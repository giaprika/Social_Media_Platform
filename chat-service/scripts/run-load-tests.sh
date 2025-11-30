#!/bin/bash

# =============================================================================
# Load Testing Runner Script
# Full Flow: HTTP → DB → Outbox → Redis Pub/Sub → WebSocket
# =============================================================================

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
WS_URL="${WS_URL:-ws://localhost:8081/ws}"
TARGET_RPS="${TARGET_RPS:-1000}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "============================================================"
echo "  CHAT SERVICE - FULL FLOW LOAD TEST"
echo "============================================================"
echo "HTTP API:     $BASE_URL"
echo "WebSocket:    $WS_URL"
echo "Target RPS:   $TARGET_RPS"
echo "============================================================"

if ! command -v k6 &> /dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo ""
    echo "Install k6:"
    echo "  macOS:  brew install k6"
    echo "  Ubuntu: sudo snap install k6"
    echo "  Debian: sudo apt-get install k6"
    exit 1
fi

TEST_TYPE="${1:-full}"

case $TEST_TYPE in
    "full")
        echo -e "\n${YELLOW}Running Full Flow Load Test (1000 msg/sec target)...${NC}"
        k6 run \
            -e BASE_URL="$BASE_URL" \
            -e WS_URL="$WS_URL" \
            -e TARGET_RPS="$TARGET_RPS" \
            scripts/k6-full-flow-load-test.js
        ;;
    "quick")
        echo -e "\n${YELLOW}Running Quick Test (100 msg/sec, 1 minute)...${NC}"
        k6 run \
            -e BASE_URL="$BASE_URL" \
            -e WS_URL="$WS_URL" \
            -e TARGET_RPS=100 \
            -e TEST_DURATION=1m \
            scripts/k6-full-flow-load-test.js
        ;;
    "stress")
        echo -e "\n${YELLOW}Running Stress Test (find breaking point)...${NC}"
        k6 run \
            -e BASE_URL="$BASE_URL" \
            scripts/k6-stress-test.js
        ;;
    *)
        echo "Usage: $0 [full|quick|stress]"
        echo ""
        echo "  full   - Full flow test, 1000 msg/sec target (default)"
        echo "  quick  - Quick test, 100 msg/sec for 1 minute"
        echo "  stress - Stress test to find breaking point"
        exit 1
        ;;
esac

echo -e "\n${GREEN}Test completed!${NC}"
echo "Results: scripts/k6-full-flow-results.json"
