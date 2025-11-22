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