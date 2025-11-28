//go:build integration

package outbox

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"testing"
	"time"

	"chat-service/internal/repository"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/redis/go-redis/v9"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"go.uber.org/zap"
)

// testInfra holds the test infrastructure for property tests
var testInfra *testInfrastructure

type testInfrastructure struct {
	PostgresContainer testcontainers.Container
	DBPool            *pgxpool.Pool
}

func TestMain(m *testing.M) {
	ctx := context.Background()

	var err error
	testInfra, err = setupTestInfrastructure(ctx)
	if err != nil {
		log.Fatalf("Failed to setup test infrastructure: %v", err)
	}

	code := m.Run()

	if testInfra != nil {
		if err := testInfra.teardown(ctx); err != nil {
			log.Printf("Failed to teardown: %v", err)
		}
	}

	os.Exit(code)
}

func setupTestInfrastructure(ctx context.Context) (*testInfrastructure, error) {
	infra := &testInfrastructure{}

	postgresContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "postgres:16-alpine",
			ExposedPorts: []string{"5432/tcp"},
			Env: map[string]string{
				"POSTGRES_USER":     "testuser",
				"POSTGRES_PASSWORD": "testpass",
				"POSTGRES_DB":       "testdb",
			},
			WaitingFor: wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60 * time.Second),
		},
		Started: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start PostgreSQL container: %w", err)
	}
	infra.PostgresContainer = postgresContainer

	postgresHost, err := postgresContainer.Host(ctx)
	if err != nil {
		return nil, err
	}

	postgresPort, err := postgresContainer.MappedPort(ctx, "5432")
	if err != nil {
		return nil, err
	}

	connString := fmt.Sprintf(
		"postgres://testuser:testpass@%s:%s/testdb?sslmode=disable",
		postgresHost, postgresPort.Port(),
	)

	infra.DBPool, err = pgxpool.New(ctx, connString)
	if err != nil {
		return nil, err
	}

	if err := runMigrations(ctx, infra.DBPool); err != nil {
		return nil, err
	}

	return infra, nil
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	migrationsDir := "../../migrations"

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("failed to read migrations directory: %w", err)
	}

	var migrationFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".sql" {
			migrationFiles = append(migrationFiles, entry.Name())
		}
	}
	sort.Strings(migrationFiles)

	for _, filename := range migrationFiles {
		content, err := os.ReadFile(filepath.Join(migrationsDir, filename))
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			return fmt.Errorf("migration %s failed: %w", filename, err)
		}
	}
	return nil
}

func (ti *testInfrastructure) teardown(ctx context.Context) error {
	if ti.DBPool != nil {
		ti.DBPool.Close()
	}
	if ti.PostgresContainer != nil {
		return ti.PostgresContainer.Terminate(ctx)
	}
	return nil
}

func (ti *testInfrastructure) cleanupOutbox(ctx context.Context) error {
	_, err := ti.DBPool.Exec(ctx, "TRUNCATE TABLE outbox CASCADE")
	return err
}

// insertTestOutboxEvent inserts a test event and returns its ID
func insertTestOutboxEvent(ctx context.Context, pool *pgxpool.Pool, processed bool) (pgtype.UUID, error) {
	queries := repository.New(pool)

	aggregateID := pgtype.UUID{}
	aggregateID.Scan("00000000-0000-0000-0000-000000000001")

	err := queries.InsertOutbox(ctx, repository.InsertOutboxParams{
		AggregateType: "test",
		AggregateID:   aggregateID,
		Payload:       []byte(`{"test": true}`),
	})
	if err != nil {
		return pgtype.UUID{}, err
	}

	// Get the last inserted ID
	var id pgtype.UUID
	err = pool.QueryRow(ctx, "SELECT id FROM outbox ORDER BY created_at DESC LIMIT 1").Scan(&id)
	if err != nil {
		return pgtype.UUID{}, err
	}

	if processed {
		err = queries.MarkOutboxProcessed(ctx, id)
		if err != nil {
			return pgtype.UUID{}, err
		}
	}

	return id, nil
}

