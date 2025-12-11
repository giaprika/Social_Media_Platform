.PHONY: gen-proto gen-sql gen tidy docs

# Generate Protobuf using Buf
gen-proto:
	@echo "Updating Buf dependencies..."
	cd api/proto && buf dep update
	@echo "Generating Go code and OpenAPI spec..."
	buf generate api/proto

# Generate SQLC (Giữ nguyên như cũ)
gen-sql:
	sqlc generate

# Chạy cả 2
gen: gen-proto gen-sql

tidy:
	go mod tidy

# Serve API documentation
docs:
	@echo "Starting Swagger UI at http://localhost:8081"
	@echo "Press Ctrl+C to stop"
	@cd docs && python -m http.server 8081

.PHONY: audit
audit:
	@echo "🚀 Dang kiem tra toan dien..."
	@echo "--- 1. Generate & Check Dirty ---"
	make gen
	go mod tidy
	@echo "Checking for modified files..."
	git diff --exit-code
	@echo "--- 2. Linting ---"
	golangci-lint run ./... --config=.golangci.yml
	@echo "--- 3. Running Tests ---"
	go test ./... -v
	@echo "✅ Ngon lanh! Ban co the Push."

build:
	@echo "Building binaries..."
	go build -o bin/ ./cmd/...

#
 ============ Load Testing ============

# Start infrastructure for load testing
.PHONY: infra-up infra-down

infra-up:
	docker-compose up -d postgres redis
	@echo "Waiting for services to be ready..."
	@sleep 3
	@echo "Infrastructure is ready"

infra-down:
	docker-compose down

# Run WebSocket gateway
.PHONY: ws-gateway

ws-gateway:
	go run ./cmd/ws-gateway/

# Load testing with k6
.PHONY: load-test-ws load-test-broadcast

# Test 1000 concurrent WebSocket connections
load-test-ws:
	@echo "Running WebSocket load test (1000 concurrent connections)..."
	k6 run scripts/k6-ws-load-test.js

# Test broadcast latency (run this, then run redis-broadcast in another terminal)
load-test-broadcast:
	@echo "Running broadcast latency test..."
	@echo "In another terminal, run: go run scripts/redis-broadcast-publisher.go"
	k6 run scripts/k6-ws-broadcast-test.js

# Publish test messages to Redis for broadcast testing
redis-broadcast:
	go run scripts/redis-broadcast-publisher.go -n 100 -interval 100ms -recipients 100

# Quick load test (fewer connections, shorter duration)
load-test-quick:
	@echo "Running quick WebSocket load test..."
	k6 run --vus 50 --duration 30s scripts/k6-ws-load-test.js
