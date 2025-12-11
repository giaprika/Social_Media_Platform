#!/bin/bash
# ===========================================
# WebRTC Setup Script for SRS
# Detects public IP and updates configuration
# ===========================================

set -e

echo "🔧 Setting up WebRTC configuration..."

# Detect public IP
detect_public_ip() {
    local ip=""
    
    # Method 1: GCP Metadata (if running on GCP)
    if curl -s -f -H "Metadata-Flavor: Google" \
        "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip" \
        --connect-timeout 2 > /dev/null 2>&1; then
        ip=$(curl -s -H "Metadata-Flavor: Google" \
            "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip")
        echo "📍 Detected GCP public IP: $ip"
        echo "$ip"
        return 0
    fi
    
    # Method 2: AWS Metadata (if running on AWS)
    if curl -s -f "http://169.254.169.254/latest/meta-data/public-ipv4" \
        --connect-timeout 2 > /dev/null 2>&1; then
        ip=$(curl -s "http://169.254.169.254/latest/meta-data/public-ipv4")
        echo "📍 Detected AWS public IP: $ip"
        echo "$ip"
        return 0
    fi
    
    # Method 3: External service
    ip=$(curl -s ifconfig.me --connect-timeout 5 || curl -s icanhazip.com --connect-timeout 5 || echo "")
    if [ -n "$ip" ]; then
        echo "📍 Detected public IP: $ip"
        echo "$ip"
        return 0
    fi
    
    echo "⚠️  Could not detect public IP"
    return 1
}

# Update .env file with public IP
update_env_file() {
    local ip=$1
    local env_file=".env"
    
    if [ ! -f "$env_file" ]; then
        echo "📝 Creating .env from .env.example..."
        cp .env.example "$env_file"
    fi
    
    # Update SRS_PUBLIC_IP
    if grep -q "^SRS_PUBLIC_IP=" "$env_file"; then
        sed -i "s/^SRS_PUBLIC_IP=.*/SRS_PUBLIC_IP=$ip/" "$env_file"
        echo "✅ Updated SRS_PUBLIC_IP=$ip in $env_file"
    else
        echo "SRS_PUBLIC_IP=$ip" >> "$env_file"
        echo "✅ Added SRS_PUBLIC_IP=$ip to $env_file"
    fi
}

# Verify WebRTC ports
check_ports() {
    echo ""
    echo "🔍 Checking WebRTC ports..."
    
    # Check if ports are listening (after docker-compose up)
    local ports=("1935:RTMP" "1985:WebRTC-Signaling" "8000:WebRTC-Media(UDP)" "8080:HTTP-HLS")
    
    for port_info in "${ports[@]}"; do
        local port="${port_info%%:*}"
        local name="${port_info##*:}"
        if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
            echo "  ✅ Port $port ($name) is listening"
        else
            echo "  ⚠️  Port $port ($name) not listening (start docker-compose first)"
        fi
    done
}

# Check firewall rules
check_firewall() {
    echo ""
    echo "🔥 Firewall reminder:"
    echo "   Ensure these ports are open in your firewall/security group:"
    echo "   - TCP 1935  (RTMP ingest from OBS)"
    echo "   - TCP 1985  (WebRTC signaling)"
    echo "   - UDP 8000  (WebRTC media - RTP/RTCP)"
    echo "   - TCP 8080  (HTTP API & HLS)"
    echo "   - TCP 443   (HTTPS - required for browser WebRTC)"
    echo ""
    echo "   GCP Firewall command:"
    echo "   gcloud compute firewall-rules create allow-webrtc \\"
    echo "     --allow tcp:1935,tcp:1985,udp:8000,tcp:8080,tcp:443 \\"
    echo "     --source-ranges 0.0.0.0/0 \\"
    echo "     --description 'Allow WebRTC and streaming ports'"
}

# Main
main() {
    echo "=========================================="
    echo "  SRS WebRTC Configuration Setup"
    echo "=========================================="
    echo ""
    
    # Detect and update IP
    PUBLIC_IP=$(detect_public_ip)
    if [ -n "$PUBLIC_IP" ]; then
        update_env_file "$PUBLIC_IP"
    else
        echo ""
        echo "❌ Could not auto-detect public IP."
        echo "   Please manually set SRS_PUBLIC_IP in .env file"
        echo "   Example: SRS_PUBLIC_IP=34.123.45.67"
    fi
    
    check_ports
    check_firewall
    
    echo ""
    echo "=========================================="
    echo "  Next Steps:"
    echo "=========================================="
    echo "  1. Verify SRS_PUBLIC_IP in .env"
    echo "  2. Run: docker-compose up -d srs"
    echo "  3. Test WebRTC: webrtc://$PUBLIC_IP/live/test"
    echo "=========================================="
}

main "$@"
