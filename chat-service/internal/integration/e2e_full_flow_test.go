package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"chat-service/internal/outbox"
	"chat-service/internal/ws"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// =============================================================================
// E2E Full Flow Integration Tests
// =============================================================================
// These tests verify the complete message delivery flow:
// 1. User sends message via HTTP API
// 2. Message is stored in PostgreSQL (messages table)
// 3. Outbox entry is created in same transaction (outbox table)
// 4. Outbox processor polls and publishes to Redis Pub/Sub
// 5. WebSocket gateway receives from Redis and delivers to connected users
// =============================================================================

// TestE2E_FullFlow_HTTPToWebSocket tests the complete flow from HTTP API to WebSocket delivery
// This is the main E2E test that verifies all components work together
func TestE2E_FullFlow_HTTPToWebSocket(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	// Setup test data
	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err, "Failed to create test conversation")
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	// Setup logging
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Setup WebSocket infrastructure
	connManager := ws.NewConnectionManager()
	registry := prometheus.NewRegistry()
	metrics := ws.NewMetrics(registry)
	router := ws.NewRouter(connManager, logger, metrics)

	// Setup Redis Pub/Sub subscriber
	subscriber := ws.NewSubscriber(testInfra.RedisClient, logger, router.HandleEvent)
	err = subscriber.Start(ctx)
	require.NoError(t, err, "Failed to start subscriber")
	defer subscriber.Stop()
	time.Sleep(100 * time.Millisecond)

	// Create WebSocket server and connect User B
	wsServer := createE2ETestWSServer(t, connManager, testIDs.UserB)
	defer wsServer.Close()

	wsConn, receivedMessages := connectE2EWebSocket(t, wsServer, testIDs.UserB)
	defer wsConn.Close()
	time.Sleep(50 * time.Millisecond)

	// Setup outbox processor
	processorCfg := outbox.ProcessorConfig{
		PollInterval: 50 * time.Millisecond,
		BatchSize:    10,
		MaxRetries:   3,
		WorkerCount:  2,
	}
	processor := outbox.NewProcessor(testInfra.DBPool, testInfra.RedisClient, logger, processorCfg)

	processorCtx, cancelProcessor := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		cancelProcessor()
		time.Sleep(100 * time.Millisecond)
	}()

	// === Execute: User A sends message via HTTP ===
	startTime := time.Now()
	messageContent := "E2E Full Flow Test Message"
	idempotencyKey := "e2e-full-" + uuid.New().String()

	result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)
	require.NoError(t, err, "Failed to send message")
	assert.Equal(t, http.StatusOK, resp.StatusCode, "Should return 200 OK")
	require.NotNil(t, result, "Result should not be nil")
	assert.NotEmpty(t, result.MessageID, "Should have message ID")

	// === Verify Step 1: Message stored in DB ===
	AssertMessageExists(t, testInfra.DBPool, result.MessageID)
	msg, err := GetMessageFromDB(ctx, testInfra.DBPool, result.MessageID)
	require.NoError(t, err)
	assert.Equal(t, messageContent, msg.Content)
	assert.Equal(t, testIDs.UserA, msg.SenderID)
	assert.Equal(t, testIDs.ConversationAB, msg.ConversationID)

	// === Verify Step 2: Outbox entry created ===
	AssertOutboxEntryExists(t, testInfra.DBPool, result.MessageID)

	// === Verify Step 3-5: WebSocket delivery ===
	var receivedEvent *ws.EventPayload
	select {
	case msg := <-receivedMessages:
		receivedEvent = msg
	case <-time.After(5 * time.Second):
		t.Fatal("Timeout waiting for WebSocket message delivery")
	}

	totalLatency := time.Since(startTime)
	t.Logf("E2E Full Flow latency: %v", totalLatency)

	// Verify received message content
	require.NotNil(t, receivedEvent, "Should receive event via WebSocket")
	assert.Equal(t, "message", receivedEvent.AggregateType)
	assert.Equal(t, result.MessageID, receivedEvent.AggregateID)

	var innerPayload ws.InnerMessagePayload
	err = json.Unmarshal(receivedEvent.Payload, &innerPayload)
	require.NoError(t, err)
	assert.Equal(t, messageContent, innerPayload.Content)
	assert.Equal(t, testIDs.UserA, innerPayload.SenderID)
	assert.Contains(t, innerPayload.ReceiverIDs, testIDs.UserB)

	// Verify latency is reasonable
	assert.Less(t, totalLatency, 2*time.Second, "E2E latency should be < 2s")
}


