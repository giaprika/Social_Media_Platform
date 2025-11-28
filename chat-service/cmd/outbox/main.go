package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"chat-service/internal/config"
	"chat-service/internal/middleware"
	"chat-service/internal/outbox"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

func main() {
	// 1. Load Config
	cfg, err := config.LoadConfig(".")
	if err != nil {
		fmt.Printf("cannot load config: %v\n", err)
		os.Exit(1)
	}

	// 2. Init Logger
	middleware.InitLogger()
	logger := middleware.Logger
	defer func() { _ = logger.Sync() }()

	// Log service startup with config values (Requirement 4.1)
	logger.Info("starting outbox processor service",
		zap.String("env", cfg.Environment),
		zap.Int("poll_interval_ms", cfg.OutboxPollIntervalMs),
		zap.Int("batch_size", cfg.OutboxBatchSize))

	// 3. Connect to Database (Requirement 1.1, 1.2)
	dbPool, err := pgxpool.New(context.Background(), cfg.DBSource)
	if err != nil {
		logger.Fatal("cannot connect to database", zap.Error(err))
	}
	defer dbPool.Close()
	logger.Info("connected to PostgreSQL", zap.String("status", "ok"))

	// 4. Connect to Redis (for future use) (Requirement 1.1, 1.2)
	redisClient := redis.NewClient(&redis.Options{
		Addr: cfg.RedisAddr,
	})
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		logger.Fatal("cannot connect to redis", zap.Error(err))
	}
	defer redisClient.Close()
	logger.Info("connected to Redis", zap.String("status", "ok"))

	// 5. Create Processor with validated config
	processorCfg := outbox.ProcessorConfig{
		PollInterval: cfg.GetOutboxPollInterval(logger),
		BatchSize:    cfg.GetOutboxBatchSize(logger),
	}
	processor := outbox.NewProcessor(dbPool, redisClient, logger, processorCfg)

	// 6. Setup context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 7. Start processor in a goroutine
	go processor.Start(ctx)

	logger.Info("outbox processor is running")

	// 8. Graceful Shutdown - Handle SIGINT and SIGTERM (Requirement 4.4)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigChan

	logger.Info("received shutdown signal", zap.String("signal", sig.String()))
	logger.Info("initiating graceful shutdown...")

	// Cancel context and stop processor
	cancel()
	processor.Stop()

	logger.Info("outbox processor shutdown complete")
}
