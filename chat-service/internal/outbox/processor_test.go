package outbox

import (
	"testing"
	"time"

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
	require.NotNil(processor.stopCh)
	require.NotNil(processor.doneCh)
}

// TestProcessorInterface verifies that Processor implements ProcessorInterface
func TestProcessorInterface(t *testing.T) {
	var _ ProcessorInterface = (*Processor)(nil)
}