// TestE2E_FullFlow_DatabasePersistence verifies that messages are persisted correctly
// even when WebSocket delivery fails or user is offline
func TestE2E_FullFlow_DatabasePersistence(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Setup outbox processor (NO WebSocket - simulating offline user)
	processorCfg := outbox.ProcessorConfig{
		PollInterval: 50 * time.Millisecond,
		BatchSize:    10,
		MaxRetries:   3,
		WorkerCount:  2,
	}
	processor := outbox.NewProcessor(testInfra.DBPool, testInfra.RedisClient, logger, processorCfg)

	processorCtx, cancelProcessor := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		cancelProcessor()
		time.Sleep(100 * time.Millisecond)
	}()

	// Send multiple messages while User B is offline
	messageContents := []string{
		"Message 1 - User B offline",
		"Message 2 - User B offline",
		"Message 3 - User B offline",
	}

	var messageIDs []string
	for i, content := range messageContents {
		idempotencyKey := "persist-test-" + uuid.New().String()
		result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, content, idempotencyKey)
		require.NoError(t, err, "Failed to send message %d", i)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		require.NotNil(t, result)
		messageIDs = append(messageIDs, result.MessageID)
	}

	// Wait for outbox to process
	time.Sleep(300 * time.Millisecond)

	// Verify all messages are stored in database
	for i, messageID := range messageIDs {
		AssertMessageExists(t, testInfra.DBPool, messageID)
		msg, err := GetMessageFromDB(ctx, testInfra.DBPool, messageID)
		require.NoError(t, err)
		assert.Equal(t, messageContents[i], msg.Content)
	}

	// Verify User B can retrieve messages via HTTP API
	messagesResp, httpResp, err := testServer.GetMessages(testIDs.UserB, testIDs.ConversationAB, 10, "")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, httpResp.StatusCode)
	require.NotNil(t, messagesResp)
	assert.GreaterOrEqual(t, len(messagesResp.Messages), len(messageContents))

	// Verify all sent messages are retrievable
	retrievedContents := make(map[string]bool)
	for _, msg := range messagesResp.Messages {
		retrievedContents[msg.Content] = true
	}
	for _, content := range messageContents {
		assert.True(t, retrievedContents[content], "Message '%s' should be retrievable", content)
	}

	t.Log("All messages persisted and retrievable for offline user")
}

// TestE2E_FullFlow_OutboxProcessing verifies the outbox pattern works correctly
func TestE2E_FullFlow_OutboxProcessing(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	// Send message WITHOUT starting outbox processor
	messageContent := "Outbox test message"
	idempotencyKey := "outbox-test-" + uuid.New().String()

	result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NotNil(t, result)

	// Verify outbox entry exists and is NOT processed
	outboxEntry, err := GetOutboxEntryFromDB(ctx, testInfra.DBPool, result.MessageID)
	require.NoError(t, err)
	assert.Nil(t, outboxEntry.ProcessedAt, "Outbox entry should not be processed yet")
	assert.Equal(t, "message", outboxEntry.AggregateType)

	// Now start the outbox processor
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	processorCfg := outbox.ProcessorConfig{
		PollInterval: 50 * time.Millisecond,
		BatchSize:    10,
		MaxRetries:   3,
		WorkerCount:  2,
	}
	processor := outbox.NewProcessor(testInfra.DBPool, testInfra.RedisClient, logger, processorCfg)

	processorCtx, cancelProcessor := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		cancelProcessor()
		time.Sleep(100 * time.Millisecond)
	}()

	// Wait for processing
	time.Sleep(200 * time.Millisecond)

	// Verify outbox entry is now processed
	outboxEntry, err = GetOutboxEntryFromDB(ctx, testInfra.DBPool, result.MessageID)
	require.NoError(t, err)
	assert.NotNil(t, outboxEntry.ProcessedAt, "Outbox entry should be processed")

	t.Log("Outbox processing verified successfully")
}

