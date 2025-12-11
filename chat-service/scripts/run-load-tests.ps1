# =============================================================================
# Load Testing Runner Script (PowerShell)
# Full Flow: HTTP → DB → Outbox → Redis Pub/Sub → WebSocket
# =============================================================================

param(
    [Parameter(Position=0)]
    [ValidateSet("full", "quick", "stress")]
    [string]$TestType = "full",
    
    [string]$BaseUrl = "http://localhost:8080",
    [string]$WsUrl = "ws://localhost:8081/ws",
    [int]$TargetRps = 1000
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CHAT SERVICE - FULL FLOW LOAD TEST" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "HTTP API:     $BaseUrl"
Write-Host "WebSocket:    $WsUrl"
Write-Host "Target RPS:   $TargetRps"
Write-Host "============================================================" -ForegroundColor Cyan

# Check k6
try {
    $null = Get-Command k6 -ErrorAction Stop
} catch {
    Write-Host "Error: k6 is not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install k6:"
    Write-Host "  Windows: choco install k6"
    Write-Host "  Or download: https://github.com/grafana/k6/releases"
    exit 1
}

switch ($TestType) {
    "full" {
        Write-Host "`nRunning Full Flow Load Test (1000 msg/sec target)..." -ForegroundColor Yellow
        k6 run `
            -e BASE_URL="$BaseUrl" `
            -e WS_URL="$WsUrl" `
            -e TARGET_RPS="$TargetRps" `
            scripts/k6-full-flow-load-test.js
    }
    "quick" {
        Write-Host "`nRunning Quick Test (100 msg/sec, 1 minute)..." -ForegroundColor Yellow
        k6 run `
            -e BASE_URL="$BaseUrl" `
            -e WS_URL="$WsUrl" `
            -e TARGET_RPS=100 `
            -e TEST_DURATION=1m `
            scripts/k6-full-flow-load-test.js
    }
    "stress" {
        Write-Host "`nRunning Stress Test (find breaking point)..." -ForegroundColor Yellow
        k6 run `
            -e BASE_URL="$BaseUrl" `
            scripts/k6-stress-test.js
    }
}

Write-Host "`nTest completed!" -ForegroundColor Green
Write-Host "Results: scripts/k6-full-flow-results.json"
