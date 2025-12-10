package repository

import (
	"context"
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
	s.db.ExecContext(s.ctx, "TRUNCATE TABLE live_sessions RESTART IDENTITY CASCADE")
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
			id BIGSERIAL PRIMARY KEY,
			user_id BIGINT NOT NULL,
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
func (s *LiveRepositoryTestSuite) createTestSession(userID int64, streamKey, title string) *entity.LiveSession {
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
	session := s.createTestSession(1, "live_u1_abc123", "Test Stream")

	err := s.repo.Create(s.ctx, session)

	assert.NoError(s.T(), err)
	assert.NotZero(s.T(), session.ID)
	assert.NotZero(s.T(), session.CreatedAt)
	assert.NotZero(s.T(), session.UpdatedAt)
}

func (s *LiveRepositoryTestSuite) TestCreate_DuplicateStreamKey() {
	session1 := s.createTestSession(1, "live_u1_duplicate", "Stream 1")
	session2 := s.createTestSession(2, "live_u1_duplicate", "Stream 2")

	err := s.repo.Create(s.ctx, session1)
	assert.NoError(s.T(), err)

	err = s.repo.Create(s.ctx, session2)
	assert.ErrorIs(s.T(), err, ErrDuplicateKey)
}

// ==================== READ TESTS ====================

func (s *LiveRepositoryTestSuite) TestGetByID_Success() {
	session := s.createTestSession(1, "live_u1_getbyid", "Test Stream")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	found, err := s.repo.GetByID(s.ctx, session.ID)

	assert.NoError(s.T(), err)
	assert.Equal(s.T(), session.ID, found.ID)
	assert.Equal(s.T(), session.StreamKey, found.StreamKey)
	assert.Equal(s.T(), session.Title, found.Title)
}

func (s *LiveRepositoryTestSuite) TestGetByID_NotFound() {
	found, err := s.repo.GetByID(s.ctx, 99999)

	assert.ErrorIs(s.T(), err, ErrNotFound)
	assert.Nil(s.T(), found)
}

func (s *LiveRepositoryTestSuite) TestGetByStreamKey_Success() {
	session := s.createTestSession(1, "live_u1_streamkey", "Test Stream")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	found, err := s.repo.GetByStreamKey(s.ctx, "live_u1_streamkey")

	assert.NoError(s.T(), err)
	assert.Equal(s.T(), session.ID, found.ID)
}

func (s *LiveRepositoryTestSuite) TestGetByStreamKey_NotFound() {
	found, err := s.repo.GetByStreamKey(s.ctx, "nonexistent_key")

	assert.ErrorIs(s.T(), err, ErrNotFound)
	assert.Nil(s.T(), found)
}

func (s *LiveRepositoryTestSuite) TestGetByUserID_Success() {
	// Create multiple sessions for same user
	for i := 1; i <= 3; i++ {
		session := s.createTestSession(1, "live_u1_user_"+string(rune('a'+i)), "Stream "+string(rune('0'+i)))
		err := s.repo.Create(s.ctx, session)
		require.NoError(s.T(), err)
	}
	// Create session for different user
	other := s.createTestSession(2, "live_u2_other", "Other Stream")
	err := s.repo.Create(s.ctx, other)
	require.NoError(s.T(), err)

	sessions, err := s.repo.GetByUserID(s.ctx, 1, 10, 0)

	assert.NoError(s.T(), err)
	assert.Len(s.T(), sessions, 3)
}

func (s *LiveRepositoryTestSuite) TestListByStatus_Success() {
	// Create IDLE session
	idle := s.createTestSession(1, "live_u1_idle", "Idle Stream")
	err := s.repo.Create(s.ctx, idle)
	require.NoError(s.T(), err)

	// Create LIVE session
	live := s.createTestSession(1, "live_u1_live", "Live Stream")
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
		session := s.createTestSession(int64(i), "live_u"+string(rune('0'+i))+"_live", "Live Stream")
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
	idle := s.createTestSession(1, "live_u1_count_idle", "Idle")
	err := s.repo.Create(s.ctx, idle)
	require.NoError(s.T(), err)

	live1 := s.createTestSession(2, "live_u2_count_live1", "Live 1")
	live1.Status = entity.StatusLive
	err = s.repo.Create(s.ctx, live1)
	require.NoError(s.T(), err)

	live2 := s.createTestSession(3, "live_u3_count_live2", "Live 2")
	live2.Status = entity.StatusLive
	err = s.repo.Create(s.ctx, live2)
	require.NoError(s.T(), err)

	count, err := s.repo.CountByStatus(s.ctx, entity.StatusLive)

	assert.NoError(s.T(), err)
	assert.Equal(s.T(), 2, count)
}

// ==================== UPDATE TESTS ====================

func (s *LiveRepositoryTestSuite) TestUpdate_Success() {
	session := s.createTestSession(1, "live_u1_update", "Original Title")
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
	session := s.createTestSession(1, "live_u1_status", "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.UpdateStatus(s.ctx, session.ID, entity.StatusLive)

	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), entity.StatusLive, found.Status)
}