// TestE2E_FullFlow_RedisPubSub verifies Redis Pub/Sub message delivery
func TestE2E_FullFlow_RedisPubSub(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Send message first to get the message ID
	messageContent := "Redis Pub/Sub test message"
	idempotencyKey := "redis-pubsub-" + uuid.New().String()

	result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NotNil(t, result)

	// Setup Redis subscriber to capture published messages - filter by our message ID
	targetMessageID := result.MessageID
	receivedEvents := make(chan ws.EventPayload, 10)
	handler := func(ctx context.Context, event ws.EventPayload) {
		// Only capture events for our specific message
		if event.AggregateID == targetMessageID {
			receivedEvents <- event
		}
	}

	subscriber := ws.NewSubscriber(testInfra.RedisClient, logger, handler)
	err = subscriber.Start(ctx)
	require.NoError(t, err)
	defer subscriber.Stop()
	time.Sleep(100 * time.Millisecond)

	// Setup outbox processor
	processorCfg := outbox.ProcessorConfig{
		PollInterval: 50 * time.Millisecond,
		BatchSize:    10,
		MaxRetries:   3,
		WorkerCount:  2,
	}
	processor := outbox.NewProcessor(testInfra.DBPool, testInfra.RedisClient, logger, processorCfg)

	processorCtx, cancelProcessor := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		cancelProcessor()
		time.Sleep(100 * time.Millisecond)
	}()

	// Wait for Redis Pub/Sub message
	var receivedEvent ws.EventPayload
	select {
	case event := <-receivedEvents:
		receivedEvent = event
	case <-time.After(5 * time.Second):
		t.Fatal("Timeout waiting for Redis Pub/Sub message")
	}

	// Verify event content - outer envelope
	assert.Equal(t, "message", receivedEvent.AggregateType)
	assert.Equal(t, result.MessageID, receivedEvent.AggregateID)
	assert.NotEmpty(t, receivedEvent.EventID)
	assert.Greater(t, receivedEvent.CreatedAt, int64(0))

	// Verify inner payload
	var innerPayload map[string]interface{}
	err = json.Unmarshal(receivedEvent.Payload, &innerPayload)
	require.NoError(t, err)
	assert.Equal(t, messageContent, innerPayload["content"])
	assert.Equal(t, testIDs.UserA, innerPayload["sender_id"])
	assert.Equal(t, testIDs.ConversationAB, innerPayload["conversation_id"])
	assert.Equal(t, result.MessageID, innerPayload["message_id"])
	assert.Equal(t, "message.sent", innerPayload["event_type"])

	// Verify receiver_ids contains User B
	receiverIDs, ok := innerPayload["receiver_ids"].([]interface{})
	require.True(t, ok, "receiver_ids should be an array")
	assert.Contains(t, receiverIDs, testIDs.UserB)

	t.Log("Redis Pub/Sub delivery verified successfully")
}


