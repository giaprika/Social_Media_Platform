package outbox

import (
	"context"
	"time"

	"chat-service/internal/repository"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// ProcessorConfig holds configuration for the outbox processor.
type ProcessorConfig struct {
	PollInterval time.Duration
	BatchSize    int
}

// ProcessorInterface defines the interface for outbox processor (for testing).
type ProcessorInterface interface {
	Start(ctx context.Context)
	Stop()
	ProcessBatch(ctx context.Context, events []repository.Outbox) (int, error)
}

// Processor polls the outbox table and processes events.
type Processor struct {
	db           *pgxpool.Pool
	redis        *redis.Client
	logger       *zap.Logger
	pollInterval time.Duration
	batchSize    int
	stopCh       chan struct{}
	doneCh       chan struct{}
}

// NewProcessor creates a new outbox processor.
func NewProcessor(db *pgxpool.Pool, redisClient *redis.Client, logger *zap.Logger, cfg ProcessorConfig) *Processor {
	return &Processor{
		db:           db,
		redis:        redisClient,
		logger:       logger,
		pollInterval: cfg.PollInterval,
		batchSize:    cfg.BatchSize,
		stopCh:       make(chan struct{}),
		doneCh:       make(chan struct{}),
	}
}


// Start begins the poll loop. It blocks until Stop() is called or context is cancelled.
func (p *Processor) Start(ctx context.Context) {
	p.logger.Info("starting outbox processor",
		zap.Duration("poll_interval", p.pollInterval),
		zap.Int("batch_size", p.batchSize))

	ticker := time.NewTicker(p.pollInterval)
	defer ticker.Stop()
	defer close(p.doneCh)

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("outbox processor stopped due to context cancellation")
			return
		case <-p.stopCh:
			p.logger.Info("outbox processor stopped")
			return
		case <-ticker.C:
			if err := p.pollOnce(ctx); err != nil {
				p.logger.Error("poll cycle failed", zap.Error(err))
			}
		}
	}
}

// Stop signals the processor to stop and waits for it to finish.
func (p *Processor) Stop() {
	close(p.stopCh)
	<-p.doneCh
}

// pollOnce executes a single poll cycle: query unprocessed events and process them.
func (p *Processor) pollOnce(ctx context.Context) error {
	// Start a transaction to use FOR UPDATE SKIP LOCKED
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if err := tx.Rollback(ctx); err != nil {
			p.logger.Debug("failed to rollback transaction", zap.Error(err))
		}
	}()

	queries := repository.New(tx)
	events, err := queries.GetAndLockUnprocessedOutbox(ctx, int32(p.batchSize))
	if err != nil {
		return err
	}

	if len(events) == 0 {
		return nil
	}

	processed, err := p.processBatchWithTx(ctx, queries, events)
	if err != nil {
		p.logger.Error("batch processing encountered errors",
			zap.Int("processed", processed),
			zap.Int("total", len(events)),
			zap.Error(err))
	} else {
		p.logger.Info("batch processed",
			zap.Int("count", processed))
	}

	// Commit the transaction to release locks and persist processed_at updates
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	return nil
}


// ProcessBatch processes a batch of events using partial success strategy.
// It returns the count of successfully processed events.
// This method is exposed for testing purposes.
func (p *Processor) ProcessBatch(ctx context.Context, events []repository.Outbox) (int, error) {
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() {
		if err := tx.Rollback(ctx); err != nil {
			p.logger.Debug("failed to rollback transaction", zap.Error(err))
		}
	}()

	queries := repository.New(tx)
	processed, err := p.processBatchWithTx(ctx, queries, events)
	if err != nil {
		return processed, err
	}

	if err := tx.Commit(ctx); err != nil {
		return processed, err
	}
	return processed, nil
}

// processBatchWithTx processes events within an existing transaction.
func (p *Processor) processBatchWithTx(ctx context.Context, queries *repository.Queries, events []repository.Outbox) (int, error) {
	processed := 0
	var lastErr error

	for _, event := range events {
		// Process the event (future: publish to Redis Streams)
		if err := p.processEvent(ctx, event); err != nil {
			p.logger.Error("failed to process event",
				zap.String("event_id", event.ID.String()),
				zap.String("aggregate_type", event.AggregateType),
				zap.Error(err))
			lastErr = err
			continue
		}

		// Mark as processed
		if err := p.markEventProcessed(ctx, queries, event.ID); err != nil {
			p.logger.Error("failed to mark event as processed",
				zap.String("event_id", event.ID.String()),
				zap.Error(err))
			lastErr = err
			continue
		}

		processed++
	}

	return processed, lastErr
}


// processEvent handles the actual event processing (future: publish to Redis Streams).
func (p *Processor) processEvent(ctx context.Context, event repository.Outbox) error {
	// TODO: Implement Redis Streams publishing in Task 2
	// For now, this is a no-op placeholder
	return nil
}

// markEventProcessed updates the processed_at timestamp for an event.
func (p *Processor) markEventProcessed(ctx context.Context, queries *repository.Queries, eventID pgtype.UUID) error {
	return queries.MarkOutboxProcessed(ctx, eventID)
}
