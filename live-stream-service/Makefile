# Live Service Makefile

.PHONY: build run test clean deps migrate-up migrate-down docker-build docker-run

# Variables
BINARY_NAME=live-service
MAIN_PATH=cmd/main.go
DOCKER_IMAGE=live-service:latest
BIN_DIR=bin

# Build the application
build:
	go build -o $(BIN_DIR)/$(BINARY_NAME) $(MAIN_PATH)

# Run the application
run:
	go run $(MAIN_PATH)

# Run tests
test:
	go test ./...

# Run tests with race detection
test-race:
	go test -race ./...

# Clean build artifacts
clean:
	go clean

# Download dependencies
deps:
	go mod download
	go mod tidy

# Database migrations
migrate-up:
	migrate -path migrations -database "postgres://postgres:postgres@localhost:5432/live_service?sslmode=disable" up

migrate-down:
	migrate -path migrations -database "postgres://postgres:postgres@localhost:5432/live_service?sslmode=disable" down

# Create new migration
migrate-create:
	@read -p "Enter migration name: " name; \
	migrate create -ext sql -dir migrations $$name

# Docker operations
docker-build:
	docker build -t $(DOCKER_IMAGE) .

docker-run:
	docker run -p 8080:8080 $(DOCKER_IMAGE)

# Development helpers
dev: deps
	go run $(MAIN_PATH)

# Run built binary
run-bin: build
	./$(BIN_DIR)/$(BINARY_NAME)

# Format code
fmt:
	go fmt ./...

# Lint code (requires golangci-lint)
lint:
	golangci-lint run

# Generate mocks (requires mockgen)
mocks:
	go generate ./...

# Help
help:
	@echo "Available commands:"
	@echo "  build        - Build the application"
	@echo "  run          - Run the application"
	@echo "  test         - Run tests"
	@echo "  test-race    - Run tests with race detection"
	@echo "  clean        - Clean build artifacts"
	@echo "  deps         - Download and tidy dependencies"
	@echo "  migrate-up   - Run database migrations up"
	@echo "  migrate-down - Run database migrations down"
	@echo "  migrate-create - Create new migration"
	@echo "  docker-build - Build Docker image"
	@echo "  docker-run   - Run Docker container"
	@echo "  dev          - Run in development mode"
	@echo "  fmt          - Format code"
	@echo "  lint         - Lint code"
	@echo "  mocks        - Generate mocks"