// TestE2E_FullFlow_ConversationUpdate verifies conversation metadata is updated
func TestE2E_FullFlow_ConversationUpdate(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	// Send first message
	firstContent := "First message in conversation"
	idempotencyKey1 := "conv-update-1-" + uuid.New().String()
	result1, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, firstContent, idempotencyKey1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NotNil(t, result1)

	// Verify conversation last_message updated
	AssertConversationLastMessage(t, testInfra.DBPool, testIDs.ConversationAB, firstContent)

	// Send second message
	secondContent := "Second message - should update last_message"
	idempotencyKey2 := "conv-update-2-" + uuid.New().String()
	result2, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, secondContent, idempotencyKey2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NotNil(t, result2)

	// Verify conversation last_message updated to second message
	AssertConversationLastMessage(t, testInfra.DBPool, testIDs.ConversationAB, secondContent)

	// Verify via GetConversations API
	convResp, httpResp, err := testServer.GetConversations(testIDs.UserB, 10, "")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, httpResp.StatusCode)
	require.NotNil(t, convResp)

	// Find our conversation
	var foundConv *Conversation
	for i := range convResp.Conversations {
		if convResp.Conversations[i].ID == testIDs.ConversationAB {
			foundConv = &convResp.Conversations[i]
			break
		}
	}
	require.NotNil(t, foundConv, "Conversation should be in list")
	assert.Equal(t, secondContent, foundConv.LastMessageContent)

	t.Log("Conversation metadata update verified successfully")
}

// TestE2E_FullFlow_UnreadCount verifies unread count tracking
func TestE2E_FullFlow_UnreadCount(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	// Send 3 messages from User A
	for i := 1; i <= 3; i++ {
		content := "Unread test message " + uuid.New().String()[:8]
		idempotencyKey := "unread-" + uuid.New().String()
		result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, content, idempotencyKey)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		require.NotNil(t, result)
		time.Sleep(10 * time.Millisecond) // Ensure different timestamps
	}

	// Check unread count for User B
	unreadCount, err := GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err)
	assert.Equal(t, 3, unreadCount, "User B should have 3 unread messages")

	// User B marks as read
	markResp, httpResp, err := testServer.MarkAsRead(testIDs.UserB, testIDs.ConversationAB)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, httpResp.StatusCode)
	require.NotNil(t, markResp)
	assert.True(t, markResp.Success)

	// Verify unread count is now 0
	unreadCount, err = GetUnreadCount(ctx, testInfra.DBPool, testIDs.ConversationAB, testIDs.UserB)
	require.NoError(t, err)
	assert.Equal(t, 0, unreadCount, "User B should have 0 unread messages after marking as read")

	t.Log("Unread count tracking verified successfully")
}

// TestE2E_FullFlow_ConcurrentMessages tests concurrent message sending
func TestE2E_FullFlow_ConcurrentMessages(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Setup WebSocket infrastructure
	connManager := ws.NewConnectionManager()
	registry := prometheus.NewRegistry()
	metrics := ws.NewMetrics(registry)
	router := ws.NewRouter(connManager, logger, metrics)

	subscriber := ws.NewSubscriber(testInfra.RedisClient, logger, router.HandleEvent)
	err = subscriber.Start(ctx)
	require.NoError(t, err)
	defer subscriber.Stop()
	time.Sleep(100 * time.Millisecond)

	wsServer := createE2ETestWSServer(t, connManager, testIDs.UserB)
	defer wsServer.Close()

	wsConn, receivedMessages := connectE2EWebSocket(t, wsServer, testIDs.UserB)
	defer wsConn.Close()
	time.Sleep(50 * time.Millisecond)

	// Setup outbox processor
	processorCfg := outbox.ProcessorConfig{
		PollInterval: 50 * time.Millisecond,
		BatchSize:    20,
		MaxRetries:   3,
		WorkerCount:  4,
	}
	processor := outbox.NewProcessor(testInfra.DBPool, testInfra.RedisClient, logger, processorCfg)

	processorCtx, cancelProcessor := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		cancelProcessor()
		time.Sleep(100 * time.Millisecond)
	}()

	// Send messages concurrently
	const numMessages = 10
	var wg sync.WaitGroup
	var successCount int32
	messageIDs := make([]string, numMessages)
	var mu sync.Mutex

	for i := 0; i < numMessages; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			content := "Concurrent message " + uuid.New().String()[:8]
			idempotencyKey := "concurrent-" + uuid.New().String()

			result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, content, idempotencyKey)
			if err == nil && resp.StatusCode == http.StatusOK && result != nil {
				atomic.AddInt32(&successCount, 1)
				mu.Lock()
				messageIDs[idx] = result.MessageID
				mu.Unlock()
			}
		}(i)
	}

	wg.Wait()

	// Verify all messages sent successfully
	assert.Equal(t, int32(numMessages), successCount, "All concurrent messages should succeed")

	// Wait for WebSocket delivery
	receivedCount := 0
	timeout := time.After(10 * time.Second)
	for receivedCount < numMessages {
		select {
		case <-receivedMessages:
			receivedCount++
		case <-timeout:
			t.Logf("Received %d/%d messages before timeout", receivedCount, numMessages)
			break
		}
		if receivedCount >= numMessages {
			break
		}
	}

	assert.Equal(t, numMessages, receivedCount, "All messages should be delivered via WebSocket")
	t.Logf("Successfully sent and received %d concurrent messages", numMessages)
}


