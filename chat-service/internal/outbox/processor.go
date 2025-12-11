package outbox

import (
	"context"
	"sync"
	"time"

	"chat-service/internal/repository"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

const (
	// DefaultMaxRetries is the maximum number of retry attempts for an event.
	DefaultMaxRetries = 3

	// DefaultBaseBackoff is the base duration for exponential backoff.
	DefaultBaseBackoff = 1 * time.Second

	// DefaultWorkerCount is the default number of concurrent workers for batch processing.
	DefaultWorkerCount = 10

	// DefaultBatchSize is the default batch size for processing events.
	DefaultBatchSize = 100
)

// ProcessorConfig holds configuration for the outbox processor.
type ProcessorConfig struct {
	PollInterval time.Duration
	BatchSize    int           // Number of events to fetch per poll (default: 100)
	MaxRetries   int           // Maximum retry attempts (default: 3)
	BaseBackoff  time.Duration // Base backoff duration for exponential backoff (default: 1s)
	WorkerCount  int           // Number of concurrent workers for publishing (default: 10)
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
	publisher    *Publisher
	logger       *zap.Logger
	metrics      *Metrics
	pollInterval time.Duration
	batchSize    int
	maxRetries   int
	baseBackoff  time.Duration
	workerCount  int
	stopCh       chan struct{}
	doneCh       chan struct{}
	processing   bool      // indicates if currently processing a batch
	processingMu sync.Mutex // protects processing flag
}

// eventResult holds the result of processing a single event.
type eventResult struct {
	event   repository.Outbox
	success bool
	err     error
}

// NewProcessor creates a new outbox processor.
func NewProcessor(db *pgxpool.Pool, redisClient *redis.Client, logger *zap.Logger, cfg ProcessorConfig) *Processor {
	return NewProcessorWithMetrics(db, redisClient, logger, cfg, DefaultMetrics)
}

// NewProcessorWithMetrics creates a new outbox processor with custom metrics.
func NewProcessorWithMetrics(db *pgxpool.Pool, redisClient *redis.Client, logger *zap.Logger, cfg ProcessorConfig, metrics *Metrics) *Processor {
	maxRetries := cfg.MaxRetries
	if maxRetries <= 0 {
		maxRetries = DefaultMaxRetries
	}

	baseBackoff := cfg.BaseBackoff
	if baseBackoff <= 0 {
		baseBackoff = DefaultBaseBackoff
	}

	workerCount := cfg.WorkerCount
	if workerCount <= 0 {
		workerCount = DefaultWorkerCount
	}

	batchSize := cfg.BatchSize
	if batchSize <= 0 {
		batchSize = DefaultBatchSize
	}

	if metrics == nil {
		metrics = DefaultMetrics
	}

	return &Processor{
		db:           db,
		redis:        redisClient,
		publisher:    NewPublisher(redisClient),
		logger:       logger,
		metrics:      metrics,
		pollInterval: cfg.PollInterval,
		batchSize:    batchSize,
		maxRetries:   maxRetries,
		baseBackoff:  baseBackoff,
		workerCount:  workerCount,
		stopCh:       make(chan struct{}),
		doneCh:       make(chan struct{}),
	}
}


// Start begins the poll loop. It blocks until Stop() is called or context is cancelled.
func (p *Processor) Start(ctx context.Context) {
	p.logger.Info("starting outbox processor",
		zap.Duration("poll_interval", p.pollInterval),
		zap.Int("batch_size", p.batchSize),
		zap.Int("worker_count", p.workerCount))

	ticker := time.NewTicker(p.pollInterval)
	defer ticker.Stop()
	defer close(p.doneCh)

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("outbox processor stopping due to context cancellation, waiting for current batch...")
			p.waitForCurrentBatch()
			p.logger.Info("outbox processor stopped")
			return
		case <-p.stopCh:
			p.logger.Info("outbox processor stopping, waiting for current batch...")
			p.waitForCurrentBatch()
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
// It ensures the current batch completes before returning.
func (p *Processor) Stop() {
	close(p.stopCh)
	<-p.doneCh
}

// setProcessing sets the processing flag safely.
func (p *Processor) setProcessing(processing bool) {
	p.processingMu.Lock()
	defer p.processingMu.Unlock()
	p.processing = processing
}

// isProcessing returns whether a batch is currently being processed.
func (p *Processor) isProcessing() bool {
	p.processingMu.Lock()
	defer p.processingMu.Unlock()
	return p.processing
}

// waitForCurrentBatch waits for any in-progress batch to complete.
func (p *Processor) waitForCurrentBatch() {
	for p.isProcessing() {
		time.Sleep(10 * time.Millisecond)
	}
}

// pollOnce executes a single poll cycle: query unprocessed events and process them.
func (p *Processor) pollOnce(ctx context.Context) error {
	// Mark as processing for graceful shutdown
	p.setProcessing(true)
	defer p.setProcessing(false)

	startTime := time.Now()

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

	// Update pending count metric (approximate - shows locked events count)
	if p.metrics != nil {
		p.metrics.PendingCount.Set(float64(len(events)))
		p.metrics.BatchSize.Observe(float64(len(events)))
	}

	if len(events) == 0 {
		return nil
	}

	processed, publishErrors, err := p.processBatchWithTxAndMetrics(ctx, queries, events)

	// Update metrics
	if p.metrics != nil {
		p.metrics.ProcessedTotal.Add(float64(processed))
		p.metrics.PublishErrorsTotal.Add(float64(publishErrors))
		p.metrics.ProcessingDuration.Observe(time.Since(startTime).Seconds())
	}

	if err != nil {
		p.logger.Error("batch processing encountered errors",
			zap.Int("processed", processed),
			zap.Int("errors", publishErrors),
			zap.Int("total", len(events)),
			zap.Error(err))
	} else {
		p.logger.Info("batch processed",
			zap.Int("count", processed),
			zap.Duration("duration", time.Since(startTime)))
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

// processBatchWithTx processes events within an existing transaction using worker pool.
// Phase 1: Concurrent publish to Redis (I/O bound, benefits from parallelism)
// Phase 2: Sequential DB updates (must be serialized within transaction)
func (p *Processor) processBatchWithTx(ctx context.Context, queries *repository.Queries, events []repository.Outbox) (int, error) {
	processed, _, err := p.processBatchWithTxAndMetrics(ctx, queries, events)
	return processed, err
}

// processBatchWithTxAndMetrics processes events and returns both processed count and error count.
func (p *Processor) processBatchWithTxAndMetrics(ctx context.Context, queries *repository.Queries, events []repository.Outbox) (int, int, error) {
	if len(events) == 0 {
		return 0, 0, nil
	}

	// Phase 1: Concurrent publishing using worker pool
	results := p.publishConcurrently(ctx, events)

	// Phase 2: Sequential DB updates based on publish results
	processed := 0
	publishErrors := 0
	var lastErr error

	for _, result := range results {
		if result.success {
			// Mark as processed
			if err := p.markEventProcessed(ctx, queries, result.event.ID); err != nil {
				p.logger.Error("failed to mark event as processed",
					zap.String("event_id", result.event.ID.String()),
					zap.Error(err))
				lastErr = err
				continue
			}
			processed++
		} else {
			// Handle failure - increment retry count or move to DLQ
			publishErrors++
			p.logger.Error("failed to process event",
				zap.String("event_id", result.event.ID.String()),
				zap.String("aggregate_type", result.event.AggregateType),
				zap.Int32("retry_count", result.event.RetryCount),
				zap.Error(result.err))

			errMsg := ""
			if result.err != nil {
				errMsg = result.err.Error()
			}
			if err := p.handleEventFailure(ctx, queries, result.event, errMsg); err != nil {
				p.logger.Error("failed to handle event failure",
					zap.String("event_id", result.event.ID.String()),
					zap.Error(err))
			}
			lastErr = result.err
		}
	}

	return processed, publishErrors, lastErr
}

// publishConcurrently publishes events to Redis using a worker pool.
// Returns results in the same order as input events.
func (p *Processor) publishConcurrently(ctx context.Context, events []repository.Outbox) []eventResult {
	numEvents := len(events)
	results := make([]eventResult, numEvents)

	// Use semaphore pattern for worker pool
	workerCount := p.workerCount
	if workerCount > numEvents {
		workerCount = numEvents
	}

	var wg sync.WaitGroup
	semaphore := make(chan struct{}, workerCount)

	for i, event := range events {
		wg.Add(1)
		go func(idx int, evt repository.Outbox) {
			defer wg.Done()

			// Acquire semaphore slot
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// Check context cancellation
			if ctx.Err() != nil {
				results[idx] = eventResult{
					event:   evt,
					success: false,
					err:     ctx.Err(),
				}
				return
			}

			// Publish to Redis
			err := p.processEvent(ctx, evt)
			results[idx] = eventResult{
				event:   evt,
				success: err == nil,
				err:     err,
			}
		}(i, event)
	}

	wg.Wait()
	return results
}

// handleEventFailure handles a failed event by incrementing retry count.
// If max retries exceeded, moves the event to Dead Letter Queue.
func (p *Processor) handleEventFailure(ctx context.Context, queries *repository.Queries, event repository.Outbox, errMsg string) error {
	newRetryCount := event.RetryCount + 1

	// Check if max retries exceeded - move to DLQ
	if int(newRetryCount) >= p.maxRetries {
		return p.moveEventToDLQ(ctx, queries, event, errMsg)
	}

	// Still has retries left - increment retry count
	nextBackoff := p.calculateBackoff(int(newRetryCount))
	p.logger.Warn("event failed, will retry",
		zap.String("event_id", event.ID.String()),
		zap.Int32("retry_count", newRetryCount),
		zap.Duration("next_backoff", nextBackoff))

	return queries.IncrementOutboxRetry(ctx, event.ID)
}

// moveEventToDLQ moves a failed event to the Dead Letter Queue.
func (p *Processor) moveEventToDLQ(ctx context.Context, queries *repository.Queries, event repository.Outbox, errMsg string) error {
	p.logger.Error("moving event to Dead Letter Queue - max retries exceeded",
		zap.String("event_id", event.ID.String()),
		zap.String("aggregate_type", event.AggregateType),
		zap.String("aggregate_id", event.AggregateID.String()),
		zap.Int32("retry_count", event.RetryCount),
		zap.Int("max_retries", p.maxRetries),
		zap.String("error", errMsg))

	// Move to DLQ
	if err := queries.MoveOutboxToDLQ(ctx, repository.MoveOutboxToDLQParams{
		ID:           event.ID,
		ErrorMessage: pgtype.Text{String: errMsg, Valid: errMsg != ""},
	}); err != nil {
		p.logger.Error("failed to move event to DLQ",
			zap.String("event_id", event.ID.String()),
			zap.Error(err))
		return err
	}

	// Delete from outbox
	if err := queries.DeleteOutboxEvent(ctx, event.ID); err != nil {
		p.logger.Error("failed to delete event from outbox after DLQ move",
			zap.String("event_id", event.ID.String()),
			zap.Error(err))
		return err
	}

	// Update DLQ metric
	if p.metrics != nil {
		p.metrics.DLQTotal.Inc()
	}

	p.logger.Info("event moved to Dead Letter Queue",
		zap.String("event_id", event.ID.String()),
		zap.String("aggregate_type", event.AggregateType))

	return nil
}

// calculateBackoff calculates exponential backoff duration for a given retry attempt.
// Formula: baseBackoff * 2^(retryCount-1)
// Example with 1s base: retry 1 = 1s, retry 2 = 2s, retry 3 = 4s
func (p *Processor) calculateBackoff(retryCount int) time.Duration {
	if retryCount <= 0 {
		return p.baseBackoff
	}
	multiplier := 1 << (retryCount - 1) // 2^(retryCount-1)
	return p.baseBackoff * time.Duration(multiplier)
}

// ShouldRetryEvent checks if an event should be retried based on retry count and backoff.
func (p *Processor) ShouldRetryEvent(event repository.Outbox) bool {
	// Check max retries
	if int(event.RetryCount) >= p.maxRetries {
		return false
	}

	// Check backoff period
	if event.LastRetryAt.Valid {
		backoff := p.calculateBackoff(int(event.RetryCount))
		nextRetryTime := event.LastRetryAt.Time.Add(backoff)
		if time.Now().Before(nextRetryTime) {
			return false
		}
	}

	return true
}


// processEvent publishes the event to Redis Streams.
func (p *Processor) processEvent(ctx context.Context, event repository.Outbox) error {
	streamID, err := p.publisher.Publish(ctx, event)
	if err != nil {
		return err
	}

	p.logger.Debug("event published to Redis Streams",
		zap.String("event_id", event.ID.String()),
		zap.String("aggregate_type", event.AggregateType),
		zap.String("stream_id", streamID))

	return nil
}

// markEventProcessed updates the processed_at timestamp for an event.
func (p *Processor) markEventProcessed(ctx context.Context, queries *repository.Queries, eventID pgtype.UUID) error {
	return queries.MarkOutboxProcessed(ctx, eventID)
}
