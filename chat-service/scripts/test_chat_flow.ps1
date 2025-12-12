# Test Chat Flow: User A and User B messaging each other
# Usage: .\scripts\test_chat_flow.ps1

$ErrorActionPreference = "Stop"

# $BASE_URL = "http://localhost:8080"
$BASE_URL = "34.1.200.169:8080"
$USER_A = [guid]::NewGuid().ToString()
$USER_B = [guid]::NewGuid().ToString()
$CONV_ID = [guid]::NewGuid().ToString()

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Chat Service E2E Test" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Base URL: $BASE_URL"
Write-Host "User A: $USER_A"
Write-Host "User B: $USER_B"
Write-Host "Conversation ID: $CONV_ID"
Write-Host ""

# Function to print test step
function Print-Step {
    param($Number, $Message)
    Write-Host "[STEP $Number]" -ForegroundColor Yellow -NoNewline
    Write-Host " $Message"
}

# Function to print success
function Print-Success {
    param($Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

# Function to print error
function Print-Error {
    param($Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

# Function to make API call
function Invoke-ApiCall {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$UserId,
        [string]$Body = $null
    )
    
    $headers = @{
        "Content-Type" = "application/json"
        "x-user-id" = $UserId
    }
    
    $uri = "$BASE_URL$Endpoint"
    
    try {
        if ($Method -eq "POST") {
            $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $Body
        } else {
            $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers
        }
        return $response
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
        Write-Host $_.Exception.Response.StatusCode.value__
        return $null
    }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Test Scenario: A and B Chat Flow" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: User A sends first message
Print-Step 1 "User A sends first message to User B"
$body = @{
    conversation_id = $CONV_ID
    content = "Hi Bob! How are you?"
    idempotency_key = "msg-a-1-$(Get-Date -Format 'yyyyMMddHHmmssfff')"
} | ConvertTo-Json

$response = Invoke-ApiCall -Method "POST" -Endpoint "/v1/messages" -UserId $USER_A -Body $body

if ($response -and $response.messageId) {
    Print-Success "Message sent successfully. ID: $($response.messageId)"
    $response | ConvertTo-Json
} else {
    Print-Error "Failed to send message"
    exit 1
}
Write-Host ""
Start-Sleep -Seconds 1

# Step 2: User B sends reply
Print-Step 2 "User B replies to User A"
$body = @{
    conversation_id = $CONV_ID
    content = "Hey Alice! I'm doing great, thanks for asking!"
    idempotency_key = "msg-b-1-$(Get-Date -Format 'yyyyMMddHHmmssfff')"
} | ConvertTo-Json

$response = Invoke-ApiCall -Method "POST" -Endpoint "/v1/messages" -UserId $USER_B -Body $body

if ($response -and $response.messageId) {
    Print-Success "Message sent successfully. ID: $($response.messageId)"
    $response | ConvertTo-Json
} else {
    Print-Error "Failed to send message"
    exit 1
}
Write-Host ""
Start-Sleep -Seconds 1

# Step 3: User A sends another message
Print-Step 3 "User A continues the conversation"
$body = @{
    conversation_id = $CONV_ID
    content = "That's wonderful! Want to grab coffee later?"
    idempotency_key = "msg-a-2-$(Get-Date -Format 'yyyyMMddHHmmssfff')"
} | ConvertTo-Json

$response = Invoke-ApiCall -Method "POST" -Endpoint "/v1/messages" -UserId $USER_A -Body $body

if ($response -and $response.messageId) {
    Print-Success "Message sent successfully. ID: $($response.messageId)"
    $response | ConvertTo-Json
} else {
    Print-Error "Failed to send message"
    exit 1
}
Write-Host ""
Start-Sleep -Seconds 1

# Step 4: User B sends another reply
Print-Step 4 "User B responds"
$body = @{
    conversation_id = $CONV_ID
    content = "Sure! How about 3pm at the usual place?"
    idempotency_key = "msg-b-2-$(Get-Date -Format 'yyyyMMddHHmmssfff')"
} | ConvertTo-Json

$response = Invoke-ApiCall -Method "POST" -Endpoint "/v1/messages" -UserId $USER_B -Body $body

if ($response -and $response.messageId) {
    Print-Success "Message sent successfully. ID: $($response.messageId)"
    $response | ConvertTo-Json
} else {
    Print-Error "Failed to send message"
    exit 1
}
Write-Host ""
Start-Sleep -Seconds 1

# Step 5: User A gets all messages in conversation
Print-Step 5 "User A retrieves all messages in conversation"
$response = Invoke-ApiCall -Method "GET" -Endpoint "/v1/conversations/$CONV_ID/messages?limit=50" -UserId $USER_A

if ($response -and $response.messages) {
    $msgCount = $response.messages.Count
    Print-Success "Retrieved $msgCount messages"
    $response | ConvertTo-Json -Depth 10
} else {
    Print-Error "Failed to retrieve messages"
}
Write-Host ""
Start-Sleep -Seconds 1

# Step 6: User B gets all messages in conversation
Print-Step 6 "User B retrieves all messages in conversation"
$response = Invoke-ApiCall -Method "GET" -Endpoint "/v1/conversations/$CONV_ID/messages?limit=50" -UserId $USER_B

if ($response -and $response.messages) {
    $msgCount = $response.messages.Count
    Print-Success "Retrieved $msgCount messages"
    $response | ConvertTo-Json -Depth 10
} else {
    Print-Error "Failed to retrieve messages"
}
Write-Host ""
Start-Sleep -Seconds 1

# Step 7: User A gets their conversations list
Print-Step 7 "User A retrieves their conversations list"
$response = Invoke-ApiCall -Method "GET" -Endpoint "/v1/conversations?limit=10" -UserId $USER_A

if ($response -and $response.conversations) {
    $convCount = $response.conversations.Count
    Print-Success "Retrieved $convCount conversations"
    $response | ConvertTo-Json -Depth 10
} else {
    Print-Error "Failed to retrieve conversations"
}
Write-Host ""
Start-Sleep -Seconds 1

# Step 8: User B gets their conversations list
Print-Step 8 "User B retrieves their conversations list"
$response = Invoke-ApiCall -Method "GET" -Endpoint "/v1/conversations?limit=10" -UserId $USER_B

if ($response -and $response.conversations) {
    $convCount = $response.conversations.Count
    Print-Success "Retrieved $convCount conversations"
    $response | ConvertTo-Json -Depth 10
} else {
    Print-Error "Failed to retrieve conversations"
}
Write-Host ""
Start-Sleep -Seconds 1

# Step 9: User B marks conversation as read
Print-Step 9 "User B marks conversation as read"
$body = @{} | ConvertTo-Json

$response = Invoke-ApiCall -Method "POST" -Endpoint "/v1/conversations/$CONV_ID/read" -UserId $USER_B -Body $body

if ($response) {
    Print-Success "Conversation marked as read"
    $response | ConvertTo-Json
} else {
    Print-Error "Failed to mark as read"
}
Write-Host ""
Start-Sleep -Seconds 1

# Step 10: Test idempotency
Print-Step 10 "Test idempotency - User A resends message with same key"
$idempotencyKey = "msg-a-idempotent-$(Get-Date -Format 'yyyyMMddHHmmssfff')"

$body1 = @{
    conversation_id = $CONV_ID
    content = "Testing idempotency"
    idempotency_key = $idempotencyKey
} | ConvertTo-Json

$response1 = Invoke-ApiCall -Method "POST" -Endpoint "/v1/messages" -UserId $USER_A -Body $body1
Start-Sleep -Seconds 1

$body2 = @{
    conversation_id = $CONV_ID
    content = "Testing idempotency"
    idempotency_key = $idempotencyKey
} | ConvertTo-Json

$response2 = Invoke-ApiCall -Method "POST" -Endpoint "/v1/messages" -UserId $USER_A -Body $body2

if ($response1.message_id -eq $response2.message_id) {
    Print-Success "Idempotency works! Same message ID returned: $($response1.message_id)"
} else {
    Print-Error "Idempotency failed! Different IDs: $($response1.message_id) vs $($response2.message_id)"
}
Write-Host ""

# Step 11: Test pagination
Print-Step 11 "Test pagination - Get messages with limit=2"
$response = Invoke-ApiCall -Method "GET" -Endpoint "/v1/conversations/$CONV_ID/messages?limit=2" -UserId $USER_A

if ($response -and $response.messages) {
    $msgCount = $response.messages.Count
    if ($msgCount -eq 2 -and $response.nextCursor) {
        Print-Success "Pagination works! Retrieved $msgCount messages with cursor: $($response.nextCursor)"
        Write-Host "Messages:" -ForegroundColor Cyan
        $response.messages | ForEach-Object { Write-Host "  - $($_.content)" }
    } elseif ($msgCount -gt 0) {
        Print-Success "Retrieved $msgCount messages (less than limit, no more pages)"
    } else {
        Print-Error "Pagination test failed - no messages returned"
    }
} else {
    Print-Error "Pagination test failed"
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Print-Success "All tests completed!"
Write-Host ""
Write-Host "Conversation ID: $CONV_ID"
Write-Host "Total messages sent: 5"
Write-Host "Users tested: $USER_A, $USER_B"
Write-Host ""
Write-Host "You can verify the data in your database:"
Write-Host "  SELECT * FROM messages WHERE conversation_id = '$CONV_ID';"
Write-Host "  SELECT * FROM conversations WHERE id = '$CONV_ID';"
Write-Host "==========================================" -ForegroundColor Cyan