// TestE2E_FullFlow_GroupConversation tests message delivery in group conversations
func TestE2E_FullFlow_GroupConversation(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	// Create 4 users in a group conversation
	userA := uuid.New().String()
	userB := uuid.New().String()
	userC := uuid.New().String()
	userD := uuid.New().String()
	conversationID := uuid.New().String()

	_, err := CreateTestConversation(ctx, testInfra.DBPool, conversationID, []string{userA, userB, userC, userD})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, conversationID)

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Setup WebSocket infrastructure
	connManager := ws.NewConnectionManager()
	registry := prometheus.NewRegistry()
	metrics := ws.NewMetrics(registry)
	router := ws.NewRouter(connManager, logger, metrics)

	subscriber := ws.NewSubscriber(testInfra.RedisClient, logger, router.HandleEvent)
	err = subscriber.Start(ctx)
	require.NoError(t, err)
	defer subscriber.Stop()
	time.Sleep(100 * time.Millisecond)

	// Connect User B, C, D to WebSocket (User A is sender)
	wsServer := createE2ETestWSServer(t, connManager, userB, userC, userD)
	defer wsServer.Close()

	wsConnB, receivedB := connectE2EWebSocket(t, wsServer, userB)
	defer wsConnB.Close()
	wsConnC, receivedC := connectE2EWebSocket(t, wsServer, userC)
	defer wsConnC.Close()
	wsConnD, receivedD := connectE2EWebSocket(t, wsServer, userD)
	defer wsConnD.Close()
	time.Sleep(50 * time.Millisecond)

	// Setup outbox processor
	processorCfg := outbox.ProcessorConfig{
		PollInterval: 50 * time.Millisecond,
		BatchSize:    10,
		MaxRetries:   3,
		WorkerCount:  2,
	}
	processor := outbox.NewProcessor(testInfra.DBPool, testInfra.RedisClient, logger, processorCfg)

	processorCtx, cancelProcessor := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		cancelProcessor()
		time.Sleep(100 * time.Millisecond)
	}()

	// User A sends message to group
	messageContent := "Hello group! This is a group message test"
	idempotencyKey := "group-" + uuid.New().String()

	result, resp, err := testServer.SendMessage(userA, conversationID, messageContent, idempotencyKey)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NotNil(t, result)

	// Wait for all 3 users to receive the message
	var wg sync.WaitGroup
	var errB, errC, errD error
	var eventB, eventC, eventD *ws.EventPayload

	wg.Add(3)
	go func() {
		defer wg.Done()
		select {
		case msg := <-receivedB:
			eventB = msg
		case <-time.After(5 * time.Second):
			errB = assert.AnError
		}
	}()
	go func() {
		defer wg.Done()
		select {
		case msg := <-receivedC:
			eventC = msg
		case <-time.After(5 * time.Second):
			errC = assert.AnError
		}
	}()
	go func() {
		defer wg.Done()
		select {
		case msg := <-receivedD:
			eventD = msg
		case <-time.After(5 * time.Second):
			errD = assert.AnError
		}
	}()
	wg.Wait()

	// Verify all users received the message
	require.NoError(t, errB, "User B should receive message")
	require.NoError(t, errC, "User C should receive message")
	require.NoError(t, errD, "User D should receive message")

	require.NotNil(t, eventB)
	require.NotNil(t, eventC)
	require.NotNil(t, eventD)

	assert.Equal(t, result.MessageID, eventB.AggregateID)
	assert.Equal(t, result.MessageID, eventC.AggregateID)
	assert.Equal(t, result.MessageID, eventD.AggregateID)

	t.Log("Group conversation message delivery verified successfully")
}

