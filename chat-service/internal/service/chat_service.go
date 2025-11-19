package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	chatv1 "chat-service/api/chat/v1"
	ctxkeys "chat-service/internal/context"
	"chat-service/internal/repository"
	"chat-service/pkg/idempotency"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Common errors
var (
	ErrInvalidRequest      = errors.New("invalid request")
	ErrEmptyContent        = errors.New("message content cannot be empty")
	ErrEmptyConversationID = errors.New("conversation_id cannot be empty")
	ErrEmptyIdempotencyKey = errors.New("idempotency_key cannot be empty")
	ErrTransactionFailed   = errors.New("transaction failed")
)

// ChatService implements the gRPC ChatService interface
type ChatService struct {
	chatv1.UnimplementedChatServiceServer
	db               *pgxpool.Pool
	queries          *repository.Queries
	idempotencyCheck idempotency.Checker
	logger           *zap.Logger

	getMessagesFn func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error)
}

// NewChatService creates a new ChatService instance
func NewChatService(
	db *pgxpool.Pool,
	idempotencyCheck idempotency.Checker,
	logger *zap.Logger,
) *ChatService {
	service := &ChatService{
		db:               db,
		queries:          repository.New(db),
		idempotencyCheck: idempotencyCheck,
		logger:           logger,
	}
	service.getMessagesFn = service.queries.GetMessages
	return service
}

// SendMessage handles sending a new message
func (s *ChatService) SendMessage(ctx context.Context, req *chatv1.SendMessageRequest) (*chatv1.SendMessageResponse, error) {
	// 1. Extract user_id from context (set by auth middleware)
	userID, err := getUserIDFromContext(ctx)
	if err != nil {
		s.logger.Error("failed to get user_id from context", zap.Error(err))
		return nil, err
	}

	// 2. Validate request
	if err := s.validateSendMessageRequest(req); err != nil {
		s.logger.Error("validation failed",
			zap.Error(err),
			zap.String("conversation_id", req.ConversationId),
			zap.String("user_id", userID),
		)
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	// 3. Check idempotency
	err = s.idempotencyCheck.Check(ctx, req.IdempotencyKey)
	if err != nil {
		if errors.Is(err, idempotency.ErrDuplicateRequest) {
			s.logger.Warn("duplicate request detected",
				zap.String("idempotency_key", req.IdempotencyKey),
				zap.String("conversation_id", req.ConversationId),
				zap.String("user_id", userID),
			)
			return nil, status.Error(codes.AlreadyExists, "duplicate request: message already sent")
		}
		s.logger.Error("idempotency check failed",
			zap.Error(err),
			zap.String("idempotency_key", req.IdempotencyKey),
		)
		return nil, status.Error(codes.Internal, "failed to check idempotency")
	}

	// 4. Execute transaction: upsert conversation + insert message + insert outbox
	messageID, err := s.sendMessageTx(ctx, req, userID)
	if err != nil {
		s.logger.Error("transaction failed",
			zap.Error(err),
			zap.String("conversation_id", req.ConversationId),
			zap.String("user_id", userID),
		)
		return nil, status.Error(codes.Internal, "failed to send message")
	}

	s.logger.Info("message sent successfully",
		zap.String("message_id", messageID),
		zap.String("conversation_id", req.ConversationId),
		zap.String("user_id", userID),
	)

	return &chatv1.SendMessageResponse{
		MessageId: messageID,
		Status:    "SENT",
	}, nil
}

// validateSendMessageRequest validates the SendMessage request
func (s *ChatService) validateSendMessageRequest(req *chatv1.SendMessageRequest) error {
	if req == nil {
		return ErrInvalidRequest
	}

	if req.ConversationId == "" {
		return ErrEmptyConversationID
	}

	if req.Content == "" {
		return ErrEmptyContent
	}

	if req.IdempotencyKey == "" {
		return ErrEmptyIdempotencyKey
	}

	return nil
}

// sendMessageTx executes the message sending in a transaction
func (s *ChatService) sendMessageTx(ctx context.Context, req *chatv1.SendMessageRequest, userID string) (string, error) {
	// Parse UUIDs
	conversationUUID, err := parseUUID(req.ConversationId)
	if err != nil {
		return "", fmt.Errorf("invalid conversation_id: %w", err)
	}

	senderUUID, err := parseUUID(userID)
	if err != nil {
		return "", fmt.Errorf("invalid user_id: %w", err)
	}

	// Begin transaction
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) // Rollback if not committed

	qtx := s.queries.WithTx(tx)

	// 1. Upsert conversation (ensure it exists)
	_, err = qtx.UpsertConversation(ctx, conversationUUID)
	if err != nil {
		return "", fmt.Errorf("failed to upsert conversation: %w", err)
	}

	// 2. Add sender as participant (idempotent with ON CONFLICT DO NOTHING)
	err = qtx.AddParticipant(ctx, repository.AddParticipantParams{
		ConversationID: conversationUUID,
		UserID:         senderUUID,
	})
	if err != nil {
		return "", fmt.Errorf("failed to add participant: %w", err)
	}

	// 3. Insert message
	message, err := qtx.InsertMessage(ctx, repository.InsertMessageParams{
		ConversationID: conversationUUID,
		SenderID:       senderUUID,
		Content:        req.Content,
	})
	if err != nil {
		return "", fmt.Errorf("failed to insert message: %w", err)
	}

	// 4. Update conversation last message
	err = qtx.UpdateConversationLastMessage(ctx, repository.UpdateConversationLastMessageParams{
		ID: conversationUUID,
		LastMessageContent: pgtype.Text{
			String: req.Content,
			Valid:  true,
		},
		LastMessageAt: message.CreatedAt,
	})
	if err != nil {
		return "", fmt.Errorf("failed to update conversation last message: %w", err)
	}

	// 5. Create outbox event payload
	payload, err := s.createMessageEventPayload(message)
	if err != nil {
		return "", fmt.Errorf("failed to create event payload: %w", err)
	}

	// 6. Insert outbox event
	err = qtx.InsertOutbox(ctx, repository.InsertOutboxParams{
		AggregateType: "message",
		AggregateID:   message.ID,
		Payload:       payload,
	})
	if err != nil {
		return "", fmt.Errorf("failed to insert outbox: %w", err)
	}

	// Commit transaction
	if err = tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("failed to commit transaction: %w", err)
	}

	return uuidToString(message.ID), nil
}

