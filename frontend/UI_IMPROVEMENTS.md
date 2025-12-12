# 🎨 Cải Tiến UI - Lấy Cảm Hứng Từ Slothit

## Tổng Quan

Đã implement 7 tính năng UI mới dựa trên phân tích UI của Slothit và Reddit để cải thiện trải nghiệm người dùng của SocialApp.

## ✨ Tính Năng Đã Implement

### 1. 📱 Recent Posts Sidebar (Bên Phải)

**File:** `frontend/src/components/layout/RecentPostsSidebar.jsx`

- Hiển thị 10 bài post gần đây nhất
- Có thumbnail preview cho posts có ảnh
- Show community tags (s/community)
- Responsive: chỉ hiển thị trên màn hình ≥ 1280px (xl breakpoint)
- Tự động cập nhật khi user tương tác với posts

**Cách sử dụng:**
```jsx
<RecentPostsSidebar 
  posts={recentPosts} 
  onClear={() => setRecentPosts([])} 
/>
```

### 2. 👥 Follow Button Trên PostCard

**Cải tiến trong:** `frontend/src/components/post/PostCard.jsx`

- Nút Follow/Following xuất hiện trực tiếp trên mỗi post
- Không cần vào profile để follow
- UI thay đổi khi đã follow:
  - **Follow**: Background primary, icon "+"
  - **Following**: Background muted, icon "✓"
- Giảm friction trong UX

### 3. 🔗 Link Preview Component

**File:** `frontend/src/components/ui/LinkPreview.jsx`

- Tự động preview URL trong posts
- Hiển thị title, description, domain
- 2 modes: `compact` (inline) và `full` (với ảnh)
- Fallback graceful khi không fetch được preview
- Tự động extract domain từ URL

**Props:**
- `url`: string (required)
- `compact`: boolean (mặc định: false)

### 4. ⬆️⬇️ Upvote/Downvote System

**Thay thế hệ thống Like cũ trong PostCard**

- **Voting bên trái**: Như Reddit/Slothit
- Upvote: Mũi tên lên (màu primary khi active)
- Downvote: Mũi tên xuống (màu destructive khi active)
- Hiển thị net votes (upvotes - downvotes)
- Logic: Upvote tự động remove downvote và ngược lại
- Format: "+1234" cho số dương, "-45" cho số âm

**Data structure:**
```javascript
{
  upvotes: 1234,
  downvotes: 45,
  hasUpvoted: false,
  hasDownvoted: false
}
```

### 5. 🏷️ Community Tags

**Hiển thị trong PostCard header**

- Format: `s/community_name` (giống Reddit r/subreddit)
- Clickable để navigate đến community
- Màu primary để nổi bật
- Ví dụ: s/nature, s/webdev, s/technology

**Data structure:**
```javascript
{
  community: "nature" // string
}
```

### 6. 🌓 Light/Dark Mode Toggle (Thực Tế)

**Files:**
- `frontend/src/contexts/ThemeContext.jsx` - Context provider
- `frontend/src/contexts/index.js` - Export barrel file
- Integrated vào `Header.jsx`

**Tính năng:**
- Toggle trong Profile Menu (Header)
- Lưu preference vào localStorage
- Tự động detect system preference lần đầu
- Toggle animation smooth
- Icon thay đổi: 🌙 (Dark) / ☀️ (Light)

**Cách sử dụng:**
```jsx
import { useTheme } from "src/contexts/ThemeContext";

const { isDark, toggleTheme } = useTheme();
```

### 7. 🎨 Cải Thiện Post Card Layout

**Layout mới theo style Slothit:**

```
┌─────────────────────────────────────┐
│ ↑  s/community • Author • 2h ago    │
│123                        [Follow+] │
│ ↓  Title của post                   │
│                                     │
│    Content...                       │
│    Link Preview (nếu có)            │
│    Images (nếu có)                  │
│                                     │
│    [💬 Comments] [↗ Share] [🔖 Save]│
└─────────────────────────────────────┘
```

**Cải tiến:**
- Vote section bên trái (vertical)
- Community tag prominent ở đầu
- Follow button ở góc phải header
- Actions dạng pills rounded với hover states
- Better spacing và typography

## 🎯 So Sánh Trước/Sau

