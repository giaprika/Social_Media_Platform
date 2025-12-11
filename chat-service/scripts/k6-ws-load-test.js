import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Gauge } from 'k6/metrics';

// Custom metrics
const wsConnections = new Counter('ws_connections_total');
const wsConnectionErrors = new Counter('ws_connection_errors');
const wsMessagesReceived = new Counter('ws_messages_received');
const wsConnectionTime = new Trend('ws_connection_time_ms');
const wsMessageLatency = new Trend('ws_message_latency_ms');
const wsActiveConnections = new Gauge('ws_active_connections');

// Test configuration
const WS_URL = __ENV.WS_URL || 'ws://localhost:8080/ws';

export const options = {
    scenarios: {
        // Scenario 1: Ramp up to 1000 concurrent connections
        sustained_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 100 },   // Ramp up to 100
                { duration: '30s', target: 500 },   // Ramp up to 500
                { duration: '30s', target: 1000 },  // Ramp up to 1000
                { duration: '2m', target: 1000 },   // Stay at 1000 for 2 minutes
                { duration: '30s', target: 0 },     // Ramp down
            ],
            gracefulRampDown: '30s',
        },
    },
    thresholds: {
        'ws_connection_time_ms': ['p(95)<1000'],      // 95% connections under 1s
        'ws_connection_errors': ['count<50'],         // Less than 50 connection errors
        'ws_message_latency_ms': ['p(99)<200'],       // 99% message latency under 200ms
    },
};

export default function () {
    const userId = `user-${__VU}-${__ITER}`;
    const url = WS_URL;
    const params = {
        headers: {
            'X-User-ID': userId,
        },
    };

    const startTime = Date.now();

    const res = ws.connect(url, params, function (socket) {
        const connectionTime = Date.now() - startTime;
        wsConnectionTime.add(connectionTime);
        wsConnections.add(1);
        wsActiveConnections.add(1);

        let welcomeReceived = false;
        let lastMessageTime = Date.now();

        socket.on('open', function () {
            console.log(`[${userId}] Connected in ${connectionTime}ms`);
        });

        socket.on('message', function (data) {
            const receiveTime = Date.now();
            wsMessagesReceived.add(1);

            try {
                const msg = JSON.parse(data);
                
                if (msg.type === 'welcome' || msg.type === 'reconnected') {
                    welcomeReceived = true;
                    console.log(`[${userId}] Received ${msg.type} from instance ${msg.instance_id}`);
                }

                // Calculate latency if server_time is present
                if (msg.server_time) {
                    const latency = receiveTime - msg.server_time;
                    if (latency > 0 && latency < 10000) { // Sanity check
                        wsMessageLatency.add(latency);
                    }
                }

                lastMessageTime = receiveTime;
            } catch (e) {
                console.log(`[${userId}] Failed to parse message: ${data}`);
            }
        });

        socket.on('close', function () {
            wsActiveConnections.add(-1);
            console.log(`[${userId}] Disconnected`);
        });

        socket.on('error', function (e) {
            wsConnectionErrors.add(1);
            console.log(`[${userId}] Error: ${e.error()}`);
        });

        // Keep connection alive for the test duration
        // Send periodic pings to keep connection active
        socket.setInterval(function () {
            socket.ping();
        }, 10000); // Every 10 seconds

        // Duration based on test config (default 30s for quick tests)
        const duration = __ENV.WS_DURATION ? parseInt(__ENV.WS_DURATION) : 25;
        sleep(duration);

        check(welcomeReceived, {
            'received welcome message': (r) => r === true,
        });

        socket.close();
    });

    check(res, {
        'WebSocket connection successful': (r) => r && r.status === 101,
    });

    if (!res || res.status !== 101) {
        wsConnectionErrors.add(1);
        console.log(`[${userId}] Connection failed with status: ${res ? res.status : 'null'}`);
    }
}

export function handleSummary(data) {
    const summary = {
        'Total Connections': data.metrics.ws_connections_total?.values?.count || 0,
        'Connection Errors': data.metrics.ws_connection_errors?.values?.count || 0,
        'Messages Received': data.metrics.ws_messages_received?.values?.count || 0,
        'Connection Time (p95)': `${data.metrics.ws_connection_time_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`,
        'Message Latency (p99)': `${data.metrics.ws_message_latency_ms?.values?.['p(99)']?.toFixed(2) || 'N/A'}ms`,
    };

    console.log('\n========== LOAD TEST SUMMARY ==========');
    for (const [key, value] of Object.entries(summary)) {
        console.log(`${key}: ${value}`);
    }
    console.log('========================================\n');

    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        'scripts/k6-ws-results.json': JSON.stringify(data, null, 2),
    };
}

function textSummary(data, options) {
    // Simple text summary
    let output = '\n';
    output += '     checks.........................: ' + 
        (data.metrics.checks?.values?.passes || 0) + ' passed, ' +
        (data.metrics.checks?.values?.fails || 0) + ' failed\n';
    output += '     ws_connections_total...........: ' + 
        (data.metrics.ws_connections_total?.values?.count || 0) + '\n';
    output += '     ws_connection_errors...........: ' + 
        (data.metrics.ws_connection_errors?.values?.count || 0) + '\n';
    output += '     ws_connection_time_ms..........: ' +
        'avg=' + (data.metrics.ws_connection_time_ms?.values?.avg?.toFixed(2) || 'N/A') + 'ms ' +
        'p(95)=' + (data.metrics.ws_connection_time_ms?.values?.['p(95)']?.toFixed(2) || 'N/A') + 'ms\n';
    output += '     ws_message_latency_ms..........: ' +
        'avg=' + (data.metrics.ws_message_latency_ms?.values?.avg?.toFixed(2) || 'N/A') + 'ms ' +
        'p(99)=' + (data.metrics.ws_message_latency_ms?.values?.['p(99)']?.toFixed(2) || 'N/A') + 'ms\n';
    return output;
}
