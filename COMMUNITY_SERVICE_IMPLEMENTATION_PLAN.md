# Community Service Implementation Plan

## 📋 Tổng quan

### Mục tiêu
Tích hợp hoàn chỉnh Community Service vào hệ thống Social Media Platform, bao gồm:
- Backend: Community Service đã có sẵn (Node.js/Express + PostgreSQL)
- Gateway: Đã cấu hình proxy tới Community Service
- Frontend: Cần xây dựng UI cho Communities

### Trạng thái hiện tại

| Component | Trạng thái | Ghi chú |
|-----------|------------|---------|
| **Database Schema** | ✅ Hoàn thành | `community-service/init.sql` - có communities, community_members, community_invitations, community_pinned_posts |
| **Community Service** | ✅ Hoàn thành | Port 8004, có đầy đủ routes cho communities và memberships |
| **Backend Gateway** | ✅ Hoàn thành | Proxy `/api/service/community` → community-service |
| **Frontend API** | ✅ Hoàn thành | `frontend/src/api/community.js` - đầy đủ các API functions |
| **Frontend UI** | ❌ Chưa có | Cần xây dựng pages và components |
| **Docker** | ✅ Hoàn thành | Đã có postgres-community và community-service trong docker-compose |

---

## 🏗️ Phase 1: Backend Verification & Enhancements ✅ COMPLETED

### 1.1 Kiểm tra và test Community Service APIs ✅
**Hoàn thành: 2025-12-10**

- [x] Start community-service và postgres-community (Docker)
- [x] Test tất cả endpoints:
  - `POST /communities` - Tạo community ✅
  - `GET /communities/:id` - Lấy thông tin community ✅
  - `GET /communities/slug/:slug` - Lấy community theo slug ✅
  - `PATCH /communities/:id` - Cập nhật community ✅
  - `DELETE /communities/:id` - Xóa community ✅
  - `GET /communities/:id/members` - Lấy danh sách thành viên ✅
  - `POST /communities/:id/members` - Tham gia community ✅
  - `DELETE /communities/:id/members/me` - Rời community ✅
  - `GET /users/me/communities` - Lấy communities của user ✅
- [x] Verify database triggers (member_count update)
- [x] Kiểm tra x-user-id header được truyền đúng

### 1.2 Bổ sung API endpoints - Discovery APIs ✅
**Hoàn thành: 2025-12-10**

#### Community Discovery APIs (ĐÃ THÊM) ✅
```javascript
// GET /communities - Lấy danh sách communities với filters
// Query params: category, sort (popular, newest, alphabetical), page, limit
router.get("/", CommunityController.getCommunities); ✅

// GET /communities/search - Tìm kiếm communities
// Query params: q (query string), category, page, limit
router.get("/search", CommunityController.searchCommunities); ✅

// GET /communities/categories - Lấy danh sách categories
router.get("/categories", CommunityController.getCategories); ✅
```

**Files đã cập nhật:**
- `community-service/src/repositories/community.repository.js` - Added findAll, search, getCategories
- `community-service/src/services/community.service.js` - Added getCommunities, searchCommunities, getCategories
- `community-service/src/controllers/community.controller.js` - Added controller methods
- `community-service/src/routes/community.routes.js` - Added new routes
- `frontend/src/api/community.js` - Added getCommunities, searchCommunities, getCategories
- `backend-gateway/src/config/index.js` - Added public endpoints to excludeList

#### Community Settings APIs (Tùy chọn - Phase 5)
```javascript
// PATCH /communities/:id/settings - Cập nhật settings riêng
router.patch("/:id/settings", CommunityController.updateSettings);

// POST /communities/:id/rules - Thêm rule
router.post("/:id/rules", CommunityController.addRule);

// DELETE /communities/:id/rules/:ruleIndex - Xóa rule
router.delete("/:id/rules/:ruleIndex", CommunityController.removeRule);
```

#### Moderation APIs (Tùy chọn - Phase 5)
```javascript
// GET /communities/:id/pending-members - Lấy members đang chờ duyệt
router.get("/:id/pending-members", MembershipController.getPendingMembers);

// POST /communities/:id/members/:userId/approve - Duyệt member
router.post("/:id/members/:userId/approve", MembershipController.approveMember);

// POST /communities/:id/members/:userId/ban - Ban member
router.post("/:id/members/:userId/ban", MembershipController.banMember);
```

