``` bash
pm2 start ecosystem.config.js
pm2 logs 
pm2 stop all

docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
docker run -d -p 6379:6379 --name redis-local redis


gcloud auth login
gcloud sql instances patch social-db --activation-policy=ALWAYS --project=pubsub-480117
taskkill /PID 9564 /F
cloud-sql-proxy.x64.exe pubsub-480117:asia-southeast1:social-db --credentials-file=cloud-sql-key.json


docker-compose up -d --build


docker logs backend-gateway --follow #log ra console
docker exec -it postgres-notification psql -U postgres -d notification_db -c "TRUNCATE TABLE notifications CASCADE;" # xóa dữ liệu
docker exec -it postgres-ai psql -U postgres -d violations_db -c "TRUNCATE TABLE violations CASCADE;"

# Reset database với file init mới
docker-compose stop postgres-notification
docker-compose rm -f postgres-notification
docker volume rm social_media_platform_postgres-notification-data
docker-compose up -d postgres-notification

# Nếu đã vào trong container:
psql -U postgres -d violations_db -c "TRUNCATE TABLE violations CASCADE;"

```
{
    "id": "cf897ffb-494c-4804-86fa-819397790520",
    "email": "binh39@gmail.com",
    "full_name": "Binh39",
    "avatar_url": null,
    "birth_date": null,
    "gender": null,
    "status": "active",
    "created_at": "2025-11-25T02:53:15.473Z",
    "metadata": {}
}
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNmODk3ZmZiLTQ5NGMtNDgwNC04NmZhLTgxOTM5Nzc5MDUyMCIsImVtYWlsIjoiYmluaDM5QGdtYWlsLmNvbSIsImZ1bGxfbmFtZSI6IkJpbmgzOSIsImlhdCI6MTc2NDAzOTI3NSwiZXhwIjoxNzY0MTI1Njc1fQ.CHUH8OVmkdoR6SCvluqTXfolz_SfeOUmC6ZwNZSvQZM",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNmODk3ZmZiLTQ5NGMtNDgwNC04NmZhLTgxOTM5Nzc5MDUyMCIsImVtYWlsIjoiYmluaDM5QGdtYWlsLmNvbSIsImZ1bGxfbmFtZSI6IkJpbmgzOSIsImlhdCI6MTc2NDAzOTI3NSwiZXhwIjoxNzY2NjMxMjc1fQ.vCQf2pnDkadMXESMZuf5YienqtADCQAMC_vZUhIbZgQ",
    "user": {
        "id": "cf897ffb-494c-4804-86fa-819397790520",
        "email": "binh39@gmail.com",
        "full_name": "Binh39",
        "avatar_url": null,
        "birth_date": null,
        "gender": null,
        "status": "active",
        "created_at": "2025-11-25T02:53:15.473Z",
        "metadata": {}
    }
}