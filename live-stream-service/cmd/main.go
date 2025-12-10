package main

import (
	"log"

	"live-service/internal/config"
	"live-service/internal/handler"
	"live-service/internal/middleware"
	"live-service/internal/repository"
	"live-service/internal/service"

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
		}

		// Webhook routes for SRS callbacks
		callbacks := v1.Group("/callbacks")
		{
			callbacks.POST("/on_publish", liveHandler.OnPublish)
			callbacks.POST("/on_unpublish", liveHandler.OnUnpublish)
		}
	}

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Start server
	log.Printf("Starting server on port %s", cfg.Server.Port)
	if err := router.Run(":" + cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