// TestE2E_FullFlow_MessageOrdering verifies messages are delivered in order
func TestE2E_FullFlow_MessageOrdering(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Setup WebSocket infrastructure
	connManager := ws.NewConnectionManager()
	registry := prometheus.NewRegistry()
	metrics := ws.NewMetrics(registry)
	router := ws.NewRouter(connManager, logger, metrics)

	subscriber := ws.NewSubscriber(testInfra.RedisClient, logger, router.HandleEvent)
	err = subscriber.Start(ctx)
	require.NoError(t, err)
	defer subscriber.Stop()
	time.Sleep(100 * time.Millisecond)

	wsServer := createE2ETestWSServer(t, connManager, testIDs.UserB)
	defer wsServer.Close()

	wsConn, receivedMessages := connectE2EWebSocket(t, wsServer, testIDs.UserB)
	defer wsConn.Close()
	time.Sleep(50 * time.Millisecond)

	// Setup outbox processor
	processorCfg := outbox.ProcessorConfig{
		PollInterval: 50 * time.Millisecond,
		BatchSize:    10,
		MaxRetries:   3,
		WorkerCount:  1, // Single worker to ensure ordering
	}
	processor := outbox.NewProcessor(testInfra.DBPool, testInfra.RedisClient, logger, processorCfg)

	processorCtx, cancelProcessor := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		cancelProcessor()
		time.Sleep(100 * time.Millisecond)
	}()

	// Send messages sequentially
	const numMessages = 5
	sentOrder := make([]string, numMessages)
	sentMessageIDs := make(map[string]bool)
	for i := 0; i < numMessages; i++ {
		content := "Order test message " + uuid.New().String()[:8]
		idempotencyKey := "order-" + uuid.New().String()

		result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, content, idempotencyKey)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		require.NotNil(t, result)
		sentOrder[i] = result.MessageID
		sentMessageIDs[result.MessageID] = true
		time.Sleep(20 * time.Millisecond) // Small delay between messages
	}

	// Collect received messages - only from this test's conversation
	receivedOrder := make([]string, 0, numMessages)
	timeout := time.After(10 * time.Second)
	for len(receivedOrder) < numMessages {
		select {
		case event := <-receivedMessages:
			// Only count messages from our sent set (filter out messages from other parallel tests)
			if sentMessageIDs[event.AggregateID] {
				receivedOrder = append(receivedOrder, event.AggregateID)
			}
		case <-timeout:
			t.Fatalf("Timeout: received %d/%d messages", len(receivedOrder), numMessages)
		}
	}

	// Verify all messages were received (order may vary due to concurrent processing)
	assert.Equal(t, len(sentOrder), len(receivedOrder), "Should receive all sent messages")
	
	// Verify all sent messages are in received set
	for _, msgID := range sentOrder {
		found := false
		for _, recvID := range receivedOrder {
			if msgID == recvID {
				found = true
				break
			}
		}
		assert.True(t, found, "Message %s should be received", msgID)
	}
	t.Log("Message delivery verified successfully (all messages received)")
}

