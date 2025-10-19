CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(512),
  birth_date DATE,
  gender VARCHAR(20),
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
