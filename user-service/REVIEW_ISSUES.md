# User Service - Code Review Issues

## 🔴 Critical Issues

### 1. Security - Missing Authentication Middleware
**File**: `src/routes/user.routes.js`
- Routes `/me`, `DELETE /:id`, `searchUsers` should require authentication
- Currently anyone can delete users or access private data

### 2. Security - Error Stack Exposure
**File**: `app.js` (line 46)
- Production error handler exposes `err.stack`
- Should only show stack in development

### 3. Security - No Input Validation
**Files**: All controllers
- Missing email format validation
- Missing password strength validation
- Missing required field validation
- SQL injection risk (though using parameterized queries)

### 4. Logic Bug - validateUser Response
**File**: `src/controllers/user.controller.js` (line 26-35)
- When email doesn't exist, no response is sent (hangs)
- Should return 200 with `{ exists: false }` or similar

## 🟡 Medium Priority Issues

### 5. Code Quality - Typo
**File**: `src/routes/user.routes.js` (line 9)
- Route name `logining` should be `login`

### 6. Performance - Missing Pagination
**File**: `src/services/user.service.js` (line 82-87)
- `searchUsersByName` can return unlimited results
- Should add limit/offset pagination

### 7. Database - Missing Indexes
**File**: `init.sql`
- Should add indexes:
  - `CREATE INDEX idx_users_email ON users(email);`
  - `CREATE INDEX idx_relationships_user_target ON relationships(user_id, target_id);`
  - `CREATE INDEX idx_relationships_type_status ON relationships(type, status);`

### 8. Error Handling - Inconsistent Messages
- Mix of Vietnamese and English error messages
- Should standardize to one language or use error codes

### 9. Configuration - Hardcoded CORS
**File**: `app.js` (line 12)
- CORS origin hardcoded to `http://localhost:3000`
- Should use environment variable

## 🟢 Low Priority / Improvements

### 10. Code Cleanup
**File**: `app.js` (line 18)
- Remove commented code: `// app.use(cors());`

### 11. Logging
- Add structured logging for important operations
- Log authentication attempts, user creation, deletions

### 12. Relationship Logic
**File**: `src/services/relationships.service.js`
- Block logic (line 69-86) is complex and may have edge cases
- Consider adding validation that users exist before creating relationships

### 13. Database Connection
**File**: `src/config/database.js`
- Add connection retry logic
- Add connection pool monitoring

### 14. API Consistency
- Some endpoints return different response formats
- Standardize response structure (e.g., `{ success, data, error }`)

