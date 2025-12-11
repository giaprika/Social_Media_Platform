package outbox

import (
	"testing"
	"time"

	"chat-service/internal/repository"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

// TestNewProcessor verifies the constructor creates a valid processor
func TestNewProcessor(t *testing.T) {
	require := require.New(t)

	cfg := ProcessorConfig{
		PollInterval: 100 * time.Millisecond,
		BatchSize:    50,
	}

	processor := NewProcessor(nil, nil, nil, cfg)

	require.NotNil(processor)
	require.Equal(100*time.Millisecond, processor.pollInterval)
	require.Equal(50, processor.batchSize)
	require.Equal(DefaultMaxRetries, processor.maxRetries)
	require.Equal(DefaultBaseBackoff, processor.baseBackoff)
	require.Equal(DefaultWorkerCount, processor.workerCount)
	require.NotNil(processor.stopCh)
	require.NotNil(processor.doneCh)
}

// TestNewProcessorDefaults verifies default values are applied
func TestNewProcessorDefaults(t *testing.T) {
	require := require.New(t)

	// Empty config should use all defaults
	cfg := ProcessorConfig{
		PollInterval: 100 * time.Millisecond,
	}

	processor := NewProcessor(nil, nil, nil, cfg)

	require.Equal(DefaultBatchSize, processor.batchSize)
	require.Equal(DefaultMaxRetries, processor.maxRetries)
	require.Equal(DefaultBaseBackoff, processor.baseBackoff)
	require.Equal(DefaultWorkerCount, processor.workerCount)
}

// TestNewProcessorWithRetryConfig verifies custom retry configuration
func TestNewProcessorWithRetryConfig(t *testing.T) {
	require := require.New(t)

	cfg := ProcessorConfig{
		PollInterval: 100 * time.Millisecond,
		BatchSize:    50,
		MaxRetries:   5,
		BaseBackoff:  2 * time.Second,
	}

	processor := NewProcessor(nil, nil, nil, cfg)

	require.NotNil(processor)
	require.Equal(5, processor.maxRetries)
	require.Equal(2*time.Second, processor.baseBackoff)
}

// TestNewProcessorWithWorkerCount verifies custom worker count configuration
func TestNewProcessorWithWorkerCount(t *testing.T) {
	require := require.New(t)

	cfg := ProcessorConfig{
		PollInterval: 100 * time.Millisecond,
		BatchSize:    100,
		WorkerCount:  20,
	}

	processor := NewProcessor(nil, nil, nil, cfg)

	require.NotNil(processor)
	require.Equal(100, processor.batchSize)
	require.Equal(20, processor.workerCount)
}

// TestProcessorInterface verifies that Processor implements ProcessorInterface
func TestProcessorInterface(t *testing.T) {
	var _ ProcessorInterface = (*Processor)(nil)
}

// TestCalculateBackoff verifies exponential backoff calculation
func TestCalculateBackoff(t *testing.T) {
	processor := &Processor{
		baseBackoff: 1 * time.Second,
	}

	tests := []struct {
		retryCount int
		expected   time.Duration
	}{
		{0, 1 * time.Second},  // First attempt: 1s
		{1, 1 * time.Second},  // Retry 1: 1s * 2^0 = 1s
		{2, 2 * time.Second},  // Retry 2: 1s * 2^1 = 2s
		{3, 4 * time.Second},  // Retry 3: 1s * 2^2 = 4s
		{4, 8 * time.Second},  // Retry 4: 1s * 2^3 = 8s
		{5, 16 * time.Second}, // Retry 5: 1s * 2^4 = 16s
	}

	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			result := processor.calculateBackoff(tt.retryCount)
			require.Equal(t, tt.expected, result)
		})
	}
}

// TestShouldRetryEvent verifies retry eligibility logic
func TestShouldRetryEvent(t *testing.T) {
	processor := &Processor{
		maxRetries:  3,
		baseBackoff: 1 * time.Second,
	}

	t.Run("should retry when retry count is below max", func(t *testing.T) {
		event := repository.Outbox{
			RetryCount:  0,
			LastRetryAt: pgtype.Timestamptz{Valid: false},
		}
		require.True(t, processor.ShouldRetryEvent(event))
	})

	t.Run("should not retry when max retries exceeded", func(t *testing.T) {
		event := repository.Outbox{
			RetryCount:  3,
			LastRetryAt: pgtype.Timestamptz{Valid: false},
		}
		require.False(t, processor.ShouldRetryEvent(event))
	})

	t.Run("should not retry when still in backoff period", func(t *testing.T) {
		event := repository.Outbox{
			RetryCount: 1,
			LastRetryAt: pgtype.Timestamptz{
				Time:  time.Now(),
				Valid: true,
			},
		}
		require.False(t, processor.ShouldRetryEvent(event))
	})

	t.Run("should retry when backoff period has passed", func(t *testing.T) {
		event := repository.Outbox{
			RetryCount: 1,
			LastRetryAt: pgtype.Timestamptz{
				Time:  time.Now().Add(-2 * time.Second), // 2s ago, backoff is 1s
				Valid: true,
			},
		}
		require.True(t, processor.ShouldRetryEvent(event))
	})

	t.Run("should respect exponential backoff", func(t *testing.T) {
		// Retry count 2 means backoff is 2s
		event := repository.Outbox{
			RetryCount: 2,
			LastRetryAt: pgtype.Timestamptz{
				Time:  time.Now().Add(-1 * time.Second), // 1s ago, but backoff is 2s
				Valid: true,
			},
		}
		require.False(t, processor.ShouldRetryEvent(event))

		// After 2s has passed
		event.LastRetryAt.Time = time.Now().Add(-3 * time.Second)
		require.True(t, processor.ShouldRetryEvent(event))
	})
}
