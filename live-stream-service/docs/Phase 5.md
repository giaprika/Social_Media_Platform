## 📅 TUẦN 5: Monitoring, Security & Testing

**Mục tiêu:** Production-grade monitoring, security hardening, comprehensive testing

| # | Tên Task | Mô tả tóm tắt | Priority | Estimated Time |
|---|----------|---------------|----------|----------------|
| 1 | **Budget Alert Setup** | Configure Google Cloud Budget Alert: email notification khi chi phí vượt ngưỡng (ví dụ: $50/tháng). Phòng DDoS/traffic spike | 🔴 Critical | 0.5h |
| 2 | **Prometheus Metrics** | Metrics: active_streams, webhook_calls_total, stream_duration_seconds, api_latency | 🔴 High | 2.5h |
| 3 | **Grafana Dashboard** | Dashboard: active streams count, bandwidth usage, API latency, error rates | 🔴 High | 2h |
| 4 | **SRS Stats Integration** | Poll SRS HTTP API `/api/v1/streams` để sync active streams. Update DB nếu mismatch | 🟡 Medium | 3h |
| 5 | **Alert Rules** | Alerts: SRS down, webhook failures >5/min, high CPU/bandwidth, no active stream cleanup, budget exceeded | 🔴 High | 2h |
| 6 | **Rate Limiting** | Implement rate limit: create stream max 5/user/day, API global 100 req/s | 🔴 High | 2h |
| 7 | **Input Validation** | Sanitize title, validate stream_key format, SQL injection prevention | 🔴 Critical | 2h |
| 8 | **Security Audit** | Review: webhook IP whitelist, token validation, GCS permissions, secrets management | 🔴 Critical | 2h |
| 9 | **E2E Test Suite** | Test scenarios: create → publish RTMP → playback HLS → end stream. WebRTC variant | 🔴 Critical | 4h |
| 10 | **Chaos Testing** | Test: SRS crash mid-stream, GCS mount fail, DB connection loss. Verify recovery | 🟡 Medium | 3h |
| 11 | **Performance Baseline** | Document: max concurrent streams, bandwidth per stream, CPU/RAM usage patterns | 🟡 Medium | 2h |

**Estimated Total Time:** 24.5-25.5 giờ (~4 ngày)

### ✅ Acceptance Criteria
- [ ] Prometheus metrics scrape successfully
- [ ] Grafana dashboard display real-time stats
- [ ] Alerts fire correctly when trigger conditions met
- [ ] Rate limiting block excessive requests
- [ ] Security audit pass: no hardcoded secrets, input validated
- [ ] E2E tests pass cho RTMP + WebRTC flows
- [ ] Chaos tests: service recover từ failures
- [ ] Performance baseline documented