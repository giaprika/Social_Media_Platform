#!/bin/bash
# ===========================================
# HLS File Verification Script
# Verifies .m3u8 and .ts files in GCS bucket after streaming
# ===========================================

set -e

# Configuration
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-social-app-live-hls-staging}"
CDN_BASE_URL="${CDN_BASE_URL:-https://cdn.extase.dev}"
MOUNT_PATH="${GCS_MOUNT_PATH:-/mnt/live_data}"
STREAM_KEY="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "${BLUE}=== $1 ===${NC}"; }

# ===========================================
# Check GCS bucket directly (requires gsutil)
# ===========================================
check_gcs_bucket() {
    log_header "Checking GCS Bucket: gs://$GCS_BUCKET_NAME"
    
    if ! command -v gsutil &> /dev/null; then
        log_warn "gsutil not found, skipping GCS direct check"
        return 1
    fi
    
    # List live folder
    log_info "Listing /live/ folder in bucket..."
    gsutil ls "gs://$GCS_BUCKET_NAME/live/" 2>/dev/null || {
        log_warn "No /live/ folder found or bucket empty"
        return 1
    }
    
    # Count files
    M3U8_COUNT=$(gsutil ls "gs://$GCS_BUCKET_NAME/live/*.m3u8" 2>/dev/null | wc -l || echo "0")
    TS_COUNT=$(gsutil ls "gs://$GCS_BUCKET_NAME/live/*.ts" 2>/dev/null | wc -l || echo "0")
    
    log_info "Found $M3U8_COUNT .m3u8 files"
    log_info "Found $TS_COUNT .ts segment files"
    
    return 0
}

# ===========================================
# Check local mount (gcsfuse)
# ===========================================
check_local_mount() {
    log_header "Checking Local Mount: $MOUNT_PATH"
    
    if ! mountpoint -q "$MOUNT_PATH" 2>/dev/null; then
        log_warn "$MOUNT_PATH is not mounted"
        return 1
    fi
    
    # Check live folder
    if [ ! -d "$MOUNT_PATH/live" ]; then
        log_warn "$MOUNT_PATH/live folder does not exist"
        return 1
    fi
    
    # List files
    log_info "Files in $MOUNT_PATH/live/:"
    ls -la "$MOUNT_PATH/live/" 2>/dev/null | head -20
    
    # Count files
    M3U8_COUNT=$(find "$MOUNT_PATH/live" -name "*.m3u8" 2>/dev/null | wc -l)
    TS_COUNT=$(find "$MOUNT_PATH/live" -name "*.ts" 2>/dev/null | wc -l)
    
    log_info "Found $M3U8_COUNT .m3u8 files"
    log_info "Found $TS_COUNT .ts segment files"
    
    return 0
}

# ===========================================
# Verify specific stream
# ===========================================
verify_stream() {
    local stream_key="$1"
    
    log_header "Verifying Stream: $stream_key"
    
    # Check m3u8 file
    M3U8_PATH="$MOUNT_PATH/live/$stream_key.m3u8"
    
    if [ -f "$M3U8_PATH" ]; then
        log_info "✓ Found: $M3U8_PATH"
        
        # Show m3u8 content
        log_info "M3U8 Content:"
        echo "---"
        cat "$M3U8_PATH"
        echo "---"
        
        # Check for relative vs absolute paths
        if grep -q "^http" "$M3U8_PATH"; then
            log_warn "M3U8 contains absolute URLs (may cause CORS issues)"
        else
            log_info "✓ M3U8 uses relative paths (good for CDN)"
        fi
        
        # Count segments in playlist
        SEGMENT_COUNT=$(grep -c "\.ts" "$M3U8_PATH" || echo "0")
        log_info "Segments in playlist: $SEGMENT_COUNT"
        
        # Check if segments exist
        log_info "Checking segment files..."
        MISSING=0
        while IFS= read -r segment; do
            SEGMENT_PATH="$MOUNT_PATH/live/$segment"
            if [ -f "$SEGMENT_PATH" ]; then
                SIZE=$(stat -f%z "$SEGMENT_PATH" 2>/dev/null || stat -c%s "$SEGMENT_PATH" 2>/dev/null || echo "?")
                echo "  ✓ $segment ($SIZE bytes)"
            else
                echo "  ✗ $segment (MISSING)"
                ((MISSING++))
            fi
        done < <(grep "\.ts" "$M3U8_PATH" | grep -v "^#")
        
        if [ "$MISSING" -gt 0 ]; then
            log_warn "$MISSING segment(s) missing"
        else
            log_info "✓ All segments present"
        fi
        
    else
        log_error "✗ M3U8 not found: $M3U8_PATH"
        return 1
    fi
}

