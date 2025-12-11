package main

import (
	"log"
	"net/http"

	"live-service/internal/config"
	"live-service/internal/handler"
	"live-service/internal/middleware"
	"live-service/internal/repository"
	"live-service/internal/service"
	"live-service/pkg/utils"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize database
	db, err := config.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Initialize repositories
	liveRepo := repository.NewLiveRepository(db)

	// Initialize services
	liveService := service.NewLiveService(liveRepo, cfg)

	// Initialize handlers
	liveHandler := handler.NewLiveHandler(liveService)

	// Setup router
	router := gin.Default()

	// Apply middleware
	router.Use(middleware.CORS())
	router.Use(middleware.Logger())

	// API routes
	v1 := router.Group("/api/v1")
	{
		// Live streaming routes
		live := v1.Group("/live")
		{
			live.POST("/create", middleware.Auth(), liveHandler.CreateStream)
			live.GET("/feed", liveHandler.ListStreams)
			live.GET("/:id", liveHandler.GetStreamDetail)
			live.GET("/:id/webrtc", liveHandler.GetWebRTCInfo)
		}

		// Webhook routes for SRS callbacks
		// Protected by IP whitelist - only SRS server can call these
		callbacks := v1.Group("/callbacks")
		callbacks.Use(middleware.SRSWebhookWhitelist(cfg.SRS.ServerIP))
		{
			callbacks.POST("/on_publish", liveHandler.OnPublish)
			callbacks.POST("/on_unpublish", liveHandler.OnUnpublish)
		}
	}

	// Initialize SRS health checker
	srsHealthChecker := utils.NewSRSHealthChecker(cfg.SRS.ServerIP, cfg.SRS.APIPort)

	// Health check - API service only
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Health check - includes SRS server status
	router.GET("/health/srs", func(c *gin.Context) {
		version, err := srsHealthChecker.GetVersion(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status":  "unhealthy",
				"service": "srs",
				"error":   err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "srs",
			"version": version.Data.Version,
		})
	})

	// Start server
	log.Printf("Starting server on port %s", cfg.Server.Port)
	if err := router.Run(":" + cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
