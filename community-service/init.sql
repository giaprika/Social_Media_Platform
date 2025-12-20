-- ============================================
-- Community Service Database Schema
-- ============================================

-- Communities table
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL, -- URL-friendly name (e.g., "programming", "gaming")
  description TEXT,
  avatar_url VARCHAR(512),
  banner_url VARCHAR(512),
  owner_id UUID NOT NULL, -- References users(id) in user-service
  
  -- Settings
  visibility VARCHAR(20) NOT NULL DEFAULT 'public', -- public, private
  join_type VARCHAR(20) NOT NULL DEFAULT 'open', -- open, approval, invite_only
  post_permissions VARCHAR(20) NOT NULL DEFAULT 'all', -- all, approved_only, moderators_only
  
  -- Metadata
  tags TEXT[], -- Array of tags
  category VARCHAR(100), -- Technology, Gaming, Art, etc.
  rules JSONB, -- Array of rules [{title: "...", description: "..."}]
  settings JSONB, -- Additional settings {allow_images: true, min_karma: 0}
  
  -- Stats (cached, updated via triggers or service)
  member_count INT DEFAULT 0,
  post_count INT DEFAULT 0,
  active_member_count INT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Community memberships
CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'moderator', 'member');
CREATE TYPE membership_status AS ENUM ('pending', 'approved', 'rejected', 'banned');

CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- References users(id) in user-service
  role membership_role NOT NULL DEFAULT 'member',
  status membership_status NOT NULL DEFAULT 'pending',
  
  -- Metadata
  flair TEXT, -- User flair in this community (e.g., "Expert", "Newbie")
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID, -- References users(id)
  invited_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(community_id, user_id)
);

-- Pinned posts (reference to posts in post-service)
CREATE TABLE IF NOT EXISTS community_pinned_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  post_id VARCHAR(255) NOT NULL, -- Reference to post_id in post-service
  pinned_by UUID NOT NULL, -- References users(id)
  pinned_at TIMESTAMPTZ DEFAULT NOW(),
  order_index INT DEFAULT 0, -- For ordering multiple pinned posts
  
  UNIQUE(community_id, post_id)
);

