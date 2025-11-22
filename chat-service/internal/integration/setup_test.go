package integration

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// TestInfrastructure manages the test containers and connections
type TestInfrastructure struct {
	PostgresContainer testcontainers.Container
	RedisContainer    testcontainers.Container
	DBPool            *pgxpool.Pool
	RedisClient       *redis.Client
	DBConnString      string
	RedisAddr         string
}

var (
	testInfra  *TestInfrastructure
	testServer *TestServer
)

// TestMain sets up the test infrastructure before running tests
func TestMain(m *testing.M) {
	ctx := context.Background()

	// Measure total setup time
	setupStart := time.Now()
	log.Println("=== Starting test infrastructure setup ===")

	// Setup test infrastructure
	var err error
	testInfra, err = SetupTestInfrastructure(ctx)
	if err != nil {
		log.Fatalf("Failed to setup test infrastructure: %v", err)
	}

	// Setup test server
	testServer, err = NewTestServer(testInfra)
	if err != nil {
		log.Fatalf("Failed to create test server: %v", err)
	}

	setupDuration := time.Since(setupStart)
	log.Printf("=== Test infrastructure setup completed in %v ===", setupDuration)
	log.Println("=== Containers will be reused across all tests ===")

	// Run tests
	testStart := time.Now()
	log.Println("=== Starting test execution ===")
	code := m.Run()
	testDuration := time.Since(testStart)
	log.Printf("=== Test execution completed in %v ===", testDuration)

	// Teardown
	log.Println("=== Starting test infrastructure teardown ===")
	teardownStart := time.Now()
	testServer.Close()
	if err := testInfra.Teardown(ctx); err != nil {
		log.Printf("Failed to teardown test infrastructure: %v", err)
	}
	teardownDuration := time.Since(teardownStart)
	log.Printf("=== Test infrastructure teardown completed in %v ===", teardownDuration)

	// Log total time
	totalDuration := time.Since(setupStart)
	log.Printf("=== Total test suite time: %v (setup: %v, tests: %v, teardown: %v) ===", 
		totalDuration, setupDuration, testDuration, teardownDuration)

	// Verify performance target: full suite should complete in <60 seconds
	if totalDuration > 60*time.Second {
		log.Printf("[WARNING] Test suite exceeded 60 second target (took %v)", totalDuration)
		log.Printf("[WARNING] Consider optimizing slow tests or infrastructure setup")
	} else {
		log.Printf("[SUCCESS] Test suite completed within 60 second target")
	}

	os.Exit(code)
}

// RunMigrations executes all migration files in order
func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	// Get the migrations directory path (relative to project root)
	migrationsDir := "../../migrations"
	
	// Read migration directory
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("failed to read migrations directory: %w", err)
	}

	if len(entries) == 0 {
		return fmt.Errorf("no migration files found in migrations directory")
	}

	// Filter and sort migration files
	var migrationFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		// Only include .sql files
		if filepath.Ext(entry.Name()) == ".sql" {
			migrationFiles = append(migrationFiles, entry.Name())
		}
	}

	// Sort to ensure migrations run in order
	sort.Strings(migrationFiles)

	log.Printf("Found %d migration files", len(migrationFiles))

	// Execute migrations in order
	for _, filename := range migrationFiles {
		log.Printf("Executing migration: %s", filename)

		// Read migration file content
		content, err := os.ReadFile(filepath.Join(migrationsDir, filename))
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", filename, err)
		}

		// Execute migration
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			return fmt.Errorf("migration %s failed: %w", filename, err)
		}

		log.Printf("Successfully executed migration: %s", filename)
	}

	// Verify schema creation
	if err := verifySchemaCreation(ctx, pool); err != nil {
		return fmt.Errorf("schema verification failed: %w", err)
	}

	log.Println("All migrations executed successfully and schema verified")
	return nil
}

// verifySchemaCreation checks that all expected tables exist after migrations
func verifySchemaCreation(ctx context.Context, pool *pgxpool.Pool) error {
	expectedTables := []string{"conversations", "messages", "outbox", "conversation_participants"}

	for _, table := range expectedTables {
		var exists bool
		query := `
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'public' 
				AND table_name = $1
			)
		`
		if err := pool.QueryRow(ctx, query, table).Scan(&exists); err != nil {
			return fmt.Errorf("failed to check if table %s exists: %w", table, err)
		}

		if !exists {
			return fmt.Errorf("expected table %s does not exist after migrations", table)
		}

		log.Printf("Verified table exists: %s", table)
	}

	return nil
}