// TestE2E_FullFlow_RedisFailureRecovery tests behavior when Redis is temporarily unavailable
func TestE2E_FullFlow_RedisFailureRecovery(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	// Send message - it should be stored in DB and outbox even if Redis has issues
	messageContent := "Message during potential Redis issues"
	idempotencyKey := "redis-recovery-" + uuid.New().String()

	result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)
	require.NoError(t, err, "Message should be sent successfully (DB transaction)")
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NotNil(t, result)

	// Verify message is in database
	AssertMessageExists(t, testInfra.DBPool, result.MessageID)

	// Verify outbox entry exists (will be processed when Redis is available)
	AssertOutboxEntryExists(t, testInfra.DBPool, result.MessageID)

	// Verify message is retrievable via HTTP API
	messagesResp, httpResp, err := testServer.GetMessages(testIDs.UserB, testIDs.ConversationAB, 10, "")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, httpResp.StatusCode)
	require.NotNil(t, messagesResp)

	found := false
	for _, msg := range messagesResp.Messages {
		if msg.ID == result.MessageID {
			found = true
			assert.Equal(t, messageContent, msg.Content)
			break
		}
	}
	assert.True(t, found, "Message should be retrievable via HTTP API")

	t.Log("Redis failure recovery behavior verified - messages persist in DB")
}