func (s *LiveRepositoryTestSuite) TestUpdateViewerCount_Success() {
	session := s.createTestSession(1, "live_u1_viewers", "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.UpdateViewerCount(s.ctx, session.ID, 100)

	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), 100, found.ViewerCount)
}

func (s *LiveRepositoryTestSuite) TestIncrementViewerCount_Success() {
	session := s.createTestSession(1, "live_u1_inc", "Test")
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
	session := s.createTestSession(1, "live_u1_dec", "Test")
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
	session := s.createTestSession(1, "live_u1_dec_zero", "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	// Decrement from 0
	err = s.repo.DecrementViewerCount(s.ctx, session.ID)
	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), 0, found.ViewerCount)
}

func (s *LiveRepositoryTestSuite) TestSetStarted_Success() {
	session := s.createTestSession(1, "live_u1_started", "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.SetStarted(s.ctx, session.ID)

	assert.NoError(s.T(), err)

	found, _ := s.repo.GetByID(s.ctx, session.ID)
	assert.Equal(s.T(), entity.StatusLive, found.Status)
	assert.NotNil(s.T(), found.StartedAt)
}

func (s *LiveRepositoryTestSuite) TestSetStarted_InvalidStatus() {
	session := s.createTestSession(1, "live_u1_started_invalid", "Test")
	session.Status = entity.StatusLive
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.SetStarted(s.ctx, session.ID)

	assert.ErrorIs(s.T(), err, ErrInvalidStatus)
}

func (s *LiveRepositoryTestSuite) TestSetEnded_Success() {
	session := s.createTestSession(1, "live_u1_ended", "Test")
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
	session := s.createTestSession(1, "live_u1_ended_invalid", "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.SetEnded(s.ctx, session.ID)

	assert.ErrorIs(s.T(), err, ErrInvalidStatus)
}

// ==================== DELETE TESTS ====================

func (s *LiveRepositoryTestSuite) TestDelete_Success() {
	session := s.createTestSession(1, "live_u1_delete", "Test")
	err := s.repo.Create(s.ctx, session)
	require.NoError(s.T(), err)

	err = s.repo.Delete(s.ctx, session.ID)

	assert.NoError(s.T(), err)

	_, err = s.repo.GetByID(s.ctx, session.ID)
	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestDelete_NotFound() {
	err := s.repo.Delete(s.ctx, 99999)

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

// ==================== COUNT TESTS ====================

func (s *LiveRepositoryTestSuite) TestCountByUserID_Success() {
	// Create sessions for user 1
	for i := 1; i <= 3; i++ {
		session := s.createTestSession(1, "live_u1_count_"+string(rune('a'+i)), "Stream")
		err := s.repo.Create(s.ctx, session)
		require.NoError(s.T(), err)
	}

	count, err := s.repo.CountByUserID(s.ctx, 1)

	assert.NoError(s.T(), err)
	assert.Equal(s.T(), 3, count)
}

func (s *LiveRepositoryTestSuite) TestUpdate_NotFound() {
	session := &entity.LiveSession{
		ID:     99999,
		Title:  "Not Found",
		Status: entity.StatusIdle,
	}

	err := s.repo.Update(s.ctx, session)

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestUpdateStatus_NotFound() {
	err := s.repo.UpdateStatus(s.ctx, 99999, entity.StatusLive)

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestUpdateViewerCount_NotFound() {
	err := s.repo.UpdateViewerCount(s.ctx, 99999, 100)

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestIncrementViewerCount_NotFound() {
	err := s.repo.IncrementViewerCount(s.ctx, 99999)

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

func (s *LiveRepositoryTestSuite) TestDecrementViewerCount_NotFound() {
	err := s.repo.DecrementViewerCount(s.ctx, 99999)

	assert.ErrorIs(s.T(), err, ErrNotFound)
}

// ==================== RUN SUITE ====================

func TestLiveRepositorySuite(t *testing.T) {
	suite.Run(t, new(LiveRepositoryTestSuite))
}