-- Community invitations
CREATE TABLE IF NOT EXISTS community_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL, -- References users(id)
  invitee_id UUID, -- References users(id), NULL if inviting by email
  invitee_email VARCHAR(255), -- If inviting by email (before user signs up)
  token VARCHAR(255) UNIQUE NOT NULL, -- Invitation token for email invites
  status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, expired, revoked
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure either invitee_id or invitee_email is set
  CHECK (invitee_id IS NOT NULL OR invitee_email IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities(slug);
CREATE INDEX IF NOT EXISTS idx_communities_owner ON communities(owner_id);
CREATE INDEX IF NOT EXISTS idx_communities_visibility ON communities(visibility);
CREATE INDEX IF NOT EXISTS idx_communities_category ON communities(category);
CREATE INDEX IF NOT EXISTS idx_communities_tags ON communities USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_communities_created ON communities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communities_member_count ON communities(member_count DESC);

CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_community_members_status ON community_members(status);
CREATE INDEX IF NOT EXISTS idx_community_members_role ON community_members(role);
CREATE INDEX IF NOT EXISTS idx_community_members_joined ON community_members(joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_pinned_posts_community ON community_pinned_posts(community_id);
CREATE INDEX IF NOT EXISTS idx_pinned_posts_order ON community_pinned_posts(community_id, order_index);

CREATE INDEX IF NOT EXISTS idx_invitations_community ON community_invitations(community_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON community_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON community_invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_invitee ON community_invitations(invitee_id) WHERE invitee_id IS NOT NULL;

-- Functions to update member_count automatically
CREATE OR REPLACE FUNCTION update_community_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'approved' THEN
    UPDATE communities 
    SET member_count = member_count + 1,
        active_member_count = active_member_count + 1
    WHERE id = NEW.community_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If status changed from non-approved to approved
    IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
      UPDATE communities 
      SET member_count = member_count + 1,
          active_member_count = active_member_count + 1
      WHERE id = NEW.community_id;
    -- If status changed from approved to non-approved
    ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      UPDATE communities 
      SET member_count = GREATEST(member_count - 1, 0),
          active_member_count = GREATEST(active_member_count - 1, 0)
      WHERE id = NEW.community_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'approved' THEN
    UPDATE communities 
    SET member_count = GREATEST(member_count - 1, 0),
        active_member_count = GREATEST(active_member_count - 1, 0)
    WHERE id = OLD.community_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update member_count
DROP TRIGGER IF EXISTS trigger_update_member_count ON community_members;
CREATE TRIGGER trigger_update_member_count
  AFTER INSERT OR UPDATE OR DELETE ON community_members
  FOR EACH ROW EXECUTE FUNCTION update_community_member_count();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_communities_updated_at ON communities;
CREATE TRIGGER trigger_update_communities_updated_at
  BEFORE UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: Sample Communities
-- ============================================
-- Using testuser as owner: fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e

INSERT INTO communities (id, name, slug, description, owner_id, visibility, join_type, category, tags, rules, member_count)
VALUES 
  ('c0000001-0000-4000-8000-000000000001', 'Web Development', 'webdev', 
   'A community for web developers to discuss frontend, backend, and full-stack development. Share your projects, ask questions, and learn from each other!', 
   'fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'public', 'open', 'Technology',
   ARRAY['javascript', 'react', 'nodejs', 'css', 'html'],
   '[{"title": "Be respectful", "description": "Treat others with respect. No harassment or hate speech."}, {"title": "Stay on topic", "description": "Keep discussions related to web development."}]'::jsonb,
   1),
   
  ('c0000002-0000-4000-8000-000000000002', 'Gaming Hub', 'gaming',
   'The ultimate gaming community! Discuss your favorite games, share strategies, find teammates, and stay updated on gaming news.',
   'a1b2c3d4-3333-4000-8000-000000000003', 'public', 'open', 'Gaming',
   ARRAY['games', 'esports', 'pc', 'console', 'mobile'],
   '[{"title": "No spoilers without warning", "description": "Use spoiler tags for new game content."}, {"title": "Be a good sport", "description": "No toxic behavior or cheating discussions."}]'::jsonb,
   1),

  ('c0000003-0000-4000-8000-000000000003', 'Data Science', 'datascience',
   'Explore the world of data science, machine learning, and AI. Share tutorials, discuss algorithms, and collaborate on projects.',
   'a1b2c3d4-6666-4000-8000-000000000006', 'public', 'open', 'Technology',
   ARRAY['python', 'machinelearning', 'ai', 'statistics', 'bigdata'],
   '[{"title": "Share knowledge", "description": "Help others learn and grow."}, {"title": "Cite your sources", "description": "Link to papers and resources when possible."}]'::jsonb,
   1),

  ('c0000004-0000-4000-8000-000000000004', 'Photography', 'photography',
   'A space for photographers of all levels. Share your shots, get feedback, discuss techniques, and find inspiration.',
   'a1b2c3d4-4444-4000-8000-000000000004', 'public', 'open', 'Art',
   ARRAY['photos', 'camera', 'editing', 'landscape', 'portrait'],
   '[{"title": "Original content only", "description": "Only share photos you have taken yourself."}, {"title": "Constructive feedback", "description": "Be helpful and encouraging when critiquing."}]'::jsonb,
   1),

  ('c0000005-0000-4000-8000-000000000005', 'Fitness & Health', 'fitness',
   'Your journey to a healthier life starts here! Share workout routines, nutrition tips, and motivation.',
   'a1b2c3d4-9999-4000-8000-000000000009', 'public', 'open', 'Sports',
   ARRAY['workout', 'nutrition', 'gym', 'running', 'wellness'],
   '[{"title": "Safety first", "description": "Dont give medical advice. Consult professionals."}, {"title": "Be supportive", "description": "Encourage others on their fitness journey."}]'::jsonb,
   1),

  ('c0000006-0000-4000-8000-000000000006', 'Music Production', 'musicproduction',
   'For music producers, singers, and audio engineers. Share your tracks, discuss DAWs, and collaborate!',
   'a1b2c3d4-2222-4000-8000-000000000002', 'public', 'open', 'Music',
   ARRAY['production', 'daw', 'mixing', 'beats', 'audio'],
   '[{"title": "Credit collaborators", "description": "Always give credit when sharing collaborative work."}, {"title": "Constructive criticism", "description": "Be helpful when giving feedback on tracks."}]'::jsonb,
   1),

  ('c0000007-0000-4000-8000-000000000007', 'Book Club', 'bookclub',
   'A community for book lovers! Share reviews, recommendations, and discuss your current reads.',
   'a1b2c3d4-1111-4000-8000-000000000001', 'public', 'open', 'Books',
   ARRAY['reading', 'books', 'literature', 'fiction', 'nonfiction'],
   '[{"title": "Use spoiler tags", "description": "Warn before discussing plot points."}, {"title": "Respect opinions", "description": "Everyone has different tastes in books."}]'::jsonb,
   1),

  ('c0000008-0000-4000-8000-000000000008', 'Startup Founders', 'startups',
   'Connect with fellow entrepreneurs! Share experiences, get advice, and discuss the startup journey.',
   'a1b2c3d4-5555-4000-8000-000000000005', 'public', 'approval', 'Business',
   ARRAY['entrepreneurship', 'business', 'funding', 'growth', 'tech'],
   '[{"title": "No spam or self-promotion", "description": "Share value, not just your product."}, {"title": "Confidentiality", "description": "Respect others private business information."}]'::jsonb,
   1)
ON CONFLICT (slug) DO NOTHING;

-- Add owners as members
INSERT INTO community_members (community_id, user_id, role, status)
VALUES 
  ('c0000001-0000-4000-8000-000000000001', 'fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'owner', 'approved'),
  ('c0000002-0000-4000-8000-000000000002', 'a1b2c3d4-3333-4000-8000-000000000003', 'owner', 'approved'),
  ('c0000003-0000-4000-8000-000000000003', 'a1b2c3d4-6666-4000-8000-000000000006', 'owner', 'approved'),
  ('c0000004-0000-4000-8000-000000000004', 'a1b2c3d4-4444-4000-8000-000000000004', 'owner', 'approved'),
  ('c0000005-0000-4000-8000-000000000005', 'a1b2c3d4-9999-4000-8000-000000000009', 'owner', 'approved'),
  ('c0000006-0000-4000-8000-000000000006', 'a1b2c3d4-2222-4000-8000-000000000002', 'owner', 'approved'),
  ('c0000007-0000-4000-8000-000000000007', 'a1b2c3d4-1111-4000-8000-000000000001', 'owner', 'approved'),
  ('c0000008-0000-4000-8000-000000000008', 'a1b2c3d4-5555-4000-8000-000000000005', 'owner', 'approved')
ON CONFLICT (community_id, user_id) DO NOTHING;

-- Add sample members to communities
INSERT INTO community_members (community_id, user_id, role, status)
VALUES 
  -- Web Development members
  ('c0000001-0000-4000-8000-000000000001', 'a1b2c3d4-1111-4000-8000-000000000001', 'member', 'approved'),
  ('c0000001-0000-4000-8000-000000000001', 'a1b2c3d4-5555-4000-8000-000000000005', 'member', 'approved'),
  ('c0000001-0000-4000-8000-000000000001', 'a1b2c3d4-8888-4000-8000-000000000008', 'member', 'approved'),
  ('c0000001-0000-4000-8000-000000000001', 'a1b2c3d4-9999-4000-8000-000000000009', 'member', 'approved'),
  
  -- Gaming Hub members
  ('c0000002-0000-4000-8000-000000000002', 'fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'member', 'approved'),
  ('c0000002-0000-4000-8000-000000000002', 'a1b2c3d4-1111-4000-8000-000000000001', 'member', 'approved'),
  ('c0000002-0000-4000-8000-000000000002', 'a1b2c3d4-7777-4000-8000-000000000007', 'member', 'approved'),
  
  -- Data Science members
  ('c0000003-0000-4000-8000-000000000003', 'a1b2c3d4-1111-4000-8000-000000000001', 'member', 'approved'),
  ('c0000003-0000-4000-8000-000000000003', 'a1b2c3d4-5555-4000-8000-000000000005', 'member', 'approved'),
  ('c0000003-0000-4000-8000-000000000003', 'a1b2c3d4-7777-4000-8000-000000000007', 'member', 'approved'),
  
  -- Photography members
  ('c0000004-0000-4000-8000-000000000004', 'a1b2c3d4-2222-4000-8000-000000000002', 'member', 'approved'),
  ('c0000004-0000-4000-8000-000000000004', 'a1b2c3d4-aaaa-4000-8000-000000000010', 'member', 'approved'),
  
  -- Fitness members
  ('c0000005-0000-4000-8000-000000000005', 'a1b2c3d4-3333-4000-8000-000000000003', 'member', 'approved'),
  ('c0000005-0000-4000-8000-000000000005', 'a1b2c3d4-4444-4000-8000-000000000004', 'member', 'approved'),
  
  -- Music Production members
  ('c0000006-0000-4000-8000-000000000006', 'fa0fe1b0-7b9b-4351-a5e0-5ba54ece736e', 'member', 'approved'),
  ('c0000006-0000-4000-8000-000000000006', 'a1b2c3d4-aaaa-4000-8000-000000000010', 'member', 'approved'),
  
  -- Book Club members
  ('c0000007-0000-4000-8000-000000000007', 'a1b2c3d4-2222-4000-8000-000000000002', 'member', 'approved'),
  ('c0000007-0000-4000-8000-000000000007', 'a1b2c3d4-6666-4000-8000-000000000006', 'member', 'approved'),
  
  -- Startups members
  ('c0000008-0000-4000-8000-000000000008', 'fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'member', 'approved'),
  ('c0000008-0000-4000-8000-000000000008', 'a1b2c3d4-7777-4000-8000-000000000007', 'member', 'approved')
ON CONFLICT (community_id, user_id) DO NOTHING;
