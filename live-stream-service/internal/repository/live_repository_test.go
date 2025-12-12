//go:build !windows
// +build !windows

package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"live-service/internal/entity"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

type LiveRepositoryTestSuite struct {
	suite.Suite
	container *postgres.PostgresContainer
	db        *sqlx.DB
	repo      LiveRepository
	ctx       context.Context
}

func (s *LiveRepositoryTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Start PostgreSQL container
	container, err := postgres.Run(s.ctx,
		"postgres:15-alpine",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	require.NoError(s.T(), err)
	s.container = container

	// Get connection string
	connStr, err := container.ConnectionString(s.ctx, "sslmode=disable")
	require.NoError(s.T(), err)

	// Connect to database
	s.db, err = sqlx.Connect("postgres", connStr)
	require.NoError(s.T(), err)

	// Run migrations
	s.runMigrations()

	// Create repository
	s.repo = NewLiveRepository(s.db)
}

func (s *LiveRepositoryTestSuite) TearDownSuite() {
	if s.db != nil {
		s.db.Close()
	}
	if s.container != nil {
		s.container.Terminate(s.ctx)
	}
}

func (s *LiveRepositoryTestSuite) SetupTest() {
	// Clean up table before each test
	s.db.ExecContext(s.ctx, "TRUNCATE TABLE live_sessions CASCADE")
}

func (s *LiveRepositoryTestSuite) runMigrations() {
	// Create enum type
	_, err := s.db.ExecContext(s.ctx, `
		DO $$ BEGIN
			CREATE TYPE session_status AS ENUM ('IDLE', 'LIVE', 'ENDED');
		EXCEPTION
			WHEN duplicate_object THEN null;
		END $$;
	`)
	require.NoError(s.T(), err)

	// Create table
	_, err = s.db.ExecContext(s.ctx, `
		CREATE TABLE IF NOT EXISTS live_sessions (
			id VARCHAR(21) PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL,
			stream_key VARCHAR(255) NOT NULL UNIQUE,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			status session_status NOT NULL DEFAULT 'IDLE',
			rtmp_url VARCHAR(500),
			webrtc_url VARCHAR(500),
			hls_url VARCHAR(500),
			viewer_count INTEGER NOT NULL DEFAULT 0,
			started_at TIMESTAMP WITH TIME ZONE,
			ended_at TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`)
	require.NoError(s.T(), err)
}

// Helper to create a test session
func (s *LiveRepositoryTestSuite) createTestSession(userID string, streamKey, title string) *entity.LiveSession {
	rtmpURL := "rtmp://test/live/" + streamKey
	hlsURL := "https://cdn.test/live/" + streamKey + "/index.m3u8"
	return &entity.LiveSession{
		UserID:      userID,
		StreamKey:   streamKey,
		Title:       title,
		Status:      entity.StatusIdle,
		RTMPUrl:     &rtmpURL,
		HLSUrl:      &hlsURL,
		ViewerCount: 0,
	}
}

// ==================== CREATE TESTS ====================

func (s *LiveRepositoryTestSuite) TestCreate_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, "live_"+userID+"_0123456789abcdef0123456789abcdef", "Test Stream")

	err := s.repo.Create(s.ctx, session)

	assert.NoError(s.T(), err)
	assert.NotEmpty(s.T(), session.ID)
	assert.NotZero(s.T(), session.CreatedAt)
	assert.NotZero(s.T(), session.UpdatedAt)
}

func (s *LiveRepositoryTestSuite) TestCreate_DuplicateStreamKey() {
	user1 := "550e8400-e29b-41d4-a716-446655440000"
	user2 := "550e8400-e29b-41d4-a716-446655440001"
	dupKey := "live_" + user1 + "_0123456789abcdef0123456789abcdef"
	session1 := s.createTestSession(user1, dupKey, "Stream 1")
	session2 := s.createTestSession(user2, dupKey, "Stream 2")

	err := s.repo.Create(s.ctx, session1)
	assert.NoError(s.T(), err)

	err = s.repo.Create(s.ctx, session2)
	assert.ErrorIs(s.T(), err, ErrDuplicateKey)
}

// ==================== READ TESTS ====================

func (s *LiveRepositoryTestSuite) TestGetByID_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, "live_"+userID+"_00000000000000000000000000000001", "Test Stream")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	found, err := s.repo.GetByID(s.ctx, session.ID)

	assert.NoError(s.T(), err)
	assert.Equal(s.T(), session.ID, found.ID)
	assert.Equal(s.T(), session.StreamKey, found.StreamKey)
	assert.Equal(s.T(), session.Title, found.Title)
}

