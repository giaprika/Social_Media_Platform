# Integration Tests for Chat Service

This directory contains comprehensive integration tests for the Chat Service that verify the complete HTTP → gRPC → Database flow using real PostgreSQL and Redis instances.

## Overview

Unlike unit tests that use mocks, these integration tests:
- Use real PostgreSQL and Redis containers (via testcontainers)
- Test the complete request-response cycle through the HTTP gateway
- Verify database state after operations
- Test multi-user conversation scenarios
- Validate the transactional outbox pattern

## Prerequisites

### Required Software

- **Go**: Version 1.21 or higher
  ```bash
  go version
  ```

- **Docker**: Docker daemon must be running
  ```bash
  docker --version
  docker ps  # Verify Docker is running
  ```

- **Docker Socket Access**: The test suite needs access to the Docker API
  - Linux/macOS: `/var/run/docker.sock`
  - Windows: Docker Desktop must be running

### Required Go Packages

All dependencies are managed via `go.mod`. Run:
```bash
go mod download
```

Key dependencies:
- `github.com/testcontainers/testcontainers-go` - Container management
- `github.com/jackc/pgx/v5` - PostgreSQL driver
- `github.com/redis/go-redis/v9` - Redis client
- `github.com/stretchr/testify` - Test assertions

## Running Integration Tests

### Run All Integration Tests

From the project root:
```bash
go test ./internal/integration/... -v
```

Or with a timeout:
```bash
go test ./internal/integration/... -v -timeout 5m
```

### Run Specific Test File

```bash
# Run only SendMessage tests
go test ./internal/integration -v -run TestSendMessage

# Run only GetMessages tests
go test ./internal/integration -v -run TestGetMessages

# Run only multi-user flow tests
go test ./internal/integration -v -run TestMultiUser
```

### Run Specific Test Case

```bash
# Run a single test
go test ./internal/integration -v -run TestSendMessage_Success

# Run tests matching a pattern
go test ./internal/integration -v -run "TestSendMessage.*Idempotency"
```

### Run Tests with Coverage

```bash
go test ./internal/integration/... -v -cover -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html
```

### Run Tests in Parallel

Tests that are safe to run in parallel are marked with `t.Parallel()`:
```bash
go test ./internal/integration/... -v -parallel 4
```

## Test Structure

```
internal/integration/
├── setup_test.go                 # TestMain, infrastructure setup
├── helpers_test.go               # HTTP client helpers
├── verification_helpers_test.go  # Database verification helpers
├── sendmessage_test.go          # SendMessage API tests
├── getmessages_test.go          # GetMessages API tests
├── getconversations_test.go     # GetConversations API tests
├── markasread_test.go           # MarkAsRead API tests
├── multiuser_flow_test.go       # Multi-user scenario tests
└── README.md                     # This file
```

## Test Lifecycle

1. **TestMain Setup** (once per test run)
   - Starts PostgreSQL container (postgres:16-alpine)
   - Runs database migrations
   - Starts Redis container (redis:7-alpine)
   - Creates connection pools
   - Initializes test server with HTTP gateway

2. **Individual Test Execution** (per test)
   - Setup: Insert test fixtures
   - Execute: Make HTTP requests
   - Verify: Check responses and database state
   - Cleanup: Delete test data

3. **TestMain Teardown** (once per test run)
   - Closes connection pools
   - Stops and removes containers

## Environment Variables

The test suite uses sensible defaults, but you can customize behavior:

### Optional Configuration

- `TESTCONTAINERS_RYUK_DISABLED`: Set to `true` to disable Ryuk container cleanup (useful for debugging)
  ```bash
  export TESTCONTAINERS_RYUK_DISABLED=true
  go test ./internal/integration/...
  ```

- `DOCKER_HOST`: Override Docker socket location (if not using default)
  ```bash
  export DOCKER_HOST=unix:///var/run/docker.sock
  ```

### Container Configuration

Containers are configured with:
- **PostgreSQL**: 
  - User: `testuser`
  - Password: `testpass`
  - Database: `testdb`
  - Port: Randomly assigned by testcontainers

- **Redis**:
  - Port: Randomly assigned by testcontainers
  - No authentication

## Troubleshooting

### Docker Not Running

**Error:**
```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Solution:**
- Ensure Docker Desktop is running (Windows/macOS)
- Ensure Docker daemon is running (Linux): `sudo systemctl start docker`
- Verify with: `docker ps`

### Permission Denied on Docker Socket

**Error:**
```
permission denied while trying to connect to the Docker daemon socket
```

**Solution (Linux):**
```bash
# Add your user to the docker group
sudo usermod -aG docker $USER
newgrp docker

