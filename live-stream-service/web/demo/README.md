# WebRTC Live Stream Demo

Demo pages để test WebRTC streaming qua SRS server.

## Pages

| Page | URL | Mô tả |
|------|-----|-------|
| Full Demo | `/demo/index.html` | Publisher + Player trong 1 trang |
| Player Only | `/demo/player.html` | Chỉ player cho viewers |

## Yêu cầu

1. **HTTPS** - Browser chặn camera/mic trên HTTP
2. **SRS Server** đang chạy với WebRTC enabled
3. **Firewall** mở ports: UDP 8000, TCP 1985

## Cách sử dụng

### 1. Publisher (Streamer)

```
https://your-domain.com/demo/index.html
```

1. Nhập **Server IP** (public IP của SRS server)
2. Nhập **User ID (UUID)** để gọi API create (header `X-User-ID`)
3. Click **Create Stream** để nhận:
   - **Stream ID (NanoID)**: public, dùng để play
   - **Stream Key**: secret token, dùng để publish (WHIP/RTMP/WebRTC publish)
4. Click **Start Streaming**
5. Cho phép camera/mic access

### 2. Player (Viewer)

```
https://your-domain.com/demo/player.html?server=IP&id=STREAM_ID&autoplay=1
```

Query params:
- `server` - SRS server IP
- `id` - Stream ID (NanoID)
- `autoplay` - Tự động play khi load

## Test Local (Development)

Vì cần HTTPS, có thể dùng một trong các cách:

### Option 1: localhost (Chrome cho phép)
```bash
# Serve static files
npx serve web/demo -p 3000

# Mở http://localhost:3000
```

### Option 2: ngrok tunnel
```bash
ngrok http 3000
# Dùng HTTPS URL từ ngrok
```

### Option 3: Self-signed cert
```bash
# Tạo cert
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem

# Serve với HTTPS
npx serve web/demo -p 3000 --ssl-cert cert.pem --ssl-key key.pem
```

## Troubleshooting

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| Camera blocked | HTTP không phải HTTPS | Dùng HTTPS hoặc localhost |
| WHIP/WHEP failed | SRS không chạy hoặc sai IP | Kiểm tra SRS container, firewall |
| ICE failed | NAT/Firewall chặn UDP | Mở port 8000/udp, cần TURN server |
| No video | Stream chưa publish | Kiểm tra publisher đang stream |

## WebRTC URLs Format

```
# Play URL (SRS native) - public
webrtc://SERVER_IP/live/STREAM_ID

# Publish URL (SRS native) - requires token
webrtc://SERVER_IP/live/STREAM_ID?token=STREAM_KEY

# WHIP (HTTP publish)
POST https://API_DOMAIN/rtc/v1/whip/?app=live&stream=STREAM_ID&token=STREAM_KEY

# WHEP (HTTP play)
POST https://API_DOMAIN/rtc/v1/whep/?app=live&stream=STREAM_ID
```
