.PHONY: gen-proto gen-sql tidy

# Generate Protobuf using Buf
gen-proto:
	@echo "Updating Buf dependencies..."
	cd api/proto && buf dep update
	@echo "Generating Go code..."
	buf generate api/proto

# Generate SQLC (Giữ nguyên như cũ)
gen-sql:
	sqlc generate

# Chạy cả 2
gen: gen-proto gen-sql

tidy:
	go mod tidy