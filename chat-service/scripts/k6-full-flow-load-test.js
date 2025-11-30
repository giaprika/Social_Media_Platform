import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { SharedArray } from 'k6/data';

// =============================================================================
// K6 Full Flow Load Test
// 
// Flow: User A gửi tin nhắn HTTP → DB → Outbox → Redis Pub/Sub → User B nhận qua WebSocket
// Target: 1000 msg/sec, P99 latency < 200ms
// =============================================================================

// Custom metrics
const e2eLatency = new Trend('e2e_delivery_latency_ms');  // Thời gian từ gửi HTTP đến nhận WS
const httpLatency = new Trend('http_send_latency_ms');     // Thời gian HTTP response
const messagesSent = new Counter('messages_sent');
const messagesDelivered = new Counter('messages_delivered');
const deliverySuccess = new Rate('delivery_success_rate');
const httpErrors = new Counter('http_errors');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8081/ws';
const TARGET_RPS = parseInt(__ENV.TARGET_RPS) || 1000;
const TEST_DURATION = __ENV.TEST_DURATION || '3m';

// Tạo test data - 50 cặp user (sender, receiver) với conversation
const NUM_PAIRS = 50;
const testPairs = new SharedArray('testPairs', function() {
    const pairs = [];
    for (let i = 0; i < NUM_PAIRS; i++) {
        pairs.push({
            sender: uuidv4(),
            receiver: uuidv4(),
            conversationId: uuidv4(),
        });
    }
    return pairs;
});

export const options = {
    scenarios: {
        // WebSocket receivers - kết nối trước và chờ nhận tin
        receivers: {
            executor: 'per-vu-iterations',
            vus: NUM_PAIRS,           // Mỗi VU là 1 receiver
            iterations: 1,            // Mỗi VU chạy 1 lần (giữ connection)
            maxDuration: '5m',
            exec: 'receiver',
            startTime: '0s',
        },
        // HTTP senders - bắt đầu sau khi WS đã kết nối
        senders: {
            executor: 'ramping-arrival-rate',
            startRate: 50,
            timeUnit: '1s',
            preAllocatedVUs: 200,
            maxVUs: 500,
            stages: [
                { duration: '30s', target: Math.floor(TARGET_RPS * 0.3) },  // Warm up 30%
                { duration: '30s', target: Math.floor(TARGET_RPS * 0.6) },  // Ramp 60%
                { duration: '30s', target: TARGET_RPS },                     // Full load
                { duration: TEST_DURATION, target: TARGET_RPS },             // Sustain
                { duration: '30s', target: 0 },                              // Ramp down
            ],
            exec: 'sender',
            startTime: '5s',  // Chờ 5s cho WS kết nối
        },
    },
    thresholds: {
        'e2e_delivery_latency_ms': ['p(99)<500', 'p(95)<300', 'avg<200'],
        'http_send_latency_ms': ['p(95)<500'],
        'delivery_success_rate': ['rate>0.95'],
        'http_errors': ['count<100'],
    },
};

export function setup() {
    console.log('='.repeat(70));
    console.log('  FULL FLOW LOAD TEST: HTTP → DB → Outbox → Redis → WebSocket');
    console.log('='.repeat(70));
    console.log(`  HTTP API:     ${BASE_URL}`);
    console.log(`  WebSocket:    ${WS_URL}`);
    console.log(`  Target RPS:   ${TARGET_RPS} messages/second`);
    console.log(`  Test Pairs:   ${NUM_PAIRS} sender-receiver pairs`);
    console.log('='.repeat(70));
    return {};
}


// =============================================================================
// RECEIVER: WebSocket client chờ nhận tin nhắn
// =============================================================================
export function receiver() {
    const pairIdx = __VU - 1;  // VU bắt đầu từ 1
    const pair = testPairs[pairIdx % testPairs.length];
    const receiverId = pair.receiver;
    
    const params = {
        headers: { 'X-User-ID': receiverId },
    };

    const res = ws.connect(WS_URL, params, function(socket) {
        console.log(`[Receiver ${pairIdx}] Connected as ${receiverId.substring(0, 8)}...`);
        
        socket.on('message', function(data) {
            const receiveTime = Date.now();
            
            try {
                const event = JSON.parse(data);
                
                // Bỏ qua welcome message
                if (event.type === 'welcome' || event.type === 'reconnected') {
                    return;
                }
                
                // Xử lý message event
                if (event.aggregate_type === 'message') {
                    let payload = event.payload;
                    if (typeof payload === 'string') {
                        payload = JSON.parse(payload);
                    }
                    
                    // Lấy timestamp gửi từ content
                    if (payload.content) {
                        try {
                            const content = JSON.parse(payload.content);
                            if (content.sent_at) {
                                const latency = receiveTime - content.sent_at;
                                if (latency > 0 && latency < 60000) {
                                    e2eLatency.add(latency);
                                    messagesDelivered.add(1);
                                    deliverySuccess.add(1);
                                    
                                    if (latency > 500) {
                                        console.log(`[Receiver ${pairIdx}] High latency: ${latency}ms`);
                                    }
                                }
                            }
                        } catch (e) {
                            // Content không phải JSON, bỏ qua
                        }
                    }
                }
            } catch (e) {
                // Parse error, bỏ qua
            }
        });

        socket.on('error', function(e) {
            console.log(`[Receiver ${pairIdx}] Error: ${e.error()}`);
        });

        // Keep alive
        socket.setInterval(function() {
            socket.ping();
        }, 25000);

        // Giữ connection trong suốt test
        sleep(280);  // ~4.5 phút
        socket.close();
    });

    check(res, {
        'WebSocket connected': (r) => r && r.status === 101,
    });
}

