#!/bin/bash
# ===========================================
# GCS Fuse Installation & Mount Script
# For Ubuntu 22.04 LTS on Google Compute Engine
# ===========================================

set -e

# Configuration
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-social-app-live-hls-staging}"
MOUNT_PATH="${GCS_MOUNT_PATH:-/mnt/live_data}"
SERVICE_ACCOUNT_KEY="${GCS_KEY_FILE:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ===========================================
# Check if running as root or with sudo
# ===========================================
check_permissions() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Please run as root or with sudo"
        exit 1
    fi
}

# ===========================================
# Install gcsfuse
# ===========================================
install_gcsfuse() {
    log_info "Installing gcsfuse..."

    # Check if already installed
    if command -v gcsfuse &> /dev/null; then
        log_info "gcsfuse is already installed: $(gcsfuse --version)"
        return 0
    fi

    # Add Google Cloud SDK repo
    export GCSFUSE_REPO=gcsfuse-$(lsb_release -c -s)
    echo "deb https://packages.cloud.google.com/apt $GCSFUSE_REPO main" | tee /etc/apt/sources.list.d/gcsfuse.list

    # Import Google Cloud public key
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add -

    # Update and install
    apt-get update
    apt-get install -y gcsfuse

    log_info "gcsfuse installed successfully: $(gcsfuse --version)"
}

# ===========================================
# Create mount directory
# ===========================================
create_mount_directory() {
    log_info "Creating mount directory: $MOUNT_PATH"

    if [ -d "$MOUNT_PATH" ]; then
        # Check if already mounted
        if mountpoint -q "$MOUNT_PATH"; then
            log_warn "$MOUNT_PATH is already mounted"
            return 0
        fi
    fi

    mkdir -p "$MOUNT_PATH"
    chmod 755 "$MOUNT_PATH"

    log_info "Mount directory created"
}

# ===========================================
# Mount GCS bucket
# ===========================================
mount_bucket() {
    log_info "Mounting GCS bucket: $GCS_BUCKET_NAME -> $MOUNT_PATH"

    # Check if already mounted
    if mountpoint -q "$MOUNT_PATH"; then
        log_warn "Already mounted. Unmounting first..."
        fusermount -u "$MOUNT_PATH" || true
        sleep 1
    fi

    # Mount options optimized for HLS streaming (high-speed continuous writes)
    # --implicit-dirs: Create directories implicitly
    # --allow-other: Allow Docker containers to access (CRITICAL for SRS in Docker)
    # --file-mode/--dir-mode: Permissions for files/dirs
    # --stat-cache-ttl/--type-cache-ttl: Cache metadata to reduce GCS API calls (CRITICAL for performance)
    MOUNT_OPTIONS="--implicit-dirs -o allow_other --file-mode=644 --dir-mode=755 --stat-cache-ttl 1m --type-cache-ttl 1m"

    # Add key file if specified
    if [ -n "$SERVICE_ACCOUNT_KEY" ] && [ -f "$SERVICE_ACCOUNT_KEY" ]; then
        MOUNT_OPTIONS="$MOUNT_OPTIONS --key-file=$SERVICE_ACCOUNT_KEY"
        log_info "Using service account key: $SERVICE_ACCOUNT_KEY"
    else
        log_info "Using default credentials (VM service account)"
    fi

    # Mount the bucket
    gcsfuse $MOUNT_OPTIONS "$GCS_BUCKET_NAME" "$MOUNT_PATH"

    # Verify mount
    if mountpoint -q "$MOUNT_PATH"; then
        log_info "Successfully mounted $GCS_BUCKET_NAME to $MOUNT_PATH"
    else
        log_error "Failed to mount bucket"
        exit 1
    fi
}

# ===========================================
# Setup systemd service for auto-mount
# ===========================================
setup_systemd_service() {
    log_info "Setting up systemd service for auto-mount..."

    SERVICE_FILE="/etc/systemd/system/gcsfuse-live-data.service"

    # Determine key file option
    KEY_FILE_OPT=""
    if [ -n "$SERVICE_ACCOUNT_KEY" ] && [ -f "$SERVICE_ACCOUNT_KEY" ]; then
        KEY_FILE_OPT="--key-file=$SERVICE_ACCOUNT_KEY"
    fi

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Mount GCS bucket for live streaming HLS data
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
User=root
ExecStart=/usr/bin/gcsfuse --implicit-dirs --allow-other --file-mode=644 --dir-mode=755 --stat-cache-ttl 1m --type-cache-ttl 1m $KEY_FILE_OPT $GCS_BUCKET_NAME $MOUNT_PATH
ExecStop=/usr/bin/fusermount -u $MOUNT_PATH
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable gcsfuse-live-data.service

    log_info "Systemd service created and enabled"
    log_info "Service will auto-start on boot"
}

