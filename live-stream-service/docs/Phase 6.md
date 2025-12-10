## 📅 TUẦN 6: Production Deployment

**Mục tiêu:** Deploy lên Google Cloud, documentation, handover

| # | Tên Task | Mô tả tóm tắt | Priority | Estimated Time |
|---|----------|---------------|----------|----------------|
| 1 | **Compute Engine Setup** | Provision VM: Ubuntu 22.04, n2-standard-4 (4vCPU, 16GB RAM). Public IP, firewall rules | 🔴 Critical | 2h |
| 2 | **Deployment Script** | Bash script: install Docker, gcsfuse, pull SRS image, mount GCS, run containers | 🔴 Critical | 3h |
| 3 | **Environment Variables** | Setup .env file: DB credentials, SRS IPs, CDN domain. Use Secret Manager | 🔴 High | 1.5h |
| 4 | **DNS Configuration** | Point domains: api.myapp.com → VM IP, cdn.myapp.com → Cloud CDN | 🟡 Medium | 1h |
| 5 | **Auto-restart Service** | Configure `docker restart: always` cho SRS container + Go app. Simpler than systemd | 🔴 High | 1h |
| 6 | **CDN Cache Clearing Script** | Script invalidate Cloud CDN cache (clear stale .m3u8 files after testing). Prevent F5 vô tận | 🟡 Medium | 1.5h |
| 7 | **Backup Strategy** | Setup automated PostgreSQL backups. GCS versioning/retention policy | 🟡 Medium | 2h |
| 8 | **Deployment Documentation** | Step-by-step deploy guide: VM setup, GCS mount, SRS config, troubleshooting | 🔴 High | 2.5h |
| 9 | **API Documentation** | OpenAPI spec với examples. Postman collection cho all endpoints | 🟢 Low | 2h |
| 10 | **Runbook** | Common issues: SRS không start, gcsfuse unmount, webhook timeout, **ổ cứng đầy do gcsfuse lag**. Resolution steps | 🔴 High | 2.5h |
| 11 | **Load Test Production** | Run load test trên production VM: 30 concurrent streams, 1h duration | 🔴 Critical | 3h |
| 12 | **Smoke Tests** | Verify: API health, RTMP publish, WebRTC publish, HLS playback, webhooks | 🔴 Critical | 2h |

**Estimated Total Time:** 24-25 giờ (~4 ngày)

### ✅ Acceptance Criteria
- [ ] Service deployed trên Google Cloud VM successfully
- [ ] HTTPS endpoints accessible với valid SSL cert
- [ ] DNS resolve correctly cho API và CDN domains
- [ ] Auto-restart hoạt động khi service crash
- [ ] Deployment guide tested by junior dev
- [ ] API documentation complete với examples
- [ ] Production load test pass: 30 streams stable 1h
- [ ] Smoke tests pass tất cả flows