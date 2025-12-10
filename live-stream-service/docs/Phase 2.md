## 📅 TUẦN 2: SRS Integration & Webhooks

**Mục tiêu:** Setup SRS container, implement webhook callbacks, xác thực stream

| # | Tên Task | Mô tả tóm tắt | Priority | Estimated Time |
|---|----------|---------------|----------|----------------|
| 1 | **Docker Compose - SRS** | Setup SRS container (ossrs/srs:5) với ports: 1935 (RTMP), 8000 (WebRTC), 8080 (HTTP). Mount volume cho config | 🔴 Critical | 2h |
| 2 | **SRS Config File** | Tạo `srs.conf` theo SRS spec: enable RTMP, WebRTC, http_hooks. Point callbacks đến Go service. **Chú ý:** Cú pháp rất nhạy cảm, test kỹ http_hooks section | 🔴 Critical | 2.5h |
| 3 | **Webhook - On Publish** | POST `/api/v1/callbacks/on_publish`: Parse stream_key → validate DB → update status=LIVE + started_at → return 200/403 | 🔴 Critical | 3h |
| 4 | **Webhook - On Unpublish** | POST `/api/v1/callbacks/on_unpublish`: Find session → update status=ENDED + ended_at → return 200 | 🔴 Critical | 2h |
| 5 | **IP Whitelist Middleware** | Validate webhook requests chỉ từ SRS server IP. Reject unauthorized IPs | 🔴 High | 1.5h |
| 6 | **RTMP URL Construction** | Implement helper build RTMP URL: `rtmp://{SRS_IP}:1935/live/{stream_key}` | 🟡 Medium | 1h |
| 7 | **SRS Health Check** | Implement probe SRS HTTP API (`/api/v1/versions`) để check server alive | 🟡 Medium | 1h |
| 8 | **Integration Test - RTMP** | Test: Create stream → push RTMP với ffmpeg → verify on_publish called → status=LIVE | 🔴 Critical | 3h |
| 9 | **Integration Test - Stop Stream** | Test: Stop RTMP push → verify on_unpublish called → status=ENDED | 🔴 High | 2h |
| 10 | **Error Handling** | Handle webhook errors: invalid stream_key, duplicate publish, network timeout | 🔴 High | 2h |

**Estimated Total Time:** 20-21 giờ (~3-4 ngày)

### ✅ Acceptance Criteria
- [ ] SRS container chạy, accept RTMP connections port 1935
- [ ] Webhook on_publish validate stream_key thành công
- [ ] Valid stream_key → return 200 → SRS allow publish
- [ ] Invalid stream_key → return 403 → SRS reject stream
- [ ] on_unpublish update status=ENDED correctly
- [ ] IP whitelist block unauthorized webhook calls
- [ ] Integration test pass: ffmpeg push RTMP → database updated