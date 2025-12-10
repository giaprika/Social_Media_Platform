package service

import (
	"context"
	"fmt"

	"live-service/internal/config"
	"live-service/internal/entity"
	"live-service/internal/repository"
	"live-service/pkg/utils"
)

// Service errors
var (
	ErrStreamKeyGeneration = fmt.Errorf("failed to generate stream key")
	ErrStreamCreation      = fmt.Errorf("failed to create stream")
)

type LiveService interface {
	CreateStream(ctx context.Context, userID int64, req *entity.CreateStreamRequest) (*entity.CreateStreamResponse, error)
	GetStreamDetail(ctx context.Context, id int64, userID int64) (*entity.StreamDetailResponse, error)
	ListStreams(ctx context.Context, params entity.PaginationParams) (*entity.ListStreamsResponse, error)
	// Webhook handlers
	HandleOnPublish(ctx context.Context, streamKey string) error
	HandleOnUnpublish(ctx context.Context, streamKey string) error
}

type liveService struct {
	repo   repository.LiveRepository
	config *config.Config
}

func NewLiveService(repo repository.LiveRepository, config *config.Config) LiveService {
	return &liveService{
		repo:   repo,
		config: config,
	}
}

func (s *liveService) CreateStream(ctx context.Context, userID int64, req *entity.CreateStreamRequest) (*entity.CreateStreamResponse, error) {
	// Generate secure stream key
	streamKey, err := utils.GenerateStreamKey(userID)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrStreamKeyGeneration, err)
	}

	// Construct streaming URLs
	rtmpURL := s.config.GetRTMPURL(streamKey)
	webrtcURL := s.config.GetWebRTCURL(streamKey)
	hlsURL := s.config.GetHLSURL(streamKey)

	// Prepare description pointer
	var description *string
	if req.Description != "" {
		description = &req.Description
	}

	// Create live session entity
	session := &entity.LiveSession{
		UserID:      userID,
		StreamKey:   streamKey,
		Title:       req.Title,
		Description: description,
		Status:      entity.StatusIdle,
		RTMPUrl:     &rtmpURL,
		WebRTCUrl:   &webrtcURL,
		HLSUrl:      &hlsURL,
		ViewerCount: 0,
	}

	// Save to database
	if err := s.repo.Create(ctx, session); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrStreamCreation, err)
	}

	return &entity.CreateStreamResponse{
		ID:        session.ID,
		StreamKey: streamKey,
		RTMPUrl:   rtmpURL,
		WebRTCUrl: webrtcURL,
		HLSUrl:    hlsURL,
	}, nil
}

func (s *liveService) GetStreamDetail(ctx context.Context, id int64, userID int64) (*entity.StreamDetailResponse, error) {
	session, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	isOwner := session.UserID == userID

	resp := &entity.StreamDetailResponse{
		ID:          session.ID,
		UserID:      session.UserID,
		Title:       session.Title,
		Description: session.Description,
		Status:      session.Status,
		HLSUrl:      session.HLSUrl,
		ViewerCount: session.ViewerCount,
		StartedAt:   session.StartedAt,
		EndedAt:     session.EndedAt,
		CreatedAt:   session.CreatedAt,
		IsOwner:     isOwner,
		// TODO: Populate from user service
		Username: fmt.Sprintf("user_%d", session.UserID),
		Avatar:   "",
	}

	// Only show sensitive info to owner
	if isOwner {
		resp.StreamKey = session.StreamKey
		if session.RTMPUrl != nil {
			resp.RTMPUrl = *session.RTMPUrl
		}
		if session.WebRTCUrl != nil {
			resp.WebRTCUrl = *session.WebRTCUrl
		}
	}

	return resp, nil
}

func (s *liveService) ListStreams(ctx context.Context, params entity.PaginationParams) (*entity.ListStreamsResponse, error) {
	// Get live streams with pagination
	sessions, err := s.repo.ListLive(ctx, params.Limit, params.Offset())
	if err != nil {
		return nil, fmt.Errorf("failed to list streams: %w", err)
	}

	// Get total count for pagination
	total, err := s.repo.CountByStatus(ctx, entity.StatusLive)
	if err != nil {
		return nil, fmt.Errorf("failed to count streams: %w", err)
	}

	// Convert to response format
	streams := make([]entity.LiveStreamInfo, len(sessions))
	for i, session := range sessions {
		streams[i] = entity.LiveStreamInfo{
			ID:          session.ID,
			UserID:      session.UserID,
			Title:       session.Title,
			Status:      session.Status,
			ViewerCount: session.ViewerCount,
			HLSUrl:      session.HLSUrl,
			StartedAt:   session.StartedAt,
			CreatedAt:   session.CreatedAt,
			// TODO: Populate from user service
			Username: fmt.Sprintf("user_%d", session.UserID),
			Avatar:   "",
		}
	}

	totalPages := (total + params.Limit - 1) / params.Limit

	return &entity.ListStreamsResponse{
		Streams:    streams,
		Total:      total,
		Page:       params.Page,
		Limit:      params.Limit,
		TotalPages: totalPages,
	}, nil
}

// HandleOnPublish validates stream key and updates session status to LIVE
func (s *liveService) HandleOnPublish(ctx context.Context, streamKey string) error {
	// Find session by stream key
	session, err := s.repo.GetByStreamKey(ctx, streamKey)
	if err != nil {
		return fmt.Errorf("invalid stream key: %w", err)
	}

	// Validate status transition (only IDLE can go LIVE)
	if !session.Status.CanTransitionTo(entity.StatusLive) {
		return fmt.Errorf("invalid status transition: current status is %s", session.Status)
	}

	// Update status to LIVE and set started_at
	if err := s.repo.SetStarted(ctx, session.ID); err != nil {
		return fmt.Errorf("failed to start stream: %w", err)
	}

	return nil
}

// HandleOnUnpublish updates session status to ENDED when stream stops
func (s *liveService) HandleOnUnpublish(ctx context.Context, streamKey string) error {
	// Find session by stream key
	session, err := s.repo.GetByStreamKey(ctx, streamKey)
	if err != nil {
		return fmt.Errorf("stream not found: %w", err)
	}

	// Update status to ENDED and set ended_at
	if err := s.repo.SetEnded(ctx, session.ID); err != nil {
		// Log but don't fail - stream might already be ended
		return fmt.Errorf("failed to end stream: %w", err)
	}

	return nil
}