# Or run tests with sudo (not recommended)
sudo go test ./internal/integration/...
```

### Container Startup Timeout

**Error:**
```
container failed to start within timeout
```

**Solution:**
- Check Docker has sufficient resources (CPU, memory)
- Increase timeout in test code if needed
- Check Docker logs: `docker logs <container-id>`
- Ensure no firewall blocking container networking

### Port Already in Use

**Error:**
```
bind: address already in use
```

**Solution:**
- Testcontainers uses random ports, so this is rare
- Stop any conflicting services
- Check for orphaned containers: `docker ps -a`
- Clean up: `docker rm -f $(docker ps -aq)`

### Migration Failures

**Error:**
```
migration failed: relation already exists
```

**Solution:**
- Containers are cleaned up between test runs
- If you see this, manually stop containers:
  ```bash
  docker stop $(docker ps -q --filter ancestor=postgres:16-alpine)
  docker stop $(docker ps -q --filter ancestor=redis:7-alpine)
  ```

### Tests Hanging

**Symptoms:**
- Tests don't complete
- No output for extended period

**Solution:**
- Check container logs for errors
- Verify wait strategies are working
- Increase test timeout: `go test -timeout 10m`
- Check for deadlocks in application code

### Connection Pool Exhausted

**Error:**
```
connection pool exhausted
```

**Solution:**
- Ensure tests properly clean up connections
- Check for connection leaks in application code
- Increase pool size in test setup if needed

### Flaky Tests

**Symptoms:**
- Tests pass sometimes, fail other times
- Race conditions

**Solution:**
- Run tests multiple times: `go test -count=10`
- Check for timing issues
- Ensure proper test isolation
- Use `t.Parallel()` carefully

### Out of Disk Space

**Error:**
```
no space left on device
```

**Solution:**
```bash
# Clean up Docker resources
docker system prune -a --volumes

# Remove unused images
docker image prune -a

# Check disk usage
docker system df
```

## Debugging Tests

### View Container Logs

While tests are running, find container IDs:
```bash
docker ps
```

View logs:
```bash
docker logs <container-id>
```

### Keep Containers Running After Tests

Disable Ryuk (automatic cleanup):
```bash
export TESTCONTAINERS_RYUK_DISABLED=true
go test ./internal/integration/... -v
```

Then inspect containers:
```bash
docker ps
docker exec -it <postgres-container-id> psql -U testuser -d testdb
```

### Enable Verbose Logging

Run tests with verbose output:
```bash
go test ./internal/integration/... -v -test.v
```

### Debug Specific Test

Add debug prints in test code:
```go
t.Logf("Debug: messageID=%s", messageID)
```

Run with verbose flag to see output:
```bash
go test ./internal/integration -v -run TestSendMessage_Success
```

## Performance

### Expected Performance

- Container startup: ~10 seconds (first run)
- Container startup: ~5 seconds (cached images)
- Individual test: <2 seconds
- Full test suite: <60 seconds

### Optimization Tips

1. **Container Reuse**: Containers are started once in TestMain and reused across tests
2. **Parallel Execution**: Safe tests use `t.Parallel()`
3. **Selective Cleanup**: Only test data is cleaned up between tests, not containers
4. **Connection Pooling**: Database connections are pooled and reused

### Monitoring Performance

Run tests with timing:
```bash
go test ./internal/integration/... -v -benchtime=1x
```

## Test Coverage

The integration test suite covers:

- ✅ **SendMessage API**: Success, idempotency, validation, authentication, transactional outbox
- ✅ **GetMessages API**: Success, pagination, empty conversations, validation
- ✅ **GetConversations API**: Success, unread counts, user isolation, pagination
- ✅ **MarkAsRead API**: Success, user isolation, idempotency, validation
- ✅ **Multi-User Flows**: Complete conversation flows, unread tracking, participant management

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Go
      uses: actions/setup-go@v4
      with:
        go-version: '1.21'
    
    - name: Run integration tests
      run: go test ./internal/integration/... -v -timeout 5m
```

### Docker-in-Docker

If running in a containerized CI environment, ensure Docker socket is mounted:
```yaml
services:
  docker:
    image: docker:dind
    privileged: true
```

## Adding New Tests

### Test Pattern

Follow this pattern for new integration tests:

```go
func TestNewFeature_Success(t *testing.T) {
    ctx := context.Background()
    
    // Setup: Create test data
    testIDs := GenerateTestIDs()
    
    // Execute: Make HTTP request
    resp, err := testServer.MakeRequest("POST", "/v1/endpoint", 
        map[string]interface{}{
            "field": "value",
        }, 
        map[string]string{
            "x-user-id": testIDs.UserA,
        })
    
    // Verify: Check response
    require.NoError(t, err)
    assert.Equal(t, http.StatusOK, resp.StatusCode)
    
    // Verify: Check database state
    AssertDatabaseState(t, testInfra.DBPool, expectedState)
    
    // Cleanup
    CleanupTestData(ctx, testInfra.DBPool, testIDs)
}
```

### Best Practices

1. **Use unique UUIDs**: Call `GenerateTestIDs()` for each test
2. **Clean up test data**: Always clean up in defer or at end of test
3. **Verify database state**: Don't just check HTTP responses
4. **Use helpers**: Leverage existing helper functions
5. **Test isolation**: Ensure tests can run independently
6. **Clear test names**: Use descriptive names like `TestFeature_Scenario`

## Additional Resources

- [Testcontainers Go Documentation](https://golang.testcontainers.org/)
- [Go Testing Package](https://pkg.go.dev/testing)
- [Testify Assertions](https://pkg.go.dev/github.com/stretchr/testify/assert)
- [pgx Documentation](https://pkg.go.dev/github.com/jackc/pgx/v5)

## Support

For issues or questions:
1. Check this README's troubleshooting section
2. Review test output for specific error messages
3. Check Docker and container logs
4. Verify prerequisites are met
5. Consult the design document at `.kiro/specs/integration-tests/design.md`
