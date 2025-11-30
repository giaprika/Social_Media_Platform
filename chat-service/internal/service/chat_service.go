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

	"github.com/jackc/pgx/v5"
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

	// Injectable functions for testing
	getMessagesFn                  func(ctx context.Context, arg repository.GetMessagesParams) ([]repository.Message, error)
	getConversationsForUserFn      func(ctx context.Context, arg repository.GetConversationsForUserParams) ([]repository.GetConversationsForUserRow, error)
	markAsReadFn                   func(ctx context.Context, arg repository.MarkAsReadParams) error
	beginTxFn                      func(ctx context.Context) (repository.DBTX, error)
	upsertConversationFn           func(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error)
	addParticipantFn               func(ctx context.Context, qtx *repository.Queries, params repository.AddParticipantParams) error
	addConversationParticipantsFn  func(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error
	insertMessageFn                func(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error)
	updateLastMessageFn            func(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error
	insertOutboxFn                 func(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error
	commitTxFn                     func(ctx context.Context, tx repository.DBTX) error
	rollbackTxFn                   func(ctx context.Context, tx repository.DBTX) error
	getConversationParticipantsFn  func(ctx context.Context, qtx *repository.Queries, conversationID pgtype.UUID) ([]pgtype.UUID, error)
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

	// Parse receiver_ids if provided
	receiverUUIDs, err := parseReceiverIDs(req.ReceiverIds)
	if err != nil {
		return "", err
	}

	// Begin transaction
	tx, err := s.beginTx(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() { _ = s.rollbackTx(ctx, tx) }() // Rollback if not committed

	// Create queries with transaction context
	// For testing, we pass the tx directly to the injectable functions
	// For production, WithTx expects pgx.Tx, so we type assert
	var qtx *repository.Queries
	if pgxTx, ok := tx.(pgx.Tx); ok {
		qtx = s.queries.WithTx(pgxTx)
	} else {
		// For testing with mocked tx, create a new Queries with the DBTX
		qtx = repository.New(tx)
	}

	// 1. Upsert conversation (ensure it exists)
	_, err = s.upsertConversation(ctx, qtx, conversationUUID)
	if err != nil {
		return "", fmt.Errorf("failed to upsert conversation: %w", err)
	}

	// 2. Add sender + receivers as participants using bulk insert
	// Merge sender and receivers into allParticipants array
	allParticipants := make([]pgtype.UUID, 0, len(receiverUUIDs)+1)
	allParticipants = append(allParticipants, senderUUID)
	allParticipants = append(allParticipants, receiverUUIDs...)

	// Bulk insert all participants - ON CONFLICT DO NOTHING handles duplicates
	err = s.addConversationParticipants(ctx, qtx, repository.AddConversationParticipantsParams{
		ConversationID: conversationUUID,
		Column2:        allParticipants,
	})
	if err != nil {
		return "", fmt.Errorf("failed to add participants: %w", err)
	}

	// 3. Insert message
	message, err := s.insertMessage(ctx, qtx, repository.InsertMessageParams{
		ConversationID: conversationUUID,
		SenderID:       senderUUID,
		Content:        req.Content,
	})
	if err != nil {
		return "", fmt.Errorf("failed to insert message: %w", err)
	}

	// 4. Update conversation last message
	err = s.updateLastMessage(ctx, qtx, repository.UpdateConversationLastMessageParams{
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

	// 5. Get all participants to determine receivers
	participants, err := s.getConversationParticipants(ctx, qtx, conversationUUID)
	if err != nil {
		return "", fmt.Errorf("failed to get conversation participants: %w", err)
	}

	// Filter out sender to get receiver_ids
	receiverIDs := make([]string, 0, len(participants))
	for _, p := range participants {
		if p != senderUUID {
			receiverIDs = append(receiverIDs, uuidToString(p))
		}
	}

	// 6. Create outbox event payload with receiver_ids
	payload, err := s.createMessageEventPayload(message, receiverIDs)
	if err != nil {
		return "", fmt.Errorf("failed to create event payload: %w", err)
	}

	// 7. Insert outbox event
	err = s.insertOutbox(ctx, qtx, repository.InsertOutboxParams{
		AggregateType: "message",
		AggregateID:   message.ID,
		Payload:       payload,
	})
	if err != nil {
		return "", fmt.Errorf("failed to insert outbox: %w", err)
	}

	// Commit transaction
	if err = s.commitTx(ctx, tx); err != nil {
		return "", fmt.Errorf("failed to commit transaction: %w", err)
	}

	return uuidToString(message.ID), nil
}

// createMessageEventPayload creates the JSON payload for the outbox event
func (s *ChatService) createMessageEventPayload(message repository.Message, receiverIDs []string) ([]byte, error) {
	event := map[string]interface{}{
		"event_type":      "message.sent",
		"message_id":      uuidToString(message.ID),
		"conversation_id": uuidToString(message.ConversationID),
		"sender_id":       uuidToString(message.SenderID),
		"receiver_ids":    receiverIDs,
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

// parseReceiverIDs parses an array of UUID strings to []pgtype.UUID
// Returns an error with invalid UUID details on failure
func parseReceiverIDs(receiverIDs []string) ([]pgtype.UUID, error) {
	if len(receiverIDs) == 0 {
		return nil, nil
	}

	result := make([]pgtype.UUID, 0, len(receiverIDs))
	for _, rid := range receiverIDs {
		uuid, err := parseUUID(rid)
		if err != nil {
			return nil, fmt.Errorf("invalid receiver_id: %s", rid)
		}
		result = append(result, uuid)
	}
	return result, nil
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

	var before pgtype.Timestamptz
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

	conversations, err := s.getConversationsForUser(ctx, params)
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

	err = s.markAsRead(ctx, repository.MarkAsReadParams{
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

func (s *ChatService) markAsRead(ctx context.Context, params repository.MarkAsReadParams) error {
	if s.markAsReadFn != nil {
		return s.markAsReadFn(ctx, params)
	}
	return s.queries.MarkAsRead(ctx, params)
}

func (s *ChatService) getMessages(ctx context.Context, params repository.GetMessagesParams) ([]repository.Message, error) {
	if s.getMessagesFn != nil {
		return s.getMessagesFn(ctx, params)
	}
	return s.queries.GetMessages(ctx, params)
}

func (s *ChatService) getConversationsForUser(ctx context.Context, params repository.GetConversationsForUserParams) ([]repository.GetConversationsForUserRow, error) {
	if s.getConversationsForUserFn != nil {
		return s.getConversationsForUserFn(ctx, params)
	}
	return s.queries.GetConversationsForUser(ctx, params)
}

// beginTx starts a database transaction, using injectable function if available
func (s *ChatService) beginTx(ctx context.Context) (repository.DBTX, error) {
	if s.beginTxFn != nil {
		return s.beginTxFn(ctx)
	}
	return s.db.Begin(ctx)
}

// upsertConversation upserts a conversation, using injectable function if available
func (s *ChatService) upsertConversation(ctx context.Context, qtx *repository.Queries, id pgtype.UUID) (repository.Conversation, error) {
	if s.upsertConversationFn != nil {
		return s.upsertConversationFn(ctx, qtx, id)
	}
	return qtx.UpsertConversation(ctx, id)
}

// addParticipant adds a participant to a conversation, using injectable function if available
func (s *ChatService) addParticipant(ctx context.Context, qtx *repository.Queries, params repository.AddParticipantParams) error {
	if s.addParticipantFn != nil {
		return s.addParticipantFn(ctx, qtx, params)
	}
	return qtx.AddParticipant(ctx, params)
}

// addConversationParticipants adds multiple participants to a conversation using bulk insert
func (s *ChatService) addConversationParticipants(ctx context.Context, qtx *repository.Queries, params repository.AddConversationParticipantsParams) error {
	if s.addConversationParticipantsFn != nil {
		return s.addConversationParticipantsFn(ctx, qtx, params)
	}
	return qtx.AddConversationParticipants(ctx, params)
}

// insertMessage inserts a message, using injectable function if available
func (s *ChatService) insertMessage(ctx context.Context, qtx *repository.Queries, params repository.InsertMessageParams) (repository.Message, error) {
	if s.insertMessageFn != nil {
		return s.insertMessageFn(ctx, qtx, params)
	}
	return qtx.InsertMessage(ctx, params)
}

// updateLastMessage updates the last message of a conversation, using injectable function if available
func (s *ChatService) updateLastMessage(ctx context.Context, qtx *repository.Queries, params repository.UpdateConversationLastMessageParams) error {
	if s.updateLastMessageFn != nil {
		return s.updateLastMessageFn(ctx, qtx, params)
	}
	return qtx.UpdateConversationLastMessage(ctx, params)
}

// insertOutbox inserts an outbox event, using injectable function if available
func (s *ChatService) insertOutbox(ctx context.Context, qtx *repository.Queries, params repository.InsertOutboxParams) error {
	if s.insertOutboxFn != nil {
		return s.insertOutboxFn(ctx, qtx, params)
	}
	return qtx.InsertOutbox(ctx, params)
}

// commitTx commits a transaction, using injectable function if available
func (s *ChatService) commitTx(ctx context.Context, tx repository.DBTX) error {
	if s.commitTxFn != nil {
		return s.commitTxFn(ctx, tx)
	}
	// Type assert to pgx.Tx to call Commit
	if pgxTx, ok := tx.(interface{ Commit(context.Context) error }); ok {
		return pgxTx.Commit(ctx)
	}
	return fmt.Errorf("transaction does not support Commit")
}

// rollbackTx rolls back a transaction, using injectable function if available
func (s *ChatService) rollbackTx(ctx context.Context, tx repository.DBTX) error {
	if s.rollbackTxFn != nil {
		return s.rollbackTxFn(ctx, tx)
	}
	// Type assert to pgx.Tx to call Rollback
	if pgxTx, ok := tx.(interface{ Rollback(context.Context) error }); ok {
		return pgxTx.Rollback(ctx)
	}
	return fmt.Errorf("transaction does not support Rollback")
}

// getConversationParticipants retrieves all participants of a conversation
func (s *ChatService) getConversationParticipants(ctx context.Context, qtx *repository.Queries, conversationID pgtype.UUID) ([]pgtype.UUID, error) {
	if s.getConversationParticipantsFn != nil {
		return s.getConversationParticipantsFn(ctx, qtx, conversationID)
	}
	return qtx.GetConversationParticipants(ctx, conversationID)
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
