``` bash
pm2 start ecosystem.config.js
pm2 logs 
pm2 stop all

docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
docker run -d -p 6379:6379 --name redis-local redis

cloud-sql-proxy.x64.exe pubsub-480117:asia-southeast1:social-db --credentials-file=cloud-sql-key.json
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