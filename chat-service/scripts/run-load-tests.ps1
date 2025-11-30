# =============================================================================
# Load Testing Runner Script (PowerShell)
# Run k6 load tests against chat-service
# =============================================================================

param(
    [Parameter(Position=0)]
    [ValidateSet("http", "ws", "e2e", "stress", "quick", "all")]
    [string]$TestType = "all",
    
    [string]$BaseUrl = "http://localhost:8080",
    [string]$WsUrl = "ws://localhost:8081/ws",
    [int]$TargetRps = 1000
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "           CHAT SERVICE LOAD TESTING" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl"
Write-Host "WebSocket URL: $WsUrl"
Write-Host "Target RPS: $TargetRps"
Write-Host "============================================================" -ForegroundColor Cyan

# Check if k6 is installed
try {
    $null = Get-Command k6 -ErrorAction Stop
} catch {
    Write-Host "Error: k6 is not installed" -ForegroundColor Red
    Write-Host "Install k6: https://k6.io/docs/getting-started/installation/"
    Write-Host ""
    Write-Host "Quick install:"
    Write-Host "  - Windows: choco install k6"
    Write-Host "  - Or download from: https://github.com/grafana/k6/releases"
    exit 1
}

function Run-Test {
    param(
        [string]$TestName,
        [string]$Script,
        [string]$ExtraArgs = ""
    )
    
    Write-Host ""
    Write-Host "Running: $TestName" -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------"
    
    $args = @(
        "run",
        "-e", "BASE_URL=$BaseUrl",
        "-e", "WS_URL=$WsUrl",
        "-e", "TARGET_RPS=$TargetRps"
    )
    
    if ($ExtraArgs) {
        $args += $ExtraArgs.Split(" ")
    }
    
    $args += $Script
    
    & k6 @args
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ $TestName completed" -ForegroundColor Green
    } else {
        Write-Host "✗ $TestName failed" -ForegroundColor Red
    }
}

switch ($TestType) {
    "http" {
        Write-Host "Running HTTP Load Test only..."
        Run-Test -TestName "HTTP Load Test" -Script "scripts/k6-http-load-test.js"
    }
    "ws" {
        Write-Host "Running WebSocket Load Test only..."
        Run-Test -TestName "WebSocket Load Test" -Script "scripts/k6-ws-load-test.js"
    }
    "e2e" {
        Write-Host "Running E2E Load Test only..."
        Run-Test -TestName "E2E Load Test" -Script "scripts/k6-e2e-load-test.js"
    }
    "stress" {
        Write-Host "Running Stress Test only..."
        Run-Test -TestName "Stress Test" -Script "scripts/k6-stress-test.js"
    }
    "quick" {
        Write-Host "Running Quick Test (reduced load)..."
        Run-Test -TestName "Quick HTTP Test" -Script "scripts/k6-http-load-test.js" -ExtraArgs "--duration 30s"
    }
    "all" {
        Write-Host "Running all load tests..."
        
        Run-Test -TestName "HTTP Load Test (1000 RPS)" -Script "scripts/k6-http-load-test.js"
        Start-Sleep -Seconds 10
        
        Run-Test -TestName "WebSocket Load Test (1000 connections)" -Script "scripts/k6-ws-load-test.js"
        Start-Sleep -Seconds 10
        
        Run-Test -TestName "E2E Load Test (Full Flow)" -Script "scripts/k6-e2e-load-test.js"
        Start-Sleep -Seconds 10
        
        Run-Test -TestName "Stress Test (Find Breaking Point)" -Script "scripts/k6-stress-test.js"
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Load testing completed!" -ForegroundColor Green
Write-Host "Results saved to scripts/k6-*-results.json"
Write-Host "============================================================" -ForegroundColor Cyan
