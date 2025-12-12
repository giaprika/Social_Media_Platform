package utils

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

const (
	// StreamKeyPrefix is the prefix for all stream keys
	StreamKeyPrefix = "live"

	// DefaultKeyLength is the default number of random bytes (32 hex chars = 256 bits entropy)
	DefaultKeyLength = 16

	// MinKeyLength is the minimum number of random bytes (16 hex chars = 128 bits entropy)
	MinKeyLength = 8
)

var (
	// ErrInvalidStreamKey indicates the stream key format is invalid
	ErrInvalidStreamKey = errors.New("invalid stream key format")

	// ErrInsufficientEntropy indicates not enough random bytes were requested
	ErrInsufficientEntropy = errors.New("insufficient entropy: minimum 8 bytes required")

	// streamKeyPattern matches the format: live_u{userID}_{hex} (legacy int64 userID)
	streamKeyPattern = regexp.MustCompile(`^live_u(\d+)_([a-f0-9]{16,64})$`)

	// streamKeyUUIDPattern matches the format: live_{uuid}_{hex} (new UUID userID)
	streamKeyUUIDPattern = regexp.MustCompile(`^live_([a-f0-9-]{36})_([a-f0-9]{16,64})$`)
)

// GenerateStreamKeyFromUUID generates a secure random stream key with UUID userID
// Format: live_{uuid}_{randomHex}
func GenerateStreamKeyFromUUID(userID string) (string, error) {
	return GenerateStreamKeyFromUUIDWithLength(userID, DefaultKeyLength)
}

// GenerateStreamKeyFromUUIDWithLength generates a stream key with UUID and custom entropy
func GenerateStreamKeyFromUUIDWithLength(userID string, byteLength int) (string, error) {
	if byteLength < MinKeyLength {
		return "", ErrInsufficientEntropy
	}

	randomBytes := make([]byte, byteLength)
	_, err := rand.Read(randomBytes)
	if err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	randomHex := hex.EncodeToString(randomBytes)
	streamKey := fmt.Sprintf("%s_%s_%s", StreamKeyPrefix, userID, randomHex)

	return streamKey, nil
}

// ValidateStreamKey checks if a stream key has valid format
func ValidateStreamKey(streamKey string) bool {
	return streamKeyPattern.MatchString(streamKey) || streamKeyUUIDPattern.MatchString(streamKey)
}

// ParseStreamKeyUUID extracts the UUID userID from a stream key
func ParseStreamKeyUUID(streamKey string) (string, error) {
	matches := streamKeyUUIDPattern.FindStringSubmatch(streamKey)
	if len(matches) < 2 {
		return "", ErrInvalidStreamKey
	}
	return matches[1], nil
}

// MaskStreamKey returns a masked version of the stream key for logging
func MaskStreamKey(streamKey string) string {
	if !ValidateStreamKey(streamKey) {
		// For unknown format, just mask middle part
		if len(streamKey) > 12 {
			return streamKey[:6] + "..." + streamKey[len(streamKey)-6:]
		}
		return "***"
	}

	parts := strings.Split(streamKey, "_")
	if len(parts) < 3 {
		return "***"
	}

	hex := parts[len(parts)-1]
	if len(hex) <= 8 {
		return streamKey
	}

	masked := hex[:4] + "..." + hex[len(hex)-4:]
	parts[len(parts)-1] = masked
	return strings.Join(parts, "_")
}

// GenerateSecureToken generates a generic secure random token
func GenerateSecureToken(byteLength int) (string, error) {
	if byteLength < 1 {
		return "", errors.New("byte length must be positive")
	}

	randomBytes := make([]byte, byteLength)
	_, err := rand.Read(randomBytes)
	if err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	return hex.EncodeToString(randomBytes), nil
}
