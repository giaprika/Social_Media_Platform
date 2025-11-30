import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// =============================================================================
// K6 Full Flow Load Test
// Flow: HTTP SendMessage → DB → Outbox → Redis Pub/Sub → WebSocket
// =============================================================================

// Metrics
const e2eLatency = new Trend('e2e_latency_ms');
const httpLatency = new Trend('http_latency_ms');
const messagesSent = new Counter('messages_sent');
const messagesReceived = new Counter('messages_received');
const httpErrors = new Counter('http_errors');
const deliveryRate = new Rate('delivery_rate');

// Config từ environment
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8081/ws';
const VUS = parseInt(__ENV.VUS) || 10;
const DURATION = __ENV.DURATION || '30s';

export const options = {
    scenarios: {
        load_test: {
            executor: 'constant-vus',
            vus: VUS,
            duration: DURATION,
        },
    },
    thresholds: {
        'e2e_latency_ms': ['p(99)<500'],
        'http_latency_ms': ['p(95)<500'],
        'delivery_rate': ['rate>0.90'],
    },
};

export function setup() {
    console.log('='.repeat(60));
    console.log('  FULL FLOW LOAD TEST');
    console.log('='.repeat(60));
    console.log(`  HTTP:      ${BASE_URL}`);
    console.log(`  WebSocket: ${WS_URL}`);
    console.log(`  VUs:       ${VUS}`);
    console.log(`  Duration:  ${DURATION}`);
    console.log('='.repeat(60));
    return {};
}

export default function() {
    const senderId = uuidv4();
    const receiverId = uuidv4();
    const conversationId = uuidv4();
    
    // Step 1: Cả sender và receiver đều gửi 1 message để join conversation
    // (Vì hiện tại SendMessage chỉ add sender vào conversation)
    
    // Receiver join conversation
    http.post(`${BASE_URL}/v1/messages`, JSON.stringify({
        conversation_id: conversationId,
        content: 'join',
        idempotency_key: uuidv4(),
    }), {
        headers: { 'Content-Type': 'application/json', 'X-User-ID': receiverId },
        timeout: '5s',
    });
    
    // Sender join conversation  
    http.post(`${BASE_URL}/v1/messages`, JSON.stringify({
        conversation_id: conversationId,
        content: 'join',
        idempotency_key: uuidv4(),
    }), {
        headers: { 'Content-Type': 'application/json', 'X-User-ID': senderId },
        timeout: '5s',
    });
    
    // Step 2: Kết nối WebSocket với receiver
    const res = ws.connect(WS_URL, { headers: { 'X-User-ID': receiverId } }, function(socket) {
        let messageReceived = false;
        let sentAt = 0;
        let targetMessageId = null;
        
        socket.on('open', function() {
            // Step 3: Sender gửi message thực sự
            sentAt = Date.now();
            
            const httpRes = http.post(`${BASE_URL}/v1/messages`, JSON.stringify({
                conversation_id: conversationId,
                content: JSON.stringify({ sent_at: sentAt }),
                idempotency_key: uuidv4(),
            }), {
                headers: { 'Content-Type': 'application/json', 'X-User-ID': senderId },
                timeout: '10s',
            });
            
            httpLatency.add(Date.now() - sentAt);
            messagesSent.add(1);
            
            if (httpRes.status === 200) {
                try {
                    targetMessageId = JSON.parse(httpRes.body).messageId;
                } catch (e) {}
            } else {
                httpErrors.add(1);
                deliveryRate.add(0);
                socket.close();
            }
        });
        
        socket.on('message', function(data) {
            try {
                const event = JSON.parse(data);
                if (event.type === 'welcome' || event.type === 'reconnected') return;
                
                // Nhận đúng message từ sender
                if (event.aggregate_type === 'message' && event.aggregate_id === targetMessageId && !messageReceived) {
                    messageReceived = true;
                    const latency = Date.now() - sentAt;
                    if (latency > 0 && latency < 30000) {
                        e2eLatency.add(latency);
                        messagesReceived.add(1);
                        deliveryRate.add(1);
                    }
                    socket.close();
                }
            } catch (e) {}
        });
        
        socket.on('error', function(e) {
            deliveryRate.add(0);
        });
        
        socket.setTimeout(function() {
            if (!messageReceived) deliveryRate.add(0);
            socket.close();
        }, 5000);
    });
    
    check(res, { 'WS connected': (r) => r && r.status === 101 });
    sleep(0.3);
}

