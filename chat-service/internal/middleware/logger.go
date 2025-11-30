package middleware

import (
	"os"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var Logger *zap.Logger

// InitLogger initializes the global logger.
// Log level is controlled by LOG_LEVEL env var: debug, info, warn, error (default: info)
// In production (ENVIRONMENT=production), defaults to error level for performance.
func InitLogger() {
	encoderConfig := zap.NewProductionEncoderConfig()
	encoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	encoderConfig.EncodeLevel = zapcore.CapitalLevelEncoder

	encoder := zapcore.NewJSONEncoder(encoderConfig)
	level := getLogLevel()
	core := zapcore.NewCore(encoder, zapcore.AddSync(os.Stdout), level)

	Logger = zap.New(core, zap.AddCaller())
}

func getLogLevel() zapcore.Level {
	// Check explicit LOG_LEVEL first
	logLevel := strings.ToLower(os.Getenv("LOG_LEVEL"))
	switch logLevel {
	case "debug":
		return zapcore.DebugLevel
	case "info":
		return zapcore.InfoLevel
	case "warn", "warning":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	}

	// Default based on ENVIRONMENT
	env := strings.ToLower(os.Getenv("ENVIRONMENT"))
	if env == "production" {
		return zapcore.WarnLevel // Production: warn and above only
	}
	return zapcore.InfoLevel // Development: info and above
}