// =============================================================================
// SENDER: HTTP client gửi tin nhắn
// =============================================================================
export function sender() {
    // Chọn random 1 cặp sender-receiver
    const pairIdx = Math.floor(Math.random() * testPairs.length);
    const pair = testPairs[pairIdx];
    
    const sentAt = Date.now();
    const idempotencyKey = uuidv4();
    
    // Content chứa timestamp để đo E2E latency
    const messageContent = JSON.stringify({
        text: `Load test message`,
        sent_at: sentAt,
        pair: pairIdx,
    });
    
    const payload = JSON.stringify({
        conversation_id: pair.conversationId,
        content: messageContent,
        idempotency_key: idempotencyKey,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'X-User-ID': pair.sender,
        },
        timeout: '10s',
    };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/v1/messages`, payload, params);
    const latency = Date.now() - startTime;

    messagesSent.add(1);
    httpLatency.add(latency);

    const success = check(response, {
        'HTTP 200 OK': (r) => r.status === 200,
    });

    if (!success) {
        httpErrors.add(1);
        deliverySuccess.add(0);
        
        if (response.status !== 200 && response.status !== 409) {
            console.log(`[Sender] Error ${response.status}: ${response.body?.substring(0, 100)}`);
        }
    }
}

// =============================================================================
// SUMMARY: Báo cáo kết quả
// =============================================================================
export function handleSummary(data) {
    const duration = (data.state.testRunDurationMs / 1000).toFixed(1);
    const sent = data.metrics.messages_sent?.values?.count || 0;
    const delivered = data.metrics.messages_delivered?.values?.count || 0;
    const errors = data.metrics.http_errors?.values?.count || 0;
    const rps = (sent / parseFloat(duration)).toFixed(1);
    
    const e2eAvg = data.metrics.e2e_delivery_latency_ms?.values?.avg?.toFixed(1) || 'N/A';
    const e2eP50 = data.metrics.e2e_delivery_latency_ms?.values?.['p(50)']?.toFixed(1) || 'N/A';
    const e2eP95 = data.metrics.e2e_delivery_latency_ms?.values?.['p(95)']?.toFixed(1) || 'N/A';
    const e2eP99 = data.metrics.e2e_delivery_latency_ms?.values?.['p(99)']?.toFixed(1) || 'N/A';
    
    const httpAvg = data.metrics.http_send_latency_ms?.values?.avg?.toFixed(1) || 'N/A';
    const httpP95 = data.metrics.http_send_latency_ms?.values?.['p(95)']?.toFixed(1) || 'N/A';

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║              FULL FLOW LOAD TEST - KẾT QUẢ                       ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║  Thời gian test:        ${duration.padStart(10)}s                            ║`);
    console.log(`║  Tin nhắn đã gửi:       ${String(sent).padStart(10)}                             ║`);
    console.log(`║  Tin nhắn đã nhận:      ${String(delivered).padStart(10)}                             ║`);
    console.log(`║  Lỗi HTTP:              ${String(errors).padStart(10)}                             ║`);
    console.log(`║  Tỷ lệ delivery:        ${((delivered/Math.max(sent,1))*100).toFixed(1).padStart(9)}%                            ║`);
    console.log(`║  Throughput:            ${rps.padStart(10)} msg/sec                       ║`);
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log('║  E2E LATENCY (HTTP gửi → WebSocket nhận)                         ║');
    console.log(`║    Average:             ${e2eAvg.padStart(10)}ms                           ║`);
    console.log(`║    P50:                 ${e2eP50.padStart(10)}ms                           ║`);
    console.log(`║    P95:                 ${e2eP95.padStart(10)}ms                           ║`);
    console.log(`║    P99:                 ${e2eP99.padStart(10)}ms  ← TARGET: <200ms        ║`);
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log('║  HTTP LATENCY (API response time)                                ║');
    console.log(`║    Average:             ${httpAvg.padStart(10)}ms                           ║`);
    console.log(`║    P95:                 ${httpP95.padStart(10)}ms                           ║`);
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    
    // Đánh giá
    console.log('\n📊 ĐÁNH GIÁ HIỆU NĂNG:');
    
    const p99 = parseFloat(e2eP99) || 0;
    if (p99 > 0 && p99 < 200) {
        console.log('  ✅ P99 Latency < 200ms - ĐẠT MỤC TIÊU!');
    } else if (p99 < 500) {
        console.log('  ⚠️  P99 Latency < 500ms - Chấp nhận được');
    } else if (p99 > 0) {
        console.log('  ❌ P99 Latency > 500ms - Cần tối ưu');
    }
    
    if (parseFloat(rps) >= TARGET_RPS * 0.9) {
        console.log(`  ✅ Throughput ${rps} msg/sec >= 90% target (${TARGET_RPS})`);
    } else {
        console.log(`  ⚠️  Throughput ${rps} msg/sec < 90% target (${TARGET_RPS})`);
    }
    
    const deliveryRate = (delivered / Math.max(sent, 1)) * 100;
    if (deliveryRate >= 95) {
        console.log(`  ✅ Delivery rate ${deliveryRate.toFixed(1)}% >= 95%`);
    } else {
        console.log(`  ❌ Delivery rate ${deliveryRate.toFixed(1)}% < 95%`);
    }
    
    console.log('\n');

    return {
        'scripts/k6-full-flow-results.json': JSON.stringify(data, null, 2),
    };
}
