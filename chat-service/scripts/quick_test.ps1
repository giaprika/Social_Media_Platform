# Quick Test - Send a single message
# Usage: .\scripts\quick_test.ps1

$BASE_URL = "http://localhost:8080"
$USER_ID = [guid]::NewGuid().ToString()
$CONV_ID = [guid]::NewGuid().ToString()

Write-Host "Quick Test - Sending a message..." -ForegroundColor Cyan
Write-Host "User ID: $USER_ID"
Write-Host "Conversation ID: $CONV_ID"
Write-Host ""

$body = @{
    conversation_id = $CONV_ID
    content = "Hello from quick test!"
    idempotency_key = "quick-test-$(Get-Date -Format 'yyyyMMddHHmmssfff')"
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
    "x-user-id" = $USER_ID
}

try {
    Write-Host "Sending POST request to $BASE_URL/v1/messages" -ForegroundColor Yellow
    Write-Host "Headers:" -ForegroundColor Yellow
    $headers | ConvertTo-Json
    Write-Host "Body:" -ForegroundColor Yellow
    $body
    Write-Host ""
    
    $response = Invoke-RestMethod -Uri "$BASE_URL/v1/messages" -Method Post -Headers $headers -Body $body
    
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json
    
} catch {
    Write-Host "✗ Error!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error Message: $_" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Red
        $_.ErrorDetails.Message
    }
}
