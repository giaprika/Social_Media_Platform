#!/bin/bash
# ===========================================
# GCS Fuse Mount Verification Script
# Checks if gcsfuse is properly mounted and working
# ===========================================

MOUNT_PATH="${GCS_MOUNT_PATH:-/mnt/live_data}"
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-social-app-live-hls-staging}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

check() {
    local name="$1"
    local result="$2"
    
    if [ "$result" -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $name"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $name"
        ((FAILED++))
    fi
}

echo "=========================================="
echo "GCS Fuse Mount Verification"
echo "=========================================="
echo "Bucket: $GCS_BUCKET_NAME"
echo "Mount:  $MOUNT_PATH"
echo ""

# Check 1: gcsfuse installed
if command -v gcsfuse &> /dev/null; then
    check "gcsfuse installed ($(gcsfuse --version 2>&1 | head -1))" 0
else
    check "gcsfuse installed" 1
fi

# Check 2: Mount directory exists
if [ -d "$MOUNT_PATH" ]; then
    check "Mount directory exists" 0
else
    check "Mount directory exists" 1
fi

# Check 3: Mount point is mounted
if mountpoint -q "$MOUNT_PATH" 2>/dev/null; then
    check "Mount point is active" 0
else
    check "Mount point is active" 1
fi

# Check 4: Can list directory
if ls "$MOUNT_PATH" &>/dev/null; then
    check "Can list directory" 0
else
    check "Can list directory" 1
fi

# Check 5: Can write file
TEST_FILE="$MOUNT_PATH/.verify_test_$$"
if echo "test $(date)" > "$TEST_FILE" 2>/dev/null; then
    check "Can write files" 0
    rm -f "$TEST_FILE" 2>/dev/null
else
    check "Can write files" 1
fi

# Check 6: Can create subdirectory
TEST_DIR="$MOUNT_PATH/.verify_dir_$$"
if mkdir -p "$TEST_DIR" 2>/dev/null; then
    check "Can create directories" 0
    rmdir "$TEST_DIR" 2>/dev/null
else
    check "Can create directories" 1
fi

# Check 7: Systemd service status
if systemctl is-active --quiet gcsfuse-live-data 2>/dev/null; then
    check "Systemd service running" 0
elif systemctl is-enabled --quiet gcsfuse-live-data 2>/dev/null; then
    echo -e "${YELLOW}○${NC} Systemd service enabled but not running"
else
    echo -e "${YELLOW}○${NC} Systemd service not configured (optional)"
fi

# Check 8: Disk space
if mountpoint -q "$MOUNT_PATH"; then
    USAGE=$(df -h "$MOUNT_PATH" 2>/dev/null | tail -1 | awk '{print $5}')
    echo -e "${GREEN}○${NC} Disk usage: $USAGE"
fi

echo ""
echo "=========================================="
echo "Results: $PASSED passed, $FAILED failed"
echo "=========================================="

if [ "$FAILED" -gt 0 ]; then
    echo ""
    echo "Troubleshooting:"
    echo "  1. Run: sudo ./scripts/setup_gcsfuse.sh install"
    echo "  2. Check VM service account has Storage permissions"
    echo "  3. Verify bucket exists: gsutil ls gs://$GCS_BUCKET_NAME"
    exit 1
fi

exit 0
