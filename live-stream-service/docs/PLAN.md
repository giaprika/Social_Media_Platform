# Implementation Plan: Live Streaming Service

**Tech Stack:** Go 1.21+ | Gin | PostgreSQL | SRS 5 | Google Cloud Storage + CDN | RTMP + WebRTC + HLS

---

## 📊 Timeline Summary

| Phase | Duration | Key Deliverable | Status |
|-------|----------|----------------|--------|
| Tuần 1 | 3 ngày | Core APIs + DB | ⬜ |
| Tuần 2 | 3-4 ngày | SRS + Webhooks | ⬜ |
| Tuần 3 | 3-4 ngày | GCS + HLS + CDN | ⬜ |
| Tuần 4 | 4 ngày | WebRTC + optimization | ⬜ |
| Tuần 5 | 4 ngày | Monitoring + security | ⬜ |
| Tuần 6 | 4 ngày | Production deployment | ⬜ |
| **Total** | **~6 tuần** | **Production ready** | ⬜ |

---

## 🎯 Definition of Done

### **Functional:**
- ✅ Create stream API trả về RTMP URL + HLS playback URL
- ✅ RTMP push từ OBS → on_publish webhook → status=LIVE
- ✅ WebRTC publish từ browser hoạt động
- ✅ HLS playback qua CDN với latency <15s
- ✅ Stop stream → on_unpublish → status=ENDED

### **Non-Functional:**
- ✅ Support 50+ concurrent streams
- ✅ API P95 latency <100ms
- ✅ HLS segments available within 10s sau khi start stream
- ✅ 99.9% uptime trong 7 ngày staging

### **Deliverables:**
- [ ] `live-service` (Go binary)
- [ ] SRS container với config
- [ ] Deployment scripts + documentation
- [ ] API documentation (OpenAPI)
- [ ] Monitoring dashboard + alerts
- [ ] Runbook

---

## 🚨 Critical Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| gcsfuse I/O blocking với fragment nhỏ | High | **Phương án A:** SRS ghi `/tmp/hls` (local SSD) + worker upload async GCS. **Phương án B:** gcsfuse cache mode `--stat-cache-ttl 1m` + fragment=4-5s. Monitor SRS logs cho write blocking |
| SRS webhook timeout during deployment | High | Graceful deployment hoặc chấp nhận ~10s downtime khi deploy. Monitor webhook error rate |
| WebRTC camera access blocked | Critical | **RESOLVED:** SSL setup moved to Tuần 4 before WebRTC testing. Use ngrok for local dev |
| WebRTC NAT traversal failures | Critical | **RESOLVED:** TURN server (coturn) now Critical priority. Test từ 4G/corporate wifi |
| CDN cache serving stale .m3u8 | Medium | Cache invalidation script added. Short cache TTL (30s) |
| Concurrent stream limit | High | Load test Tuần 4, vertical scale VM, plan sharding |
| Chi phí cloud tăng đột biến (DDoS/traffic spike) | Critical | **Budget Alert** setup Tuần 5. Email notification khi vượt ngưỡng. Rate limiting + CDN DDoS protection |
| WebRTC URL format sai → Client không connect được | High | **API trả đúng format:** `webrtc://{IP_SERVER}/live/{stream_key}`. Test với SRS SDK trước khi deploy |

---

## 👥 Team Structure

**1-person:** 6 tuần full-time
**2-person:**
- Engineer 1: API + Webhooks + DB (Tuần 1-2)
- Engineer 2: SRS + GCS + CDN (Tuần 3-4)
- Both: Testing + deployment (Tuần 5-6)

---

## 📚 Key References

- [SRS Documentation](https://ossrs.io/lts/en-us/)
- [SRS HTTP Callback API](https://ossrs.io/lts/en-us/docs/v5/doc/http-callback)
- [gcsfuse Guide](https://cloud.google.com/storage/docs/gcsfuse-quickstart-mount-bucket)
- [Google Cloud CDN](https://cloud.google.com/cdn/docs)
- [HLS Specification](https://datatracker.ietf.org/doc/html/rfc8216)