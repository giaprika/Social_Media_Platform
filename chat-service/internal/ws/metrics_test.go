package ws

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewMetrics(t *testing.T) {
	registry := prometheus.NewRegistry()
	m := NewMetrics(registry)

	require.NotNil(t, m)
	assert.NotNil(t, m.ActiveConnections)
	assert.NotNil(t, m.MessagesSent)
	assert.NotNil(t, m.MessagesDropped)
	assert.NotNil(t, m.ConnectionsTotal)
	assert.NotNil(t, m.MessageLatency)
}

func TestMetrics_ConnectionOpened(t *testing.T) {
	registry := prometheus.NewRegistry()
	m := NewMetrics(registry)

	// Open 3 connections
	m.ConnectionOpened()
	m.ConnectionOpened()
	m.ConnectionOpened()

	// Verify active connections gauge
	metrics, err := registry.Gather()
	require.NoError(t, err)

	var activeConns float64
	var openedCount float64
	for _, mf := range metrics {
		if mf.GetName() == "ws_gateway_active_connections" {
			activeConns = mf.GetMetric()[0].GetGauge().GetValue()
		}
		if mf.GetName() == "ws_gateway_connections_total" {
			for _, m := range mf.GetMetric() {
				for _, label := range m.GetLabel() {
					if label.GetName() == "event" && label.GetValue() == "opened" {
						openedCount = m.GetCounter().GetValue()
					}
				}
			}
		}
	}

	assert.Equal(t, float64(3), activeConns)
	assert.Equal(t, float64(3), openedCount)
}

func TestMetrics_ConnectionClosed(t *testing.T) {
	registry := prometheus.NewRegistry()
	m := NewMetrics(registry)

	// Open 3, close 2
	m.ConnectionOpened()
	m.ConnectionOpened()
	m.ConnectionOpened()
	m.ConnectionClosed()
	m.ConnectionClosed()

	metrics, err := registry.Gather()
	require.NoError(t, err)

	var activeConns float64
	var closedCount float64
	for _, mf := range metrics {
		if mf.GetName() == "ws_gateway_active_connections" {
			activeConns = mf.GetMetric()[0].GetGauge().GetValue()
		}
		if mf.GetName() == "ws_gateway_connections_total" {
			for _, m := range mf.GetMetric() {
				for _, label := range m.GetLabel() {
					if label.GetName() == "event" && label.GetValue() == "closed" {
						closedCount = m.GetCounter().GetValue()
					}
				}
			}
		}
	}

	assert.Equal(t, float64(1), activeConns)
	assert.Equal(t, float64(2), closedCount)
}

func TestMetrics_MessagesSent(t *testing.T) {
	registry := prometheus.NewRegistry()
	m := NewMetrics(registry)

	m.IncMessagesSent()
	m.IncMessagesSent()
	m.IncMessagesSent()

	metrics, err := registry.Gather()
	require.NoError(t, err)

	var sentCount float64
	for _, mf := range metrics {
		if mf.GetName() == "ws_gateway_messages_sent_total" {
			sentCount = mf.GetMetric()[0].GetCounter().GetValue()
		}
	}

	assert.Equal(t, float64(3), sentCount)
}

func TestMetrics_MessagesDropped(t *testing.T) {
	registry := prometheus.NewRegistry()
	m := NewMetrics(registry)

	m.IncMessagesDropped()
	m.IncMessagesDropped()

	metrics, err := registry.Gather()
	require.NoError(t, err)

	var droppedCount float64
	for _, mf := range metrics {
		if mf.GetName() == "ws_gateway_messages_dropped_total" {
			droppedCount = mf.GetMetric()[0].GetCounter().GetValue()
		}
	}

	assert.Equal(t, float64(2), droppedCount)
}

func TestMetrics_ObserveLatency(t *testing.T) {
	registry := prometheus.NewRegistry()
	m := NewMetrics(registry)

	m.ObserveLatency(0.005)
	m.ObserveLatency(0.010)
	m.ObserveLatency(0.050)

	metrics, err := registry.Gather()
	require.NoError(t, err)

	var sampleCount uint64
	for _, mf := range metrics {
		if mf.GetName() == "ws_gateway_message_latency_seconds" {
			sampleCount = mf.GetMetric()[0].GetHistogram().GetSampleCount()
		}
	}

	assert.Equal(t, uint64(3), sampleCount)
}

func TestMetrics_ImplementsRouterMetrics(t *testing.T) {
	registry := prometheus.NewRegistry()
	m := NewMetrics(registry)

	// Verify Metrics implements RouterMetrics interface
	var _ RouterMetrics = m
}