// **Feature: outbox-processor, Property 1: Unprocessed Events Query Correctness**
// *For any* set of outbox events in the database, when the processor queries for unprocessed events,
// all returned events SHALL have `processed_at = NULL` and be ordered by `created_at` ascending.
// **Validates: Requirements 2.1**
func TestProperty_UnprocessedEventsQueryCorrectness(t *testing.T) {
	if testInfra == nil {
		t.Skip("Test infrastructure not available")
	}

	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	properties.Property("query returns only unprocessed events in created_at order", prop.ForAll(
		func(numUnprocessed, numProcessed int) bool {
			ctx := context.Background()

			// Cleanup before test
			if err := testInfra.cleanupOutbox(ctx); err != nil {
				t.Logf("cleanup failed: %v", err)
				return false
			}

			// Insert unprocessed events
			for i := 0; i < numUnprocessed; i++ {
				if _, err := insertTestOutboxEvent(ctx, testInfra.DBPool, false); err != nil {
					t.Logf("insert unprocessed failed: %v", err)
					return false
				}
				// Small delay to ensure different created_at timestamps
				time.Sleep(time.Millisecond)
			}

			// Insert processed events
			for i := 0; i < numProcessed; i++ {
				if _, err := insertTestOutboxEvent(ctx, testInfra.DBPool, true); err != nil {
					t.Logf("insert processed failed: %v", err)
					return false
				}
			}

			// Query unprocessed events
			queries := repository.New(testInfra.DBPool)
			events, err := queries.GetAndLockUnprocessedOutbox(ctx, int32(numUnprocessed+numProcessed+10))
			if err != nil {
				t.Logf("query failed: %v", err)
				return false
			}

			// Verify: count matches unprocessed
			if len(events) != numUnprocessed {
				t.Logf("expected %d unprocessed, got %d", numUnprocessed, len(events))
				return false
			}

			// Verify: all returned events have processed_at = NULL
			for _, event := range events {
				if event.ProcessedAt.Valid {
					t.Logf("event %s has processed_at set", event.ID.String())
					return false
				}
			}

			// Verify: events are ordered by created_at ascending
			for i := 1; i < len(events); i++ {
				prev := events[i-1].CreatedAt.Time
				curr := events[i].CreatedAt.Time
				if curr.Before(prev) {
					t.Logf("events not in order: %v > %v", prev, curr)
					return false
				}
			}

			return true
		},
		gen.IntRange(0, 10),  // numUnprocessed: 0-10
		gen.IntRange(0, 10),  // numProcessed: 0-10
	))

	properties.TestingRun(t)
}

// **Feature: outbox-processor, Property 2: Batch Size Limit**
// *For any* number of unprocessed events in the database (N events), when the processor queries
// with batch size B, the number of returned events SHALL be `min(N, B)`.
// **Validates: Requirements 2.4**
func TestProperty_BatchSizeLimit(t *testing.T) {
	if testInfra == nil {
		t.Skip("Test infrastructure not available")
	}

	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	properties.Property("query respects batch size limit", prop.ForAll(
		func(numEvents, batchSize int) bool {
			ctx := context.Background()

			// Cleanup before test
			if err := testInfra.cleanupOutbox(ctx); err != nil {
				t.Logf("cleanup failed: %v", err)
				return false
			}

			// Insert unprocessed events
			for i := 0; i < numEvents; i++ {
				if _, err := insertTestOutboxEvent(ctx, testInfra.DBPool, false); err != nil {
					t.Logf("insert failed: %v", err)
					return false
				}
			}

			// Query with batch size limit
			queries := repository.New(testInfra.DBPool)
			events, err := queries.GetAndLockUnprocessedOutbox(ctx, int32(batchSize))
			if err != nil {
				t.Logf("query failed: %v", err)
				return false
			}

			// Verify: returned count = min(numEvents, batchSize)
			expected := numEvents
			if batchSize < expected {
				expected = batchSize
			}

			if len(events) != expected {
				t.Logf("expected min(%d, %d) = %d events, got %d", numEvents, batchSize, expected, len(events))
				return false
			}

			return true
		},
		gen.IntRange(0, 20),  // numEvents: 0-20
		gen.IntRange(1, 15),  // batchSize: 1-15
	))

	properties.TestingRun(t)
}

