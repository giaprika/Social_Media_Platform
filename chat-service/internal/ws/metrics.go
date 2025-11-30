package ws

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const (
	namespace = "ws_gateway"
)

// Metrics holds all Prometheus metrics for the WebSocket Gateway.
type Metrics struct {
	// Active WebSocket connections (gauge)
	ActiveConnections prometheus.Gauge

	// Total messages sent to clients (counter)
	MessagesSent prometheus.Counter

	// Total messages dropped (counter) - due to slow client, closed connection, etc.
	MessagesDropped prometheus.Counter

	// Connection events (counter with labels)
	ConnectionsTotal *prometheus.CounterVec

	// Reconnections counter - when a user reconnects (had previous connection)
	Reconnections prometheus.Counter

	// Message latency histogram (optional, for future use)
	MessageLatency prometheus.Histogram
}

// NewMetrics creates and registers all Prometheus metrics.
func NewMetrics(registry prometheus.Registerer) *Metrics {
	factory := promauto.With(registry)

	m := &Metrics{
		ActiveConnections: factory.NewGauge(prometheus.GaugeOpts{
			Namespace: namespace,
			Name:      "active_connections",
			Help:      "Number of currently active WebSocket connections",
		}),

		MessagesSent: factory.NewCounter(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "messages_sent_total",
			Help:      "Total number of messages successfully sent to clients",
		}),

		MessagesDropped: factory.NewCounter(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "messages_dropped_total",
			Help:      "Total number of messages dropped (slow client, closed connection)",
		}),

		ConnectionsTotal: factory.NewCounterVec(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "connections_total",
			Help:      "Total number of WebSocket connection events",
		}, []string{"event"}), // event: "opened", "closed"

		Reconnections: factory.NewCounter(prometheus.CounterOpts{
			Namespace: namespace,
			Name:      "reconnections_total",
			Help:      "Total number of client reconnections (user had previous connection)",
		}),

		MessageLatency: factory.NewHistogram(prometheus.HistogramOpts{
			Namespace: namespace,
			Name:      "message_latency_seconds",
			Help:      "Latency of message delivery to WebSocket clients",
			Buckets:   []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1},
		}),
	}

	return m
}

// IncMessagesSent increments the messages sent counter.
func (m *Metrics) IncMessagesSent() {
	m.MessagesSent.Inc()
}

// IncMessagesDropped increments the messages dropped counter.
func (m *Metrics) IncMessagesDropped() {
	m.MessagesDropped.Inc()
}

// ConnectionOpened increments active connections and connection opened counter.
func (m *Metrics) ConnectionOpened() {
	m.ActiveConnections.Inc()
	m.ConnectionsTotal.WithLabelValues("opened").Inc()
}

// ConnectionClosed decrements active connections and increments connection closed counter.
func (m *Metrics) ConnectionClosed() {
	m.ActiveConnections.Dec()
	m.ConnectionsTotal.WithLabelValues("closed").Inc()
}

// ObserveLatency records message delivery latency.
func (m *Metrics) ObserveLatency(seconds float64) {
	m.MessageLatency.Observe(seconds)
}

// IncReconnections increments the reconnections counter.
func (m *Metrics) IncReconnections() {
	m.Reconnections.Inc()
}

// DefaultMetrics creates metrics with the default Prometheus registry.
func DefaultMetrics() *Metrics {
	return NewMetrics(prometheus.DefaultRegisterer)
}
