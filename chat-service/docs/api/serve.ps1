# PowerShell script to serve Swagger UI
Write-Host "Starting Swagger UI server..." -ForegroundColor Green
Write-Host "Open your browser at: http://localhost:8081" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Check if Python is available
if (Get-Command python -ErrorAction SilentlyContinue) {
    python -m http.server 8081
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    python3 -m http.server 8081
} else {
    Write-Host "Error: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Python or use another HTTP server" -ForegroundColor Yellow
    exit 1
}