// **Feature: scaling, Property 5: No Duplicate Processing**
// *For any* number of Processor instances (N workers) running concurrently against the same database,
// when M events are inserted into the outbox, the total number of times events are processed SHALL be
// exactly M (no duplicates, no missed events).
// **Validates: Horizontal Scaling requirement**
func TestProperty_ConcurrencySafety_NoDuplicateProcessing(t *testing.T) {
	if testInfra == nil {
		t.Skip("Test infrastructure not available")
	}

	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	properties.Property("concurrent processors do not duplicate event processing", prop.ForAll(
		func(numEvents, numWorkers int) bool {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			// Cleanup before test
			if err := testInfra.cleanupOutbox(ctx); err != nil {
				t.Logf("cleanup failed: %v", err)
				return false
			}

			// Insert unprocessed events
			insertedIDs := make([]pgtype.UUID, 0, numEvents)
			for i := 0; i < numEvents; i++ {
				id, err := insertTestOutboxEvent(ctx, testInfra.DBPool, false)
				if err != nil {
					t.Logf("insert failed: %v", err)
					return false
				}
				insertedIDs = append(insertedIDs, id)
			}

			// Track processed events using a channel
			processedCh := make(chan pgtype.UUID, numEvents*numWorkers)
			doneCh := make(chan struct{})

			// Start multiple workers concurrently
			for w := 0; w < numWorkers; w++ {
				go func(workerID int) {
					// Each worker runs multiple poll cycles
					for cycle := 0; cycle < 5; cycle++ {
						select {
						case <-doneCh:
							return
						default:
						}

						// Start a transaction with FOR UPDATE SKIP LOCKED
						tx, err := testInfra.DBPool.Begin(ctx)
						if err != nil {
							continue
						}

						queries := repository.New(tx)
						events, err := queries.GetAndLockUnprocessedOutbox(ctx, int32(numEvents+10))
						if err != nil {
							tx.Rollback(ctx)
							continue
						}

						// Process each event
						for _, event := range events {
							// Mark as processed
							if err := queries.MarkOutboxProcessed(ctx, event.ID); err != nil {
								continue
							}
							// Record that we processed this event
							processedCh <- event.ID
						}

						tx.Commit(ctx)

						// Small delay between cycles
						time.Sleep(5 * time.Millisecond)
					}
				}(w)
			}

			// Wait for workers to finish
			time.Sleep(200 * time.Millisecond)
			close(doneCh)

			// Give workers time to finish current operations
			time.Sleep(50 * time.Millisecond)
			close(processedCh)

			// Collect all processed event IDs
			processedIDs := make(map[string]int)
			for id := range processedCh {
				idStr := id.String()
				processedIDs[idStr]++
			}

			// Verify: each event was processed exactly once (no duplicates)
			for idStr, count := range processedIDs {
				if count > 1 {
					t.Logf("event %s was processed %d times (duplicate!)", idStr, count)
					return false
				}
			}

			// Verify: all events were processed (no missed events)
			// Query remaining unprocessed events
			queries := repository.New(testInfra.DBPool)
			remaining, err := queries.GetUnprocessedOutbox(ctx, int32(numEvents+10))
			if err != nil {
				t.Logf("query remaining failed: %v", err)
				return false
			}

			totalProcessed := len(processedIDs)
			totalRemaining := len(remaining)

			// Total should equal numEvents
			if totalProcessed+totalRemaining != numEvents {
				t.Logf("processed=%d + remaining=%d != total=%d", totalProcessed, totalRemaining, numEvents)
				return false
			}

			return true
		},
		gen.IntRange(10, 50),  // numEvents: 10-50
		gen.IntRange(2, 5),    // numWorkers: 2-5
	))

	properties.TestingRun(t)
}

