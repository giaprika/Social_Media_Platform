package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"time"

	chatv1 "chat-service/api/chat/v1"
	"chat-service/internal/auth"
	"chat-service/internal/middleware"
	"chat-service/internal/service"
	"chat-service/pkg/idempotency"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"
)

const bufSize = 1024 * 1024

// TestServer manages the test HTTP server with gRPC backend
type TestServer struct {
	HTTPServer      *httptest.Server
	ChatService     *service.ChatService
	Infrastructure  *TestInfrastructure
	grpcServer      *grpc.Server
	listener        *bufconn.Listener
	logger          *zap.Logger
}

// NewTestServer creates a new test server with all middleware configured
func NewTestServer(infra *TestInfrastructure) (*TestServer, error) {
	// Initialize logger for tests (use a simpler config for test output)
	logger, err := zap.NewDevelopment()
	if err != nil {
		return nil, fmt.Errorf("failed to create logger: %w", err)
	}

	// Create idempotency checker with Redis
	idempotencyChecker := idempotency.NewRedisChecker(infra.RedisClient)

	// Create ChatService with real database and Redis connections
	chatService := service.NewChatService(infra.DBPool, idempotencyChecker, logger)

	// Setup gRPC server with all middleware (auth, logging, recovery)
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			middleware.GrpcLogger(logger),
			middleware.GrpcRecovery(logger),
			auth.GrpcAuthInterceptor(logger),
		),
	)

	// Register ChatService with gRPC server
	chatv1.RegisterChatServiceServer(grpcServer, chatService)

	// Create in-memory listener for gRPC (using bufconn for testing)
	listener := bufconn.Listen(bufSize)

	// Start gRPC server in background
	go func() {
		if err := grpcServer.Serve(listener); err != nil {
			logger.Error("gRPC server failed", zap.Error(err))
		}
	}()

	// Setup HTTP gateway using grpc-gateway
	ctx := context.Background()
	gatewayMux := runtime.NewServeMux(
		runtime.WithErrorHandler(middleware.GatewayErrorHandler(logger)),
		runtime.WithIncomingHeaderMatcher(middleware.CustomHeaderMatcher),
	)

	// Create gRPC client connection to the in-memory listener
	conn, err := grpc.DialContext(
		ctx,
		"bufnet",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) {
			return listener.Dial()
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		grpcServer.Stop()
		return nil, fmt.Errorf("failed to dial bufnet: %w", err)
	}

	// Register gateway handler with the gRPC connection
	if err := chatv1.RegisterChatServiceHandler(ctx, gatewayMux, conn); err != nil {
		conn.Close()
		grpcServer.Stop()
		return nil, fmt.Errorf("failed to register gateway handler: %w", err)
	}

	// Setup HTTP middleware chain
	httpHandler := middleware.HTTPRecovery(logger)(
		middleware.HTTPLogger(logger)(
			middleware.HTTPAuthExtractor(logger)(gatewayMux)))

	// Create httptest.Server for HTTP requests
	httpServer := httptest.NewServer(httpHandler)

	return &TestServer{
		HTTPServer:     httpServer,
		ChatService:    chatService,
		Infrastructure: infra,
		grpcServer:     grpcServer,
		listener:       listener,
		logger:         logger,
	}, nil
}

// Close shuts down the test server and cleans up resources
func (ts *TestServer) Close() {
	if ts.HTTPServer != nil {
		ts.HTTPServer.Close()
	}
	if ts.grpcServer != nil {
		ts.grpcServer.Stop()
	}
	if ts.listener != nil {
		ts.listener.Close()
	}
	if ts.logger != nil {
		ts.logger.Sync()
	}
}

// MakeRequest is a helper method for making HTTP requests to the test server
func (ts *TestServer) MakeRequest(method, path string, body interface{}, headers map[string]string) (*http.Response, error) {
	var reqBody *bytes.Buffer
	
	// Marshal body to JSON if provided
	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonData)
	} else {
		reqBody = bytes.NewBuffer(nil)
	}
	
	// Create HTTP request without context (use client timeout instead)
	req, err := http.NewRequest(method, ts.HTTPServer.URL+path, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	
	// Set Content-Type header for JSON
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	
	// Add custom headers
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	
	// Execute request with timeout (using client timeout to avoid context cancellation issues)
	client := &http.Client{
		Timeout: 10 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	
	return resp, nil
}

// Response structures matching proto definitions

// SendMessageResponse represents the response from SendMessage API
type SendMessageResponse struct {
	MessageID string `json:"messageId"` // grpc-gateway uses camelCase
	Status    string `json:"status"`
}

// ChatMessage represents a single chat message
type ChatMessage struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversationId"` // grpc-gateway uses camelCase
	SenderID       string `json:"senderId"`       // grpc-gateway uses camelCase
	Content        string `json:"content"`
	CreatedAt      string `json:"createdAt"` // grpc-gateway uses camelCase
}

// GetMessagesResponse represents the response from GetMessages API
type GetMessagesResponse struct {
	Messages   []ChatMessage `json:"messages"`
	NextCursor string        `json:"nextCursor"` // grpc-gateway uses camelCase
}

