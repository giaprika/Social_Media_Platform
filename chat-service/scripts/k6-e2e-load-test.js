import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// =============================================================================
// K6 E2E Load Test: Full Flow
// HTTP SendMessage -> DB -> Outbox -> Redis Pub/Sub -> WebSocket Delivery
// Target: 1000 msg/sec with P99 latency < 200ms
// =============================================================================

// Custom metrics
const e2eLatency = new Trend('e2e_latency_ms');
const messagesSent = new Counter('messages_sent_total');
const messagesDelivered = new Counter('messages_delivered_total');
const deliveryRate = new Rate('delivery_rate');
const httpLatency = new Trend('http_send_latency_ms');
const wsMessagesReceived = new Counter('ws_messages_received');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8081/ws';
const TARGET_RPS = parseInt(__ENV.TARGET_RPS) || 500;

// Shared state for tracking message delivery
const pendingMessages = {};

export const options = {
    scenarios: {
        // WebSocket receivers - connect first and stay connected
        ws_receivers: {
            executor: 'constant-vus',
            vus: 50,
            duration: '4m',
            exec: 'wsReceiver',
            startTime: '0s',
        },
        // HTTP senders - start after WS connections are established
        http_senders: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 300,
            stages: [
                { duration: '30s', target: 100 },
                { duration: '30s', target: TARGET_RPS },
                { duration: '2m', target: TARGET_RPS },
                { duration: '30s', target: 0 },
            ],
            exec: 'httpSender',
            startTime: '10s', // Start 10s after WS connections
        },
    },
    thresholds: {
        'e2e_latency_ms': ['p(99)<500', 'avg<200'],
        'http_send_latency_ms': ['p(95)<300'],
        'delivery_rate': ['rate>0.95'],
    },
};

// Pre-created test data
const testConversations = [];
const testUsers = [];
for (let i = 0; i < 50; i++) {
    testConversations.push(uuidv4());
    testUsers.push(uuidv4());
}

export function setup() {
    console.log('='.repeat(60));
    console.log('K6 E2E Load Test - Full Message Flow');
    console.log(`HTTP URL: ${BASE_URL}`);
    console.log(`WebSocket URL: ${WS_URL}`);
    console.log(`Target RPS: ${TARGET_RPS}`);
    console.log('='.repeat(60));
    
    return {
        conversations: testConversations,
        users: testUsers,
    };
}


