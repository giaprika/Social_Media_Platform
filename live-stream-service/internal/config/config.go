package config

import (
	"fmt"
	"log"

	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	SRS      SRSConfig      `mapstructure:"srs"`
	GCS      GCSConfig      `mapstructure:"gcs"`
	CDN      CDNConfig      `mapstructure:"cdn"`
	Auth     AuthConfig     `mapstructure:"auth"`
}

type ServerConfig struct {
	Port string `mapstructure:"port"`
	Host string `mapstructure:"host"`
}

type DatabaseConfig struct {
	Host         string `mapstructure:"host"`
	Port         int    `mapstructure:"port"`
	User         string `mapstructure:"user"`
	Password     string `mapstructure:"password"`
	DBName       string `mapstructure:"dbname"`
	SSLMode      string `mapstructure:"sslmode"`
	MaxOpenConns int    `mapstructure:"max_open_conns"`
	MaxIdleConns int    `mapstructure:"max_idle_conns"`
}

type SRSConfig struct {
	ServerURL string `mapstructure:"server_url"`
	RTMPPort  int    `mapstructure:"rtmp_port"`
	HTTPPort  int    `mapstructure:"http_port"`
	WebRTCURL string `mapstructure:"webrtc_url"`
}

type GCSConfig struct {
	BucketName string `mapstructure:"bucket_name"`
	ProjectID  string `mapstructure:"project_id"`
	MountPath  string `mapstructure:"mount_path"`
}

type CDNConfig struct {
	Domain  string `mapstructure:"domain"`
	BaseURL string `mapstructure:"base_url"`
}

type AuthConfig struct {
	JWTSecret string `mapstructure:"jwt_secret"`
}

func Load() (*Config, error) {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Set defaults and bind environment variables
	setDefaults()

	// Read environment variables
	viper.AutomaticEnv()

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("error unmarshaling config: %w", err)
	}

	return &config, nil
}

func setDefaults() {
	// Bind environment variables to config keys
	_ = viper.BindEnv("server.port", "SERVER_PORT")
	_ = viper.BindEnv("server.host", "SERVER_HOST")

	_ = viper.BindEnv("database.host", "DB_HOST")
	_ = viper.BindEnv("database.port", "DB_PORT")
	_ = viper.BindEnv("database.user", "DB_USER")
	_ = viper.BindEnv("database.password", "DB_PASSWORD")
	_ = viper.BindEnv("database.dbname", "DB_NAME")
	_ = viper.BindEnv("database.sslmode", "DB_SSLMODE")
	_ = viper.BindEnv("database.max_open_conns", "DB_MAX_OPEN_CONNS")
	_ = viper.BindEnv("database.max_idle_conns", "DB_MAX_IDLE_CONNS")

	_ = viper.BindEnv("srs.server_url", "SRS_SERVER_URL")
	_ = viper.BindEnv("srs.rtmp_port", "SRS_RTMP_PORT")
	_ = viper.BindEnv("srs.http_port", "SRS_HTTP_PORT")
	_ = viper.BindEnv("srs.webrtc_url", "SRS_WEBRTC_URL")

	_ = viper.BindEnv("gcs.bucket_name", "GCS_BUCKET_NAME")
	_ = viper.BindEnv("gcs.project_id", "GCS_PROJECT_ID")
	_ = viper.BindEnv("gcs.mount_path", "GCS_MOUNT_PATH")

	_ = viper.BindEnv("cdn.domain", "CDN_DOMAIN")
	_ = viper.BindEnv("cdn.base_url", "CDN_BASE_URL")

	_ = viper.BindEnv("auth.jwt_secret", "JWT_SECRET")

	// Server defaults
	viper.SetDefault("server.port", "8080")
	viper.SetDefault("server.host", "localhost")

	// Database defaults
	viper.SetDefault("database.host", "localhost")
	viper.SetDefault("database.port", 5432)
	viper.SetDefault("database.user", "postgres")
	viper.SetDefault("database.password", "postgres")
	viper.SetDefault("database.dbname", "live_service")
	viper.SetDefault("database.sslmode", "disable")
	viper.SetDefault("database.max_open_conns", 25)
	viper.SetDefault("database.max_idle_conns", 5)

	// SRS defaults
	viper.SetDefault("srs.server_url", "http://localhost:8080")
	viper.SetDefault("srs.rtmp_port", 1935)
	viper.SetDefault("srs.http_port", 8080)
	viper.SetDefault("srs.webrtc_url", "http://localhost:1985")

	// GCS defaults
	viper.SetDefault("gcs.bucket_name", "live-hls-bucket")
	viper.SetDefault("gcs.project_id", "your-project-id")
	viper.SetDefault("gcs.mount_path", "/mnt/live_data")

	// CDN defaults
	viper.SetDefault("cdn.domain", "cdn.example.com")
	viper.SetDefault("cdn.base_url", "https://cdn.example.com")

	// Auth defaults
	viper.SetDefault("auth.jwt_secret", "your-secret-key")
}

func InitDB(cfg *Config) (*sqlx.DB, error) {
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.DBName,
		cfg.Database.SSLMode,
	)

	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	db.SetMaxIdleConns(cfg.Database.MaxIdleConns)

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return db, nil
}
