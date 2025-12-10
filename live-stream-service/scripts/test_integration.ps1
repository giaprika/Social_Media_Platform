# Integration Test Script for Live Service
# Usage: .\scripts\test_integration.ps1 [-WithFFmpeg]

param(
    [switch]$WithFFmpeg
)

Write-Host "=== Live Service Integration Tests ===" -ForegroundColor Cyan

# Check prerequisites
Write-Host "`nChecking prerequisites..." -ForegroundColor Yellow

# Check database connection
$env:DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$env:DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$env:DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "live_service" }

Write-Host "Database: $env:DB_HOST`:$env:DB_PORT/$env:DB_NAME"

# Run unit tests for webhooks first
Write-Host "`nRunning webhook integration tests..." -ForegroundColor Yellow

if ($WithFFmpeg) {
    Write-Host "Including ffmpeg tests (requires SRS running)" -ForegroundColor Magenta
    $env:RUN_FFMPEG_TESTS = "true"
    
    # Check if SRS is running
    try {
        $srsResponse = Invoke-WebRequest -Uri "http://localhost:1985/api/v1/versions" -TimeoutSec 5 -ErrorAction Stop
        Write-Host "SRS server is running" -ForegroundColor Green
    } catch {
        Write-Host "WARNING: SRS server not responding. Start it with: docker-compose up -d srs" -ForegroundColor Red
        $env:RUN_FFMPEG_TESTS = "false"
    }
    
    # Check if ffmpeg is available
    if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
        Write-Host "ffmpeg found" -ForegroundColor Green
    } else {
        Write-Host "WARNING: ffmpeg not found in PATH" -ForegroundColor Red
        $env:RUN_FFMPEG_TESTS = "false"
    }
}

# Run tests
Write-Host "`nRunning tests..." -ForegroundColor Yellow
go test -v -tags=integration ./internal/handler/... -run "Test.*Publish|Test.*Unpublish|TestFull"

$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "`n=== All tests passed! ===" -ForegroundColor Green
} else {
    Write-Host "`n=== Some tests failed ===" -ForegroundColor Red
}

exit $exitCode
