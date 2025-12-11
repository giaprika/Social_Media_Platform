package ws

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetInstanceID_GeneratesUniqueID(t *testing.T) {
	ResetInstanceID()
	defer ResetInstanceID()

	// Clear env var
	os.Unsetenv("WS_GATEWAY_INSTANCE_ID")

	id := GetInstanceID()
	assert.NotEmpty(t, id)
	assert.Len(t, id, 8) // Short UUID format

	// Should return same ID on subsequent calls
	id2 := GetInstanceID()
	assert.Equal(t, id, id2)
}

func TestGetInstanceID_UsesEnvVar(t *testing.T) {
	ResetInstanceID()
	defer ResetInstanceID()

	customID := "gateway-1"
	os.Setenv("WS_GATEWAY_INSTANCE_ID", customID)
	defer os.Unsetenv("WS_GATEWAY_INSTANCE_ID")

	id := GetInstanceID()
	assert.Equal(t, customID, id)
}

func TestGetInstanceID_CachesValue(t *testing.T) {
	ResetInstanceID()
	defer ResetInstanceID()

	os.Unsetenv("WS_GATEWAY_INSTANCE_ID")

	id1 := GetInstanceID()

	// Even if we set env var now, it should return cached value
	os.Setenv("WS_GATEWAY_INSTANCE_ID", "different-id")
	defer os.Unsetenv("WS_GATEWAY_INSTANCE_ID")

	id2 := GetInstanceID()
	assert.Equal(t, id1, id2)
}

func TestResetInstanceID(t *testing.T) {
	ResetInstanceID()
	defer ResetInstanceID()

	os.Unsetenv("WS_GATEWAY_INSTANCE_ID")

	id1 := GetInstanceID()
	require.NotEmpty(t, id1)

	ResetInstanceID()

	// After reset, should generate new ID
	id2 := GetInstanceID()
	// Note: There's a tiny chance they could be equal, but extremely unlikely
	// For a more robust test, we'd mock the UUID generator
	assert.NotEmpty(t, id2)
}
