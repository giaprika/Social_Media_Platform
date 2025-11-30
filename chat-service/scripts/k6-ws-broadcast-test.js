import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const broadcastLatency = new Trend('broadcast_latency_ms');
const messagesReceived = new Counter('broadcast_messages_received');
const messagesSent = new Counter('broadcast_messages_sent');

// Configuration
const WS_URL = __ENV.WS_URL || 'ws://localhost:8080/ws';
const REDIS_PUBLISH_URL = __ENV.REDIS_PUBLISH_URL || null; // Optional: for direct Redis publish

export const options = {
    scenarios: {
        // Receivers: 100 WebSocket connections waiting for broadcasts
        receivers: {
            executor: 'constant-vus',
            vus: 100,
            duration: '2m',
            exec: 'receiver',
        },
    },
    thresholds: {
        'broadcast_latency_ms': ['p(99)<200', 'avg<100'],
    },
};

// Default function (required for k6)
export default function () {
    receiver();
}

// Receiver function - connects and waits for broadcast messages
export function receiver() {
    const userId = `receiver-${__VU}`;
    const params = {
        headers: {
            'X-User-ID': userId,
        },
    };

    const res = ws.connect(WS_URL, params, function (socket) {
        socket.on('open', function () {
            console.log(`[${userId}] Connected, waiting for broadcasts...`);
        });

        socket.on('message', function (data) {
            const receiveTime = Date.now();
            
            try {
                const msg = JSON.parse(data);
                
                // Skip welcome/reconnected messages
                if (msg.type === 'welcome' || msg.type === 'reconnected') {
                    return;
                }

                messagesReceived.add(1);

                // Calculate broadcast latency from server_time
                if (msg.server_time) {
                    const latency = receiveTime - msg.server_time;
                    if (latency > 0 && latency < 10000) {
                        broadcastLatency.add(latency);
                        console.log(`[${userId}] Received broadcast, latency: ${latency}ms`);
                    }
                }

                // If message has sent_at timestamp (from our test)
                if (msg.data && msg.data.sent_at) {
                    const latency = receiveTime - msg.data.sent_at;
                    if (latency > 0 && latency < 10000) {
                        broadcastLatency.add(latency);
                    }
                }
            } catch (e) {
                // Ignore parse errors for non-JSON messages
            }
        });

        socket.on('error', function (e) {
            console.log(`[${userId}] Error: ${e.error()}`);
        });

        // Keep connection alive
        socket.setInterval(function () {
            socket.ping();
        }, 25000);

        // Stay connected for test duration
        sleep(120);
        socket.close();
    });

    check(res, {
        'WebSocket connection successful': (r) => r && r.status === 101,
    });
}

export function handleSummary(data) {
    console.log('\n========== BROADCAST LATENCY TEST SUMMARY ==========');
    console.log(`Messages Received: ${data.metrics.broadcast_messages_received?.values?.count || 0}`);
    console.log(`Broadcast Latency (avg): ${data.metrics.broadcast_latency_ms?.values?.avg?.toFixed(2) || 'N/A'}ms`);
    console.log(`Broadcast Latency (p95): ${data.metrics.broadcast_latency_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`);
    console.log(`Broadcast Latency (p99): ${data.metrics.broadcast_latency_ms?.values?.['p(99)']?.toFixed(2) || 'N/A'}ms`);
    console.log('====================================================\n');

    return {
        'scripts/k6-broadcast-results.json': JSON.stringify(data, null, 2),
    };
}
