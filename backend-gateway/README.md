# Backend Gateway Service

# Hướng dẫn

## Thiết lập env

Copy từ file env.example:

- `USER_NAME`: tên của mình
- `*_SERVICE_URL`: domain của các services

## Thiết lập proxy

Vào file `src/config/index.js`.
Ở phần services, thay thế `pathRewrite` thành base path tương ứng với từng service

**Ví dụ:**

User service có endpoint path là `http://localhost:10458/{BASE_PATH}` thì thêm đoạn này vào trong file:

```js
users: {
    target: process.env.USER_SERVICE_URL || 'http://localhost:10458',
        pathRewrite: {
            '^/api/service/users': '/BASE_PATH'
        },
    },
```

Lúc này muốn check API thì gọi `http://localhost:3000/api/service/{service}/*`.

**Ví dụ:**

Thay vì gọi trực tiếp tới `http://localhost:10458/users/login`

Sau khi thiết lập proxy thì gọi `http://locahost:3000/api/service/users/login`

## Authenticate

**Nếu cần bypass authenticate:**
Tạo excludeList tương ứng với service ở `src/config/index.js`. Ví dụ:

```js
services: {
    ...,
    users: {
      ...,
      excludeList: ['/login', '/register', '/saveRefreshToken']
    },
    ...
}
```

- Nếu cần bypass ở aggregation XXX thì tạo excludeList tương ứng với service ở `src/services/xxx/config.js`

## Aggregation (optional)

Nếu cần gọi tới nhiều endpoints ở nhiều service:

- Tạo folder `XXX` ở trong src/services
- Viết file config.js (optional)
- Tạo các file controller của `XXX`, file index.js chứa các routes, file XXXService.js gọi tới service
- Muốn check API thì gọi `http://localhost:3000/api/XXX`
- Nếu muốn gọi tới service nào, thì gọi vào axios instance tương ứng thay vì tạo `this.axios` mới (xem trong file [`axiosFactory.js`](./src/utils/axiosFactory.js))

## Test Endpoint (Postman)

Chạy user_service, tạo user bằng cách POST `http://localhost:3000/api/users/register`.

```json
{
  "email": "username@gmail.com",
  "password": "password",
  "full_name": "me"
}
```

Đăng nhập bằng cách POST `http:localhost:3000/api/users/login`, gửi body json tương tự như trên.

Copy `accessToken` và `user.id`, đưa vào headers:

```
x-user-id: {user.id}
Authorization: <Bearer> {accessToken}
```
