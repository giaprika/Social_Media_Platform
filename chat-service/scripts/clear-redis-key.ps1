# Clear idempotency key from Redis (PowerShell version)

param(
    [Parameter(Mandatory=$true)]
    [string]$Key
)

$RedisKey = "idempotency:$Key"

Write-Host "Deleting Redis key: $RedisKey" -ForegroundColor Yellow
docker exec chat_redis redis-cli DEL $RedisKey
Write-Host "Done!" -ForegroundColor Green