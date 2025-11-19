import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import useAuth from "src/hooks/useAuth";
import { useToast } from "src/components/ui";
import ProfileHeader from "src/components/profile/ProfileHeader";
import ProfileTabs from "src/components/profile/ProfileTabs";
import ProfileContent from "src/components/profile/ProfileContent";
import ProfileSidebar from "src/components/profile/ProfileSidebar";

export default function Profile() {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const toast = useToast();
  
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  
  // Determine if viewing own profile
  const isOwnProfile = !userId || userId === currentUser?.id;
  
  // Mock user data
  const profileUser = {
    id: currentUser?.id || "1",
    username: currentUser?.username || "socialuser",
    displayName: currentUser?.displayName || currentUser?.fullName || "SocialUser",
    avatar: currentUser?.avatar,
    bio: "Passionate about technology, design, and coffee ☕",
  };

  const stats = {
    followers: 0,
    karma: 1,
    contributions: 0,
    redditAge: new Date(2024, 0, 15),
    goldEarned: 0,
    activeIn: 0,
  };

  useEffect(() => {
    // Load posts based on active tab
    setLoading(true);
    setTimeout(() => {
      setPosts([]); // Empty for now
      setLoading(false);
    }, 500);
  }, [activeTab, userId]);

  const handleUpvote = (postId) => {
    // TODO: Implement
  };

  const handleDownvote = (postId) => {
    // TODO: Implement
  };

  const handleComment = (postId) => {
    // TODO: Implement
  };

  const handleShare = (postId) => {
    toast.success("Đã sao chép link!");
  };

  const handleSave = (postId) => {
    // TODO: Implement
  };

  const handleAuthorClick = (authorId) => {
    // TODO: Navigate to author profile
  };

  const handleFollow = (authorId, shouldFollow) => {
    toast.success(shouldFollow ? "Đã follow!" : "Đã unfollow!");
  };

  const handleCommunityClick = (community) => {
    toast.info(`Navigating to s/${community}`);
  };

  return (
    <div className="bg-background">
      {/* Profile Header và Tabs - Gắn liền với nhau */}
      <div className="bg-card">
        {/* Profile Header - Scroll với content */}
        <div className="border-b border-border">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <ProfileHeader user={profileUser} isOwnProfile={isOwnProfile} />
          </div>
        </div>

        {/* Profile Tabs - Sticky ngay dưới global header khi scroll */}
        <div className="sticky top-16 lg:top-20 z-30 border-b border-border bg-card">
          <div className="max-w-5xl mx-auto px-6">
            <ProfileTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>
      </div>

      {/* Content Area with Sidebar */}
      <div className="flex gap-6 bg-background max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <ProfileContent
            activeTab={activeTab}
            posts={posts}
            loading={loading}
            onUpvote={handleUpvote}
            onDownvote={handleDownvote}
            onComment={handleComment}
            onShare={handleShare}
            onSave={handleSave}
            onAuthorClick={handleAuthorClick}
            onFollow={handleFollow}
            onCommunityClick={handleCommunityClick}
          />
        </div>

        {/* Profile Sidebar - Thống kê user, achievements, settings */}
        <div className="hidden xl:block w-80 flex-shrink-0 py-4 pr-6">
          <div className="sticky top-24">
            <ProfileSidebar user={profileUser} stats={stats} />
          </div>
        </div>
      </div>
    </div>
  );
}
