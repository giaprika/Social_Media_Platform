package config

import (
	"fmt"
	"net/url"
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
	DBSource          string `mapstructure:"DB_SOURCE"` // Legacy: full connection string
	RedisAddr         string `mapstructure:"REDIS_ADDR"`
	HTTPServerAddress string `mapstructure:"HTTP_SERVER_ADDRESS"`
	GRPCServerAddress string `mapstructure:"GRPC_SERVER_ADDRESS"`

	// Database connection components (preferred over DB_SOURCE)
	DBHost     string `mapstructure:"DB_HOST"`
	DBPort     string `mapstructure:"DB_PORT"`
	DBUser     string `mapstructure:"DB_USER"`
	DBPassword string `mapstructure:"DB_PASSWORD"`
	DBName     string `mapstructure:"DB_NAME"`
	DBSSLMode  string `mapstructure:"DB_SSLMODE"`

	// Outbox Processor Settings
	OutboxPollIntervalMs int `mapstructure:"OUTBOX_POLL_INTERVAL_MS"`
	OutboxBatchSize      int `mapstructure:"OUTBOX_BATCH_SIZE"`

	// Metrics Settings
	MetricsPort int `mapstructure:"METRICS_PORT"`

	// Database Pool Settings
	DBMaxConns     int32 `mapstructure:"DB_MAX_CONNS"`
	DBMinConns     int32 `mapstructure:"DB_MIN_CONNS"`
	DBMaxConnLife  int   `mapstructure:"DB_MAX_CONN_LIFE_MINUTES"`
	DBMaxConnIdle  int   `mapstructure:"DB_MAX_CONN_IDLE_MINUTES"`

	// Cloudinary Settings
	CloudinaryCloudName   string `mapstructure:"CLOUDINARY_CLOUD_NAME"`
	CloudinaryAPIKey      string `mapstructure:"CLOUDINARY_API_KEY"`
	CloudinaryAPISecret   string `mapstructure:"CLOUDINARY_API_SECRET"`
	CloudinaryUploadFolder string `mapstructure:"CLOUDINARY_UPLOAD_FOLDER"`
}

// GetDBSource returns the database connection string.
// If DB_HOST is set, it builds the connection string from components (with URL-encoded password).
// Otherwise, it falls back to DB_SOURCE for backward compatibility.
func (c *Config) GetDBSource() string {
	if c.DBHost != "" {
		// Build connection string from components with URL-encoded password
		encodedPassword := url.QueryEscape(c.DBPassword)
		sslMode := c.DBSSLMode
		if sslMode == "" {
			sslMode = "disable"
		}
		port := c.DBPort
		if port == "" {
			port = "5432"
		}
		return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
			c.DBUser,
			encodedPassword,
			c.DBHost,
			port,
			c.DBName,
			sslMode,
		)
	}
	// Fallback to legacy DB_SOURCE
	return c.DBSource
}

// GetDBMaxConns returns max connections for the pool (default: 25)
func (c *Config) GetDBMaxConns() int32 {
	if c.DBMaxConns <= 0 {
		return 25
	}
	return c.DBMaxConns
}

// GetDBMinConns returns min connections for the pool (default: 5)
func (c *Config) GetDBMinConns() int32 {
	if c.DBMinConns <= 0 {
		return 5
	}
	return c.DBMinConns
}

// GetDBMaxConnLifetime returns max connection lifetime (default: 60 minutes)
func (c *Config) GetDBMaxConnLifetime() time.Duration {
	if c.DBMaxConnLife <= 0 {
		return 60 * time.Minute
	}
	return time.Duration(c.DBMaxConnLife) * time.Minute
}

// GetDBMaxConnIdleTime returns max connection idle time (default: 15 minutes)
func (c *Config) GetDBMaxConnIdleTime() time.Duration {
	if c.DBMaxConnIdle <= 0 {
		return 15 * time.Minute
	}
	return time.Duration(c.DBMaxConnIdle) * time.Minute
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

	// Bind environment variables explicitly (errors ignored as per viper convention)
	_ = viper.BindEnv("ENVIRONMENT")
	_ = viper.BindEnv("DB_SOURCE")
	_ = viper.BindEnv("DB_HOST")
	_ = viper.BindEnv("DB_PORT")
	_ = viper.BindEnv("DB_USER")
	_ = viper.BindEnv("DB_PASSWORD")
	_ = viper.BindEnv("DB_NAME")
	_ = viper.BindEnv("DB_SSLMODE")
	_ = viper.BindEnv("REDIS_ADDR")
	_ = viper.BindEnv("HTTP_SERVER_ADDRESS")
	_ = viper.BindEnv("GRPC_SERVER_ADDRESS")
	_ = viper.BindEnv("OUTBOX_POLL_INTERVAL_MS")
	_ = viper.BindEnv("OUTBOX_BATCH_SIZE")
	_ = viper.BindEnv("METRICS_PORT")
	_ = viper.BindEnv("DB_MAX_CONNS")
	_ = viper.BindEnv("DB_MIN_CONNS")
	_ = viper.BindEnv("DB_MAX_CONN_LIFE_MINUTES")
	_ = viper.BindEnv("DB_MAX_CONN_IDLE_MINUTES")
	_ = viper.BindEnv("CLOUDINARY_CLOUD_NAME")
	_ = viper.BindEnv("CLOUDINARY_API_KEY")
	_ = viper.BindEnv("CLOUDINARY_API_SECRET")
	_ = viper.BindEnv("CLOUDINARY_UPLOAD_FOLDER")

	// Đọc từ environment variables
	viper.AutomaticEnv()

	// Thử đọc file config, nhưng không fail nếu không có
	if err = viper.ReadInConfig(); err != nil {
		// Nếu không tìm thấy file, vẫn tiếp tục với env vars
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return
		}
		// File not found is ok, continue with env vars
		err = nil //nolint:ineffassign // intentional reset for env-only mode
	}

	err = viper.Unmarshal(&config)
	return
}
