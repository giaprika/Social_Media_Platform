``` bash
pm2 start ecosystem.config.js
pm2 logs 
pm2 stop all

docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```