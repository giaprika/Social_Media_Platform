package middleware

import (
	ctxkeys "chat-service/internal/context"
	"context"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"go.uber.org/zap"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// responseWriter wraps http.ResponseWriter to capture status and size.
type responseWriter struct {
	http.ResponseWriter
	status int
	size   int
}

func (w *responseWriter) WriteHeader(statusCode int) {
	w.status = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *responseWriter) Write(b []byte) (int, error) {
	size, err := w.ResponseWriter.Write(b)
	w.size += size
	return size, err
}

// HTTPLogger logs HTTP requests.
func HTTPLogger(logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			wrapper := &responseWriter{
				ResponseWriter: w,
				status:         http.StatusOK,
			}

			next.ServeHTTP(wrapper, r)

			logger.Info("http request",
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.Int("status", wrapper.status),
				zap.Int("bytes", wrapper.size),
				zap.Duration("duration", time.Since(start)),
			)
		})
	}
}

// HTTPRecovery recovers from panics in HTTP handlers.
func HTTPRecovery(logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					logger.Error("http panic recovery",
						zap.Any("panic", rec),
						zap.String("stack", string(debug.Stack())),
					)
					http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

type gatewayErrorResponse struct {
	Error gatewayErrorBody `json:"error"`
}

type gatewayErrorBody struct {
	Code    string        `json:"code"`
	Message string        `json:"message"`
	Details []interface{} `json:"details,omitempty"`
}

// GatewayErrorHandler returns a custom error handler for grpc-gateway.
func GatewayErrorHandler(logger *zap.Logger) runtime.ErrorHandlerFunc {
	return func(ctx context.Context, mux *runtime.ServeMux, marshaler runtime.Marshaler, w http.ResponseWriter, r *http.Request, err error) {
		st := status.Convert(err)
		httpStatus := runtime.HTTPStatusFromCode(st.Code())

		resp := gatewayErrorResponse{
			Error: gatewayErrorBody{
				Code:    st.Code().String(),
				Message: st.Message(),
			},
		}

		if len(st.Details()) > 0 {
			resp.Error.Details = make([]interface{}, 0, len(st.Details()))
			resp.Error.Details = append(resp.Error.Details, st.Details()...)
		}

		payload, marshalErr := marshaler.Marshal(resp)
		if marshalErr != nil {
			logger.Error("failed to marshal gateway error response", zap.Error(marshalErr))
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", marshaler.ContentType(resp))
		w.WriteHeader(httpStatus)
		if _, writeErr := w.Write(payload); writeErr != nil {
			logger.Warn("failed to write gateway error response", zap.Error(writeErr))
		}
	}
}

// CustomHeaderMatcher determines which HTTP headers should be forwarded to gRPC metadata.
// This is used to pass authentication headers from HTTP to gRPC.
func CustomHeaderMatcher(key string) (string, bool) {
	// Convert to lowercase for case-insensitive matching
	key = strings.ToLower(key)

	// Forward x- prefixed headers (including x-user-id)
	if strings.HasPrefix(key, "x-") {
		return key, true
	}

	// Forward authorization header
	if key == "authorization" {
		return key, true
	}

	// Use default behavior for other headers
	return runtime.DefaultHeaderMatcher(key)
}

// HTTPAuthExtractor extracts user_id from HTTP headers and injects it into context.
// This is needed for grpc-gateway in-process handlers which don't go through gRPC interceptors.
func HTTPAuthExtractor(logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			// Extract user_id from x-user-id header
			userID := r.Header.Get("x-user-id")
			if userID != "" {
				// Inject user_id into both the regular context and gRPC metadata
				ctx = context.WithValue(ctx, ctxkeys.UserIDKey, userID)

				// Also add to gRPC metadata for consistency
				md := metadata.Pairs("x-user-id", userID)
				ctx = metadata.NewIncomingContext(ctx, md)

				logger.Debug("extracted user_id from HTTP header",
					zap.String("user_id", userID),
					zap.String("path", r.URL.Path),
				)
			} else {
				logger.Debug("no x-user-id header found",
					zap.String("path", r.URL.Path),
				)
			}

			// Update request with new context
			r = r.WithContext(ctx)
			next.ServeHTTP(w, r)
		})
	}
}
