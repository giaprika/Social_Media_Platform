package service

import (
	"context"
	"errors"
	"fmt"
	"log"

	"live-service/internal/config"
	"live-service/internal/entity"
	"live-service/internal/repository"
	"live-service/pkg/utils"
)

// Service errors
var (
	ErrStreamKeyGeneration = fmt.Errorf("failed to generate stream key")
	ErrStreamCreation      = fmt.Errorf("failed to create stream")
	ErrInvalidStreamKey    = fmt.Errorf("invalid stream key")
	ErrStreamNotFound      = fmt.Errorf("stream not found")
	ErrInvalidTransition   = fmt.Errorf("invalid status transition")
	ErrDuplicatePublish    = fmt.Errorf("stream already publishing")
	ErrStreamAlreadyEnded  = fmt.Errorf("stream already ended")
)

type LiveService interface {
	CreateStream(ctx context.Context, userID string, req *entity.CreateStreamRequest) (*entity.CreateStreamResponse, error)
	GetStreamDetail(ctx context.Context, id string, userID string) (*entity.StreamDetailResponse, error)
	ListStreams(ctx context.Context, params entity.PaginationParams) (*entity.ListStreamsResponse, error)
	GetWebRTCInfo(ctx context.Context, id string, userID string) (*entity.WebRTCInfoResponse, error)
	// Webhook handlers
	// streamID: the stream ID (NanoID)
	// token: the secret stream key from ?token= param (e.g., "sk_abc123")
	HandleOnPublish(ctx context.Context, streamID string, token string) error
	HandleOnUnpublish(ctx context.Context, streamID string) error
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

func (s *liveService) CreateStream(ctx context.Context, userID string, req *entity.CreateStreamRequest) (*entity.CreateStreamResponse, error) {
	// Generate secure stream key (secret token)
	streamKey, err := utils.GenerateStreamKeyFromUUID(userID)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrStreamKeyGeneration, err)
	}

	// Prepare description pointer
	var description *string
	if req.Description != "" {
		description = &req.Description
	}

	// Generate NanoID for stream
	streamID := entity.GenerateNanoID()

	// Create live session entity
	session := &entity.LiveSession{
		ID:          streamID,
		UserID:      userID,
		StreamKey:   streamKey,
		Title:       req.Title,
		Description: description,
		Status:      entity.StatusIdle,
		ViewerCount: 0,
	}

	// Save to database
	if err := s.repo.Create(ctx, session); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrStreamCreation, err)
	}

	// Construct URLs with stream ID + token
	// Format: rtmp://server/live/{id}?token={stream_key}
	// This keeps stream_key secret - viewers only see the ID in playback URLs
	rtmpURL := s.config.GetRTMPURL(session.ID, streamKey)
	webrtcURL := s.config.GetWebRTCURL(session.ID, streamKey)
	hlsURL := s.config.GetHLSURL(session.ID)

	// Update session with URLs
	session.RTMPUrl = &rtmpURL
	session.WebRTCUrl = &webrtcURL
	session.HLSUrl = &hlsURL

	// Update URLs in database
	if err := s.repo.UpdateURLs(ctx, session.ID, rtmpURL, webrtcURL, hlsURL); err != nil {
		// Log but don't fail - URLs are derived, not critical
		log.Printf("[CreateStream] WARNING: failed to update URLs for stream %s: %v", session.ID, err)
	}

	return &entity.CreateStreamResponse{
		ID:        session.ID,
		StreamKey: streamKey,
		RTMPUrl:   rtmpURL,
		WebRTCUrl: webrtcURL,
		HLSUrl:    hlsURL,
	}, nil
}

