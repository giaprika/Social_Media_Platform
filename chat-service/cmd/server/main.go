package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	chatv1 "chat-service/api/chat/v1"
	"chat-service/internal/auth"
	"chat-service/internal/config"
	"chat-service/internal/middleware"
	"chat-service/internal/service"
	"chat-service/pkg/idempotency"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
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

	logger.Info("starting chat service", zap.String("env", cfg.Environment))

	// 3. Connect to Database with pool configuration
	poolConfig, err := pgxpool.ParseConfig(cfg.GetDBSource())
	if err != nil {
		logger.Fatal("cannot parse db config", zap.Error(err))
	}
	poolConfig.MaxConns = cfg.GetDBMaxConns()
	poolConfig.MinConns = cfg.GetDBMinConns()
	poolConfig.MaxConnLifetime = cfg.GetDBMaxConnLifetime()
	poolConfig.MaxConnIdleTime = cfg.GetDBMaxConnIdleTime()

	logger.Info("database pool config",
		zap.Int32("max_conns", poolConfig.MaxConns),
		zap.Int32("min_conns", poolConfig.MinConns),
		zap.Duration("max_conn_lifetime", poolConfig.MaxConnLifetime),
		zap.Duration("max_conn_idle_time", poolConfig.MaxConnIdleTime))

	dbPool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		logger.Fatal("cannot connect to db", zap.Error(err))
	}
	defer dbPool.Close()

	// 4. Connect to Redis
	redisClient := redis.NewClient(&redis.Options{
		Addr: cfg.RedisAddr,
	})
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		logger.Fatal("cannot connect to redis", zap.Error(err))
	}
	defer redisClient.Close()

	// 5. Setup Dependencies
	idempotencyChecker := idempotency.NewRedisChecker(redisClient)
	chatService := service.NewChatService(dbPool, idempotencyChecker, logger)

	// 6. Setup gRPC Server
	grpcServer := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			middleware.GrpcLogger(logger),
			middleware.GrpcRecovery(logger),
			auth.GrpcAuthInterceptor(logger),
		),
	)

	chatv1.RegisterChatServiceServer(grpcServer, chatService)
	reflection.Register(grpcServer) // Enable reflection for tools like evans/grpcurl

	// 7. Setup gRPC listener
	listener, err := net.Listen("tcp", cfg.GRPCServerAddress)
	if err != nil {
		logger.Fatal("cannot create listener", zap.Error(err))
	}

	// 8. Setup HTTP gateway server
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	gatewayMux := runtime.NewServeMux(
		runtime.WithErrorHandler(middleware.GatewayErrorHandler(logger)),
		runtime.WithIncomingHeaderMatcher(middleware.CustomHeaderMatcher),
	)

	if err := chatv1.RegisterChatServiceHandlerServer(ctx, gatewayMux, chatService); err != nil {
		logger.Fatal("cannot register chat gateway handler", zap.Error(err))
	}

	httpMux := http.NewServeMux()
	httpHandler := middleware.CORS(
		middleware.HTTPRecovery(logger)(
			middleware.HTTPLogger(logger)(
				middleware.HTTPAuthExtractor(logger)(gatewayMux))))
	httpMux.Handle("/", httpHandler)

	httpServer := &http.Server{
		Addr:    cfg.HTTPServerAddress,
		Handler: httpMux,
	}

	logger.Info("gRPC server listening", zap.String("address", cfg.GRPCServerAddress))
	logger.Info("HTTP gateway listening", zap.String("address", cfg.HTTPServerAddress))

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("failed to start HTTP server", zap.Error(err))
		}
	}()

	// Graceful Shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigChan
		logger.Info("received shutdown signal", zap.String("signal", sig.String()))

		// stop gateway registrations
		cancel()

		ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancelShutdown()

		if err := httpServer.Shutdown(ctxShutdown); err != nil {
			logger.Error("failed to shutdown HTTP server", zap.Error(err))
		} else {
			logger.Info("HTTP server stopped")
		}

		logger.Info("shutting down gRPC server...")
		grpcServer.GracefulStop()
		logger.Info("gRPC server stopped")
	}()

	if err := grpcServer.Serve(listener); err != nil {
		logger.Fatal("cannot start gRPC server", zap.Error(err))
	}
}