export function handleSummary(data) {
    const duration = (data.state.testRunDurationMs / 1000).toFixed(1);
    const sent = data.metrics.messages_sent?.values?.count || 0;
    const received = data.metrics.messages_received?.values?.count || 0;
    const errors = data.metrics.http_errors?.values?.count || 0;
    
    // Lấy giá trị, nếu không có thì dùng max thay cho p99
    const e2eAvg = data.metrics.e2e_latency_ms?.values?.avg?.toFixed(0) || '0';
    const e2eP95 = data.metrics.e2e_latency_ms?.values?.['p(95)']?.toFixed(0) || 
                   data.metrics.e2e_latency_ms?.values?.max?.toFixed(0) || '0';
    const e2eP99 = data.metrics.e2e_latency_ms?.values?.['p(99)']?.toFixed(0) || 
                   data.metrics.e2e_latency_ms?.values?.max?.toFixed(0) || '0';
    const e2eMax = data.metrics.e2e_latency_ms?.values?.max?.toFixed(0) || '0';
    const httpAvg = data.metrics.http_latency_ms?.values?.avg?.toFixed(0) || '0';
    const httpP95 = data.metrics.http_latency_ms?.values?.['p(95)']?.toFixed(0) || '0';

    const deliveryPct = (received / Math.max(sent, 1)) * 100;
    const rps = (sent / parseFloat(duration)).toFixed(1);

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  LOAD TEST RESULTS                         ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Duration:          ${duration.padStart(10)}s                        ║`);
    console.log(`║  Throughput:        ${rps.padStart(10)} msg/sec                   ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Messages Sent:     ${String(sent).padStart(10)}                          ║`);
    console.log(`║  Messages Received: ${String(received).padStart(10)}                          ║`);
    console.log(`║  HTTP Errors:       ${String(errors).padStart(10)}                          ║`);
    console.log(`║  Delivery Rate:     ${deliveryPct.toFixed(1).padStart(9)}%                         ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  E2E Latency (HTTP Send → WebSocket Receive)               ║');
    console.log(`║    Average:         ${e2eAvg.padStart(10)}ms                        ║`);
    console.log(`║    P95:             ${e2eP95.padStart(10)}ms                        ║`);
    console.log(`║    P99:             ${e2eP99.padStart(10)}ms                        ║`);
    console.log(`║    Max:             ${e2eMax.padStart(10)}ms                        ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  HTTP API Latency                                          ║');
    console.log(`║    Average:         ${httpAvg.padStart(10)}ms                        ║`);
    console.log(`║    P95:             ${httpP95.padStart(10)}ms                        ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    console.log('\n📊 Assessment:');
    if (deliveryPct >= 95) console.log('  ✅ Delivery rate >= 95%');
    else if (deliveryPct >= 80) console.log('  ⚠️  Delivery rate 80-95%');
    else console.log('  ❌ Delivery rate < 80%');
    
    const p99Val = parseFloat(e2eP99) || 0;
    if (p99Val > 0 && p99Val < 200) console.log('  ✅ E2E P99 < 200ms - TARGET MET!');
    else if (p99Val < 500) console.log('  ⚠️  E2E P99 < 500ms');
    else if (p99Val > 0) console.log('  ❌ E2E P99 > 500ms - NEEDS OPTIMIZATION');
    
    console.log('\n');
    return { 'scripts/k6-results.json': JSON.stringify(data, null, 2) };
}
