package config

import (
	"time"

	"github.com/spf13/viper"
	"go.uber.org/zap"
)

const (
	DefaultOutboxPollIntervalMs = 100
	DefaultOutboxBatchSize      = 100
	DefaultMetricsPort          = 9090
)

type Config struct {
	Environment       string `mapstructure:"ENVIRONMENT"`
	DBSource          string `mapstructure:"DB_SOURCE"`
	RedisAddr         string `mapstructure:"REDIS_ADDR"`
	HTTPServerAddress string `mapstructure:"HTTP_SERVER_ADDRESS"`
	GRPCServerAddress string `mapstructure:"GRPC_SERVER_ADDRESS"`

	// Outbox Processor Settings
	OutboxPollIntervalMs int `mapstructure:"OUTBOX_POLL_INTERVAL_MS"`
	OutboxBatchSize      int `mapstructure:"OUTBOX_BATCH_SIZE"`

	// Metrics Settings
	MetricsPort int `mapstructure:"METRICS_PORT"`
}

// GetOutboxPollInterval returns the poll interval as time.Duration.
// If the configured value is invalid (non-positive), it returns the default value and logs a warning.
func (c *Config) GetOutboxPollInterval(logger *zap.Logger) time.Duration {
	if c.OutboxPollIntervalMs <= 0 {
		if logger != nil {
			logger.Warn("invalid OUTBOX_POLL_INTERVAL_MS, using default",
				zap.Int("configured", c.OutboxPollIntervalMs),
				zap.Int("default", DefaultOutboxPollIntervalMs))
		}
		return time.Duration(DefaultOutboxPollIntervalMs) * time.Millisecond
	}
	return time.Duration(c.OutboxPollIntervalMs) * time.Millisecond
}

// GetOutboxBatchSize returns the batch size for outbox processing.
// If the configured value is invalid (non-positive), it returns the default value and logs a warning.
func (c *Config) GetOutboxBatchSize(logger *zap.Logger) int {
	if c.OutboxBatchSize <= 0 {
		if logger != nil {
			logger.Warn("invalid OUTBOX_BATCH_SIZE, using default",
				zap.Int("configured", c.OutboxBatchSize),
				zap.Int("default", DefaultOutboxBatchSize))
		}
		return DefaultOutboxBatchSize
	}
	return c.OutboxBatchSize
}

// GetMetricsPort returns the metrics server port.
// If the configured value is invalid (non-positive), it returns the default value.
func (c *Config) GetMetricsPort() int {
	if c.MetricsPort <= 0 {
		return DefaultMetricsPort
	}
	return c.MetricsPort
}

func LoadConfig(path string) (config Config, err error) {
	viper.AddConfigPath(path)
	viper.SetConfigName("app")
	viper.SetConfigType("env")

	// Bind environment variables explicitly
	viper.BindEnv("ENVIRONMENT")
	viper.BindEnv("DB_SOURCE")
	viper.BindEnv("REDIS_ADDR")
	viper.BindEnv("HTTP_SERVER_ADDRESS")
	viper.BindEnv("GRPC_SERVER_ADDRESS")
	viper.BindEnv("OUTBOX_POLL_INTERVAL_MS")
	viper.BindEnv("OUTBOX_BATCH_SIZE")
	viper.BindEnv("METRICS_PORT")

	// Đọc từ environment variables
	viper.AutomaticEnv()

	// Thử đọc file config, nhưng không fail nếu không có
	if err = viper.ReadInConfig(); err != nil {
		// Nếu không tìm thấy file, vẫn tiếp tục với env vars
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return
		}
		// Reset error - sẽ dùng env vars
		err = nil
	}

	err = viper.Unmarshal(&config)
	return
}
