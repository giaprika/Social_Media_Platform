package config

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"log"
	"time"

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
	Budget   BudgetConfig   `mapstructure:"budget"`
	TURN     TURNConfig     `mapstructure:"turn"`
	Env      string         `mapstructure:"env"`
}

type ServerConfig struct {
	Port         string        `mapstructure:"port"`
	Host         string        `mapstructure:"host"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
}

type DatabaseConfig struct {
	Host            string        `mapstructure:"host"`
	Port            int           `mapstructure:"port"`
	User            string        `mapstructure:"user"`
	Password        string        `mapstructure:"password"`
	DBName          string        `mapstructure:"dbname"`
	SSLMode         string        `mapstructure:"sslmode"`
	MaxOpenConns    int           `mapstructure:"max_open_conns"`
	MaxIdleConns    int           `mapstructure:"max_idle_conns"`
	ConnMaxLifetime time.Duration `mapstructure:"conn_max_lifetime"`
	ConnMaxIdleTime time.Duration `mapstructure:"conn_max_idle_time"`
}

type SRSConfig struct {
	ServerURL   string `mapstructure:"server_url"`
	ServerIP    string `mapstructure:"server_ip"`
	RTMPPort    int    `mapstructure:"rtmp_port"`
	HTTPPort    int    `mapstructure:"http_port"`
	WebRTCPort  int    `mapstructure:"webrtc_port"`
	APIPort     int    `mapstructure:"api_port"`
	CallbackURL string `mapstructure:"callback_url"`
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
	JWTSecret     string        `mapstructure:"jwt_secret"`
	TokenExpiry   time.Duration `mapstructure:"token_expiry"`
	RefreshExpiry time.Duration `mapstructure:"refresh_expiry"`
}

type BudgetConfig struct {
	AlertEnabled   bool    `mapstructure:"alert_enabled"`
	MonthlyLimit   float64 `mapstructure:"monthly_limit"`
	AlertThreshold float64 `mapstructure:"alert_threshold"`
	AlertEmail     string  `mapstructure:"alert_email"`
}

type TURNConfig struct {
	Realm         string        `mapstructure:"realm"`
	Secret        string        `mapstructure:"secret"`
	ExternalIP    string        `mapstructure:"external_ip"`
	CredentialTTL time.Duration `mapstructure:"credential_ttl"`
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

	// Validate required configuration
	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("config validation failed: %w", err)
	}

	return &config, nil
}

// Validate checks if required configuration values are set
func (c *Config) Validate() error {
	if c.Database.Host == "" {
		return fmt.Errorf("database host is required")
	}
	if c.Database.DBName == "" {
		return fmt.Errorf("database name is required")
	}
	if c.Auth.JWTSecret == "" || c.Auth.JWTSecret == "your-super-secret-jwt-key-change-in-production" {
		log.Println("WARNING: Using default JWT secret. Please set JWT_SECRET in production!")
	}
	return nil
}

// IsDevelopment returns true if running in development environment
func (c *Config) IsDevelopment() bool {
	return c.Env == "development" || c.Env == ""
}

// IsProduction returns true if running in production environment
func (c *Config) IsProduction() bool {
	return c.Env == "production"
}

// GetRTMPURL constructs the RTMP ingest URL with token authentication
// Format: rtmp://server/live/stream_id?token=stream_key
// This keeps stream_key secret - only visible in OBS, not in playback URLs
func (c *Config) GetRTMPURL(streamID string, streamKey string) string {
	return fmt.Sprintf("rtmp://%s:%d/live/%s?token=%s", c.SRS.ServerIP, c.SRS.RTMPPort, streamID, streamKey)
}

// GetWebRTCURL constructs the WebRTC publish URL with token authentication
// Format: webrtc://server/live/stream_id?token=stream_key
func (c *Config) GetWebRTCURL(streamID string, streamKey string) string {
	return fmt.Sprintf("webrtc://%s/live/%s?token=%s", c.SRS.ServerIP, streamID, streamKey)
}

// GetHLSURL constructs the HLS playback URL using stream ID (public, no token)
// Format: https://cdn/live/stream_id.m3u8
// Viewers only see the stream ID, never the secret stream_key
func (c *Config) GetHLSURL(streamID string) string {
	return fmt.Sprintf("%s/live/%s.m3u8", c.CDN.BaseURL, streamID)
}

// TURNCredentials holds time-limited TURN credentials (RFC 5766)
type TURNCredentials struct {
	Username   string `json:"username"`
	Credential string `json:"credential"`
}

// GenerateTURNCredentials creates time-limited credentials for TURN server
// Uses HMAC-SHA1 as per RFC 5766 (TURN REST API)
// Username = timestamp (expiry time as Unix epoch)
// Password = Base64(HMAC-SHA1(username, secret))
func (c *Config) GenerateTURNCredentials() TURNCredentials {
	// Username is the expiry timestamp
	expiry := time.Now().Add(c.TURN.CredentialTTL).Unix()
	username := fmt.Sprintf("%d", expiry)

	// Password = Base64(HMAC-SHA1(username, secret))
	h := hmac.New(sha1.New, []byte(c.TURN.Secret))
	h.Write([]byte(username))
	credential := base64.StdEncoding.EncodeToString(h.Sum(nil))

	return TURNCredentials{
		Username:   username,
		Credential: credential,
	}
}

// ICEServer represents a STUN/TURN server for WebRTC
type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

// GetICEServers returns ICE servers config for WebRTC clients
// Includes Google STUN (free) and our TURN server (with time-limited credentials)
func (c *Config) GetICEServers() []ICEServer {
	servers := []ICEServer{
		// Google STUN servers (free, public)
		{URLs: []string{"stun:stun.l.google.com:19302"}},
		{URLs: []string{"stun:stun1.l.google.com:19302"}},
	}

	// Add TURN server if configured
	if c.TURN.Secret != "" && c.TURN.ExternalIP != "" {
		creds := c.GenerateTURNCredentials()
		servers = append(servers, ICEServer{
			URLs: []string{
				fmt.Sprintf("turn:%s:3478", c.TURN.ExternalIP),
				fmt.Sprintf("turn:%s:3478?transport=tcp", c.TURN.ExternalIP),
				fmt.Sprintf("turns:%s:5349", c.TURN.ExternalIP),
			},
			Username:   creds.Username,
			Credential: creds.Credential,
		})
	}

	return servers
}

// GetDSN returns the PostgreSQL connection string
func (c *Config) GetDSN() string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Database.Host,
		c.Database.Port,
		c.Database.User,
		c.Database.Password,
		c.Database.DBName,
		c.Database.SSLMode,
	)
}

func setDefaults() {
	// Bind environment variables to config keys
	_ = viper.BindEnv("env", "ENV")

	// Server bindings
	_ = viper.BindEnv("server.port", "SERVER_PORT")
	_ = viper.BindEnv("server.host", "SERVER_HOST")
	_ = viper.BindEnv("server.read_timeout", "SERVER_READ_TIMEOUT")
	_ = viper.BindEnv("server.write_timeout", "SERVER_WRITE_TIMEOUT")

	// Database bindings
	_ = viper.BindEnv("database.host", "DB_HOST")
	_ = viper.BindEnv("database.port", "DB_PORT")
	_ = viper.BindEnv("database.user", "DB_USER")
	_ = viper.BindEnv("database.password", "DB_PASSWORD")
	_ = viper.BindEnv("database.dbname", "DB_NAME")
	_ = viper.BindEnv("database.sslmode", "DB_SSLMODE")
	_ = viper.BindEnv("database.max_open_conns", "DB_MAX_OPEN_CONNS")
	_ = viper.BindEnv("database.max_idle_conns", "DB_MAX_IDLE_CONNS")
	_ = viper.BindEnv("database.conn_max_lifetime", "DB_CONN_MAX_LIFETIME")
	_ = viper.BindEnv("database.conn_max_idle_time", "DB_CONN_MAX_IDLE_TIME")

	// SRS bindings
	_ = viper.BindEnv("srs.server_url", "SRS_SERVER_URL")
	_ = viper.BindEnv("srs.server_ip", "SRS_SERVER_IP")
	_ = viper.BindEnv("srs.rtmp_port", "SRS_RTMP_PORT")
	_ = viper.BindEnv("srs.http_port", "SRS_HTTP_PORT")
	_ = viper.BindEnv("srs.webrtc_port", "SRS_WEBRTC_PORT")
	_ = viper.BindEnv("srs.api_port", "SRS_API_PORT")
	_ = viper.BindEnv("srs.callback_url", "SRS_CALLBACK_URL")

	// GCS bindings
	_ = viper.BindEnv("gcs.bucket_name", "GCS_BUCKET_NAME")
	_ = viper.BindEnv("gcs.project_id", "GCS_PROJECT_ID")
	_ = viper.BindEnv("gcs.mount_path", "GCS_MOUNT_PATH")

	// CDN bindings
	_ = viper.BindEnv("cdn.domain", "CDN_DOMAIN")
	_ = viper.BindEnv("cdn.base_url", "CDN_BASE_URL")

	// Auth bindings
	_ = viper.BindEnv("auth.jwt_secret", "JWT_SECRET")
	_ = viper.BindEnv("auth.token_expiry", "JWT_TOKEN_EXPIRY")
	_ = viper.BindEnv("auth.refresh_expiry", "JWT_REFRESH_EXPIRY")

	// Budget bindings
	_ = viper.BindEnv("budget.alert_enabled", "BUDGET_ALERT_ENABLED")
	_ = viper.BindEnv("budget.monthly_limit", "BUDGET_MONTHLY_LIMIT")
	_ = viper.BindEnv("budget.alert_threshold", "BUDGET_ALERT_THRESHOLD")
	_ = viper.BindEnv("budget.alert_email", "BUDGET_ALERT_EMAIL")

	// TURN bindings
	_ = viper.BindEnv("turn.realm", "TURN_REALM")
	_ = viper.BindEnv("turn.secret", "TURN_SECRET")
	_ = viper.BindEnv("turn.external_ip", "TURN_EXTERNAL_IP")
	_ = viper.BindEnv("turn.credential_ttl", "TURN_CREDENTIAL_TTL")

	// Environment defaults
	viper.SetDefault("env", "development")

	// Server defaults
	viper.SetDefault("server.port", "8080")
	viper.SetDefault("server.host", "localhost")
	viper.SetDefault("server.read_timeout", 30*time.Second)
	viper.SetDefault("server.write_timeout", 30*time.Second)

	// Database defaults - optimized for 50+ concurrent streams
	viper.SetDefault("database.host", "localhost")
	viper.SetDefault("database.port", 5432)
	viper.SetDefault("database.user", "postgres")
	viper.SetDefault("database.password", "postgres")
	viper.SetDefault("database.dbname", "live_service")
	viper.SetDefault("database.sslmode", "disable")
	viper.SetDefault("database.max_open_conns", 25)
	viper.SetDefault("database.max_idle_conns", 10)
	viper.SetDefault("database.conn_max_lifetime", 30*time.Minute)
	viper.SetDefault("database.conn_max_idle_time", 5*time.Minute)

	// SRS defaults
	viper.SetDefault("srs.server_url", "http://localhost:8080")
	viper.SetDefault("srs.server_ip", "localhost")
	viper.SetDefault("srs.rtmp_port", 1935)
	viper.SetDefault("srs.http_port", 8080)
	viper.SetDefault("srs.webrtc_port", 1985)
	viper.SetDefault("srs.api_port", 1985)
	viper.SetDefault("srs.callback_url", "http://localhost:8080/api/v1/callbacks")

	// GCS defaults
	viper.SetDefault("gcs.bucket_name", "social-app-live-hls-staging")
	viper.SetDefault("gcs.project_id", "your-project-id")
	viper.SetDefault("gcs.mount_path", "/mnt/live_data")

	// CDN defaults
	viper.SetDefault("cdn.domain", "cdn.example.com")
	viper.SetDefault("cdn.base_url", "https://cdn.example.com")

	// Auth defaults
	viper.SetDefault("auth.jwt_secret", "your-super-secret-jwt-key-change-in-production")
	viper.SetDefault("auth.token_expiry", 24*time.Hour)
	viper.SetDefault("auth.refresh_expiry", 7*24*time.Hour)

	// Budget defaults
	viper.SetDefault("budget.alert_enabled", false)
	viper.SetDefault("budget.monthly_limit", 100.0)
	viper.SetDefault("budget.alert_threshold", 0.8)
	viper.SetDefault("budget.alert_email", "")

	// TURN defaults
	viper.SetDefault("turn.realm", "extase.dev")
	viper.SetDefault("turn.secret", "")
	viper.SetDefault("turn.external_ip", "")
	viper.SetDefault("turn.credential_ttl", 24*time.Hour)
}

func InitDB(cfg *Config) (*sqlx.DB, error) {
	db, err := sqlx.Connect("postgres", cfg.GetDSN())
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Configure connection pool for optimal performance
	db.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	db.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	db.SetConnMaxLifetime(cfg.Database.ConnMaxLifetime)
	db.SetConnMaxIdleTime(cfg.Database.ConnMaxIdleTime)

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Printf("Database connected: %s:%d/%s (pool: max_open=%d, max_idle=%d)",
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.DBName,
		cfg.Database.MaxOpenConns,
		cfg.Database.MaxIdleConns,
	)

	return db, nil
}

// PrintConfig logs the current configuration (excluding sensitive data)
func (c *Config) PrintConfig() {
	log.Println("=== Configuration ===")
	log.Printf("Environment: %s", c.Env)
	log.Printf("Server: %s:%s", c.Server.Host, c.Server.Port)
	log.Printf("Database: %s:%d/%s (pool: %d/%d)",
		c.Database.Host, c.Database.Port, c.Database.DBName,
		c.Database.MaxOpenConns, c.Database.MaxIdleConns)
	log.Printf("SRS Server: %s (RTMP:%d, WebRTC:%d)",
		c.SRS.ServerIP, c.SRS.RTMPPort, c.SRS.WebRTCPort)
	log.Printf("GCS Bucket: %s", c.GCS.BucketName)
	log.Printf("CDN: %s", c.CDN.BaseURL)
	if c.Budget.AlertEnabled {
		log.Printf("Budget Alert: enabled (limit: $%.2f, threshold: %.0f%%)",
			c.Budget.MonthlyLimit, c.Budget.AlertThreshold*100)
	}
	log.Println("====================")
}
