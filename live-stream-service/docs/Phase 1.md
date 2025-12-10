## 📅 TUẦN 1: Foundation & Core APIs

**Mục tiêu:** Setup project structure, database, và basic CRUD APIs

| # | Tên Task | Mô tả tóm tắt | Priority | Estimated Time |
|---|----------|---------------|----------|----------------|
| 1 | **Project Structure** | Setup Go project với Gin framework. Structure: `cmd/`, `internal/` (config, entity, repository, handler), `pkg/` | 🔴 High | 2h |
| 2 | **Database Schema** | Tạo PostgreSQL schema `live_sessions` table theo SRS. Migrations với golang-migrate | 🔴 Critical | 2h |
| 3 | **Config Management** | Viper config loader: DB connection (với connection pool: max_open_conns, max_idle_conns), SRS URLs, GCS bucket name, CDN domain, Budget Alert setup | 🔴 High | 2h |
| 4 | **Entity & Repository** | Define `LiveSession` struct + enum `Status`. Implement CRUD repository với sqlx/pgx | 🔴 High | 2.5h |
| 5 | **Stream Key Generator** | Implement secure random key generator (`crypto/rand`). Format: `live_u{userID}_{randomHex}` (prefix để dễ identify) | 🔴 High | 1h |
| 6 | **API - Create Stream** | POST `/api/v1/live/create`: Validate auth → generate stream_key → insert DB → construct URLs → response | 🔴 Critical | 3h |
| 7 | **API - List Streams** | GET `/api/v1/live/feed`: Query `status='LIVE'` → join user info (mock/stub) → pagination | 🔴 High | 2h |
| 8 | **API - Get Stream Detail** | GET `/api/v1/live/:id`: Fetch single session by ID. Auth check (owner/public) | 🟡 Medium | 1.5h |
| 9 | **Auth Middleware** | JWT token validation (stub/mock GetUserFromToken helper). Extract user_id vào context. Chuẩn bị interface cho auth-service integration | 🔴 High | 1.5h |
| 10 | **Unit Tests - Repository** | Test CRUD operations với testcontainers PostgreSQL. Coverage >80% | 🟡 Medium | 2h |

**Estimated Total Time:** 19.5-20.5 giờ (~3 ngày)

### ✅ Acceptance Criteria
- [ ] PostgreSQL schema migrate thành công
- [ ] POST /api/v1/live/create tạo session, trả về stream_key + URLs
- [ ] GET /api/v1/live/feed list sessions với status=LIVE
- [ ] Stream key unique và secure (min 32 chars entropy)
- [ ] Auth middleware validate token
- [ ] Unit tests pass