// createMessageEventPayload creates the JSON payload for the outbox event
func (s *ChatService) createMessageEventPayload(message repository.Message) ([]byte, error) {
	event := map[string]interface{}{
		"event_type":      "message.sent",
		"message_id":      uuidToString(message.ID),
		"conversation_id": uuidToString(message.ConversationID),
		"sender_id":       uuidToString(message.SenderID),
		"content":         message.Content,
		"created_at":      message.CreatedAt.Time.Format(time.RFC3339),
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal event: %w", err)
	}

	return payload, nil
}

// parseUUID converts a string UUID to pgtype.UUID
func parseUUID(uuidStr string) (pgtype.UUID, error) {
	var uuid pgtype.UUID
	err := uuid.Scan(uuidStr)
	if err != nil {
		return pgtype.UUID{}, err
	}
	return uuid, nil
}

// uuidToString converts pgtype.UUID to string
func uuidToString(uuid pgtype.UUID) string {
	if !uuid.Valid {
		return ""
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x",
		uuid.Bytes[0:4], uuid.Bytes[4:6], uuid.Bytes[6:8], uuid.Bytes[8:10], uuid.Bytes[10:16])
}

const (
	defaultMessagesLimit int32 = 50
	maxMessagesLimit     int32 = 100
)

// GetMessages returns list of messages for a conversation with pagination support.
func (s *ChatService) GetMessages(ctx context.Context, req *chatv1.GetMessagesRequest) (*chatv1.GetMessagesResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request cannot be nil")
	}

	if req.ConversationId == "" {
		return nil, status.Error(codes.InvalidArgument, "conversation_id is required")
	}

	conversationUUID, err := parseUUID(req.ConversationId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid conversation_id")
	}

	limit := sanitizeLimit(req.Limit)

	var before interface{}
	if req.BeforeTimestamp != "" {
		beforeTs, err := parseTimestampToPgtype(req.BeforeTimestamp)
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, "invalid before_timestamp, must be RFC3339")
		}
		before = beforeTs
	}

	params := repository.GetMessagesParams{
		ConversationID: conversationUUID,
		Before:         before,
		Limit:          limit,
	}

	messages, err := s.getMessages(ctx, params)
	if err != nil {
		s.logger.Error("failed to fetch messages",
			zap.Error(err),
			zap.String("conversation_id", req.ConversationId),
		)
		return nil, status.Error(codes.Internal, "failed to fetch messages")
	}

	respMessages := make([]*chatv1.ChatMessage, 0, len(messages))
	for _, msg := range messages {
		respMessages = append(respMessages, &chatv1.ChatMessage{
			Id:             uuidToString(msg.ID),
			ConversationId: uuidToString(msg.ConversationID),
			SenderId:       uuidToString(msg.SenderID),
			Content:        msg.Content,
			CreatedAt:      formatTimestamp(msg.CreatedAt),
		})
	}

	nextCursor := ""
	if len(messages) > 0 {
		nextCursor = formatTimestamp(messages[len(messages)-1].CreatedAt)
	}

	return &chatv1.GetMessagesResponse{
		Messages:   respMessages,
		NextCursor: nextCursor,
	}, nil
}