func (s *liveService) GetStreamDetail(ctx context.Context, id string, userID string) (*entity.StreamDetailResponse, error) {
	session, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	isOwner := userID != "" && session.UserID == userID
	username := "user"
	if len(session.UserID) >= 8 {
		username = fmt.Sprintf("user_%s", session.UserID[:8])
	}

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
		Username: username,
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
		username := "user"
		if len(session.UserID) >= 8 {
			username = fmt.Sprintf("user_%s", session.UserID[:8])
		}
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
			Username: username,
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

// GetWebRTCInfo returns WebRTC connection info for a stream
// Includes ICE servers with time-limited TURN credentials (RFC 5766)
func (s *liveService) GetWebRTCInfo(ctx context.Context, id string, userID string) (*entity.WebRTCInfoResponse, error) {
	session, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	isOwner := userID != "" && session.UserID == userID
	serverIP := s.config.SRS.ServerIP
	streamID := session.ID
	streamKey := session.StreamKey

	// Play URL uses stream ID (public, no token needed for viewing)
	// Format: webrtc://server/live/stream_id
	playURL := fmt.Sprintf("webrtc://%s/live/%s", serverIP, streamID)

	// WHEP endpoint for viewers (uses stream ID)
	apiBase := fmt.Sprintf("http://%s:%d", serverIP, s.config.SRS.APIPort)
	whepEndpoint := fmt.Sprintf("%s/rtc/v1/whep/?app=live&stream=%s", apiBase, streamID)

	// Get ICE servers from config (includes STUN + TURN with dynamic credentials)
	configICEServers := s.config.GetICEServers()

	// Convert to entity.ICEServer format
	iceServers := make([]entity.ICEServer, len(configICEServers))
	for i, server := range configICEServers {
		iceServers[i] = entity.ICEServer{
			URLs:       server.URLs,
			Username:   server.Username,
			Credential: server.Credential,
		}
	}

	resp := &entity.WebRTCInfoResponse{
		ID:           session.ID,
		Status:       session.Status,
		PlayURL:      playURL,
		WHEPEndpoint: whepEndpoint,
		ICEServers:   iceServers,
		IsOwner:      isOwner,
	}

	// Only show publish URLs to owner (includes secret token)
	if isOwner {
		// Publish URL with token: webrtc://server/live/stream_id?token=stream_key
		resp.PublishURL = fmt.Sprintf("webrtc://%s/live/%s?token=%s", serverIP, streamID, streamKey)
		resp.WHIPEndpoint = fmt.Sprintf("%s/rtc/v1/whip/?app=live&stream=%s&token=%s", apiBase, streamID, streamKey)
	}

	return resp, nil
}

// HandleOnPublish validates stream credentials and updates session status to LIVE
// New auth flow: streamID (NanoID) + token (from ?token= param)
// Fallback: streamID only (treated as stream_key for backward compatibility)
func (s *liveService) HandleOnPublish(ctx context.Context, streamID string, token string) error {
	if streamID == "" {
		log.Printf("[on_publish] ERROR: empty stream ID")
		return ErrInvalidStreamKey
	}

	var session *entity.LiveSession
	var err error

	// New auth flow: streamID is NanoID, token is the secret key
	if token != "" {
		// Get session by ID (NanoID)
		session, err = s.repo.GetByID(ctx, streamID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				log.Printf("[on_publish] REJECTED: stream ID not found: %s", streamID)
				return fmt.Errorf("%w: stream not found", ErrStreamNotFound)
			}
			log.Printf("[on_publish] ERROR: database error for stream %s: %v", streamID, err)
			return fmt.Errorf("database error: %w", err)
		}

		// Validate token matches stream_key
		if session.StreamKey != token {
			maskedToken := utils.MaskStreamKey(token)
			log.Printf("[on_publish] REJECTED: invalid token for stream %s (token: %s)", streamID, maskedToken)
			return fmt.Errorf("%w: invalid token", ErrInvalidStreamKey)
		}

		log.Printf("[on_publish] Token auth: stream %s validated", streamID)
	} else {
		// Fallback: streamID is actually the stream_key (old behavior)
		maskedKey := utils.MaskStreamKey(streamID)
		session, err = s.repo.GetByStreamKey(ctx, streamID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				log.Printf("[on_publish] REJECTED: stream key not found: %s", maskedKey)
				return fmt.Errorf("%w: %s", ErrInvalidStreamKey, maskedKey)
			}
			log.Printf("[on_publish] ERROR: database error for %s: %v", maskedKey, err)
			return fmt.Errorf("database error: %w", err)
		}
		log.Printf("[on_publish] Legacy auth: stream %s (key: %s)", session.ID, maskedKey)
	}

	// Check current status
	switch session.Status {
	case entity.StatusLive:
		log.Printf("[on_publish] REJECTED: duplicate publish for stream %s", session.ID)
		return fmt.Errorf("%w: stream %s is already live", ErrDuplicatePublish, session.ID)

	case entity.StatusEnded:
		log.Printf("[on_publish] REJECTED: stream %s already ended", session.ID)
		return fmt.Errorf("%w: stream %s has ended", ErrStreamAlreadyEnded, session.ID)

	case entity.StatusIdle:
		// Valid transition
	default:
		log.Printf("[on_publish] REJECTED: unknown status %s for stream %s", session.Status, session.ID)
		return fmt.Errorf("%w: unknown status %s", ErrInvalidTransition, session.Status)
	}

	// Update status to LIVE
	if err := s.repo.SetStarted(ctx, session.ID); err != nil {
		if errors.Is(err, repository.ErrInvalidStatus) {
			log.Printf("[on_publish] REJECTED: race condition for stream %s", session.ID)
			return fmt.Errorf("%w: stream state changed", ErrDuplicatePublish)
		}
		log.Printf("[on_publish] ERROR: failed to start stream %s: %v", session.ID, err)
		return fmt.Errorf("failed to start stream: %w", err)
	}

	log.Printf("[on_publish] SUCCESS: stream %s started (user: %s)", session.ID, session.UserID)
	return nil
}

// HandleOnUnpublish updates session status to ENDED when stream stops
// streamID can be NanoID (new flow) or stream_key (legacy)
func (s *liveService) HandleOnUnpublish(ctx context.Context, streamID string) error {
	if streamID == "" {
		log.Printf("[on_unpublish] WARNING: empty stream ID")
		return nil
	}

	var session *entity.LiveSession
	var err error

	// Try to get by ID first (NanoID - new flow)
	session, err = s.repo.GetByID(ctx, streamID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Fallback: treat as stream_key (legacy)
			maskedKey := utils.MaskStreamKey(streamID)
			session, err = s.repo.GetByStreamKey(ctx, streamID)
			if err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					log.Printf("[on_unpublish] WARNING: stream not found: %s", maskedKey)
					return nil
				}
				log.Printf("[on_unpublish] ERROR: database error for %s: %v", maskedKey, err)
				return fmt.Errorf("database error: %w", err)
			}
		} else {
			log.Printf("[on_unpublish] ERROR: database error for stream %s: %v", streamID, err)
			return fmt.Errorf("database error: %w", err)
		}
	}

	// Check if already ended
	if session.Status == entity.StatusEnded {
		log.Printf("[on_unpublish] INFO: stream %s already ended", session.ID)
		return nil
	}

	// Update status to ENDED
	if err := s.repo.SetEnded(ctx, session.ID); err != nil {
		if errors.Is(err, repository.ErrInvalidStatus) {
			log.Printf("[on_unpublish] INFO: stream %s already ended (race)", session.ID)
			return nil
		}
		log.Printf("[on_unpublish] ERROR: failed to end stream %s: %v", session.ID, err)
		return fmt.Errorf("failed to end stream: %w", err)
	}

	log.Printf("[on_unpublish] SUCCESS: stream %s ended (user: %s)", session.ID, session.UserID)
	return nil
}
