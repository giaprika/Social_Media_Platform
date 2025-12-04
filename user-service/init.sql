-- ============================================
-- DROP EXISTING TABLES AND TYPES
-- ============================================
DROP TABLE IF EXISTS relationships CASCADE;
DROP TABLE IF EXISTS auth_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS relationship_status;
DROP TYPE IF EXISTS relationship_type;
DROP TYPE IF EXISTS user_status;

-- ============================================
-- CREATE TYPES
-- ============================================
CREATE TYPE user_status AS ENUM ('active', 'banned', 'suspended');
CREATE TYPE relationship_type AS ENUM ('friend', 'follow', 'block');
CREATE TYPE relationship_status AS ENUM ('pending', 'accepted');

-- ============================================
-- CREATE TABLES
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
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
INSERT INTO users (id, username, email, hashed_password, full_name, birth_date, gender, status, created_at, metadata)
VALUES (
  'fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e',
  'testuser',
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

INSERT INTO users (id, username, email, hashed_password, full_name, birth_date, gender, status, created_at, metadata)
VALUES (
  'fa0fe1b0-7b9b-4351-a5e0-5ba54ece736e',
  'binh39',
  'binh39@gmail.com',
  '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya',
  'Binh Nguyen',
  '1990-01-01',
  'male',
  'active',
  CURRENT_TIMESTAMP,
  '{"is_test_user": true}'::jsonb
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, username, email, hashed_password, full_name, birth_date, gender, status, created_at, metadata)
VALUES (
  'fa0fe1b0-7b9b-4351-a5e0-5ba54ece746e',
  'mchienn',
  'nmc27705@gmail.com',
  '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya',
  'Minh Chien',
  '1990-01-01',
  'male',
  'active',
  CURRENT_TIMESTAMP,
  '{"is_test_user": true}'::jsonb
)
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- SEED DATA: 10 Sample Users
-- ============================================
-- All passwords: Password123
-- Hash: $2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya
-- ============================================

INSERT INTO users (id, username, email, hashed_password, full_name, avatar_url, birth_date, gender, status, created_at, metadata)
VALUES 
  ('a1b2c3d4-1111-4000-8000-000000000001', 'johndoe', 'john.doe@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'John Doe', NULL, '1995-03-15', 'male', 'active', CURRENT_TIMESTAMP - INTERVAL '30 days', '{"bio": "Software developer passionate about web technologies"}'::jsonb),
  
  ('a1b2c3d4-2222-4000-8000-000000000002', 'janesmith', 'jane.smith@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'Jane Smith', NULL, '1992-07-22', 'female', 'active', CURRENT_TIMESTAMP - INTERVAL '25 days', '{"bio": "UX Designer | Coffee lover | Cat mom"}'::jsonb),
  
  ('a1b2c3d4-3333-4000-8000-000000000003', 'mike_nguyen', 'mike.nguyen@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'Mike Nguyen', NULL, '1998-11-08', 'male', 'active', CURRENT_TIMESTAMP - INTERVAL '20 days', '{"bio": "Tech enthusiast and gamer"}'::jsonb),
  
  ('a1b2c3d4-4444-4000-8000-000000000004', 'sarah_lee', 'sarah.lee@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'Sarah Lee', NULL, '1997-05-30', 'female', 'active', CURRENT_TIMESTAMP - INTERVAL '18 days', '{"bio": "Photography | Travel | Food"}'::jsonb),
  
  ('a1b2c3d4-5555-4000-8000-000000000005', 'alex_tran', 'alex.tran@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'Alex Tran', NULL, '1994-09-12', 'other', 'active', CURRENT_TIMESTAMP - INTERVAL '15 days', '{"bio": "Full-stack developer | Open source contributor"}'::jsonb),
  
  ('a1b2c3d4-6666-4000-8000-000000000006', 'emily_wang', 'emily.wang@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'Emily Wang', NULL, '1996-02-28', 'female', 'active', CURRENT_TIMESTAMP - INTERVAL '12 days', '{"bio": "Data scientist | AI enthusiast"}'::jsonb),
  
  ('a1b2c3d4-7777-4000-8000-000000000007', 'david_kim', 'david.kim@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'David Kim', NULL, '1993-12-05', 'male', 'active', CURRENT_TIMESTAMP - INTERVAL '10 days', '{"bio": "DevOps engineer | Cloud architect"}'::jsonb),
  
  ('a1b2c3d4-8888-4000-8000-000000000008', 'lisa_pham', 'lisa.pham@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'Lisa Pham', NULL, '1999-08-18', 'female', 'active', CURRENT_TIMESTAMP - INTERVAL '7 days', '{"bio": "Frontend developer | React lover"}'::jsonb),
  
  ('a1b2c3d4-9999-4000-8000-000000000009', 'ryan_hoang', 'ryan.hoang@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'Ryan Hoang', NULL, '1991-04-25', 'male', 'active', CURRENT_TIMESTAMP - INTERVAL '5 days', '{"bio": "Backend developer | Node.js expert"}'::jsonb),
  
  ('a1b2c3d4-aaaa-4000-8000-000000000010', 'anna_le', 'anna.le@example.com', '$2b$10$ofSJ0SbMoblFbRimT/XoA.y.VJHSLjpUhiHyw3R50rOpdoq2iCOya', 'Anna Le', NULL, '2000-01-10', 'female', 'active', CURRENT_TIMESTAMP - INTERVAL '2 days', '{"bio": "Mobile developer | Flutter fan"}'::jsonb)

ON CONFLICT (email) DO NOTHING;

-- ============================================
-- SEED DATA: Sample Relationships (Followers)
-- ============================================
INSERT INTO relationships (user_id, target_id, type, status)
VALUES
  -- John follows Jane, Mike, Sarah
  ('a1b2c3d4-1111-4000-8000-000000000001', 'a1b2c3d4-2222-4000-8000-000000000002', 'follow', 'accepted'),
  ('a1b2c3d4-1111-4000-8000-000000000001', 'a1b2c3d4-3333-4000-8000-000000000003', 'follow', 'accepted'),
  ('a1b2c3d4-1111-4000-8000-000000000001', 'a1b2c3d4-4444-4000-8000-000000000004', 'follow', 'accepted'),
  
  -- Jane follows John, Alex, Emily
  ('a1b2c3d4-2222-4000-8000-000000000002', 'a1b2c3d4-1111-4000-8000-000000000001', 'follow', 'accepted'),
  ('a1b2c3d4-2222-4000-8000-000000000002', 'a1b2c3d4-5555-4000-8000-000000000005', 'follow', 'accepted'),
  ('a1b2c3d4-2222-4000-8000-000000000002', 'a1b2c3d4-6666-4000-8000-000000000006', 'follow', 'accepted'),
  
  -- Mike follows John, David, Ryan
  ('a1b2c3d4-3333-4000-8000-000000000003', 'a1b2c3d4-1111-4000-8000-000000000001', 'follow', 'accepted'),
  ('a1b2c3d4-3333-4000-8000-000000000003', 'a1b2c3d4-7777-4000-8000-000000000007', 'follow', 'accepted'),
  ('a1b2c3d4-3333-4000-8000-000000000003', 'a1b2c3d4-9999-4000-8000-000000000009', 'follow', 'accepted'),
  
  -- Test user follows some users
  ('fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'a1b2c3d4-1111-4000-8000-000000000001', 'follow', 'accepted'),
  ('fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'a1b2c3d4-2222-4000-8000-000000000002', 'follow', 'accepted'),
  ('fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'a1b2c3d4-5555-4000-8000-000000000005', 'follow', 'accepted')

ON CONFLICT DO NOTHING;

