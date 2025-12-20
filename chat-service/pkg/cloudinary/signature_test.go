package cloudinary

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewService(t *testing.T) {
	service := NewService("test-cloud", "api-key", "api-secret", "test-folder")

	assert.NotNil(t, service)
	assert.Equal(t, "test-cloud", service.config.CloudName)
	assert.Equal(t, "api-key", service.config.APIKey)
	assert.Equal(t, "api-secret", service.config.APISecret)
	assert.Equal(t, "test-folder", service.config.UploadFolder)
}

func TestGenerateSignature(t *testing.T) {
	service := NewService("test-cloud", "api-key", "test-secret", "test-folder")

	// Test with known params
	params := map[string]interface{}{
		"timestamp": int64(1234567890),
		"folder":    "test-folder",
	}

	signature := service.GenerateSignature(params)

	// Signature should be a 40-character hex string (SHA1)
	assert.Len(t, signature, 40)
	assert.Regexp(t, "^[a-f0-9]+$", signature)
}

func TestGenerateSignature_Deterministic(t *testing.T) {
	service := NewService("test-cloud", "api-key", "test-secret", "test-folder")

	params := map[string]interface{}{
		"timestamp": int64(1234567890),
		"folder":    "test-folder",
	}

	// Same params should produce same signature
	sig1 := service.GenerateSignature(params)
	sig2 := service.GenerateSignature(params)

	assert.Equal(t, sig1, sig2)
}

func TestGenerateSignature_DifferentParams(t *testing.T) {
	service := NewService("test-cloud", "api-key", "test-secret", "test-folder")

	params1 := map[string]interface{}{
		"timestamp": int64(1234567890),
		"folder":    "folder1",
	}

	params2 := map[string]interface{}{
		"timestamp": int64(1234567890),
		"folder":    "folder2",
	}

	sig1 := service.GenerateSignature(params1)
	sig2 := service.GenerateSignature(params2)

	assert.NotEqual(t, sig1, sig2)
}

func TestGetUploadCredentials(t *testing.T) {
	service := NewService("test-cloud", "api-key", "api-secret", "test-folder")

	before := time.Now().Unix()
	creds := service.GetUploadCredentials()
	after := time.Now().Unix()

	assert.Equal(t, "test-cloud", creds.CloudName)
	assert.Equal(t, "api-key", creds.APIKey)
	assert.Equal(t, "test-folder", creds.Folder)
	assert.NotEmpty(t, creds.Signature)
	assert.GreaterOrEqual(t, creds.Timestamp, before)
	assert.LessOrEqual(t, creds.Timestamp, after)
}

func TestIsConfigured(t *testing.T) {
	tests := []struct {
		name       string
		cloudName  string
		apiKey     string
		apiSecret  string
		expected   bool
	}{
		{
			name:      "fully configured",
			cloudName: "cloud",
			apiKey:    "key",
			apiSecret: "secret",
			expected:  true,
		},
		{
			name:      "missing cloud name",
			cloudName: "",
			apiKey:    "key",
			apiSecret: "secret",
			expected:  false,
		},
		{
			name:      "missing api key",
			cloudName: "cloud",
			apiKey:    "",
			apiSecret: "secret",
			expected:  false,
		},
		{
			name:      "missing api secret",
			cloudName: "cloud",
			apiKey:    "key",
			apiSecret: "",
			expected:  false,
		},
		{
			name:      "all empty",
			cloudName: "",
			apiKey:    "",
			apiSecret: "",
			expected:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := NewService(tt.cloudName, tt.apiKey, tt.apiSecret, "folder")
			result := service.IsConfigured()
			require.Equal(t, tt.expected, result)
		})
	}
}