// SetupTestInfrastructure starts PostgreSQL and Redis containers and creates connections
func SetupTestInfrastructure(ctx context.Context) (*TestInfrastructure, error) {
	infra := &TestInfrastructure{}

	// Start PostgreSQL container
	log.Println("Starting PostgreSQL container...")
	postgresStart := time.Now()
	postgresContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "postgres:16-alpine",
			ExposedPorts: []string{"5432/tcp"},
			Env: map[string]string{
				"POSTGRES_USER":     "testuser",
				"POSTGRES_PASSWORD": "testpass",
				"POSTGRES_DB":       "testdb",
			},
			WaitingFor: wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60 * time.Second),
		},
		Started: true,
	})
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("PostgreSQL container failed to start within 60 seconds timeout: %w", err)
		}
		return nil, fmt.Errorf("failed to start PostgreSQL container: %w", err)
	}
	infra.PostgresContainer = postgresContainer
	postgresDuration := time.Since(postgresStart)
	log.Printf("PostgreSQL container started in %v", postgresDuration)

	// Get PostgreSQL connection details
	postgresHost, err := postgresContainer.Host(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get PostgreSQL host: %w", err)
	}

	postgresPort, err := postgresContainer.MappedPort(ctx, "5432")
	if err != nil {
		return nil, fmt.Errorf("failed to get PostgreSQL port: %w", err)
	}

	// Build connection string
	infra.DBConnString = fmt.Sprintf(
		"postgres://testuser:testpass@%s:%s/testdb?sslmode=disable",
		postgresHost,
		postgresPort.Port(),
	)

	// Create database connection pool
	poolConfig, err := pgxpool.ParseConfig(infra.DBConnString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	// Configure pool settings with timeouts
	poolConfig.MaxConns = 10
	poolConfig.MinConns = 2
	poolConfig.MaxConnLifetime = time.Hour
	poolConfig.MaxConnIdleTime = 30 * time.Minute
	poolConfig.ConnConfig.ConnectTimeout = 10 * time.Second // Connection timeout
	poolConfig.ConnConfig.RuntimeParams = map[string]string{
		"statement_timeout": "5000", // 5 second query timeout
	}

	infra.DBPool, err = pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create database pool: %w", err)
	}

	// Verify database connection
	if err := infra.DBPool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Start Redis container
	log.Println("Starting Redis container...")
	redisStart := time.Now()
	redisContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "redis:7-alpine",
			ExposedPorts: []string{"6379/tcp"},
			WaitingFor: wait.ForLog("Ready to accept connections").
				WithStartupTimeout(30 * time.Second),
		},
		Started: true,
	})
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("Redis container failed to start within 30 seconds timeout: %w", err)
		}
		return nil, fmt.Errorf("failed to start Redis container: %w", err)
	}
	infra.RedisContainer = redisContainer
	redisDuration := time.Since(redisStart)
	log.Printf("Redis container started in %v", redisDuration)

	// Get Redis connection details
	redisHost, err := redisContainer.Host(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get Redis host: %w", err)
	}

	redisPort, err := redisContainer.MappedPort(ctx, "6379")
	if err != nil {
		return nil, fmt.Errorf("failed to get Redis port: %w", err)
	}

	infra.RedisAddr = fmt.Sprintf("%s:%s", redisHost, redisPort.Port())

	// Create Redis client
	infra.RedisClient = redis.NewClient(&redis.Options{
		Addr:         infra.RedisAddr,
		Password:     "",
		DB:           0,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		MinIdleConns: 2,
	})

	// Verify Redis connection
	if err := infra.RedisClient.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping Redis: %w", err)
	}

	// Run database migrations
	log.Println("Running database migrations...")
	migrationStart := time.Now()
	if err := RunMigrations(ctx, infra.DBPool); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}
	migrationDuration := time.Since(migrationStart)
	log.Printf("Database migrations completed in %v", migrationDuration)

	log.Println("Test infrastructure setup completed successfully")
	log.Println("NOTE: Containers are started once and reused across all tests for optimal performance")
	log.Println("NOTE: Only test data is cleaned up between tests, not containers")
	return infra, nil
}

// Teardown stops and removes all test containers
func (ti *TestInfrastructure) Teardown(ctx context.Context) error {
	var errs []error

	// Close Redis client
	if ti.RedisClient != nil {
		if err := ti.RedisClient.Close(); err != nil {
			errs = append(errs, fmt.Errorf("failed to close Redis client: %w", err))
		}
	}

	// Close database pool
	if ti.DBPool != nil {
		ti.DBPool.Close()
	}

	// Stop Redis container
	if ti.RedisContainer != nil {
		if err := ti.RedisContainer.Terminate(ctx); err != nil {
			errs = append(errs, fmt.Errorf("failed to terminate Redis container: %w", err))
		}
	}

	// Stop PostgreSQL container
	if ti.PostgresContainer != nil {
		if err := ti.PostgresContainer.Terminate(ctx); err != nil {
			errs = append(errs, fmt.Errorf("failed to terminate PostgreSQL container: %w", err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("teardown errors: %v", errs)
	}

	log.Println("Test infrastructure teardown completed successfully")
	return nil
}

// CleanupTestData truncates all tables to clean up test data between tests
func (ti *TestInfrastructure) CleanupTestData(ctx context.Context) error {
	// Truncate tables in reverse dependency order
	tables := []string{"outbox", "messages", "conversations"}

	for _, table := range tables {
		query := fmt.Sprintf("TRUNCATE TABLE %s CASCADE", table)
		if _, err := ti.DBPool.Exec(ctx, query); err != nil {
			return fmt.Errorf("failed to truncate table %s: %w", table, err)
		}
	}

	// Clear Redis
	if err := ti.RedisClient.FlushDB(ctx).Err(); err != nil {
		return fmt.Errorf("failed to flush Redis: %w", err)
	}

	return nil
}
