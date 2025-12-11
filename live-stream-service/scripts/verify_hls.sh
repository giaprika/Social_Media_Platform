#!/bin/bash
# HLS File Verification Script

set -e

GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-social-app-live-hls-staging}"
CDN_BASE_URL="${CDN_BASE_URL:-https://cdn.extase.dev}"
MOUNT_PATH="${GCS_MOUNT_PATH:-/mnt/live_data}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "${BLUE}=== $1 ===${NC}"; }

check_gcs_bucket() {
    log_header "Checking GCS Bucket: gs://$GCS_BUCKET_NAME"
    if ! command -v gsutil > /dev/null 2>&1; then
        log_warn "gsutil not found"
        return 1
    fi
    gsutil ls "gs://$GCS_BUCKET_NAME/live/" 2>/dev/null || log_warn "No /live/ folder"
}

check_local_mount() {
    log_header "Checking Local Mount: $MOUNT_PATH"
    if ! mountpoint -q "$MOUNT_PATH" 2>/dev/null; then
        log_warn "$MOUNT_PATH is not mounted"
        return 1
    fi
    if [ ! -d "$MOUNT_PATH/live" ]; then
        log_warn "$MOUNT_PATH/live folder does not exist"
        return 1
    fi
    ls -la "$MOUNT_PATH/live/" 2>/dev/null | head -20
    log_info "Found $(find "$MOUNT_PATH/live" -name "*.m3u8" 2>/dev/null | wc -l) .m3u8 files"
    log_info "Found $(find "$MOUNT_PATH/live" -name "*.ts" 2>/dev/null | wc -l) .ts files"
}

verify_stream() {
    local stream_key="$1"
    log_header "Verifying Stream: $stream_key"
    local m3u8_path="$MOUNT_PATH/live/$stream_key.m3u8"
    if [ -f "$m3u8_path" ]; then
        log_info "Found: $m3u8_path"
        echo "--- M3U8 Content ---"
        cat "$m3u8_path"
        echo "---"
        if grep -q "^http" "$m3u8_path"; then
            log_warn "M3U8 contains absolute URLs"
        else
            log_info "M3U8 uses relative paths (good)"
        fi
    else
        log_error "M3U8 not found: $m3u8_path"
        return 1
    fi
}

check_cdn() {
    local stream_key="$1"
    log_header "Checking CDN"
    local cdn_url="$CDN_BASE_URL/live/$stream_key.m3u8"
    log_info "Testing: $cdn_url"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$cdn_url" 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
        log_info "CDN returns 200 OK"
        curl -s "$cdn_url" | head -10
    else
        log_error "CDN returns HTTP $http_code"
    fi
}

list_streams() {
    log_header "Active Streams"
    if [ -d "$MOUNT_PATH/live" ]; then
        log_info "Streams in $MOUNT_PATH/live/:"
        find "$MOUNT_PATH/live" -name "*.m3u8" -exec basename {} .m3u8 \; 2>/dev/null | while read -r stream; do
            echo "  - $stream"
        done
    else
        log_warn "No live folder found"
    fi
}

usage() {
    echo "Usage: $0 [command] [stream_key]"
    echo "Commands: list, verify, cdn, bucket, mount, all"
}

case "${1:-list}" in
    list) list_streams ;;
    verify) verify_stream "$2" ;;
    cdn) check_cdn "$2" ;;
    bucket) check_gcs_bucket ;;
    mount) check_local_mount ;;
    all) check_local_mount; verify_stream "$2"; check_cdn "$2" ;;
    *) usage ;;
esac
