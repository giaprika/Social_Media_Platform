-- Seed Communities and Members
-- Run this on the community-service database

-- Insert sample communities
INSERT INTO communities (id, name, slug, description, owner_id, visibility, join_type, category, tags, rules, member_count)
VALUES 
  ('c0000001-0000-4000-8000-000000000001', 'Web Development', 'webdev', 
   'A community for web developers to discuss frontend, backend, and full-stack development. Share your projects, ask questions, and learn from each other!', 
   'fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'public', 'open', 'Technology',
   ARRAY['javascript', 'react', 'nodejs', 'css', 'html'],
   '[{"title": "Be respectful", "description": "Treat others with respect."}, {"title": "Stay on topic", "description": "Keep discussions related to web development."}]'::jsonb,
   5),
   
  ('c0000002-0000-4000-8000-000000000002', 'Gaming Hub', 'gaming',
   'The ultimate gaming community! Discuss your favorite games, share strategies, find teammates.',
   'a1b2c3d4-3333-4000-8000-000000000003', 'public', 'open', 'Gaming',
   ARRAY['games', 'esports', 'pc', 'console'],
   '[{"title": "No spoilers", "description": "Use spoiler tags for new game content."}]'::jsonb,
   4),

  ('c0000003-0000-4000-8000-000000000003', 'Data Science', 'datascience',
   'Explore the world of data science, machine learning, and AI.',
   'a1b2c3d4-6666-4000-8000-000000000006', 'public', 'open', 'Technology',
   ARRAY['python', 'machinelearning', 'ai', 'statistics'],
   '[{"title": "Share knowledge", "description": "Help others learn and grow."}]'::jsonb,
   4),

  ('c0000004-0000-4000-8000-000000000004', 'Photography', 'photography',
   'A space for photographers of all levels. Share your shots, get feedback.',
   'a1b2c3d4-4444-4000-8000-000000000004', 'public', 'open', 'Art',
   ARRAY['photos', 'camera', 'editing', 'landscape'],
   '[{"title": "Original content only", "description": "Only share photos you have taken."}]'::jsonb,
   3),

  ('c0000005-0000-4000-8000-000000000005', 'Fitness & Health', 'fitness',
   'Your journey to a healthier life starts here! Share workout routines and nutrition tips.',
   'a1b2c3d4-9999-4000-8000-000000000009', 'public', 'open', 'Sports',
   ARRAY['workout', 'nutrition', 'gym', 'running'],
   '[{"title": "Safety first", "description": "Consult professionals for medical advice."}]'::jsonb,
   3),

  ('c0000006-0000-4000-8000-000000000006', 'Music Production', 'musicproduction',
   'For music producers and audio engineers. Share your tracks and discuss DAWs!',
   'a1b2c3d4-2222-4000-8000-000000000002', 'public', 'open', 'Music',
   ARRAY['production', 'daw', 'mixing', 'beats'],
   '[{"title": "Credit collaborators", "description": "Always give credit."}]'::jsonb,
   3),

  ('c0000007-0000-4000-8000-000000000007', 'Book Club', 'bookclub',
   'A community for book lovers! Share reviews and recommendations.',
   'a1b2c3d4-1111-4000-8000-000000000001', 'public', 'open', 'Books',
   ARRAY['reading', 'books', 'literature', 'fiction'],
   '[{"title": "Use spoiler tags", "description": "Warn before discussing plot points."}]'::jsonb,
   3),

  ('c0000008-0000-4000-8000-000000000008', 'Startup Founders', 'startups',
   'Connect with fellow entrepreneurs! Share experiences and get advice.',
   'a1b2c3d4-5555-4000-8000-000000000005', 'public', 'approval', 'Business',
   ARRAY['entrepreneurship', 'business', 'funding', 'growth'],
   '[{"title": "No spam", "description": "Share value, not just your product."}]'::jsonb,
   3)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags;

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

-- Add sample members
INSERT INTO community_members (community_id, user_id, role, status)
VALUES 
  -- Web Development
  ('c0000001-0000-4000-8000-000000000001', 'a1b2c3d4-1111-4000-8000-000000000001', 'member', 'approved'),
  ('c0000001-0000-4000-8000-000000000001', 'a1b2c3d4-5555-4000-8000-000000000005', 'member', 'approved'),
  ('c0000001-0000-4000-8000-000000000001', 'a1b2c3d4-8888-4000-8000-000000000008', 'member', 'approved'),
  ('c0000001-0000-4000-8000-000000000001', 'a1b2c3d4-9999-4000-8000-000000000009', 'member', 'approved'),
  -- Gaming
  ('c0000002-0000-4000-8000-000000000002', 'fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'member', 'approved'),
  ('c0000002-0000-4000-8000-000000000002', 'a1b2c3d4-1111-4000-8000-000000000001', 'member', 'approved'),
  ('c0000002-0000-4000-8000-000000000002', 'a1b2c3d4-7777-4000-8000-000000000007', 'member', 'approved'),
  -- Data Science
  ('c0000003-0000-4000-8000-000000000003', 'a1b2c3d4-1111-4000-8000-000000000001', 'member', 'approved'),
  ('c0000003-0000-4000-8000-000000000003', 'a1b2c3d4-5555-4000-8000-000000000005', 'member', 'approved'),
  ('c0000003-0000-4000-8000-000000000003', 'a1b2c3d4-7777-4000-8000-000000000007', 'member', 'approved'),
  -- Photography
  ('c0000004-0000-4000-8000-000000000004', 'a1b2c3d4-2222-4000-8000-000000000002', 'member', 'approved'),
  ('c0000004-0000-4000-8000-000000000004', 'a1b2c3d4-aaaa-4000-8000-000000000010', 'member', 'approved'),
  -- Fitness
  ('c0000005-0000-4000-8000-000000000005', 'a1b2c3d4-3333-4000-8000-000000000003', 'member', 'approved'),
  ('c0000005-0000-4000-8000-000000000005', 'a1b2c3d4-4444-4000-8000-000000000004', 'member', 'approved'),
  -- Music
  ('c0000006-0000-4000-8000-000000000006', 'fa0fe1b0-7b9b-4351-a5e0-5ba54ece736e', 'member', 'approved'),
  ('c0000006-0000-4000-8000-000000000006', 'a1b2c3d4-aaaa-4000-8000-000000000010', 'member', 'approved'),
  -- Book Club
  ('c0000007-0000-4000-8000-000000000007', 'a1b2c3d4-2222-4000-8000-000000000002', 'member', 'approved'),
  ('c0000007-0000-4000-8000-000000000007', 'a1b2c3d4-6666-4000-8000-000000000006', 'member', 'approved'),
  -- Startups
  ('c0000008-0000-4000-8000-000000000008', 'fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e', 'member', 'approved'),
  ('c0000008-0000-4000-8000-000000000008', 'a1b2c3d4-7777-4000-8000-000000000007', 'member', 'approved')
ON CONFLICT (community_id, user_id) DO NOTHING;

SELECT 'Communities seeded: ' || count(*) FROM communities;
SELECT 'Members seeded: ' || count(*) FROM community_members;
