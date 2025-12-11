import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// =============================================================================
// K6 Setup Script: Create Test Conversations
// Run this ONCE before load testing to create test data
// =============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const NUM_CONVERSATIONS = parseInt(__ENV.NUM_CONVERSATIONS) || 100;
const NUM_USERS = parseInt(__ENV.NUM_USERS) || 100;

export const options = {
    vus: 10,
    iterations: NUM_CONVERSATIONS,
};

// Generate consistent test IDs (same as load test scripts)
const testUsers = [];
const testConversations = [];

// Use seeded random for reproducibility
for (let i = 0; i < NUM_USERS; i++) {
    testUsers.push(`user-${i.toString().padStart(4, '0')}-${uuidv4().substring(0, 8)}`);
}

for (let i = 0; i < NUM_CONVERSATIONS; i++) {
    testConversations.push(`conv-${i.toString().padStart(4, '0')}-${uuidv4().substring(0, 8)}`);
}

export function setup() {
    console.log('='.repeat(60));
    console.log('Setting up test data for load testing');
    console.log(`Creating ${NUM_CONVERSATIONS} conversations with ${NUM_USERS} users`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log('='.repeat(60));
    
    return {
        users: testUsers,
        conversations: testConversations,
    };
}

export default function (data) {
    const convIdx = __ITER % data.conversations.length;
    const conversationId = data.conversations[convIdx];
    
    // Each conversation has 2 participants
    const user1Idx = convIdx % data.users.length;
    const user2Idx = (convIdx + 1) % data.users.length;
    
    const user1 = data.users[user1Idx];
    const user2 = data.users[user2Idx];
    
    // Send initial message to create conversation
    const payload = JSON.stringify({
        conversation_id: conversationId,
        content: `Initial message for conversation ${convIdx}`,
        idempotency_key: `setup-${conversationId}-init`,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'X-User-ID': user1,
        },
        timeout: '10s',
    };

    const response = http.post(`${BASE_URL}/v1/messages`, payload, params);
    
    const success = check(response, {
        'conversation created': (r) => r.status === 200 || r.status === 409,
    });

    if (success) {
        console.log(`✅ Created conversation ${convIdx}: ${conversationId}`);
    } else {
        console.log(`❌ Failed to create conversation ${convIdx}: ${response.status}`);
    }
    
    sleep(0.1); // Small delay between requests
}

export function teardown(data) {
    console.log('\n' + '='.repeat(60));
    console.log('Test data setup complete!');
    console.log('='.repeat(60));
    console.log('\nTest Users (first 10):');
    data.users.slice(0, 10).forEach((u, i) => console.log(`  ${i}: ${u}`));
    console.log('\nTest Conversations (first 10):');
    data.conversations.slice(0, 10).forEach((c, i) => console.log(`  ${i}: ${c}`));
    console.log('\nYou can now run the load tests!');
    console.log('='.repeat(60));
}
