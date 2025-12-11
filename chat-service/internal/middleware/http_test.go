package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	ctxkeys "chat-service/internal/context"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/grpc/metadata"
)

func TestHTTPLogger(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("test response"))
	})

	middleware := HTTPLogger(logger)(handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	middleware.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "test response", w.Body.String())
}

func TestHTTPLogger_CapturesStatus(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("not found"))
	})

	middleware := HTTPLogger(logger)(handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	middleware.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestHTTPRecovery_NoPanic(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	})

	middleware := HTTPRecovery(logger)(handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	middleware.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "success", w.Body.String())
}

func TestHTTPRecovery_WithPanic(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("test panic")
	})

	middleware := HTTPRecovery(logger)(handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	// Should not panic
	middleware.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Contains(t, w.Body.String(), "Internal Server Error")
}

func TestCustomHeaderMatcher_XHeaders(t *testing.T) {
	tests := []struct {
		name     string
		header   string
		expected string
		forward  bool
	}{
		{
			name:     "x-user-id header",
			header:   "X-User-Id",
			expected: "x-user-id",
			forward:  true,
		},
		{
			name:     "x-custom header",
			header:   "X-Custom-Header",
			expected: "x-custom-header",
			forward:  true,
		},
		{
			name:     "authorization header",
			header:   "Authorization",
			expected: "authorization",
			forward:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, forward := CustomHeaderMatcher(tt.header)
			assert.Equal(t, tt.expected, key)
			assert.Equal(t, tt.forward, forward)
		})
	}
}

func TestCustomHeaderMatcher_DefaultHeaders(t *testing.T) {
	// Test headers that use default behavior
	key, forward := CustomHeaderMatcher("Content-Type")
	assert.True(t, forward)
	// The exact key depends on runtime.DefaultHeaderMatcher implementation
	assert.NotEmpty(t, key)
}

func TestHTTPAuthExtractor_WithUserID(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	
	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		
		// Check context has user_id
		userID, ok := r.Context().Value(ctxkeys.UserIDKey).(string)
		assert.True(t, ok, "user_id should be in context")
		assert.Equal(t, "test-user-123", userID)

		// Check metadata has user_id
		md, ok := metadata.FromIncomingContext(r.Context())
		assert.True(t, ok, "metadata should be in context")
		userIDs := md.Get("x-user-id")
		assert.Len(t, userIDs, 1)
		assert.Equal(t, "test-user-123", userIDs[0])

		w.WriteHeader(http.StatusOK)
	})

	middleware := HTTPAuthExtractor(logger)(handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("x-user-id", "test-user-123")
	w := httptest.NewRecorder()

	middleware.ServeHTTP(w, req)

	assert.True(t, handlerCalled)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestHTTPAuthExtractor_WithoutUserID(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	
	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		
		// Check context does not have user_id
		userID, ok := r.Context().Value(ctxkeys.UserIDKey).(string)
		assert.False(t, ok || userID != "")

		w.WriteHeader(http.StatusOK)
	})

	middleware := HTTPAuthExtractor(logger)(handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	middleware.ServeHTTP(w, req)

	assert.True(t, handlerCalled)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestHTTPAuthExtractor_EmptyUserID(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	
	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		
		// Check context does not have user_id
		userID, ok := r.Context().Value(ctxkeys.UserIDKey).(string)
		assert.False(t, ok || userID != "")

		w.WriteHeader(http.StatusOK)
	})

	middleware := HTTPAuthExtractor(logger)(handler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("x-user-id", "")
	w := httptest.NewRecorder()

	middleware.ServeHTTP(w, req)

	assert.True(t, handlerCalled)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestResponseWriter_WriteHeader(t *testing.T) {
	w := httptest.NewRecorder()
	wrapper := &responseWriter{
		ResponseWriter: w,
		status:         http.StatusOK,
	}

	wrapper.WriteHeader(http.StatusNotFound)

	assert.Equal(t, http.StatusNotFound, wrapper.status)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestResponseWriter_Write(t *testing.T) {
	w := httptest.NewRecorder()
	wrapper := &responseWriter{
		ResponseWriter: w,
		status:         http.StatusOK,
	}

	data := []byte("test data")
	n, err := wrapper.Write(data)

	require.NoError(t, err)
	assert.Equal(t, len(data), n)
	assert.Equal(t, len(data), wrapper.size)
	assert.Equal(t, "test data", w.Body.String())
}

func TestResponseWriter_MultipleWrites(t *testing.T) {
	w := httptest.NewRecorder()
	wrapper := &responseWriter{
		ResponseWriter: w,
		status:         http.StatusOK,
	}

	wrapper.Write([]byte("hello "))
	wrapper.Write([]byte("world"))

	assert.Equal(t, 11, wrapper.size)
	assert.Equal(t, "hello world", w.Body.String())
}
