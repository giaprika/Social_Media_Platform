package repository

import (
	"database/sql"
	"fmt"
	"time"

	"live-service/internal/entity"

	"github.com/jmoiron/sqlx"
)

type LiveRepository interface {
	Create(session *entity.LiveSession) error
	GetByID(id int64) (*entity.LiveSession, error)
	GetByStreamKey(streamKey string) (*entity.LiveSession, error)
	Update(session *entity.LiveSession) error
	UpdateStatus(id int64, status entity.LiveSessionStatus) error
	ListByStatus(status entity.LiveSessionStatus, limit, offset int) ([]entity.LiveSession, error)
	CountByStatus(status entity.LiveSessionStatus) (int, error)
	Delete(id int64) error
}

type liveRepository struct {
	db *sqlx.DB
}

func NewLiveRepository(db *sqlx.DB) LiveRepository {
	return &liveRepository{db: db}
}

func (r *liveRepository) Create(session *entity.LiveSession) error {
	query := `
		INSERT INTO live_sessions (
			user_id, stream_key, title, description, status, 
			rtmp_url, webrtc_url, hls_url, viewer_count,
			created_at, updated_at
		) VALUES (
			:user_id, :stream_key, :title, :description, :status,
			:rtmp_url, :webrtc_url, :hls_url, :viewer_count,
			:created_at, :updated_at
		) RETURNING id`

	rows, err := r.db.NamedQuery(query, session)
	if err != nil {
		return fmt.Errorf("failed to create live session: %w", err)
	}
	defer rows.Close()

	if rows.Next() {
		if err := rows.Scan(&session.ID); err != nil {
			return fmt.Errorf("failed to scan session ID: %w", err)
		}
	}

	return nil
}

func (r *liveRepository) GetByID(id int64) (*entity.LiveSession, error) {
	var session entity.LiveSession
	query := `
		SELECT id, user_id, stream_key, title, description, status,
			   rtmp_url, webrtc_url, hls_url, viewer_count,
			   started_at, ended_at, created_at, updated_at
		FROM live_sessions 
		WHERE id = $1`

	err := r.db.Get(&session, query, id)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get live session by ID: %w", err)
	}

	return &session, nil
}

func (r *liveRepository) GetByStreamKey(streamKey string) (*entity.LiveSession, error) {
	var session entity.LiveSession
	query := `
		SELECT id, user_id, stream_key, title, description, status,
			   rtmp_url, webrtc_url, hls_url, viewer_count,
			   started_at, ended_at, created_at, updated_at
		FROM live_sessions 
		WHERE stream_key = $1`

	err := r.db.Get(&session, query, streamKey)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get live session by stream key: %w", err)
	}

	return &session, nil
}

func (r *liveRepository) Update(session *entity.LiveSession) error {
	session.UpdatedAt = time.Now()

	query := `
		UPDATE live_sessions SET
			title = :title,
			description = :description,
			status = :status,
			viewer_count = :viewer_count,
			started_at = :started_at,
			ended_at = :ended_at,
			updated_at = :updated_at
		WHERE id = :id`

	result, err := r.db.NamedExec(query, session)
	if err != nil {
		return fmt.Errorf("failed to update live session: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("live session not found")
	}

	return nil
}

func (r *liveRepository) UpdateStatus(id int64, status entity.LiveSessionStatus) error {
	query := `
		UPDATE live_sessions SET
			status = $1,
			updated_at = $2
		WHERE id = $3`

	result, err := r.db.Exec(query, status, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to update live session status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("live session not found")
	}

	return nil
}

func (r *liveRepository) ListByStatus(status entity.LiveSessionStatus, limit, offset int) ([]entity.LiveSession, error) {
	var sessions []entity.LiveSession
	query := `
		SELECT id, user_id, stream_key, title, description, status,
			   rtmp_url, webrtc_url, hls_url, viewer_count,
			   started_at, ended_at, created_at, updated_at
		FROM live_sessions 
		WHERE status = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	err := r.db.Select(&sessions, query, status, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list live sessions: %w", err)
	}

	return sessions, nil
}

func (r *liveRepository) CountByStatus(status entity.LiveSessionStatus) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM live_sessions WHERE status = $1`

	err := r.db.Get(&count, query, status)
	if err != nil {
		return 0, fmt.Errorf("failed to count live sessions: %w", err)
	}

	return count, nil
}

func (r *liveRepository) Delete(id int64) error {
	query := `DELETE FROM live_sessions WHERE id = $1`

	result, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete live session: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("live session not found")
	}

	return nil
}
