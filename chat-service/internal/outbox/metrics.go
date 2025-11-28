package outbox

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Metrics holds all Prometheus metrics for the outbox processor.
type Metrics struct {
	// PendingCount is a gauge showing current number of unprocessed events in outbox
	PendingCount prometheus.Gauge

	// ProcessedTotal is a counter of total successfully processed events
	ProcessedTotal prometheus.Counter

	// PublishErrorsTotal is a counter of total publish failures
	PublishErrorsTotal prometheus.Counter

	// ProcessingDuration is a histogram of batch processing duration
	ProcessingDuration prometheus.Histogram

	// BatchSize is a histogram of actual batch sizes processed
	BatchSize prometheus.Histogram

	// DLQTotal is a counter of events moved to Dead Letter Queue
	DLQTotal prometheus.Counter
}

// NewMetrics creates and registers all outbox metrics.
func NewMetrics(namespace string) *Metrics {
	if namespace == "" {
		namespace = "outbox"
	}

	return &Metrics{
		PendingCount: promauto.NewGauge(prometheus.GaugeOpts{
			Namespace: namespace,
			Name:      "pending_count",
			Help:      "Current number of unprocessed events in the outbox table",
		}),

		ProcessedTotal: promauto.NewCounter(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "processed_total",
			Help:      "Total number of successfully processed outbox events",
		}),

		PublishErrorsTotal: promauto.NewCounter(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "publish_errors_total",
			Help:      "Total number of failed publish attempts to Redis Streams",
		}),

		ProcessingDuration: promauto.NewHistogram(prometheus.HistogramOpts{
			Namespace: namespace,
			Name:      "processing_duration_seconds",
			Help:      "Time spent processing a batch of events",
			Buckets:   []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
		}),

		BatchSize: promauto.NewHistogram(prometheus.HistogramOpts{
			Namespace: namespace,
			Name:      "batch_size",
			Help:      "Number of events in each processed batch",
			Buckets:   []float64{1, 5, 10, 25, 50, 100, 200, 500},
		}),

		DLQTotal: promauto.NewCounter(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "dlq_total",
			Help:      "Total number of events moved to Dead Letter Queue",
		}),
	}
}

// DefaultMetrics is the default metrics instance used by the processor.
var DefaultMetrics = NewMetrics("outbox")