func (s *LiveRepositoryTestSuite) TestGetByID_NotFound() {
	found, err := s.repo.GetByID(s.ctx, "nonexistent_stream_id")

	assert.ErrorIs(s.T(), err, ErrNotFound)
	assert.Nil(s.T(), found)
}

func (s *LiveRepositoryTestSuite) TestGetByStreamKey_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	key := "live_" + userID + "_00000000000000000000000000000002"
	session := s.createTestSession(userID, key, "Test Stream")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	found, err := s.repo.GetByStreamKey(s.ctx, key)

	assert.NoError(s.T(), err)
	assert.Equal(s.T(), session.ID, found.ID)
}

func (s *LiveRepositoryTestSuite) TestGetByStreamKey_NotFound() {
	found, err := s.repo.GetByStreamKey(s.ctx, "nonexistent_key")

	assert.ErrorIs(s.T(), err, ErrNotFound)
	assert.Nil(s.T(), found)
}

func (s *LiveRepositoryTestSuite) TestGetByUserID_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	// Create multiple sessions for same user
	for i := 1; i <= 3; i++ {
		streamKey := fmt.Sprintf("live_%s_%032x", userID, i)
		session := s.createTestSession(userID, streamKey, fmt.Sprintf("Stream %d", i))
		err := s.repo.Create(s.ctx, session)
		require.NoError(s.T(), err)
	}
	// Create session for different user
	otherUser := "550e8400-e29b-41d4-a716-446655440001"
	other := s.createTestSession(otherUser, fmt.Sprintf("live_%s_%032x", otherUser, 999), "Other Stream")
	err := s.repo.Create(s.ctx, other)
	require.NoError(s.T(), err)

	sessions, err := s.repo.GetByUserID(s.ctx, userID, 10, 0)

	assert.NoError(s.T(), err)
	assert.Len(s.T(), sessions, 3)
}

func (s *LiveRepositoryTestSuite) TestListByStatus_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	// Create IDLE session
	idle := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 1), "Idle Stream")
	err := s.repo.Create(s.ctx, idle)
	require.NoError(s.T(), err)

	// Create LIVE session
	live := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 2), "Live Stream")
	live.Status = entity.StatusLive
	err = s.repo.Create(s.ctx, live)
	require.NoError(s.T(), err)

	sessions, err := s.repo.ListByStatus(s.ctx, entity.StatusLive, 10, 0)

	assert.NoError(s.T(), err)
	assert.Len(s.T(), sessions, 1)
	assert.Equal(s.T(), entity.StatusLive, sessions[0].Status)
}

func (s *LiveRepositoryTestSuite) TestListLive_Success() {
	// Create multiple live sessions
	for i := 1; i <= 5; i++ {
		userID := fmt.Sprintf("550e8400-e29b-41d4-a716-44665544000%d", i)
		session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, i), "Live Stream")
		session.Status = entity.StatusLive
		err := s.repo.Create(s.ctx, session)
		require.NoError(s.T(), err)
	}

	sessions, err := s.repo.ListLive(s.ctx, 3, 0)

	assert.NoError(s.T(), err)
	assert.Len(s.T(), sessions, 3)
}

func (s *LiveRepositoryTestSuite) TestCountByStatus_Success() {
	// Create sessions with different statuses
	user1 := "550e8400-e29b-41d4-a716-446655440000"
	user2 := "550e8400-e29b-41d4-a716-446655440001"
	user3 := "550e8400-e29b-41d4-a716-446655440002"
	idle := s.createTestSession(user1, fmt.Sprintf("live_%s_%032x", user1, 1), "Idle")
	err := s.repo.Create(s.ctx, idle)
	require.NoError(s.T(), err)

	live1 := s.createTestSession(user2, fmt.Sprintf("live_%s_%032x", user2, 2), "Live 1")
	live1.Status = entity.StatusLive
	err = s.repo.Create(s.ctx, live1)
	require.NoError(s.T(), err)

	live2 := s.createTestSession(user3, fmt.Sprintf("live_%s_%032x", user3, 3), "Live 2")
	live2.Status = entity.StatusLive
	err = s.repo.Create(s.ctx, live2)
	require.NoError(s.T(), err)

	count, err := s.repo.CountByStatus(s.ctx, entity.StatusLive)

	assert.NoError(s.T(), err)
	assert.Equal(s.T(), 2, count)
}

// ==================== UPDATE TESTS ====================

func (s *LiveRepositoryTestSuite) TestUpdate_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 100), "Original Title")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	session.Title = "Updated Title"
	session.Status = entity.StatusLive
	err = s.repo.Update(s.ctx, session)

	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), "Updated Title", found.Title)
	assert.Equal(s.T(), entity.StatusLive, found.Status)
}

