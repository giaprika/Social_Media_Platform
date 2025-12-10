## 📅 TUẦN 3: GCS Mount & HLS Delivery

**Mục tiêu:** Mount Google Cloud Storage, enable HLS output, CDN integration

| # | Tên Task | Mô tả tóm tắt | Priority | Estimated Time |
|---|----------|---------------|----------|----------------|
| 1 | **GCS Bucket Setup** | Tạo bucket `live-hls-bucket` region asia-southeast1. Public read permission. Lifecycle: delete >1 day | 🔴 Critical | 1.5h |
| 2 | **gcsfuse Installation** | Script install gcsfuse trên VM/container. Mount bucket vào `/mnt/live_data`. **⚠️ Warning:** Network filesystem có thể gây I/O blocking với fragment nhỏ | 🔴 Critical | 2h |
| 3 | **SRS HLS Config** | Update `srs.conf`: enable HLS, hls_path=/mnt/live_data, fragment=5s (an toàn với gcsfuse), window=60s, cleanup=on. **Có thể** giảm xuống fragment=2s sau khi test | 🔴 Critical | 2h |
| 4 | **Docker Volume Mount** | Mount `/mnt/live_data` vào SRS container để write .m3u8/.ts files | 🔴 High | 1.5h |
| 5 | **CDN Setup** | Configure Cloud CDN với backend bucket. SSL certificate. Custom domain | 🔴 High | 3h |
| 6 | **Playback URL Constructor** | Implement helper: `https://{CDN_DOMAIN}/live/{stream_key}.m3u8` | 🟡 Medium | 1h |
| 7 | **HLS File Verification** | Test script: verify .m3u8/.ts files xuất hiện trong GCS bucket sau khi stream. Check nội dung .m3u8: relative/absolute paths | 🔴 High | 2h |
| 8 | **CORS Configuration** | Configure GCS bucket CORS cho phép browser fetch HLS segments. **Critical:** Quên bước này → Video.js báo lỗi Access-Control-Allow-Origin | 🔴 High | 1h |
| 9 | **Integration Test - Playback** | Test: Push RTMP → wait 10s → fetch CDN .m3u8 → verify segments playable | 🔴 Critical | 3h |
| 10 | **Cleanup Job** | Implement background job xóa ended sessions' files từ GCS (hoặc rely on lifecycle) | 🟡 Medium | 2h |

**Estimated Total Time:** 19-20 giờ (~3-4 ngày)

### ✅ Acceptance Criteria
- [ ] GCS bucket public readable, lifecycle rule configured
- [ ] gcsfuse mount thành công, SRS write files vào /mnt/live_data
- [ ] HLS files (.m3u8 + .ts) xuất hiện trong bucket khi stream
- [ ] CDN serve .m3u8 file qua HTTPS với custom domain
- [ ] Video playable trong browser (video.js hoặc hls.js)
- [ ] CORS headers allow cross-origin requests
- [ ] Integration test: RTMP push → HLS playback working