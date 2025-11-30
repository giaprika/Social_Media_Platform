package ws

import (
	"os"
	"sync"

	"github.com/google/uuid"
)

var (
	instanceID     string
	instanceIDOnce sync.Once
)

// GetInstanceID returns a unique identifier for this gateway instance.
// The ID is generated once and cached for the lifetime of the process.
// It can be overridden by setting the WS_GATEWAY_INSTANCE_ID environment variable.
func GetInstanceID() string {
	instanceIDOnce.Do(func() {
		if id := os.Getenv("WS_GATEWAY_INSTANCE_ID"); id != "" {
			instanceID = id
		} else {
			instanceID = uuid.New().String()[:8] // Short UUID for readability
		}
	})
	return instanceID
}

// ResetInstanceID resets the instance ID (for testing purposes only).
func ResetInstanceID() {
	instanceIDOnce = sync.Once{}
	instanceID = ""
}