// WebSocket receiver function
export function wsReceiver(data) {
    const userId = data.users[__VU % data.users.length];
    const params = {
        headers: {
            'X-User-ID': userId,
        },
    };

    const res = ws.connect(WS_URL, params, function (socket) {
        socket.on('open', function () {
            console.log(`[WS-${__VU}] Connected as ${userId}`);
        });

        socket.on('message', function (msg) {
            const receiveTime = Date.now();
            wsMessagesReceived.add(1);
            
            try {
                const event = JSON.parse(msg);
                
                // Skip welcome messages
                if (event.type === 'welcome' || event.type === 'reconnected') {
                    return;
                }

                // Track E2E latency from message payload
                if (event.aggregate_type === 'message' && event.payload) {
                    const payload = typeof event.payload === 'string' 
                        ? JSON.parse(event.payload) 
                        : event.payload;
                    
                    if (payload.sent_at) {
                        const latency = receiveTime - payload.sent_at;
                        if (latency > 0 && latency < 30000) {
                            e2eLatency.add(latency);
                            messagesDelivered.add(1);
                            deliveryRate.add(1);
                        }
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        });

        socket.on('error', function (e) {
            console.log(`[WS-${__VU}] Error: ${e.error()}`);
        });

        // Keep alive
        socket.setInterval(function () {
            socket.ping();
        }, 25000);

        // Stay connected for test duration
        sleep(230);
        socket.close();
    });

    check(res, {
        'WS connection successful': (r) => r && r.status === 101,
    });
}

// HTTP sender function
export function httpSender(data) {
    const senderIdx = __VU % data.users.length;
    const receiverIdx = (senderIdx + 1) % data.users.length;
    
    const senderId = data.users[senderIdx];
    const conversationId = data.conversations[__VU % data.conversations.length];
    const idempotencyKey = uuidv4();
    const sentAt = Date.now();
    
    const payload = JSON.stringify({
        conversation_id: conversationId,
        content: JSON.stringify({
            text: `E2E test message`,
            sent_at: sentAt,
            vu: __VU,
            iter: __ITER,
        }),
        idempotency_key: idempotencyKey,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'X-User-ID': senderId,
        },
        timeout: '10s',
    };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/v1/messages`, payload, params);
    const latency = Date.now() - startTime;

    messagesSent.add(1);
    httpLatency.add(latency);

    const success = check(response, {
        'HTTP status 200': (r) => r.status === 200,
        'HTTP latency < 500ms': () => latency < 500,
    });

    if (!success) {
        deliveryRate.add(0);
        if (response.status !== 200) {
            console.log(`[HTTP] Error: ${response.status} - ${response.body?.substring(0, 100)}`);
        }
    }
}

export function handleSummary(data) {
    const duration = data.state.testRunDurationMs / 1000;
    const totalSent = data.metrics.messages_sent_total?.values?.count || 0;
    const totalDelivered = data.metrics.messages_delivered_total?.values?.count || 0;
    const avgRPS = totalSent / duration;
    
    const summary = {
        'Test Duration': `${duration.toFixed(2)}s`,
        'Messages Sent (HTTP)': totalSent,
        'Messages Delivered (WS)': totalDelivered,
        'Delivery Rate': `${((totalDelivered / Math.max(totalSent, 1)) * 100).toFixed(2)}%`,
        'Average RPS': avgRPS.toFixed(2),
        'E2E Latency (avg)': `${data.metrics.e2e_latency_ms?.values?.avg?.toFixed(2) || 'N/A'}ms`,
        'E2E Latency (p50)': `${data.metrics.e2e_latency_ms?.values?.['p(50)']?.toFixed(2) || 'N/A'}ms`,
        'E2E Latency (p95)': `${data.metrics.e2e_latency_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`,
        'E2E Latency (p99)': `${data.metrics.e2e_latency_ms?.values?.['p(99)']?.toFixed(2) || 'N/A'}ms`,
        'HTTP Latency (avg)': `${data.metrics.http_send_latency_ms?.values?.avg?.toFixed(2) || 'N/A'}ms`,
        'HTTP Latency (p95)': `${data.metrics.http_send_latency_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`,
    };

    console.log('\n' + '='.repeat(60));
    console.log('           E2E LOAD TEST SUMMARY');
    console.log('='.repeat(60));
    for (const [key, value] of Object.entries(summary)) {
        console.log(`  ${key.padEnd(25)}: ${value}`);
    }
    console.log('='.repeat(60));
    
    // Performance assessment
    console.log('\n📊 PERFORMANCE ASSESSMENT:');
    
    const p99Latency = data.metrics.e2e_latency_ms?.values?.['p(99)'] || 0;
    if (p99Latency > 0 && p99Latency < 200) {
        console.log('  ✅ E2E P99 Latency < 200ms - TARGET MET!');
    } else if (p99Latency < 500) {
        console.log('  ⚠️  E2E P99 Latency < 500ms - ACCEPTABLE');
    } else if (p99Latency > 0) {
        console.log('  ❌ E2E P99 Latency > 500ms - NEEDS OPTIMIZATION');
    }
    
    if (avgRPS >= TARGET_RPS * 0.9) {
        console.log(`  ✅ RPS ${avgRPS.toFixed(0)} >= ${TARGET_RPS * 0.9} (90% of target)`);
    } else {
        console.log(`  ⚠️  RPS ${avgRPS.toFixed(0)} < ${TARGET_RPS * 0.9} (90% of target)`);
    }
    
    console.log('');

    return {
        'stdout': '',
        'scripts/k6-e2e-results.json': JSON.stringify(data, null, 2),
    };
}
