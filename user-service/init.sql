CREATE TYPE user_status AS ENUM ('active', 'banned', 'suspended');

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  hashed_password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(512),
  birth_date DATE,
  gender VARCHAR(20),
  status user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP,
  metadata JSONB
);

CREATE TABLE auth_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  token VARCHAR(1024) NOT NULL,
  created_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP,
  is_revoked BOOLEAN
);

CREATE TYPE relationship_type AS ENUM ('friend', 'follow', 'block');

CREATE TYPE relationship_status AS ENUM ('pending', 'accepted');

CREATE TABLE relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  target_id UUID NOT NULL REFERENCES users(id),
  type relationship_type NOT NULL,
  status relationship_status NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SEED DATA: Test User
-- ============================================
-- Test Account for Development:
-- Email: test@socialapp.com
-- Password: Test123456
-- ============================================
INSERT INTO users (id, email, hashed_password, full_name, birth_date, gender, status, created_at, metadata)
VALUES (
  'fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e',
  'test@socialapp.com',
  '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya',
  'Test User',
  '1990-01-01',
  'other',
  'active',
  CURRENT_TIMESTAMP,
  '{"is_test_user": true}'::jsonb
)
ON CONFLICT (email) DO NOTHING;
