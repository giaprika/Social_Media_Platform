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