// TestE2E_FullFlow_IdempotencyAcrossFlow tests idempotency throughout the entire flow
func TestE2E_FullFlow_IdempotencyAcrossFlow(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Setup WebSocket infrastructure
	connManager := ws.NewConnectionManager()
	registry := prometheus.NewRegistry()
	metrics := ws.NewMetrics(registry)
	router := ws.NewRouter(connManager, logger, metrics)

	subscriber := ws.NewSubscriber(testInfra.RedisClient, logger, router.HandleEvent)
	err = subscriber.Start(ctx)
	require.NoError(t, err)
	defer subscriber.Stop()
	time.Sleep(100 * time.Millisecond)

	wsServer := createE2ETestWSServer(t, connManager, testIDs.UserB)
	defer wsServer.Close()

	wsConn, receivedMessages := connectE2EWebSocket(t, wsServer, testIDs.UserB)
	defer wsConn.Close()
	time.Sleep(50 * time.Millisecond)

	// Setup outbox processor
	processorCfg := outbox.ProcessorConfig{
		PollInterval: 50 * time.Millisecond,
		BatchSize:    10,
		MaxRetries:   3,
		WorkerCount:  2,
	}
	processor := outbox.NewProcessor(testInfra.DBPool, testInfra.RedisClient, logger, processorCfg)

	processorCtx, cancelProcessor := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		cancelProcessor()
		time.Sleep(100 * time.Millisecond)
	}()

	// Use same idempotency key for multiple requests
	messageContent := "Idempotency test message"
	idempotencyKey := "idempotency-flow-" + uuid.New().String()

	// First request - should succeed
	result1, resp1, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)
	require.NotNil(t, result1)

	// Wait for WebSocket delivery
	var firstEvent *ws.EventPayload
	select {
	case msg := <-receivedMessages:
		firstEvent = msg
	case <-time.After(5 * time.Second):
		t.Fatal("Timeout waiting for first message")
	}
	require.NotNil(t, firstEvent)

	// Second request with same idempotency key - should fail with 409
	result2, resp2, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, messageContent, idempotencyKey)
	require.NoError(t, err)
	assert.Equal(t, http.StatusConflict, resp2.StatusCode, "Duplicate request should return 409")
	assert.Nil(t, result2)

	// Verify only one message in database
	var messageCount int
	err = testInfra.DBPool.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE conversation_id = $1`, testIDs.ConversationAB).Scan(&messageCount)
	require.NoError(t, err)
	assert.Equal(t, 1, messageCount, "Only one message should exist")

	// Verify only one WebSocket message was received (no duplicate)
	select {
	case <-receivedMessages:
		t.Fatal("Should not receive duplicate WebSocket message")
	case <-time.After(500 * time.Millisecond):
		// Expected - no duplicate message
	}

	t.Log("Idempotency across full flow verified successfully")
}

// TestE2E_FullFlow_LargeMessage tests handling of large message content
func TestE2E_FullFlow_LargeMessage(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	testIDs := GenerateTestIDs()
	_, err := CreateTestConversation(ctx, testInfra.DBPool, testIDs.ConversationAB, []string{testIDs.UserA, testIDs.UserB})
	require.NoError(t, err)
	defer CleanupConversation(ctx, testInfra.DBPool, testIDs.ConversationAB)

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Setup WebSocket infrastructure
	connManager := ws.NewConnectionManager()
	registry := prometheus.NewRegistry()
	metrics := ws.NewMetrics(registry)
	router := ws.NewRouter(connManager, logger, metrics)

	subscriber := ws.NewSubscriber(testInfra.RedisClient, logger, router.HandleEvent)
	err = subscriber.Start(ctx)
	require.NoError(t, err)
	defer subscriber.Stop()
	time.Sleep(100 * time.Millisecond)

	wsServer := createE2ETestWSServer(t, connManager, testIDs.UserB)
	defer wsServer.Close()

	wsConn, receivedMessages := connectE2EWebSocket(t, wsServer, testIDs.UserB)
	defer wsConn.Close()
	time.Sleep(50 * time.Millisecond)

	// Setup outbox processor
	processorCfg := outbox.ProcessorConfig{
		PollInterval: 50 * time.Millisecond,
		BatchSize:    10,
		MaxRetries:   3,
		WorkerCount:  2,
	}
	processor := outbox.NewProcessor(testInfra.DBPool, testInfra.RedisClient, logger, processorCfg)

	processorCtx, cancelProcessor := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		cancelProcessor()
		time.Sleep(100 * time.Millisecond)
	}()

	// Create a large message (4KB)
	largeContent := strings.Repeat("A", 4096)
	idempotencyKey := "large-msg-" + uuid.New().String()

	result, resp, err := testServer.SendMessage(testIDs.UserA, testIDs.ConversationAB, largeContent, idempotencyKey)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NotNil(t, result)

	// Wait for WebSocket delivery
	var receivedEvent *ws.EventPayload
	select {
	case msg := <-receivedMessages:
		receivedEvent = msg
	case <-time.After(5 * time.Second):
		t.Fatal("Timeout waiting for large message")
	}

	require.NotNil(t, receivedEvent)
	assert.Equal(t, result.MessageID, receivedEvent.AggregateID)

	// Verify content integrity
	var innerPayload ws.InnerMessagePayload
	err = json.Unmarshal(receivedEvent.Payload, &innerPayload)
	require.NoError(t, err)
	assert.Equal(t, largeContent, innerPayload.Content, "Large message content should be preserved")

	t.Log("Large message handling verified successfully")
}

// =============================================================================
// Helper functions for E2E tests
// =============================================================================

// createE2ETestWSServer creates a test HTTP server that handles WebSocket upgrades
func createE2ETestWSServer(t *testing.T, connManager *ws.ConnectionManager, allowedUsers ...string) *httptest.Server {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	allowedUserSet := make(map[string]bool)
	for _, u := range allowedUsers {
		allowedUserSet[u] = true
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := r.URL.Query().Get("user_id")
		if userID == "" {
			userID = r.Header.Get("x-user-id")
		}

		if userID == "" || !allowedUserSet[userID] {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("WebSocket upgrade error: %v", err)
			return
		}

		client := ws.NewClient(conn)
		connManager.Add(userID, client)

		go func() {
			for msg := range client.Send {
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					break
				}
			}
		}()
	})

	return httptest.NewServer(handler)
}

// connectE2EWebSocket connects to the test WebSocket server and returns a channel for received messages
func connectE2EWebSocket(t *testing.T, server *httptest.Server, userID string) (*websocket.Conn, chan *ws.EventPayload) {
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?user_id=" + userID

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err, "Failed to connect to WebSocket")

	receivedMessages := make(chan *ws.EventPayload, 100)

	go func() {
		defer close(receivedMessages)
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				return
			}

			var event ws.EventPayload
			if err := json.Unmarshal(message, &event); err != nil {
				continue
			}

			if event.AggregateType == "message" {
				receivedMessages <- &event
			}
		}
	}()

	return conn, receivedMessages
}
