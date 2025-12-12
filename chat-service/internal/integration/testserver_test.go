package integration

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestServerInitialization verifies that the test server is properly initialized
func TestServerInitialization(t *testing.T) {
	// Verify test infrastructure is initialized
	require.NotNil(t, testInfra, "test infrastructure should be initialized")
	require.NotNil(t, testInfra.DBPool, "database pool should be initialized")
	require.NotNil(t, testInfra.RedisClient, "redis client should be initialized")

	// Verify test server is initialized
	require.NotNil(t, testServer, "test server should be initialized")
	require.NotNil(t, testServer.HTTPServer, "HTTP server should be initialized")
	require.NotNil(t, testServer.ChatService, "chat service should be initialized")
	require.NotNil(t, testServer.Infrastructure, "infrastructure reference should be set")

	// Verify HTTP server is running
	assert.NotEmpty(t, testServer.HTTPServer.URL, "HTTP server URL should not be empty")

	t.Logf("Test server initialized successfully at %s", testServer.HTTPServer.URL)
}
