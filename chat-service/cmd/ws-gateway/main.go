package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"chat-service/internal/auth"
	"chat-service/internal/ws"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			// TODO: Tighten this in production
			return true
		},
	}
	connManager = ws.NewConnectionManager()
	subscriber  *ws.Subscriber
	router      *ws.Router
	logger      *zap.Logger
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 90 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = 30 * time.Second
)

func serveWs(w http.ResponseWriter, r *http.Request) {
	// Extract user_id from header (set by API Gateway after JWT validation)
	userID, err := auth.ExtractUserIDFromHeader(r)
	if err != nil {
		log.Printf("Auth failed: %v", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Upgrade connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	client := ws.NewClient(conn)
	connManager.Add(userID, client)
	log.Printf("Client connected: %s (active: %d)", userID, connManager.Count())

	// Start write pump (for pings and messages)
	go writePump(userID, client)

	// Start read pump (for pongs and incoming messages)
	readPump(userID, client)
}

func readPump(userID string, client *ws.Client) {
	defer func() {
		connManager.Remove(userID, client)
		log.Printf("Client disconnected: %s (active: %d)", userID, connManager.Count())
	}()

	conn := client.Conn
	conn.SetReadLimit(4096) // Max message size
	_ = conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, p, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Read error for %s: %v", userID, err)
			}
			break
		}
		log.Printf("Received message from %s: %s", userID, string(p))
		// Messages from client can be processed here if needed
		// For chat, clients typically don't send messages via WebSocket (they use gRPC)
	}
}

func writePump(userID string, client *ws.Client) {
	ticker := time.NewTicker(pingPeriod)
	conn := client.Conn
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.Send:
			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Channel closed, connection is being terminated
				_ = conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("Write error for %s: %v", userID, err)
				return
			}

		case <-ticker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func main() {
	// Initialize logger
	var err error
	logger, err = zap.NewProduction()
	if err != nil {
		log.Fatal("Failed to create logger:", err)
	}
	defer func() {
		_ = logger.Sync()
	}()

	// Initialize Redis client
	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	redisClient := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: getEnv("REDIS_PASSWORD", ""),
		DB:       0,
	})

	// Test Redis connection
	ctx := context.Background()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		logger.Fatal("Failed to connect to Redis", zap.Error(err))
	}
	logger.Info("Connected to Redis", zap.String("addr", redisAddr))

	// Initialize message router
	router = ws.NewRouter(connManager, logger, nil) // TODO: Add metrics in Task 10

	// Initialize and start Redis Pub/Sub subscriber
	subscriber = ws.NewSubscriber(redisClient, logger, router.HandleEvent)
	if err := subscriber.Start(ctx); err != nil {
		logger.Fatal("Failed to start subscriber", zap.Error(err))
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", serveWs)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	addr := getEnv("WS_GATEWAY_ADDR", ":8080")
	server := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		logger.Info("Shutting down WebSocket Gateway...")
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Stop subscriber first
		if subscriber != nil {
			_ = subscriber.Stop()
		}

		// Close all connections
		for userID, client := range connManager.GetAllClients() {
			_ = client.Conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutdown"))
			connManager.Remove(userID, client)
		}

		// Close Redis client
		_ = redisClient.Close()

		if err := server.Shutdown(ctx); err != nil {
			logger.Error("Shutdown error", zap.Error(err))
		}
	}()

	logger.Info("WebSocket Gateway starting", zap.String("addr", addr))
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		logger.Fatal("ListenAndServe failed", zap.Error(err))
	}
	logger.Info("WebSocket Gateway stopped")
}



func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
