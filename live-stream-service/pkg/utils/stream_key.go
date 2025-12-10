package utils

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strconv"
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

	// streamKeyPattern matches the format: live_u{userID}_{hex}
	streamKeyPattern = regexp.MustCompile(`^live_u(\d+)_([a-f0-9]{16,64})$`)
)

// GenerateStreamKey generates a secure random stream key
// Format: live_u{userID}_{randomHex}
// Uses crypto/rand for cryptographically secure random generation
// Default: 16 bytes = 32 hex characters = 256 bits of entropy
func GenerateStreamKey(userID int64) (string, error) {
	return GenerateStreamKeyWithLength(userID, DefaultKeyLength)
}

// GenerateStreamKeyWithLength generates a stream key with custom entropy length
// byteLength: number of random bytes (minimum 8, recommended 16+)
func GenerateStreamKeyWithLength(userID int64, byteLength int) (string, error) {
	if byteLength < MinKeyLength {
		return "", ErrInsufficientEntropy
	}

	randomBytes := make([]byte, byteLength)
	_, err := rand.Read(randomBytes)
	if err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	randomHex := hex.EncodeToString(randomBytes)
	streamKey := fmt.Sprintf("%s_u%d_%s", StreamKeyPrefix, userID, randomHex)

	return streamKey, nil
}

// ValidateStreamKey checks if a stream key has valid format
func ValidateStreamKey(streamKey string) bool {
	return streamKeyPattern.MatchString(streamKey)
}

// ParseStreamKey extracts the userID from a stream key
// Returns the userID and nil error if valid, or 0 and error if invalid
func ParseStreamKey(streamKey string) (int64, error) {
	matches := streamKeyPattern.FindStringSubmatch(streamKey)
	if matches == nil || len(matches) < 2 {
		return 0, ErrInvalidStreamKey
	}

	userID, err := strconv.ParseInt(matches[1], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("failed to parse user ID: %w", err)
	}

	return userID, nil
}

// ExtractStreamKeyParts extracts all parts from a stream key
// Returns: userID, randomHex, error
func ExtractStreamKeyParts(streamKey string) (userID int64, randomHex string, err error) {
	matches := streamKeyPattern.FindStringSubmatch(streamKey)
	if matches == nil || len(matches) < 3 {
		return 0, "", ErrInvalidStreamKey
	}

	userID, err = strconv.ParseInt(matches[1], 10, 64)
	if err != nil {
		return 0, "", fmt.Errorf("failed to parse user ID: %w", err)
	}

	return userID, matches[2], nil
}

// GetStreamKeyEntropy returns the entropy bits of a stream key
func GetStreamKeyEntropy(streamKey string) (int, error) {
	_, randomHex, err := ExtractStreamKeyParts(streamKey)
	if err != nil {
		return 0, err
	}

	// Each hex character represents 4 bits
	return len(randomHex) * 4, nil
}

// MaskStreamKey returns a masked version of the stream key for logging
// Example: live_u123_abcd...ef12
func MaskStreamKey(streamKey string) string {
	if !ValidateStreamKey(streamKey) {
		return "invalid_key"
	}

	parts := strings.Split(streamKey, "_")
	if len(parts) < 3 {
		return "invalid_key"
	}

	hex := parts[2]
	if len(hex) <= 8 {
		return streamKey // Too short to mask
	}

	masked := hex[:4] + "..." + hex[len(hex)-4:]
	return fmt.Sprintf("%s_%s_%s", parts[0], parts[1], masked)
}

// GenerateSecureToken generates a generic secure random token
// Useful for other purposes like session tokens, API keys, etc.
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