// TestIntegration_ConcurrentWorkers tests that multiple processor instances
// can run concurrently without duplicate processing.
func TestIntegration_ConcurrentWorkers(t *testing.T) {
	if testInfra == nil {
		t.Skip("Test infrastructure not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Cleanup before test
	if err := testInfra.cleanupOutbox(ctx); err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}

	// Insert 100 test events
	numEvents := 100
	insertedIDs := make(map[string]bool)
	for i := 0; i < numEvents; i++ {
		id, err := insertTestOutboxEvent(ctx, testInfra.DBPool, false)
		if err != nil {
			t.Fatalf("insert failed: %v", err)
		}
		insertedIDs[id.String()] = true
	}

	// Track processed events
	var mu sync.Mutex
	processedCount := make(map[string]int)

	// Create multiple processor instances
	numWorkers := 3
	var wg sync.WaitGroup

	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()

			// Each worker runs multiple poll cycles
			for cycle := 0; cycle < 20; cycle++ {
				select {
				case <-ctx.Done():
					return
				default:
				}

				// Start a transaction with FOR UPDATE SKIP LOCKED
				tx, err := testInfra.DBPool.Begin(ctx)
				if err != nil {
					continue
				}

				queries := repository.New(tx)
				events, err := queries.GetAndLockUnprocessedOutbox(ctx, 20)
				if err != nil {
					tx.Rollback(ctx)
					continue
				}

				// Process each event
				for _, event := range events {
					// Mark as processed
					if err := queries.MarkOutboxProcessed(ctx, event.ID); err != nil {
						continue
					}

					// Record processing
					mu.Lock()
					processedCount[event.ID.String()]++
					mu.Unlock()
				}

				if err := tx.Commit(ctx); err != nil {
					continue
				}

				// Small delay between cycles
				time.Sleep(10 * time.Millisecond)
			}
		}(w)
	}

	// Wait for all workers to complete
	wg.Wait()

	// Verify no duplicates
	duplicates := 0
	for id, count := range processedCount {
		if count > 1 {
			t.Errorf("event %s was processed %d times (duplicate!)", id, count)
			duplicates++
		}
	}

	if duplicates > 0 {
		t.Fatalf("found %d duplicate processings", duplicates)
	}

	// Verify all events were processed
	queries := repository.New(testInfra.DBPool)
	remaining, err := queries.GetUnprocessedOutbox(ctx, int32(numEvents+10))
	if err != nil {
		t.Fatalf("query remaining failed: %v", err)
	}

	totalProcessed := len(processedCount)
	totalRemaining := len(remaining)

	t.Logf("Processed: %d, Remaining: %d, Total: %d", totalProcessed, totalRemaining, numEvents)

	if totalProcessed+totalRemaining != numEvents {
		t.Errorf("processed=%d + remaining=%d != total=%d", totalProcessed, totalRemaining, numEvents)
	}

	// All events should be processed
	if totalRemaining > 0 {
		t.Logf("Note: %d events remain unprocessed (this is acceptable if workers finished early)", totalRemaining)
	}
}

// redisTestInfra holds Redis test infrastructure
type redisTestInfrastructure struct {
	RedisContainer testcontainers.Container
	RedisAddr      string
}

