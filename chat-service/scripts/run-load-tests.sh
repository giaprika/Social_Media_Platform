#!/bin/bash

# =============================================================================
# Load Testing Runner Script
# Run k6 load tests against chat-service
# =============================================================================

set -e

# Default configuration
BASE_URL="${BASE_URL:-http://localhost:8080}"
WS_URL="${WS_URL:-ws://localhost:8081/ws}"
TARGET_RPS="${TARGET_RPS:-1000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================================"
echo "           CHAT SERVICE LOAD TESTING"
echo "============================================================"
echo "Base URL: $BASE_URL"
echo "WebSocket URL: $WS_URL"
echo "Target RPS: $TARGET_RPS"
echo "============================================================"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo "Install k6: https://k6.io/docs/getting-started/installation/"
    echo ""
    echo "Quick install:"
    echo "  - macOS: brew install k6"
    echo "  - Ubuntu: sudo snap install k6"
    echo "  - Windows: choco install k6"
    exit 1
fi

# Function to run a test
run_test() {
    local test_name=$1
    local script=$2
    local extra_args=$3
    
    echo ""
    echo -e "${YELLOW}Running: $test_name${NC}"
    echo "------------------------------------------------------------"
    
    k6 run \
        -e BASE_URL="$BASE_URL" \
        -e WS_URL="$WS_URL" \
        -e TARGET_RPS="$TARGET_RPS" \
        $extra_args \
        "$script"
    
    echo -e "${GREEN}✓ $test_name completed${NC}"
}

# Parse command line arguments
TEST_TYPE="${1:-all}"

case $TEST_TYPE in
    "http")
        echo "Running HTTP Load Test only..."
        run_test "HTTP Load Test" "scripts/k6-http-load-test.js"
        ;;
    "ws")
        echo "Running WebSocket Load Test only..."
        run_test "WebSocket Load Test" "scripts/k6-ws-load-test.js"
        ;;
    "e2e")
        echo "Running E2E Load Test only..."
        run_test "E2E Load Test" "scripts/k6-e2e-load-test.js"
        ;;
    "stress")
        echo "Running Stress Test only..."
        run_test "Stress Test" "scripts/k6-stress-test.js"
        ;;
    "quick")
        echo "Running Quick Test (reduced load)..."
        run_test "Quick HTTP Test" "scripts/k6-http-load-test.js" "--duration 30s -e TARGET_RPS=100"
        ;;
    "all")
        echo "Running all load tests..."
        
        # 1. HTTP Load Test
        run_test "HTTP Load Test (1000 RPS)" "scripts/k6-http-load-test.js"
        
        sleep 10
        
        # 2. WebSocket Load Test
        run_test "WebSocket Load Test (1000 connections)" "scripts/k6-ws-load-test.js"
        
        sleep 10
        
        # 3. E2E Load Test
        run_test "E2E Load Test (Full Flow)" "scripts/k6-e2e-load-test.js"
        
        sleep 10
        
        # 4. Stress Test
        run_test "Stress Test (Find Breaking Point)" "scripts/k6-stress-test.js"
        ;;
    *)
        echo "Usage: $0 [http|ws|e2e|stress|quick|all]"
        echo ""
        echo "Tests:"
        echo "  http   - HTTP API load test (SendMessage)"
        echo "  ws     - WebSocket connection load test"
        echo "  e2e    - End-to-end flow test (HTTP + WS)"
        echo "  stress - Stress test to find breaking point"
        echo "  quick  - Quick test with reduced load"
        echo "  all    - Run all tests sequentially"
        exit 1
        ;;
esac

echo ""
echo "============================================================"
echo -e "${GREEN}Load testing completed!${NC}"
echo "Results saved to scripts/k6-*-results.json"
echo "============================================================"
