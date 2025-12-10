package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"live-service/internal/entity"

	"github.com/jmoiron/sqlx"
)

// Common repository errors
var (
	ErrNotFound      = errors.New("record not found")
	ErrDuplicateKey  = errors.New("duplicate key violation")
	ErrInvalidStatus = errors.New("invalid status transition")
)

// LiveRepository defines the interface for live session data operations
type LiveRepository interface {
	// Create operations
	Create(ctx context.Context, session *entity.LiveSession) error

	// Read operations
	GetByID(ctx context.Context, id int64) (*entity.LiveSession, error)
	GetByStreamKey(ctx context.Context, streamKey string) (*entity.LiveSession, error)
	GetByUserID(ctx context.Context, userID int64, limit, offset int) ([]entity.LiveSession, error)
	ListByStatus(ctx context.Context, status entity.LiveSessionStatus, limit, offset int) ([]entity.LiveSession, error)
	ListLive(ctx context.Context, limit, offset int) ([]entity.LiveSession, error)
	CountByStatus(ctx context.Context, status entity.LiveSessionStatus) (int, error)
	CountByUserID(ctx context.Context, userID int64) (int, error)

	// Update operations
	Update(ctx context.Context, session *entity.LiveSession) error
	UpdateStatus(ctx context.Context, id int64, status entity.LiveSessionStatus) error
	UpdateViewerCount(ctx context.Context, id int64, count int) error
	IncrementViewerCount(ctx context.Context, id int64) error
	DecrementViewerCount(ctx context.Context, id int64) error
	SetStarted(ctx context.Context, id int64) error
	SetEnded(ctx context.Context, id int64) error

	// Delete operations
	Delete(ctx context.Context, id int64) error
}

type liveRepository struct {
	db *sqlx.DB
}

// NewLiveRepository creates a new LiveRepository instance
func NewLiveRepository(db *sqlx.DB) LiveRepository {
	return &liveRepository{db: db}
}

func (r *liveRepository) Create(ctx context.Context, session *entity.LiveSession) error {
	query := `
		INSERT INTO live_sessions (
			user_id, stream_key, title, description, status, 
			rtmp_url, webrtc_url, hls_url, viewer_count
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9
		) RETURNING id, created_at, updated_at`

	err := r.db.QueryRowxContext(ctx, query,
		session.UserID,
		session.StreamKey,
		session.Title,
		session.Description,
		session.Status,
		session.RTMPUrl,
		session.WebRTCUrl,
		session.HLSUrl,
		session.ViewerCount,
	).Scan(&session.ID, &session.CreatedAt, &session.UpdatedAt)

	if err != nil {
		if isDuplicateKeyError(err) {
			return ErrDuplicateKey
		}
		return fmt.Errorf("failed to create live session: %w", err)
	}

	return nil
}

func (r *liveRepository) GetByID(ctx context.Context, id int64) (*entity.LiveSession, error) {
	var session entity.LiveSession
	query := `
		SELECT id, user_id, stream_key, title, description, status,
			   rtmp_url, webrtc_url, hls_url, viewer_count,
			   started_at, ended_at, created_at, updated_at
		FROM live_sessions 
		WHERE id = $1`

	err := r.db.GetContext(ctx, &session, query, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get live session by ID: %w", err)
	}

	return &session, nil
}

func (r *liveRepository) GetByStreamKey(ctx context.Context, streamKey string) (*entity.LiveSession, error) {
	var session entity.LiveSession
	query := `
		SELECT id, user_id, stream_key, title, description, status,
			   rtmp_url, webrtc_url, hls_url, viewer_count,
			   started_at, ended_at, created_at, updated_at
		FROM live_sessions 
		WHERE stream_key = $1`

	err := r.db.GetContext(ctx, &session, query, streamKey)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get live session by stream key: %w", err)
	}

	return &session, nil
}