// Conversation represents a conversation with metadata
type Conversation struct {
	ID                 string `json:"id"`
	LastMessageContent string `json:"lastMessageContent"` // grpc-gateway uses camelCase
	LastMessageAt      string `json:"lastMessageAt"`      // grpc-gateway uses camelCase
	UnreadCount        int32  `json:"unreadCount"`        // grpc-gateway uses camelCase
}

// GetConversationsResponse represents the response from GetConversations API
type GetConversationsResponse struct {
	Conversations []Conversation `json:"conversations"`
	NextCursor    string         `json:"nextCursor"` // grpc-gateway uses camelCase
}

// MarkAsReadResponse represents the response from MarkAsRead API
type MarkAsReadResponse struct {
	Success bool `json:"success"`
}

// ErrorResponse represents an error response from the API
type ErrorResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// SendMessage sends a message via HTTP POST with authentication header
func (ts *TestServer) SendMessage(userID, conversationID, content, idempotencyKey string) (*SendMessageResponse, *http.Response, error) {
	requestBody := map[string]interface{}{
		"conversation_id": conversationID,
		"content":         content,
		"idempotency_key": idempotencyKey,
	}

	headers := map[string]string{
		"x-user-id": userID,
	}

	resp, err := ts.MakeRequest("POST", "/v1/messages", requestBody, headers)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to send message: %w", err)
	}

	// Parse response if successful
	if resp.StatusCode == http.StatusOK {
		var result SendMessageResponse
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, resp, fmt.Errorf("failed to read response body: %w", err)
		}

		if err := json.Unmarshal(body, &result); err != nil {
			return nil, resp, fmt.Errorf("failed to parse response: %w", err)
		}

		return &result, resp, nil
	}

	return nil, resp, nil
}

// GetMessages retrieves messages for a conversation with query parameters
func (ts *TestServer) GetMessages(userID, conversationID string, limit int32, beforeTimestamp string) (*GetMessagesResponse, *http.Response, error) {
	// Build URL with query parameters
	path := fmt.Sprintf("/v1/conversations/%s/messages", conversationID)
	
	// Add query parameters
	params := url.Values{}
	if limit > 0 {
		params.Add("limit", strconv.Itoa(int(limit)))
	}
	if beforeTimestamp != "" {
		params.Add("before_timestamp", beforeTimestamp)
	}
	
	if len(params) > 0 {
		path = path + "?" + params.Encode()
	}

	headers := map[string]string{
		"x-user-id": userID,
	}

	resp, err := ts.MakeRequest("GET", path, nil, headers)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get messages: %w", err)
	}

	// Parse response if successful
	if resp.StatusCode == http.StatusOK {
		var result GetMessagesResponse
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, resp, fmt.Errorf("failed to read response body: %w", err)
		}

		if err := json.Unmarshal(body, &result); err != nil {
			return nil, resp, fmt.Errorf("failed to parse response: %w", err)
		}

		return &result, resp, nil
	}

	return nil, resp, nil
}

// GetConversations retrieves conversations for a user with pagination support
func (ts *TestServer) GetConversations(userID string, limit int32, cursor string) (*GetConversationsResponse, *http.Response, error) {
	path := "/v1/conversations"
	
	// Add query parameters
	params := url.Values{}
	if limit > 0 {
		params.Add("limit", strconv.Itoa(int(limit)))
	}
	if cursor != "" {
		params.Add("cursor", cursor)
	}
	
	if len(params) > 0 {
		path = path + "?" + params.Encode()
	}

	headers := map[string]string{
		"x-user-id": userID,
	}

	resp, err := ts.MakeRequest("GET", path, nil, headers)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get conversations: %w", err)
	}

	// Parse response if successful
	if resp.StatusCode == http.StatusOK {
		var result GetConversationsResponse
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, resp, fmt.Errorf("failed to read response body: %w", err)
		}

		if err := json.Unmarshal(body, &result); err != nil {
			return nil, resp, fmt.Errorf("failed to parse response: %w", err)
		}

		return &result, resp, nil
	}

	return nil, resp, nil
}

// MarkAsRead marks all messages in a conversation as read for the authenticated user
func (ts *TestServer) MarkAsRead(userID, conversationID string) (*MarkAsReadResponse, *http.Response, error) {
	path := fmt.Sprintf("/v1/conversations/%s/read", conversationID)
	
	// Empty body for POST request (conversation_id is in URL)
	requestBody := map[string]interface{}{}

	headers := map[string]string{
		"x-user-id": userID,
	}

	resp, err := ts.MakeRequest("POST", path, requestBody, headers)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to mark as read: %w", err)
	}

	// Parse response if successful
	if resp.StatusCode == http.StatusOK {
		var result MarkAsReadResponse
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, resp, fmt.Errorf("failed to read response body: %w", err)
		}

		if err := json.Unmarshal(body, &result); err != nil {
			return nil, resp, fmt.Errorf("failed to parse response: %w", err)
		}

		return &result, resp, nil
	}

	return nil, resp, nil
}

// ParseErrorResponse parses an error response from the API
func ParseErrorResponse(resp *http.Response) (*ErrorResponse, error) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read error response body: %w", err)
	}
	
	var errorResp ErrorResponse
	if err := json.Unmarshal(body, &errorResp); err != nil {
		// If JSON parsing fails, return raw body as message
		return &ErrorResponse{
			Code:    resp.StatusCode,
			Message: string(body),
		}, nil
	}
	
	return &errorResp, nil
}