# ===========================================
# Check CDN accessibility
# ===========================================
check_cdn() {
    local stream_key="$1"
    
    log_header "Checking CDN Accessibility"
    
    CDN_URL="$CDN_BASE_URL/live/$stream_key.m3u8"
    log_info "Testing: $CDN_URL"
    
    # Check with curl
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$CDN_URL" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        log_info "✓ CDN returns 200 OK"
        
        # Fetch and show content
        log_info "CDN M3U8 Content:"
        echo "---"
        curl -s "$CDN_URL" | head -20
        echo "---"
        
        # Check CORS headers
        log_info "Checking CORS headers..."
        CORS_HEADER=$(curl -s -I "$CDN_URL" 2>/dev/null | grep -i "access-control-allow-origin" || echo "")
        if [ -n "$CORS_HEADER" ]; then
            log_info "✓ CORS header present: $CORS_HEADER"
        else
            log_warn "✗ No CORS header found (may cause browser playback issues)"
        fi
        
    elif [ "$HTTP_CODE" = "404" ]; then
        log_error "✗ CDN returns 404 Not Found"
        log_info "Stream may not be active or files not synced yet"
    else
        log_error "✗ CDN returns HTTP $HTTP_CODE"
    fi
}

# ===========================================
# List all active streams
# ===========================================
list_streams() {
    log_header "Active Streams"
    
    if [ -d "$MOUNT_PATH/live" ]; then
        log_info "Streams in $MOUNT_PATH/live/:"
        for m3u8 in "$MOUNT_PATH/live"/*.m3u8 2>/dev/null; do
            if [ -f "$m3u8" ]; then
                STREAM=$(basename "$m3u8" .m3u8)
                SEGMENTS=$(grep -c "\.ts" "$m3u8" 2>/dev/null || echo "0")
                MODIFIED=$(stat -c %y "$m3u8" 2>/dev/null | cut -d'.' -f1 || stat -f "%Sm" "$m3u8" 2>/dev/null || echo "?")
                echo "  - $STREAM ($SEGMENTS segments, modified: $MODIFIED)"
            fi
        done
    else
        log_warn "No live folder found"
    fi
}

# ===========================================
# Usage
# ===========================================
usage() {
    echo "Usage: $0 [command] [stream_key]"
    echo ""
    echo "Commands:"
    echo "  list              List all active streams"
    echo "  verify <key>      Verify specific stream by key"
    echo "  cdn <key>         Check CDN accessibility for stream"
    echo "  bucket            Check GCS bucket contents"
    echo "  mount             Check local gcsfuse mount"
    echo "  all <key>         Run all checks for a stream"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 verify live_u1_abc123"
    echo "  $0 all live_u1_abc123"
    echo ""
    echo "Environment variables:"
    echo "  GCS_BUCKET_NAME   Bucket name (default: social-app-live-hls-staging)"
    echo "  CDN_BASE_URL      CDN URL (default: https://cdn.extase.dev)"
    echo "  GCS_MOUNT_PATH    Mount path (default: /mnt/live_data)"
}

# ===========================================
# Main
# ===========================================
main() {
    case "${1:-list}" in
        list)
            list_streams
            ;;
        verify)
            if [ -z "$2" ]; then
                log_error "Stream key required"
                usage
                exit 1
            fi
            verify_stream "$2"
            ;;
        cdn)
            if [ -z "$2" ]; then
                log_error "Stream key required"
                usage
                exit 1
            fi
            check_cdn "$2"
            ;;
        bucket)
            check_gcs_bucket
            ;;
        mount)
            check_local_mount
            ;;
        all)
            if [ -z "$2" ]; then
                log_error "Stream key required"
                usage
                exit 1
            fi
            check_local_mount
            echo ""
            verify_stream "$2"
            echo ""
            check_cdn "$2"
            ;;
        -h|--help|help)
            usage
            ;;
        *)
            log_error "Unknown command: $1"
            usage
            exit 1
            ;;
    esac
}

main "$@"
