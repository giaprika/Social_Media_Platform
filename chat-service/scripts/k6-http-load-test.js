import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// =============================================================================
// K6 Load Test: HTTP API - SendMessage
// Target: 1000 messages/second on e2-medium (2 vCPU, 4GB RAM)
// =============================================================================

// Custom metrics
const messagesSent = new Counter('messages_sent_total');
const messagesSuccess = new Counter('messages_success');
const messagesFailed = new Counter('messages_failed');
const messageLatency = new Trend('message_latency_ms');
const messagesPerSecond = new Gauge('messages_per_second');
const errorRate = new Rate('error_rate');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const TARGET_RPS = parseInt(__ENV.TARGET_RPS) || 1000;

// Test scenarios
export const options = {
    scenarios: {
        // Scenario 1: Ramp up to target RPS
        ramp_up: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 200,
            maxVUs: 500,
            stages: [
                { duration: '30s', target: 100 },    // Warm up
                { duration: '30s', target: 500 },    // Ramp to 500 RPS
                { duration: '30s', target: TARGET_RPS }, // Ramp to target
                { duration: '2m', target: TARGET_RPS },  // Sustain target
                { duration: '30s', target: 0 },      // Ramp down
            ],
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<500', 'p(99)<1000'],  // 95% < 500ms, 99% < 1s
        'error_rate': ['rate<0.01'],                       // Error rate < 1%
        'messages_success': ['count>0'],
    },
};

// Pre-created conversation IDs for testing (simulate existing conversations)
const conversationIds = [];
for (let i = 0; i < 100; i++) {
    conversationIds.push(uuidv4());
}

// Pre-created user IDs
const userIds = [];
for (let i = 0; i < 100; i++) {
    userIds.push(uuidv4());
}

export function setup() {
    console.log('='.repeat(60));
    console.log('K6 HTTP Load Test - SendMessage API');
    console.log(`Target: ${TARGET_RPS} messages/second`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log('='.repeat(60));
    
    // Create test conversations (optional - depends on your setup)
    // In production test, conversations should already exist
    return {
        startTime: Date.now(),
        conversationIds: conversationIds,
        userIds: userIds,
    };
}


export default function (data) {
    // Select random user and conversation
    const userId = data.userIds[Math.floor(Math.random() * data.userIds.length)];
    const conversationId = data.conversationIds[Math.floor(Math.random() * data.conversationIds.length)];
    const idempotencyKey = uuidv4();
    
    const payload = JSON.stringify({
        conversation_id: conversationId,
        content: `Load test message ${Date.now()} - VU:${__VU} ITER:${__ITER}`,
        idempotency_key: idempotencyKey,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userId,
        },
        timeout: '10s',
    };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/v1/messages`, payload, params);
    const latency = Date.now() - startTime;

    messagesSent.add(1);
    messageLatency.add(latency);

    const success = check(response, {
        'status is 200': (r) => r.status === 200,
        'has message_id': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.messageId !== undefined;
            } catch {
                return false;
            }
        },
        'latency < 500ms': () => latency < 500,
    });

    if (success) {
        messagesSuccess.add(1);
        errorRate.add(0);
    } else {
        messagesFailed.add(1);
        errorRate.add(1);
        
        if (response.status !== 200) {
            console.log(`[ERROR] Status: ${response.status}, Body: ${response.body?.substring(0, 200)}`);
        }
    }
}

export function handleSummary(data) {
    const duration = data.state.testRunDurationMs / 1000;
    const totalMessages = data.metrics.messages_sent_total?.values?.count || 0;
    const successMessages = data.metrics.messages_success?.values?.count || 0;
    const failedMessages = data.metrics.messages_failed?.values?.count || 0;
    const avgRPS = totalMessages / duration;
    
    const summary = {
        'Test Duration': `${duration.toFixed(2)}s`,
        'Total Messages Sent': totalMessages,
        'Successful Messages': successMessages,
        'Failed Messages': failedMessages,
        'Success Rate': `${((successMessages / totalMessages) * 100).toFixed(2)}%`,
        'Average RPS': avgRPS.toFixed(2),
        'Latency (avg)': `${data.metrics.message_latency_ms?.values?.avg?.toFixed(2) || 'N/A'}ms`,
        'Latency (p50)': `${data.metrics.message_latency_ms?.values?.['p(50)']?.toFixed(2) || 'N/A'}ms`,
        'Latency (p95)': `${data.metrics.message_latency_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`,
        'Latency (p99)': `${data.metrics.message_latency_ms?.values?.['p(99)']?.toFixed(2) || 'N/A'}ms`,
        'HTTP Req Duration (avg)': `${data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 'N/A'}ms`,
        'HTTP Req Duration (p99)': `${data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) || 'N/A'}ms`,
    };

    console.log('\n' + '='.repeat(60));
    console.log('           HTTP LOAD TEST SUMMARY');
    console.log('='.repeat(60));
    for (const [key, value] of Object.entries(summary)) {
        console.log(`  ${key.padEnd(25)}: ${value}`);
    }
    console.log('='.repeat(60));
    
    // Performance assessment
    console.log('\n📊 PERFORMANCE ASSESSMENT:');
    if (avgRPS >= 1000) {
        console.log('  ✅ Target RPS (1000) ACHIEVED!');
    } else if (avgRPS >= 800) {
        console.log('  ⚠️  Close to target RPS (80%+)');
    } else {
        console.log('  ❌ Below target RPS');
    }
    
    const p99Latency = data.metrics.message_latency_ms?.values?.['p(99)'] || 0;
    if (p99Latency < 200) {
        console.log('  ✅ P99 Latency < 200ms - EXCELLENT!');
    } else if (p99Latency < 500) {
        console.log('  ⚠️  P99 Latency < 500ms - ACCEPTABLE');
    } else {
        console.log('  ❌ P99 Latency > 500ms - NEEDS OPTIMIZATION');
    }
    
    const errorRateValue = (failedMessages / totalMessages) * 100;
    if (errorRateValue < 1) {
        console.log('  ✅ Error Rate < 1% - EXCELLENT!');
    } else if (errorRateValue < 5) {
        console.log('  ⚠️  Error Rate < 5% - ACCEPTABLE');
    } else {
        console.log('  ❌ Error Rate > 5% - NEEDS INVESTIGATION');
    }
    console.log('');

    return {
        'stdout': textSummary(data),
        'scripts/k6-http-results.json': JSON.stringify(data, null, 2),
    };
}

function textSummary(data) {
    let output = '\n';
    output += '     checks.........................: ' + 
        (data.metrics.checks?.values?.passes || 0) + ' passed, ' +
        (data.metrics.checks?.values?.fails || 0) + ' failed\n';
    output += '     http_reqs......................: ' + 
        (data.metrics.http_reqs?.values?.count || 0) + '\n';
    output += '     http_req_duration..............: ' +
        'avg=' + (data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 'N/A') + 'ms ' +
        'p(95)=' + (data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A') + 'ms ' +
        'p(99)=' + (data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) || 'N/A') + 'ms\n';
    return output;
}