// GetConversations returns list of conversations for a user with pagination support.
func (s *ChatService) GetConversations(ctx context.Context, req *chatv1.GetConversationsRequest) (*chatv1.GetConversationsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request cannot be nil")
	}

	// Extract user_id from context (set by auth middleware)
	userID, err := getUserIDFromContext(ctx)
	if err != nil {
		s.logger.Error("failed to get user_id from context", zap.Error(err))
		return nil, err
	}

	userUUID, err := parseUUID(userID)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}

	limit := sanitizeLimit(req.Limit)

	var before pgtype.Timestamptz
	if req.Cursor != "" {
		beforeTs, err := parseTimestampToPgtype(req.Cursor)
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, "invalid cursor, must be RFC3339")
		}
		before = beforeTs
	}

	params := repository.GetConversationsForUserParams{
		UserID:  userUUID,
		Column2: before,
		Limit:   limit,
	}

	conversations, err := s.queries.GetConversationsForUser(ctx, params)
	if err != nil {
		s.logger.Error("failed to fetch conversations",
			zap.Error(err),
			zap.String("user_id", userID),
		)
		return nil, status.Error(codes.Internal, "failed to fetch conversations")
	}

	respConversations := make([]*chatv1.Conversation, 0, len(conversations))
	for _, conv := range conversations {
		var lastMessageContent string
		if conv.LastMessageContent.Valid {
			lastMessageContent = conv.LastMessageContent.String
		}

		respConversations = append(respConversations, &chatv1.Conversation{
			Id:                 uuidToString(conv.ID),
			LastMessageContent: lastMessageContent,
			LastMessageAt:      formatTimestamp(conv.LastMessageAt),
			UnreadCount:        int32(conv.UnreadCount),
		})
	}

	nextCursor := ""
	if len(conversations) > 0 {
		nextCursor = formatTimestamp(conversations[len(conversations)-1].LastMessageAt)
	}

	return &chatv1.GetConversationsResponse{
		Conversations: respConversations,
		NextCursor:    nextCursor,
	}, nil
}

// MarkAsRead marks all messages in a conversation as read for a user.
func (s *ChatService) MarkAsRead(ctx context.Context, req *chatv1.MarkAsReadRequest) (*chatv1.MarkAsReadResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request cannot be nil")
	}

	if req.ConversationId == "" {
		return nil, status.Error(codes.InvalidArgument, "conversation_id is required")
	}

	// Extract user_id from context (set by auth middleware)
	userID, err := getUserIDFromContext(ctx)
	if err != nil {
		s.logger.Error("failed to get user_id from context", zap.Error(err))
		return nil, err
	}

	conversationUUID, err := parseUUID(req.ConversationId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid conversation_id")
	}

	userUUID, err := parseUUID(userID)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}

	err = s.queries.MarkAsRead(ctx, repository.MarkAsReadParams{
		ConversationID: conversationUUID,
		UserID:         userUUID,
	})
	if err != nil {
		s.logger.Error("failed to mark conversation as read",
			zap.Error(err),
			zap.String("conversation_id", req.ConversationId),
			zap.String("user_id", userID),
		)
		return nil, status.Error(codes.Internal, "failed to mark conversation as read")
	}

	return &chatv1.MarkAsReadResponse{
		Success: true,
	}, nil
}

func (s *ChatService) getMessages(ctx context.Context, params repository.GetMessagesParams) ([]repository.Message, error) {
	if s.getMessagesFn != nil {
		return s.getMessagesFn(ctx, params)
	}
	return s.queries.GetMessages(ctx, params)
}

func sanitizeLimit(limit int32) int32 {
	if limit <= 0 {
		return defaultMessagesLimit
	}
	if limit > maxMessagesLimit {
		return maxMessagesLimit
	}
	return limit
}

func parseTimestampToPgtype(value string) (pgtype.Timestamptz, error) {
	var ts pgtype.Timestamptz
	if value == "" {
		return ts, nil
	}

	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		parsed, err = time.Parse(time.RFC3339, value)
		if err != nil {
			return ts, err
		}
	}

	ts.Valid = true
	ts.Time = parsed
	return ts, nil
}

func formatTimestamp(ts pgtype.Timestamptz) string {
	if !ts.Valid {
		return ""
	}
	return ts.Time.Format(time.RFC3339Nano)
}

// getUserIDFromContext retrieves user_id from context (set by auth middleware)
func getUserIDFromContext(ctx context.Context) (string, error) {
	userID, ok := ctx.Value(ctxkeys.UserIDKey).(string)
	if !ok || userID == "" {
		return "", status.Error(codes.Unauthenticated, "user_id not found in context")
	}
	return userID, nil
}
