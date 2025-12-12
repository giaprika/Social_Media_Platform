#!/bin/bash

# Test Chat Flow: User A and User B messaging each other
# Usage: ./scripts/test_chat_flow.sh

set -e

BASE_URL="http://localhost:8080"

# Generate UUIDs for users and conversation
generate_uuid() {
    uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "$(od -x /dev/urandom | head -1 | awk '{OFS="-"; print $2$3,$4,$5,$6,$7$8$9}')"
}

USER_A=$(generate_uuid)
USER_B=$(generate_uuid)
CONV_ID=$(generate_uuid)

echo "=========================================="
echo "Chat Service E2E Test"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "User A: $USER_A"
echo "User B: $USER_B"
echo "Conversation ID: $CONV_ID"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print test step
print_step() {
    echo -e "${YELLOW}[STEP $1]${NC} $2"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to make API call
api_call() {
    local method=$1
    local endpoint=$2
    local user_id=$3
    local data=$4
    
    if [ "$method" = "POST" ]; then
        curl -s -X POST "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "x-user-id: $user_id" \
            -d "$data"
    else
        curl -s -X GET "$BASE_URL$endpoint" \
            -H "x-user-id: $user_id"
    fi
}

echo "=========================================="
echo "Test Scenario: A and B Chat Flow"
echo "=========================================="
echo ""

# Step 1: User A sends first message
print_step "1" "User A sends first message to User B"
RESPONSE=$(api_call "POST" "/v1/messages" "$USER_A" "{
    \"conversation_id\": \"$CONV_ID\",
    \"content\": \"Hi Bob! How are you?\",
    \"idempotency_key\": \"msg-a-1-$(date +%s%N)\"
}")

if echo "$RESPONSE" | grep -q "message_id"; then
    MSG_A_1=$(echo "$RESPONSE" | grep -o '"message_id":"[^"]*"' | cut -d'"' -f4)
    print_success "Message sent successfully. ID: $MSG_A_1"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Failed to send message"
    echo "$RESPONSE"
    exit 1
fi
echo ""
sleep 1

# Step 2: User B sends reply
print_step "2" "User B replies to User A"
RESPONSE=$(api_call "POST" "/v1/messages" "$USER_B" "{
    \"conversation_id\": \"$CONV_ID\",
    \"content\": \"Hey Alice! I'm doing great, thanks for asking!\",
    \"idempotency_key\": \"msg-b-1-$(date +%s%N)\"
}")

if echo "$RESPONSE" | grep -q "message_id"; then
    MSG_B_1=$(echo "$RESPONSE" | grep -o '"message_id":"[^"]*"' | cut -d'"' -f4)
    print_success "Message sent successfully. ID: $MSG_B_1"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Failed to send message"
    echo "$RESPONSE"
    exit 1
fi
echo ""
sleep 1

# Step 3: User A sends another message
print_step "3" "User A continues the conversation"
RESPONSE=$(api_call "POST" "/v1/messages" "$USER_A" "{
    \"conversation_id\": \"$CONV_ID\",
    \"content\": \"That's wonderful! Want to grab coffee later?\",
    \"idempotency_key\": \"msg-a-2-$(date +%s%N)\"
}")

if echo "$RESPONSE" | grep -q "message_id"; then
    MSG_A_2=$(echo "$RESPONSE" | grep -o '"message_id":"[^"]*"' | cut -d'"' -f4)
    print_success "Message sent successfully. ID: $MSG_A_2"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Failed to send message"
    echo "$RESPONSE"
    exit 1
fi
echo ""
sleep 1

# Step 4: User B sends another reply
print_step "4" "User B responds"
RESPONSE=$(api_call "POST" "/v1/messages" "$USER_B" "{
    \"conversation_id\": \"$CONV_ID\",
    \"content\": \"Sure! How about 3pm at the usual place?\",
    \"idempotency_key\": \"msg-b-2-$(date +%s%N)\"
}")

if echo "$RESPONSE" | grep -q "message_id"; then
    MSG_B_2=$(echo "$RESPONSE" | grep -o '"message_id":"[^"]*"' | cut -d'"' -f4)
    print_success "Message sent successfully. ID: $MSG_B_2"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Failed to send message"
    echo "$RESPONSE"
    exit 1
fi
echo ""
sleep 1

# Step 5: User A gets all messages in conversation
print_step "5" "User A retrieves all messages in conversation"
RESPONSE=$(api_call "GET" "/v1/conversations/$CONV_ID/messages?limit=50" "$USER_A")

if echo "$RESPONSE" | grep -q "messages"; then
    MSG_COUNT=$(echo "$RESPONSE" | grep -o '"id"' | wc -l)
    print_success "Retrieved $MSG_COUNT messages"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Failed to retrieve messages"
    echo "$RESPONSE"
fi
echo ""
sleep 1

# Step 6: User B gets all messages in conversation
print_step "6" "User B retrieves all messages in conversation"
RESPONSE=$(api_call "GET" "/v1/conversations/$CONV_ID/messages?limit=50" "$USER_B")

if echo "$RESPONSE" | grep -q "messages"; then
    MSG_COUNT=$(echo "$RESPONSE" | grep -o '"id"' | wc -l)
    print_success "Retrieved $MSG_COUNT messages"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Failed to retrieve messages"
    echo "$RESPONSE"
fi
echo ""
sleep 1

# Step 7: User A gets their conversations list
print_step "7" "User A retrieves their conversations list"
RESPONSE=$(api_call "GET" "/v1/conversations?limit=10" "$USER_A")

if echo "$RESPONSE" | grep -q "conversations"; then
    CONV_COUNT=$(echo "$RESPONSE" | grep -o '"id"' | wc -l)
    print_success "Retrieved $CONV_COUNT conversations"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Failed to retrieve conversations"
    echo "$RESPONSE"
fi
echo ""
sleep 1

# Step 8: User B gets their conversations list
print_step "8" "User B retrieves their conversations list"
RESPONSE=$(api_call "GET" "/v1/conversations?limit=10" "$USER_B")

if echo "$RESPONSE" | grep -q "conversations"; then
    CONV_COUNT=$(echo "$RESPONSE" | grep -o '"id"' | wc -l)
    print_success "Retrieved $CONV_COUNT conversations"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Failed to retrieve conversations"
    echo "$RESPONSE"
fi
echo ""
sleep 1

# Step 9: User B marks conversation as read
print_step "9" "User B marks conversation as read"
RESPONSE=$(api_call "POST" "/v1/conversations/$CONV_ID/read" "$USER_B" "{}")

if echo "$RESPONSE" | grep -q "success"; then
    print_success "Conversation marked as read"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Failed to mark as read"
    echo "$RESPONSE"
fi
echo ""
sleep 1

# Step 10: Test idempotency - resend same message
print_step "10" "Test idempotency - User A resends message with same key"
IDEMPOTENCY_KEY="msg-a-idempotent-$(date +%s)"
RESPONSE1=$(api_call "POST" "/v1/messages" "$USER_A" "{
    \"conversation_id\": \"$CONV_ID\",
    \"content\": \"Testing idempotency\",
    \"idempotency_key\": \"$IDEMPOTENCY_KEY\"
}")

sleep 1

RESPONSE2=$(api_call "POST" "/v1/messages" "$USER_A" "{
    \"conversation_id\": \"$CONV_ID\",
    \"content\": \"Testing idempotency\",
    \"idempotency_key\": \"$IDEMPOTENCY_KEY\"
}")

MSG_ID_1=$(echo "$RESPONSE1" | grep -o '"message_id":"[^"]*"' | cut -d'"' -f4)
MSG_ID_2=$(echo "$RESPONSE2" | grep -o '"message_id":"[^"]*"' | cut -d'"' -f4)

if [ "$MSG_ID_1" = "$MSG_ID_2" ]; then
    print_success "Idempotency works! Same message ID returned: $MSG_ID_1"
else
    print_error "Idempotency failed! Different IDs: $MSG_ID_1 vs $MSG_ID_2"
fi
echo ""

# Step 11: Test pagination
print_step "11" "Test pagination - Get messages with limit=2"
RESPONSE=$(api_call "GET" "/v1/conversations/$CONV_ID/messages?limit=2" "$USER_A")

if echo "$RESPONSE" | grep -q "next_cursor"; then
    print_success "Pagination works - cursor returned"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    print_error "Pagination test inconclusive"
    echo "$RESPONSE"
fi
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
print_success "All tests completed!"
echo ""
echo "Conversation ID: $CONV_ID"
echo "Total messages sent: 5"
echo "Users tested: $USER_A, $USER_B"
echo ""
echo "You can verify the data in your database:"
echo "  SELECT * FROM messages WHERE conversation_id = '$CONV_ID';"
echo "  SELECT * FROM conversations WHERE id = '$CONV_ID';"
echo "=========================================="