| Tính năng | Trước | Sau |
|-----------|-------|-----|
| Layout | 2 cột | 3 cột (sidebar + feed + recent) |
| Voting | ❤️ Like only | ⬆️⬇️ Upvote/Downvote |
| Follow | Profile only | Trực tiếp trên post |
| Community | Không có | s/community tags |
| Links | Plain text | Rich preview |
| Theme | Dark only | Dark + Light |
| Recent Posts | Không có | Sidebar bên phải |

## 🚀 Cách Sử Dụng

### Setup ThemeProvider

Đã được integrate vào `frontend/src/index.js`:

```jsx
<ThemeProvider>
  <AuthProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </AuthProvider>
</ThemeProvider>
```

### Sử Dụng PostCard Mới

```jsx
<PostCard
  post={post}
  onUpvote={handleUpvote}
  onDownvote={handleDownvote}
  onComment={handleComment}
  onShare={handleShare}
  onSave={handleSave}
  onAuthorClick={handleAuthorClick}
  onFollow={handleFollow}
  onCommunityClick={handleCommunityClick}
/>
```

### Data Structure Cho Posts

```javascript
{
  id: "1",
  author: { id: "1", name: "John Doe", avatar: null },
  community: "nature", // NEW
  title: "Amazing sunset!",
  content: "Post content...",
  url: "https://example.com/link", // NEW (optional)
  upvotes: 1234, // NEW (thay likes)
  downvotes: 45, // NEW
  comments: 89,
  hasUpvoted: false, // NEW
  hasDownvoted: false, // NEW
  saved: false,
  isFollowing: false, // NEW
  createdAt: "2025-11-18T10:00:00Z",
  images: []
}
```

## 📱 Responsive Design

- **Mobile (< 640px)**: 
  - Hidden: Recent Posts Sidebar
  - Visible: Main feed, voting vẫn bên trái
  
- **Tablet (640px - 1279px)**:
  - Hidden: Recent Posts Sidebar
  - Visible: Main feed với left sidebar toggle
  
- **Desktop (≥ 1280px)**:
  - Visible: Tất cả 3 cột (left sidebar + feed + recent posts)
  - Layout: `lg:ml-72 xl:mr-80`

## 🎨 Design Tokens

### Colors
- **Primary**: Votes, community tags, links
- **Destructive**: Downvotes
- **Muted**: Secondary text, backgrounds
- **Card**: Post backgrounds

### Spacing
- Posts: `space-y-4`
- Vote section: `gap-1` (vertical)
- Actions: `gap-2` (horizontal)

## 🔧 Technical Details

### State Management

**DefaultLayout** quản lý:
- `recentPosts`: Array of 10 posts gần nhất
- `addRecentPost(post)`: Function để thêm post vào recent

**Feed** quản lý:
- Voting state (upvote/downvote logic)
- Follow state
- Save state

### Performance

- Link preview có debounce/lazy loading
- Recent posts limit 10 items
- Images có error handling
- Skeleton loaders cho loading states

## 🐛 Known Issues & Future Improvements

### Cần Implement Sau
1. **Community Pages**: Route `/community/:name`
2. **Real Link Preview API**: Integration với linkpreview.net hoặc og-scraper
3. **Sort by Votes**: Sort posts theo net votes
4. **Vote Animation**: Thêm animation khi vote
5. **Recent Posts Auto-update**: Real-time updates
6. **Infinite Scroll**: Cho feed và recent posts

### API Integration Needed
```javascript
// Cần thêm endpoints:
POST /api/posts/:id/upvote
POST /api/posts/:id/downvote
POST /api/users/:id/follow
POST /api/users/:id/unfollow
GET /api/link-preview?url=...
```

## 📚 Dependencies

Không cần thêm dependencies mới! Tất cả sử dụng:
- React hooks
- react-router-dom
- heroicons
- clsx
- date-fns

## 🎉 Kết Luận

Đã implement thành công 7 tính năng UI mới lấy cảm hứng từ Slothit:
- ✅ Recent Posts Sidebar
- ✅ Follow Button on Posts
- ✅ Link Preview
- ✅ Upvote/Downvote System
- ✅ Community Tags
- ✅ Light/Dark Mode Toggle
- ✅ Improved Post Card Layout

UI giờ đã hiện đại, professional và tương tự với các platform thành công như Reddit và Slothit! 🚀

