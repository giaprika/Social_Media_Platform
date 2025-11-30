import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// =============================================================================
// K6 Stress Test: Find Breaking Point
// Gradually increase load until system fails
// Target: Find max sustainable RPS on e2-medium (2 vCPU, 4GB RAM)
// =============================================================================

const messagesSent = new Counter('messages_sent_total');
const messagesSuccess = new Counter('messages_success');
const messagesFailed = new Counter('messages_failed');
const messageLatency = new Trend('message_latency_ms');
const errorRate = new Rate('error_rate');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
    scenarios: {
        stress_test: {
            executor: 'ramping-arrival-rate',
            startRate: 50,
            timeUnit: '1s',
            preAllocatedVUs: 500,
            maxVUs: 1000,
            stages: [
                // Gradual ramp up to find breaking point
                { duration: '1m', target: 200 },    // 200 RPS
                { duration: '1m', target: 400 },    // 400 RPS
                { duration: '1m', target: 600 },    // 600 RPS
                { duration: '1m', target: 800 },    // 800 RPS
                { duration: '1m', target: 1000 },   // 1000 RPS
                { duration: '1m', target: 1200 },   // 1200 RPS - push beyond target
                { duration: '1m', target: 1500 },   // 1500 RPS - stress
                { duration: '1m', target: 2000 },   // 2000 RPS - extreme stress
                { duration: '30s', target: 0 },     // Ramp down
            ],
        },
    },
    thresholds: {
        // Relaxed thresholds for stress test - we want to find the breaking point
        'http_req_duration': ['p(95)<2000'],
        'error_rate': ['rate<0.50'], // Allow up to 50% errors to see degradation
    },
};

// Test data
const conversationIds = Array.from({ length: 100 }, () => uuidv4());
const userIds = Array.from({ length: 100 }, () => uuidv4());

export function setup() {
    console.log('='.repeat(60));
    console.log('K6 STRESS TEST - Finding Breaking Point');
    console.log(`Base URL: ${BASE_URL}`);
    console.log('Stages: 200 -> 400 -> 600 -> 800 -> 1000 -> 1200 -> 1500 -> 2000 RPS');
    console.log('='.repeat(60));
    return { conversationIds, userIds };
}

export default function (data) {
    const userId = data.userIds[Math.floor(Math.random() * data.userIds.length)];
    const conversationId = data.conversationIds[Math.floor(Math.random() * data.conversationIds.length)];
    
    const payload = JSON.stringify({
        conversation_id: conversationId,
        content: `Stress test ${Date.now()}`,
        idempotency_key: uuidv4(),
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userId,
        },
        timeout: '30s',
    };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/v1/messages`, payload, params);
    const latency = Date.now() - startTime;

    messagesSent.add(1);
    messageLatency.add(latency);

    const success = response.status === 200;
    
    if (success) {
        messagesSuccess.add(1);
        errorRate.add(0);
    } else {
        messagesFailed.add(1);
        errorRate.add(1);
    }
}

export function handleSummary(data) {
    const duration = data.state.testRunDurationMs / 1000;
    const totalSent = data.metrics.messages_sent_total?.values?.count || 0;
    const totalSuccess = data.metrics.messages_success?.values?.count || 0;
    const totalFailed = data.metrics.messages_failed?.values?.count || 0;
    const avgRPS = totalSent / duration;
    const successRPS = totalSuccess / duration;
    
    console.log('\n' + '='.repeat(60));
    console.log('           STRESS TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`  Test Duration           : ${duration.toFixed(2)}s`);
    console.log(`  Total Requests          : ${totalSent}`);
    console.log(`  Successful              : ${totalSuccess}`);
    console.log(`  Failed                  : ${totalFailed}`);
    console.log(`  Error Rate              : ${((totalFailed / totalSent) * 100).toFixed(2)}%`);
    console.log(`  Average RPS (total)     : ${avgRPS.toFixed(2)}`);
    console.log(`  Average RPS (success)   : ${successRPS.toFixed(2)}`);
    console.log(`  Latency (avg)           : ${data.metrics.message_latency_ms?.values?.avg?.toFixed(2) || 'N/A'}ms`);
    console.log(`  Latency (p50)           : ${data.metrics.message_latency_ms?.values?.['p(50)']?.toFixed(2) || 'N/A'}ms`);
    console.log(`  Latency (p95)           : ${data.metrics.message_latency_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`);
    console.log(`  Latency (p99)           : ${data.metrics.message_latency_ms?.values?.['p(99)']?.toFixed(2) || 'N/A'}ms`);
    console.log(`  Latency (max)           : ${data.metrics.message_latency_ms?.values?.max?.toFixed(2) || 'N/A'}ms`);
    console.log('='.repeat(60));
    
    // Estimate sustainable RPS
    console.log('\n📊 CAPACITY ESTIMATION:');
    if (totalFailed / totalSent < 0.01) {
        console.log(`  ✅ System handled ${avgRPS.toFixed(0)} RPS with <1% errors`);
        console.log(`  📈 Estimated max sustainable RPS: ~${(avgRPS * 0.8).toFixed(0)} (80% of peak)`);
    } else if (totalFailed / totalSent < 0.05) {
        console.log(`  ⚠️  System showed degradation at ${avgRPS.toFixed(0)} RPS`);
        console.log(`  📈 Recommended max RPS: ~${(successRPS * 0.9).toFixed(0)}`);
    } else {
        console.log(`  ❌ System failed at ${avgRPS.toFixed(0)} RPS`);
        console.log(`  📈 Safe operating RPS: ~${(successRPS * 0.7).toFixed(0)}`);
    }
    console.log('');

    return {
        'scripts/k6-stress-results.json': JSON.stringify(data, null, 2),
    };
}