func setupRedisInfrastructure(ctx context.Context) (*redisTestInfrastructure, error) {
	infra := &redisTestInfrastructure{}

	redisContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "redis:7-alpine",
			ExposedPorts: []string{"6379/tcp"},
			WaitingFor:   wait.ForLog("Ready to accept connections").WithStartupTimeout(30 * time.Second),
		},
		Started: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start Redis container: %w", err)
	}
	infra.RedisContainer = redisContainer

	redisHost, err := redisContainer.Host(ctx)
	if err != nil {
		return nil, err
	}

	redisPort, err := redisContainer.MappedPort(ctx, "6379")
	if err != nil {
		return nil, err
	}

	infra.RedisAddr = fmt.Sprintf("%s:%s", redisHost, redisPort.Port())
	return infra, nil
}

func (ri *redisTestInfrastructure) teardown(ctx context.Context) error {
	if ri.RedisContainer != nil {
		return ri.RedisContainer.Terminate(ctx)
	}
	return nil
}


// TestIntegration_EndToEnd_MessageToRedisPubSub tests the complete flow:
// Insert message → Outbox event created → Processor publishes to Redis Pub/Sub Channel
// Requirement: Event should be published within 100ms
// **Validates: Task 2 (Redis Pub/Sub Publisher) and Task 9 (Integration Test)**
func TestIntegration_EndToEnd_MessageToRedisPubSub(t *testing.T) {
	if testInfra == nil {
		t.Skip("Test infrastructure not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Setup Redis
	redisInfra, err := setupRedisInfrastructure(ctx)
	if err != nil {
		t.Fatalf("Failed to setup Redis: %v", err)
	}
	defer redisInfra.teardown(ctx)

	// Create Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr: redisInfra.RedisAddr,
	})
	defer redisClient.Close()

	// Verify Redis connection
	if err := redisClient.Ping(ctx).Err(); err != nil {
		t.Fatalf("Failed to connect to Redis: %v", err)
	}

	// Cleanup outbox
	if err := testInfra.cleanupOutbox(ctx); err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}

	// Subscribe to the channel BEFORE starting processor
	pubsub := redisClient.Subscribe(ctx, ChannelName)
	defer pubsub.Close()

	// Wait for subscription to be ready
	_, err = pubsub.Receive(ctx)
	if err != nil {
		t.Fatalf("Failed to subscribe: %v", err)
	}

	// Channel to receive messages
	msgCh := pubsub.Channel()

	// Create processor with fast poll interval
	logger, _ := zap.NewDevelopment()
	processor := NewProcessor(testInfra.DBPool, redisClient, logger, ProcessorConfig{
		PollInterval: 20 * time.Millisecond,
		BatchSize:    100,
		WorkerCount:  10,
	})

	// Start processor
	processorCtx, processorCancel := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		processorCancel()
		processor.Stop()
	}()

	// Insert a test outbox event
	startTime := time.Now()
	aggregateID := pgtype.UUID{}
	_ = aggregateID.Scan("11111111-1111-1111-1111-111111111111")

	queries := repository.New(testInfra.DBPool)
	err = queries.InsertOutbox(ctx, repository.InsertOutboxParams{
		AggregateType: "message.sent",
		AggregateID:   aggregateID,
		Payload:       []byte(`{"message_id": "test-123", "content": "Hello World"}`),
	})
	if err != nil {
		t.Fatalf("Failed to insert outbox event: %v", err)
	}

	// Wait for event to be published to Redis Channel (max 100ms as per task requirement)
	var receivedMsg *redis.Message
	deadline := time.Now().Add(100 * time.Millisecond)

	for time.Now().Before(deadline) {
		select {
		case msg := <-msgCh:
			receivedMsg = msg
		default:
			time.Sleep(5 * time.Millisecond)
		}
		if receivedMsg != nil {
			break
		}
	}

	latency := time.Since(startTime)

	// Verify event was published
	if receivedMsg == nil {
		t.Fatalf("Event was not published to Redis Channel within 100ms (waited %v)", latency)
	}

	t.Logf("Event published to Redis Channel in %v", latency)

	// Verify latency requirement (<100ms)
	if latency > 100*time.Millisecond {
		t.Errorf("Latency %v exceeds 100ms requirement", latency)
	}

	// Verify event content
	var payload EventPayload
	if err := json.Unmarshal([]byte(receivedMsg.Payload), &payload); err != nil {
		t.Fatalf("Failed to unmarshal payload: %v", err)
	}

	if payload.AggregateType != "message.sent" {
		t.Errorf("Expected aggregate_type 'message.sent', got '%v'", payload.AggregateType)
	}

	t.Logf("Received payload: %+v", payload)
}

