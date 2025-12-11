package outbox

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDefaultMetricsExists(t *testing.T) {
	require := require.New(t)

	// DefaultMetrics is initialized at package load time
	require.NotNil(DefaultMetrics)
	require.NotNil(DefaultMetrics.PendingCount)
	require.NotNil(DefaultMetrics.ProcessedTotal)
	require.NotNil(DefaultMetrics.PublishErrorsTotal)
	require.NotNil(DefaultMetrics.ProcessingDuration)
	require.NotNil(DefaultMetrics.BatchSize)
}

func TestMetricsOperations(t *testing.T) {
	// Use DefaultMetrics since it's already registered
	metrics := DefaultMetrics

	// Test gauge operations (these are idempotent)
	metrics.PendingCount.Set(100)
	metrics.PendingCount.Add(10)
	metrics.PendingCount.Sub(5)

	// Test counter operations
	metrics.ProcessedTotal.Add(50)
	metrics.PublishErrorsTotal.Inc()

	// Test histogram observations
	metrics.ProcessingDuration.Observe(0.5)
	metrics.BatchSize.Observe(100)

	// If we get here without panic, operations work correctly
}
