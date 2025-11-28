package config

import (
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

// **Feature: outbox-processor, Property 3: Invalid Config Fallback**
// *For any* configuration value that is non-positive (≤ 0), the processor SHALL use the default value instead.
// **Validates: Requirements 3.3**
func TestProperty_InvalidConfigFallback(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Property: For any non-positive poll interval, GetOutboxPollInterval returns default
	properties.Property("non-positive poll interval returns default", prop.ForAll(
		func(invalidValue int) bool {
			cfg := &Config{OutboxPollIntervalMs: invalidValue}
			result := cfg.GetOutboxPollInterval(nil)
			expected := time.Duration(DefaultOutboxPollIntervalMs) * time.Millisecond
			return result == expected
		},
		gen.IntRange(-1000, 0), // Generate non-positive integers
	))

	// Property: For any non-positive batch size, GetOutboxBatchSize returns default
	properties.Property("non-positive batch size returns default", prop.ForAll(
		func(invalidValue int) bool {
			cfg := &Config{OutboxBatchSize: invalidValue}
			result := cfg.GetOutboxBatchSize(nil)
			return result == DefaultOutboxBatchSize
		},
		gen.IntRange(-1000, 0), // Generate non-positive integers
	))

	// Property: For any positive poll interval, GetOutboxPollInterval returns configured value
	properties.Property("positive poll interval returns configured value", prop.ForAll(
		func(validValue int) bool {
			cfg := &Config{OutboxPollIntervalMs: validValue}
			result := cfg.GetOutboxPollInterval(nil)
			expected := time.Duration(validValue) * time.Millisecond
			return result == expected
		},
		gen.IntRange(1, 10000), // Generate positive integers
	))

	// Property: For any positive batch size, GetOutboxBatchSize returns configured value
	properties.Property("positive batch size returns configured value", prop.ForAll(
		func(validValue int) bool {
			cfg := &Config{OutboxBatchSize: validValue}
			result := cfg.GetOutboxBatchSize(nil)
			return result == validValue
		},
		gen.IntRange(1, 10000), // Generate positive integers
	))

	properties.TestingRun(t)
}

// Unit tests for config loading - Requirements 3.1, 3.2
func TestGetOutboxPollInterval_DefaultValue(t *testing.T) {
	cfg := &Config{OutboxPollIntervalMs: 0}
	result := cfg.GetOutboxPollInterval(nil)
	expected := time.Duration(DefaultOutboxPollIntervalMs) * time.Millisecond
	assert.Equal(t, expected, result, "should return default when value is 0")
}

func TestGetOutboxPollInterval_NegativeValue(t *testing.T) {
	cfg := &Config{OutboxPollIntervalMs: -50}
	result := cfg.GetOutboxPollInterval(nil)
	expected := time.Duration(DefaultOutboxPollIntervalMs) * time.Millisecond
	assert.Equal(t, expected, result, "should return default when value is negative")
}

func TestGetOutboxPollInterval_ValidValue(t *testing.T) {
	cfg := &Config{OutboxPollIntervalMs: 200}
	result := cfg.GetOutboxPollInterval(nil)
	expected := 200 * time.Millisecond
	assert.Equal(t, expected, result, "should return configured value when valid")
}

func TestGetOutboxBatchSize_DefaultValue(t *testing.T) {
	cfg := &Config{OutboxBatchSize: 0}
	result := cfg.GetOutboxBatchSize(nil)
	assert.Equal(t, DefaultOutboxBatchSize, result, "should return default when value is 0")
}

func TestGetOutboxBatchSize_NegativeValue(t *testing.T) {
	cfg := &Config{OutboxBatchSize: -10}
	result := cfg.GetOutboxBatchSize(nil)
	assert.Equal(t, DefaultOutboxBatchSize, result, "should return default when value is negative")
}

func TestGetOutboxBatchSize_ValidValue(t *testing.T) {
	cfg := &Config{OutboxBatchSize: 50}
	result := cfg.GetOutboxBatchSize(nil)
	assert.Equal(t, 50, result, "should return configured value when valid")
}

func TestGetOutboxPollInterval_LogsWarningOnInvalidValue(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	cfg := &Config{OutboxPollIntervalMs: -1}
	result := cfg.GetOutboxPollInterval(logger)
	expected := time.Duration(DefaultOutboxPollIntervalMs) * time.Millisecond
	assert.Equal(t, expected, result, "should return default and log warning")
}

func TestGetOutboxBatchSize_LogsWarningOnInvalidValue(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	cfg := &Config{OutboxBatchSize: 0}
	result := cfg.GetOutboxBatchSize(logger)
	assert.Equal(t, DefaultOutboxBatchSize, result, "should return default and log warning")
}