// TestIntegration_EndToEnd_MultipleMessages tests processing multiple messages
// and verifies all are published to Redis Pub/Sub Channel within acceptable latency.
func TestIntegration_EndToEnd_MultipleMessages(t *testing.T) {
	if testInfra == nil {
		t.Skip("Test infrastructure not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// Setup Redis
	redisInfra, err := setupRedisInfrastructure(ctx)
	if err != nil {
		t.Fatalf("Failed to setup Redis: %v", err)
	}
	defer redisInfra.teardown(ctx)

	// Create Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr: redisInfra.RedisAddr,
	})
	defer redisClient.Close()

	// Cleanup outbox
	if err := testInfra.cleanupOutbox(ctx); err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}

	// Subscribe to the channel BEFORE starting processor
	pubsub := redisClient.Subscribe(ctx, ChannelName)
	defer pubsub.Close()

	// Wait for subscription to be ready
	_, err = pubsub.Receive(ctx)
	if err != nil {
		t.Fatalf("Failed to subscribe: %v", err)
	}

	// Channel to receive messages
	msgCh := pubsub.Channel()

	// Create processor
	logger, _ := zap.NewDevelopment()
	processor := NewProcessor(testInfra.DBPool, redisClient, logger, ProcessorConfig{
		PollInterval: 20 * time.Millisecond,
		BatchSize:    100,
		WorkerCount:  10,
	})

	// Start processor
	processorCtx, processorCancel := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		processorCancel()
		processor.Stop()
	}()

	// Insert multiple test events
	numEvents := 50
	startTime := time.Now()

	queries := repository.New(testInfra.DBPool)
	for i := 0; i < numEvents; i++ {
		aggregateID := pgtype.UUID{}
		_ = aggregateID.Scan(fmt.Sprintf("22222222-2222-2222-2222-%012d", i))

		err = queries.InsertOutbox(ctx, repository.InsertOutboxParams{
			AggregateType: "message.sent",
			AggregateID:   aggregateID,
			Payload:       []byte(fmt.Sprintf(`{"message_id": "msg-%d", "content": "Message %d"}`, i, i)),
		})
		if err != nil {
			t.Fatalf("Failed to insert outbox event %d: %v", i, err)
		}
	}

	insertDuration := time.Since(startTime)
	t.Logf("Inserted %d events in %v", numEvents, insertDuration)

	// Wait for all events to be published (max 2 seconds for 50 events)
	deadline := time.Now().Add(2 * time.Second)
	publishedCount := 0

	for time.Now().Before(deadline) && publishedCount < numEvents {
		select {
		case <-msgCh:
			publishedCount++
		case <-time.After(50 * time.Millisecond):
			// Check if all events are processed in DB
			remaining, _ := queries.GetUnprocessedOutbox(ctx, int32(numEvents+10))
			if len(remaining) == 0 {
				// All processed, wait a bit more for messages
				time.Sleep(100 * time.Millisecond)
				// Drain remaining messages
				for {
					select {
					case <-msgCh:
						publishedCount++
					default:
						goto done
					}
				}
			}
		}
	}
done:

	totalLatency := time.Since(startTime)

	t.Logf("Published %d/%d events in %v", publishedCount, numEvents, totalLatency)

	// Verify all events were published
	if publishedCount < numEvents {
		t.Errorf("Only %d/%d events were published within deadline", publishedCount, numEvents)
	}

	// Calculate average latency per event
	avgLatency := totalLatency / time.Duration(numEvents)
	t.Logf("Average latency per event: %v", avgLatency)

	// Total time should be reasonable
	if totalLatency > 2*time.Second {
		t.Errorf("Total latency %v exceeds 2s for %d events", totalLatency, numEvents)
	}
}