func (r *liveRepository) GetByUserID(ctx context.Context, userID int64, limit, offset int) ([]entity.LiveSession, error) {
	var sessions []entity.LiveSession
	query := `
		SELECT id, user_id, stream_key, title, description, status,
			   rtmp_url, webrtc_url, hls_url, viewer_count,
			   started_at, ended_at, created_at, updated_at
		FROM live_sessions 
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	err := r.db.SelectContext(ctx, &sessions, query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get live sessions by user ID: %w", err)
	}

	return sessions, nil
}

func (r *liveRepository) ListByStatus(ctx context.Context, status entity.LiveSessionStatus, limit, offset int) ([]entity.LiveSession, error) {
	var sessions []entity.LiveSession
	query := `
		SELECT id, user_id, stream_key, title, description, status,
			   rtmp_url, webrtc_url, hls_url, viewer_count,
			   started_at, ended_at, created_at, updated_at
		FROM live_sessions 
		WHERE status = $1
		ORDER BY started_at DESC NULLS LAST, created_at DESC
		LIMIT $2 OFFSET $3`

	err := r.db.SelectContext(ctx, &sessions, query, status, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list live sessions: %w", err)
	}

	return sessions, nil
}

func (r *liveRepository) ListLive(ctx context.Context, limit, offset int) ([]entity.LiveSession, error) {
	return r.ListByStatus(ctx, entity.StatusLive, limit, offset)
}

func (r *liveRepository) CountByStatus(ctx context.Context, status entity.LiveSessionStatus) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM live_sessions WHERE status = $1`

	err := r.db.GetContext(ctx, &count, query, status)
	if err != nil {
		return 0, fmt.Errorf("failed to count live sessions: %w", err)
	}

	return count, nil
}

func (r *liveRepository) CountByUserID(ctx context.Context, userID int64) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM live_sessions WHERE user_id = $1`

	err := r.db.GetContext(ctx, &count, query, userID)
	if err != nil {
		return 0, fmt.Errorf("failed to count user sessions: %w", err)
	}

	return count, nil
}

func (r *liveRepository) Update(ctx context.Context, session *entity.LiveSession) error {
	query := `
		UPDATE live_sessions SET
			title = $1,
			description = $2,
			status = $3,
			viewer_count = $4,
			started_at = $5,
			ended_at = $6,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $7
		RETURNING updated_at`

	err := r.db.QueryRowxContext(ctx, query,
		session.Title,
		session.Description,
		session.Status,
		session.ViewerCount,
		session.StartedAt,
		session.EndedAt,
		session.ID,
	).Scan(&session.UpdatedAt)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("failed to update live session: %w", err)
	}

	return nil
}

func (r *liveRepository) UpdateStatus(ctx context.Context, id int64, status entity.LiveSessionStatus) error {
	query := `UPDATE live_sessions SET status = $1 WHERE id = $2`

	result, err := r.db.ExecContext(ctx, query, status, id)
	if err != nil {
		return fmt.Errorf("failed to update status: %w", err)
	}

	return checkRowsAffected(result)
}

func (r *liveRepository) UpdateViewerCount(ctx context.Context, id int64, count int) error {
	query := `UPDATE live_sessions SET viewer_count = $1 WHERE id = $2`

	result, err := r.db.ExecContext(ctx, query, count, id)
	if err != nil {
		return fmt.Errorf("failed to update viewer count: %w", err)
	}

	return checkRowsAffected(result)
}

func (r *liveRepository) IncrementViewerCount(ctx context.Context, id int64) error {
	query := `UPDATE live_sessions SET viewer_count = viewer_count + 1 WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to increment viewer count: %w", err)
	}

	return checkRowsAffected(result)
}

func (r *liveRepository) DecrementViewerCount(ctx context.Context, id int64) error {
	query := `UPDATE live_sessions SET viewer_count = GREATEST(viewer_count - 1, 0) WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to decrement viewer count: %w", err)
	}

	return checkRowsAffected(result)
}

func (r *liveRepository) SetStarted(ctx context.Context, id int64) error {
	now := time.Now()
	query := `
		UPDATE live_sessions 
		SET status = $1, started_at = $2 
		WHERE id = $3 AND status = $4`

	result, err := r.db.ExecContext(ctx, query, entity.StatusLive, now, id, entity.StatusIdle)
	if err != nil {
		return fmt.Errorf("failed to set started: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrInvalidStatus
	}

	return nil
}

func (r *liveRepository) SetEnded(ctx context.Context, id int64) error {
	now := time.Now()
	query := `
		UPDATE live_sessions 
		SET status = $1, ended_at = $2, viewer_count = 0 
		WHERE id = $3 AND status = $4`

	result, err := r.db.ExecContext(ctx, query, entity.StatusEnded, now, id, entity.StatusLive)
	if err != nil {
		return fmt.Errorf("failed to set ended: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrInvalidStatus
	}

	return nil
}

func (r *liveRepository) Delete(ctx context.Context, id int64) error {
	query := `DELETE FROM live_sessions WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete live session: %w", err)
	}

	return checkRowsAffected(result)
}

// Helper functions

func checkRowsAffected(result sql.Result) error {
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}

func isDuplicateKeyError(err error) bool {
	// PostgreSQL unique violation error code is 23505
	return err != nil && (contains(err.Error(), "duplicate key") || contains(err.Error(), "23505"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