# ===========================================
# Add fstab entry (alternative to systemd)
# ===========================================
setup_fstab() {
    log_info "Adding fstab entry for persistent mount..."

    FSTAB_ENTRY="$GCS_BUCKET_NAME $MOUNT_PATH gcsfuse rw,_netdev,allow_other,implicit_dirs,file_mode=644,dir_mode=755,stat_cache_ttl=1m,type_cache_ttl=1m"

    # Check if entry already exists
    if grep -q "$GCS_BUCKET_NAME" /etc/fstab; then
        log_warn "fstab entry already exists"
        return 0
    fi

    # Backup fstab
    cp /etc/fstab /etc/fstab.backup

    # Add entry
    echo "$FSTAB_ENTRY" >> /etc/fstab

    log_info "fstab entry added"
}

# ===========================================
# Verify mount and test write
# ===========================================
verify_mount() {
    log_info "Verifying mount..."

    # Check mount point
    if ! mountpoint -q "$MOUNT_PATH"; then
        log_error "Mount point is not mounted"
        exit 1
    fi

    # Test write
    TEST_FILE="$MOUNT_PATH/.mount_test_$(date +%s)"
    if echo "test" > "$TEST_FILE" 2>/dev/null; then
        rm -f "$TEST_FILE"
        log_info "Write test passed"
    else
        log_warn "Write test failed - check bucket permissions"
    fi

    # List contents
    log_info "Mount contents:"
    ls -la "$MOUNT_PATH" | head -10

    log_info "Mount verification complete"
}

# ===========================================
# Print status and usage
# ===========================================
print_status() {
    echo ""
    echo "=========================================="
    echo "GCS Fuse Setup Complete"
    echo "=========================================="
    echo "Bucket:     $GCS_BUCKET_NAME"
    echo "Mount Path: $MOUNT_PATH"
    echo ""
    echo "Commands:"
    echo "  Check mount:    mountpoint -v $MOUNT_PATH"
    echo "  List files:     ls -la $MOUNT_PATH"
    echo "  Unmount:        sudo fusermount -u $MOUNT_PATH"
    echo "  Remount:        sudo systemctl restart gcsfuse-live-data"
    echo ""
    echo "For Docker/SRS, mount this path as volume:"
    echo "  -v $MOUNT_PATH:/data"
    echo "=========================================="
}

# ===========================================
# Unmount function
# ===========================================
unmount_bucket() {
    log_info "Unmounting $MOUNT_PATH..."

    if mountpoint -q "$MOUNT_PATH"; then
        fusermount -u "$MOUNT_PATH"
        log_info "Unmounted successfully"
    else
        log_warn "$MOUNT_PATH is not mounted"
    fi
}

# ===========================================
# Main
# ===========================================
main() {
    case "${1:-install}" in
        install)
            check_permissions
            install_gcsfuse
            create_mount_directory
            mount_bucket
            setup_systemd_service
            verify_mount
            print_status
            ;;
        mount)
            check_permissions
            create_mount_directory
            mount_bucket
            verify_mount
            ;;
        unmount)
            check_permissions
            unmount_bucket
            ;;
        status)
            if mountpoint -q "$MOUNT_PATH"; then
                log_info "$MOUNT_PATH is mounted"
                df -h "$MOUNT_PATH"
            else
                log_warn "$MOUNT_PATH is not mounted"
            fi
            ;;
        *)
            echo "Usage: $0 {install|mount|unmount|status}"
            echo ""
            echo "Environment variables:"
            echo "  GCS_BUCKET_NAME  - Bucket name (default: social-app-live-hls-staging)"
            echo "  GCS_MOUNT_PATH   - Mount path (default: /mnt/live_data)"
            echo "  GCS_KEY_FILE     - Service account key file (optional)"
            exit 1
            ;;
    esac
}

main "$@"