---

## 🎨 Phase 2: Frontend - Pages & Routes ✅ COMPLETED

### 2.1 Cấu trúc thư mục Frontend ✅
**Hoàn thành: 2025-12-10**

```
frontend/src/
├── pages/
│   └── community/
│       ├── CommunitiesExplore.jsx  ✅ Trang khám phá communities
│       ├── CommunityPage.jsx       ✅ Layout chính của community
│       ├── CommunityFeed.jsx       ✅ Trang bài viết (placeholder)
│       ├── CommunityAbout.jsx      ✅ Thông tin, rules
│       ├── CommunityMembers.jsx    ✅ Danh sách thành viên
│       ├── CommunityCreate.jsx     ✅ Tạo community mới
│       └── index.js                ✅ Export file
│
├── constants/
│   └── paths.js                    ✅ Thêm community paths
│
└── routes/
    └── authed.js                   ✅ Thêm community routes
```

**Components được tích hợp vào pages:**
- `CommunityCard` - trong CommunitiesExplore.jsx
- `CommunityHeader` - trong CommunityPage.jsx  
- `CommunitySidebar` - trong CommunityPage.jsx
- `MemberCard` - trong CommunityMembers.jsx
- `RoleBadge` - trong CommunityMembers.jsx

### 2.2 Routes Setup ✅
**Hoàn thành: 2025-12-10**

```jsx
// Đã thêm vào routes/authed.js
// Protected routes (yêu cầu đăng nhập)
{ path: PATHS.COMMUNITIES, element: <CommunitiesExplore /> }      // /app/communities
{ path: PATHS.COMMUNITY_CREATE, element: <CommunityCreate /> }    // /app/communities/create

// Community detail routes (có thể xem không cần đăng nhập)
<Route path="/c/:slug" element={<CommunityPage />}>
  <Route index element={<CommunityFeed />} />
  <Route path="about" element={<CommunityAbout />} />
  <Route path="members" element={<CommunityMembers />} />
</Route>
```

**Paths đã thêm (constants/paths.js):**
- `COMMUNITIES: "/app/communities"`
- `COMMUNITY_CREATE: "/app/communities/create"`
- `COMMUNITY_DETAIL: "/c/:slug"`

---

## 🖼️ Phase 3: Frontend - Core Components ✅ COMPLETED

### 3.1 CommunityContext.jsx ✅
**Hoàn thành: 2025-12-10**

Đã tạo `src/contexts/CommunityContext.jsx` với đầy đủ chức năng:
- **State Management**: currentCommunity, currentMembership, members, myCommunities, discoveredCommunities, categories
- **Loading States**: isLoadingCommunity, isLoadingMyCommunities, isLoadingDiscovery
- **Role Checks**: isOwner, isAdmin, isModerator, isMember
- **Actions**: loadCommunity, loadMembers, loadMyCommunities, loadCommunities, loadCategories, searchCommunities, joinCommunity, leaveCommunity, updateCommunity, createCommunity, deleteCommunity

Đã thêm `CommunityProvider` vào `src/index.js`

### 3.2 CommunitiesExplore.jsx ✅
**Đã hoàn thành từ Phase 2**

Features đã implement:
- ✅ Grid/List view các communities
- ✅ Filter theo category
- ✅ Search communities
- ✅ Sort: Popular, Newest, Alphabetical
- ✅ Pagination
- ✅ "My Communities" section

### 3.3 CommunityHeader.jsx ✅
**Đã hoàn thành từ Phase 2** (Tích hợp trong CommunityPage.jsx)

Features đã implement:
- ✅ Banner image
- ✅ Avatar
- ✅ Community name & description
- ✅ Member count
- ✅ Join/Leave button
- ✅ Settings button (cho owner/admin)
- ✅ Share button
- ✅ Navigation tabs (Bài viết, Giới thiệu, Thành viên)

### 3.4 CommunityFeed.jsx ✅
**Đã hoàn thành từ Phase 2**

- ✅ Layout với sidebar (rules, about)
- ✅ Create post box (placeholder)
- ⏳ Integration với Post Service (Phase 4)

### 3.5 CommunitySettings.jsx ✅
**Hoàn thành: 2025-12-10**

