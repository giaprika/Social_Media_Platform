// Package cloudinary provides utilities for Cloudinary integration
package cloudinary

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"
)

// UploadCredentials contains the credentials needed for client-side upload to Cloudinary
type UploadCredentials struct {
	Signature string `json:"signature"`
	Timestamp int64  `json:"timestamp"`
	APIKey    string `json:"api_key"`
	CloudName string `json:"cloud_name"`
	Folder    string `json:"folder"`
}

// Config holds Cloudinary configuration
type Config struct {
	CloudName    string
	APIKey       string
	APISecret    string
	UploadFolder string
}

// Service provides Cloudinary operations
type Service struct {
	config Config
}

// NewService creates a new Cloudinary service
func NewService(cloudName, apiKey, apiSecret, uploadFolder string) *Service {
	return &Service{
		config: Config{
			CloudName:    cloudName,
			APIKey:       apiKey,
			APISecret:    apiSecret,
			UploadFolder: uploadFolder,
		},
	}
}

// GenerateSignature creates a signature for Cloudinary upload
// Formula: SHA1(params_string + api_secret)
func (s *Service) GenerateSignature(params map[string]interface{}) string {
	// Sort keys alphabetically
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Build params string
	var parts []string
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%v", k, params[k]))
	}
	paramsString := strings.Join(parts, "&")

	// Append API secret
	toSign := paramsString + s.config.APISecret

	// Calculate SHA1
	h := sha1.New()
	h.Write([]byte(toSign))
	return hex.EncodeToString(h.Sum(nil))
}

// GetUploadCredentials generates credentials for client-side upload
func (s *Service) GetUploadCredentials() UploadCredentials {
	timestamp := time.Now().Unix()

	params := map[string]interface{}{
		"timestamp": timestamp,
		"folder":    s.config.UploadFolder,
	}

	signature := s.GenerateSignature(params)

	return UploadCredentials{
		Signature: signature,
		Timestamp: timestamp,
		APIKey:    s.config.APIKey,
		CloudName: s.config.CloudName,
		Folder:    s.config.UploadFolder,
	}
}

// IsConfigured checks if Cloudinary is properly configured
func (s *Service) IsConfigured() bool {
	return s.config.CloudName != "" &&
		s.config.APIKey != "" &&
		s.config.APISecret != ""
}
