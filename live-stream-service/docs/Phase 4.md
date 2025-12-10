## 📅 TUẦN 4: WebRTC Support & Optimization

**Mục tiêu:** Enable WebRTC ingest từ browser, optimize latency

| # | Tên Task | Mô tả tóm tắt | Priority | Estimated Time |
|---|----------|---------------|----------|----------------|
| 1 | **SSL/TLS Certificate** | Configure Let's Encrypt SSL cho API domain. HTTPS endpoints. **Critical:** Browsers block Camera/Mic without HTTPS | 🔴 Critical | 2h |
| 2 | **SRS WebRTC Config** | Enable `rtc_server` trong srs.conf. Configure CANDIDATE với public IP | 🔴 Critical | 2h |
| 3 | **WebRTC Ports** | Open UDP port 8000, TCP 1985. Configure firewall rules | 🔴 High | 1h |
| 4 | **API - Get WebRTC URL** | Endpoint GET `/api/v1/live/:id/webrtc`: Return WebRTC publish URL đúng format SRS: `webrtc://{IP_SERVER}/live/{stream_key}` | 🔴 High | 2h |
| 5 | **Browser Client Demo** | Simple HTML page với WebRTC API publish stream qua SRS (PoC). Requires HTTPS | 🟡 Medium | 3h |
| 6 | **STUN/TURN Config** | Configure STUN server (Google STUN). **Deploy Coturn TURN server** cho NAT traversal. **Critical:** 4G/5G/corporate wifi cần TURN | 🔴 Critical | 4h |
| 7 | **HLS Optimization** | Tune HLS settings: test fragment=2s (lower latency). **Warning:** Monitor SRS logs cho write blocking với gcsfuse | 🟡 Medium | 2h |
| 8 | **Transcoding Config** | (Optional) Configure SRS transcoding multiple bitrates (240p/480p/720p) | 🟢 Low | 3h |
| 9 | **~~Connection Pooling~~** | ~~Optimize PostgreSQL connection pool (max_connections, idle_timeout)~~ **→ Moved to Tuần 1 Task 3** | ~~🟡 Medium~~ | ~~1h~~ |
| 10 | **WebRTC Integration Test** | Test: Browser publish WebRTC (HTTPS) → verify on_publish → HLS playable | 🔴 Critical | 3h |
| 11 | **Load Test - Concurrent Streams** | Test 50 concurrent RTMP streams. Measure CPU/memory/bandwidth usage | 🔴 High | 3h |

**Estimated Total Time:** 25-26 giờ (~4-5 ngày)

### ✅ Acceptance Criteria
- [ ] HTTPS/SSL configured (moved from Tuần 6)
- [ ] Browser Camera/Mic accessible với HTTPS page
- [ ] SRS container chạy, accept RTMP connections port 1935
- [ ] WebRTC publish từ browser thành công
- [ ] on_publish webhook trigger cho cả RTMP và WebRTC
- [ ] STUN/TURN hoạt động, NAT traversal OK (test từ 4G/wifi công ty)
- [ ] HLS latency < 15s với fragment=2-5s (tùy theo gcsfuse performance)
- [ ] Load test: 50 streams concurrent, server stable
- [ ] Transcoding (nếu enable) output multiple qualities