Đã tạo `src/pages/community/CommunitySettings.jsx` với các tabs:
1. **General** ✅: Name, description, category, avatar URL, banner URL
2. **Privacy** ✅: Visibility (public/private), Join type (open/approval/invite), Post permissions
3. **Rules** ✅: Add/Edit/Remove rules với title và description
4. **Members** ✅: Danh sách thành viên, approve/reject pending, ban/unban
5. **Danger Zone** ✅: Delete community với confirm dialog

### 3.6 Navigation Update ✅
- Đã thêm "Explore Communities" link vào Sidebar
- Route `/c/:slug/settings` đã được thêm

---

## 🔗 Phase 4: Integration với các Services khác

### 4.1 Post Service Integration
**Thời gian ước tính: 1.5 ngày**

**Backend Changes (post-service):**
- Thêm field `community_id` vào posts table
- Filter posts theo `community_id`
- Validate user là member của community trước khi post

**Frontend Changes:**
- Create post form chọn community (optional)
- Hiển thị community badge trên post
- Link đến community từ post

### 4.2 User Service Integration
**Thời gian ước tính: 0.5 ngày**

- Fetch user info cho members list
- Profile page hiển thị "Communities" section
- Enrich member data với avatar, full_name

### 4.3 Notification Service Integration
**Thời gian ước tính: 1 ngày**

**Notifications cần tạo:**
- `community.invitation` - Được mời vào community
- `community.join_request` - Có người xin tham gia
- `community.role_changed` - Được thăng/giáng role
- `community.mentioned` - Được mention trong community

---

## 🚀 Phase 5: Advanced Features

### 5.1 Community Search & Discovery
**Thời gian ước tính: 1 ngày**

- Full-text search communities
- Recommendations dựa trên joined communities
- Trending communities

### 5.2 Moderation Tools
**Thời gian ước tính: 2 ngày**

- Mod queue cho pending posts
- Ban/mute users
- Auto-moderation rules
- Mod log

### 5.3 Community Analytics (Optional)
**Thời gian ước tính: 1.5 ngày**

- Member growth chart
- Post activity
- Active hours
- Top contributors

---

## 📅 Timeline Tổng hợp

| Phase | Mô tả | Thời gian | Dependencies |
|-------|-------|-----------|--------------|
| **Phase 1** | Backend Verification & Enhancements | 3 ngày | - |
| **Phase 2** | Frontend Pages & Routes Setup | 1 ngày | Phase 1 |
| **Phase 3** | Core Components | 6.5 ngày | Phase 2 |
| **Phase 4** | Service Integration | 3 ngày | Phase 3 |
| **Phase 5** | Advanced Features | 4.5 ngày | Phase 4 |

**Tổng thời gian: ~18 ngày (khoảng 3.5 tuần)**

---

## 🎯 Implementation Priority

### MVP (Minimum Viable Product) - Week 1-2
1. ✅ Backend verification
2. CommunitiesExplore page
3. CommunityFeed page
4. CommunityHeader component
5. Join/Leave functionality
6. Create community

### Enhancement - Week 3
1. Community settings
2. Member management
3. Moderation tools
4. Post integration

### Polish - Week 4+
1. Search & discovery
2. Analytics
3. UI/UX improvements
4. Performance optimization

---

## 🧪 Testing Checklist

### Backend Tests
- [ ] Create community
- [ ] Get community by ID/slug
- [ ] Update community (owner only)
- [ ] Delete community (owner only)
- [ ] Join community (open)
- [ ] Join community (approval required)
- [ ] Leave community
- [ ] Approve/Reject member
- [ ] Ban/Unban member
- [ ] Invite user
- [ ] Accept invitation

### Frontend Tests
- [ ] Communities page loads
- [ ] Search works
- [ ] Filter by category works
- [ ] Join button works
- [ ] Community page loads
- [ ] Posts display correctly
- [ ] Create post in community
- [ ] Settings save correctly
- [ ] Responsive design

---

## 📝 Notes

### Naming Convention
- URL: `/c/:slug` (như Reddit: r/programming)
- API: `/api/service/community/communities`
- Database: `communities`, `community_members`

### Security Considerations
- Verify user membership before allowing actions
- Rate limit join requests
- Validate owner/admin for settings changes
- Sanitize community names and descriptions

### Performance Considerations
- Cache community info (Redis)
- Pagination for members list
- Lazy load community posts
- CDN for avatar/banner images
