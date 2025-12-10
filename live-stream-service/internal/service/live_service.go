package service

import (
	"live-service/internal/config"
	"live-service/internal/entity"
	"live-service/internal/repository"
)

type LiveService interface {
	CreateStream(userID int64, req *entity.CreateStreamRequest) (*entity.CreateStreamResponse, error)
	GetStreamDetail(id int64, userID int64) (*entity.LiveSession, error)
	ListStreams(limit, offset int) (*entity.ListStreamsResponse, error)
	UpdateStreamStatus(streamKey string, status entity.LiveSessionStatus) error
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

func (s *liveService) CreateStream(userID int64, req *entity.CreateStreamRequest) (*entity.CreateStreamResponse, error) {
	// This will be implemented in the next tasks
	// For now, return a placeholder
	return nil, nil
}

func (s *liveService) GetStreamDetail(id int64, userID int64) (*entity.LiveSession, error) {
	// This will be implemented in the next tasks
	// For now, return a placeholder
	return nil, nil
}

func (s *liveService) ListStreams(limit, offset int) (*entity.ListStreamsResponse, error) {
	// This will be implemented in the next tasks
	// For now, return a placeholder
	return nil, nil
}

func (s *liveService) UpdateStreamStatus(streamKey string, status entity.LiveSessionStatus) error {
	// This will be implemented in the next tasks
	// For now, return a placeholder
	return nil
}
