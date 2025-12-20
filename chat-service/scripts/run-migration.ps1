# PowerShell script to run database migrations
# Usage: .\scripts\run-migration.ps1 [up|down|version]

param(
    [string]$Action = "up"
)

# Load environment variables from app.env
if (Test-Path "app.env") {
    Get-Content "app.env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

# Build connection string
$DB_URL = "postgresql://$env:DB_USER`:$env:DB_PASSWORD@$env:DB_HOST`:$env:DB_PORT/$env:DB_NAME`?sslmode=$env:DB_SSLMODE"

Write-Host "Running migration: $Action" -ForegroundColor Green
Write-Host "Database: $env:DB_HOST`:$env:DB_PORT/$env:DB_NAME" -ForegroundColor Cyan

# Run migration
migrate -path migrations -database $DB_URL $Action

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Migration failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
