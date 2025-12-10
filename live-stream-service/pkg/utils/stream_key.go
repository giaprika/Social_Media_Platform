package utils

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// GenerateStreamKey generates a secure random stream key
// Format: live_u{userID}_{randomHex}
func GenerateStreamKey(userID int64) (string, error) {
	// Generate 16 bytes of random data (32 hex characters)
	randomBytes := make([]byte, 16)
	_, err := rand.Read(randomBytes)
	if err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	randomHex := hex.EncodeToString(randomBytes)
	streamKey := fmt.Sprintf("live_u%d_%s", userID, randomHex)

	return streamKey, nil
}