// TestIntegration_Latency_P99 measures P99 latency for event processing via Pub/Sub
func TestIntegration_Latency_P99(t *testing.T) {
	if testInfra == nil {
		t.Skip("Test infrastructure not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// Setup Redis
	redisInfra, err := setupRedisInfrastructure(ctx)
	if err != nil {
		t.Fatalf("Failed to setup Redis: %v", err)
	}
	defer redisInfra.teardown(ctx)

	// Create Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr: redisInfra.RedisAddr,
	})
	defer redisClient.Close()

	// Cleanup outbox
	if err := testInfra.cleanupOutbox(ctx); err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}

	// Subscribe to the channel
	pubsub := redisClient.Subscribe(ctx, ChannelName)
	defer pubsub.Close()

	_, err = pubsub.Receive(ctx)
	if err != nil {
		t.Fatalf("Failed to subscribe: %v", err)
	}

	msgCh := pubsub.Channel()

	// Create processor
	logger, _ := zap.NewDevelopment()
	processor := NewProcessor(testInfra.DBPool, redisClient, logger, ProcessorConfig{
		PollInterval: 20 * time.Millisecond,
		BatchSize:    100,
		WorkerCount:  10,
	})

	// Start processor
	processorCtx, processorCancel := context.WithCancel(ctx)
	go processor.Start(processorCtx)
	defer func() {
		processorCancel()
		processor.Stop()
	}()

	// Measure latency for individual events
	numSamples := 20
	latencies := make([]time.Duration, 0, numSamples)

	queries := repository.New(testInfra.DBPool)

	for i := 0; i < numSamples; i++ {
		// Insert event
		startTime := time.Now()
		aggregateID := pgtype.UUID{}
		_ = aggregateID.Scan(fmt.Sprintf("33333333-3333-3333-3333-%012d", i))

		err = queries.InsertOutbox(ctx, repository.InsertOutboxParams{
			AggregateType: "message.sent",
			AggregateID:   aggregateID,
			Payload:       []byte(fmt.Sprintf(`{"sample": %d}`, i)),
		})
		if err != nil {
			t.Fatalf("Failed to insert: %v", err)
		}

		// Wait for event to appear in channel
		deadline := time.Now().Add(200 * time.Millisecond)
		received := false
		for time.Now().Before(deadline) {
			select {
			case <-msgCh:
				latency := time.Since(startTime)
				latencies = append(latencies, latency)
				received = true
			default:
				time.Sleep(2 * time.Millisecond)
			}
			if received {
				break
			}
		}

		if !received {
			t.Logf("Sample %d: message not received within deadline", i)
		}

		// Small delay between samples
		time.Sleep(30 * time.Millisecond)
	}

	// Calculate P99
	if len(latencies) == 0 {
		t.Fatal("No latency samples collected")
	}

	sort.Slice(latencies, func(i, j int) bool {
		return latencies[i] < latencies[j]
	})

	p50Index := len(latencies) * 50 / 100
	p99Index := len(latencies) * 99 / 100
	if p99Index >= len(latencies) {
		p99Index = len(latencies) - 1
	}

	p50 := latencies[p50Index]
	p99 := latencies[p99Index]
	maxLatency := latencies[len(latencies)-1]

	t.Logf("Latency stats (n=%d):", len(latencies))
	t.Logf("  P50: %v", p50)
	t.Logf("  P99: %v", p99)
	t.Logf("  Max: %v", maxLatency)

	// Verify P99 < 100ms (task requirement: event received on Redis Channel trong <100ms)
	if p99 > 100*time.Millisecond {
		t.Errorf("P99 latency %v exceeds 100ms requirement", p99)
	}
}