func (s *LiveRepositoryTestSuite) TestUpdateStatus_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 101), "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.UpdateStatus(s.ctx, session.ID, entity.StatusLive)

	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), entity.StatusLive, found.Status)
}

func (s *LiveRepositoryTestSuite) TestUpdateViewerCount_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 102), "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.UpdateViewerCount(s.ctx, session.ID, 100)

	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), 100, found.ViewerCount)
}

func (s *LiveRepositoryTestSuite) TestIncrementViewerCount_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 103), "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.IncrementViewerCount(s.ctx, session.ID)
	assert.NoError(s.T(), err)

	err = s.repo.IncrementViewerCount(s.ctx, session.ID)
	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), 2, found.ViewerCount)
}

func (s *LiveRepositoryTestSuite) TestDecrementViewerCount_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 104), "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	// Set initial count
	s.repo.UpdateViewerCount(s.ctx, session.ID, 5)

	err = s.repo.DecrementViewerCount(s.ctx, session.ID)
	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), 4, found.ViewerCount)
}

func (s *LiveRepositoryTestSuite) TestDecrementViewerCount_NotBelowZero() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 105), "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	// Decrement from 0
	err = s.repo.DecrementViewerCount(s.ctx, session.ID)
	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), 0, found.ViewerCount)
}

func (s *LiveRepositoryTestSuite) TestSetStarted_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 106), "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.SetStarted(s.ctx, session.ID)

	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), entity.StatusLive, found.Status)
	assert.NotNil(s.T(), found.StartedAt)
}

func (s *LiveRepositoryTestSuite) TestSetStarted_InvalidStatus() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 107), "Test")
	session.Status = entity.StatusLive
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.SetStarted(s.ctx, session.ID)

	assert.ErrorIs(s.T(), err, ErrInvalidStatus)
}

func (s *LiveRepositoryTestSuite) TestSetEnded_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 108), "Test")
	session.Status = entity.StatusLive
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	// Set some viewers
	s.repo.UpdateViewerCount(s.ctx, session.ID, 50)

	err = s.repo.SetEnded(s.ctx, session.ID)

	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), entity.StatusEnded, found.Status)
	assert.NotNil(s.T(), found.EndedAt)
	assert.Equal(s.T(), 0, found.ViewerCount) // Should reset to 0
}

func (s *LiveRepositoryTestSuite) TestSetEnded_InvalidStatus() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 109), "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.SetEnded(s.ctx, session.ID)

	assert.ErrorIs(s.T(), err, ErrInvalidStatus)
}

// ==================== DELETE TESTS ====================

func (s *LiveRepositoryTestSuite) TestDelete_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 110), "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.Delete(s.ctx, session.ID)

	assert.NoError(s.T(), err)

	_, err = s.repo.GetByID(s.ctx, session.ID)
	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestDelete_NotFound() {
	err := s.repo.Delete(s.ctx, "nonexistent_stream_id")

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

// ==================== COUNT TESTS ====================

func (s *LiveRepositoryTestSuite) TestCountByUserID_Success() {
	userID := "550e8400-e29b-41d4-a716-446655440000"
	// Create sessions for user 1
	for i := 1; i <= 3; i++ {
		session := s.createTestSession(userID, fmt.Sprintf("live_%s_%032x", userID, 200+i), "Stream")
		err := s.repo.Create(s.ctx, session)
		require.NoError(s.T(), err)
	}

	count, err := s.repo.CountByUserID(s.ctx, userID)

	assert.NoError(s.T(), err)
	assert.Equal(s.T(), 3, count)
}

func (s *LiveRepositoryTestSuite) TestUpdate_NotFound() {
	session := &entity.LiveSession{
		ID:     "nonexistent_stream_id",
		Title:  "Not Found",
		Status: entity.StatusIdle,
	}

	err := s.repo.Update(s.ctx, session)

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestUpdateStatus_NotFound() {
	err := s.repo.UpdateStatus(s.ctx, "nonexistent_stream_id", entity.StatusLive)

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestUpdateViewerCount_NotFound() {
	err := s.repo.UpdateViewerCount(s.ctx, "nonexistent_stream_id", 100)

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestIncrementViewerCount_NotFound() {
	err := s.repo.IncrementViewerCount(s.ctx, "nonexistent_stream_id")

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestDecrementViewerCount_NotFound() {
	err := s.repo.DecrementViewerCount(s.ctx, "nonexistent_stream_id")

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

// ==================== RUN SUITE ====================

func TestLiveRepositorySuite(t *testing.T) {
	suite.Run(t, new(LiveRepositoryTestSuite))
}
