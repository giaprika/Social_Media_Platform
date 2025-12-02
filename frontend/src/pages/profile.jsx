import { useState, useEffect, useCallback } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import useAuth from "src/hooks/useAuth";
import { useToast } from "src/components/ui";
import ProfileHeader from "src/components/profile/ProfileHeader";
import ProfileTabs from "src/components/profile/ProfileTabs";
import ProfileContent from "src/components/profile/ProfileContent";
import ProfileSidebar from "src/components/profile/ProfileSidebar";

import { getUserStats, getUserByUsername, getUserById, getMe } from "src/api/user";

export default function Profile() {
  const { userId, username } = useParams();
  const { user: currentUser } = useAuth();
  const toast = useToast();
  
  // Get chat toggle from layout context
  const outletContext = useOutletContext();
  const onOpenChat = outletContext?.onOpenChat;

  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);

  const [profileUser, setProfileUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [statsKey, setStatsKey] = useState(0); // Key to trigger stats refresh

  // Determine if viewing own profile
  const isOwnProfile =
    (username && username === currentUser?.username) ||
    (userId && userId === currentUser?.id) ||
    (!username && !userId);

  useEffect(() => {
    const fetchUser = async () => {
      setLoadingUser(true);
      try {
        if (isOwnProfile) {
          setProfileUser(currentUser);
        } else if (username) {
          const response = await getUserByUsername(username);
          setProfileUser(response.data);
        } else if (userId) {
          const response = await getUserById(userId);
          setProfileUser(response.data);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        toast.error("Không thể tải thông tin người dùng");
      } finally {
        setLoadingUser(false);
      }
    };

    if (currentUser) {
      fetchUser();
    }
  }, [username, userId, currentUser, isOwnProfile]);

  // Stats will be fetched by ProfileSidebar component

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

  // Callback khi follow/unfollow để refresh stats
  const handleFollowChange = useCallback(() => {
    // Trigger stats refresh by changing key
    setStatsKey(prev => prev + 1);
  }, []);

  // Callback khi click Chat button
  const handleStartChat = useCallback((targetUser) => {
    // Open chat panel
    onOpenChat?.();
    // TODO: In future, pass targetUser to chat panel to start conversation
  }, [onOpenChat]);

  const handleCommunityClick = (community) => {
    toast.info(`Navigating to s/${community}`);
  };

  // If profileUser is null after loading, maybe show 404?
  if (!loadingUser && !profileUser) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">User not found</h2>
          <p className="text-muted-foreground">The user you are looking for does not exist.</p>
        </div>
      </div>
    );
  }

  const userDisplay = profileUser || currentUser; // Fallback to currentUser if loading or whatever

  return (
    <div className="bg-background min-h-screen">
      {/* Profile Header và Tabs - Gắn liền với nhau */}
      <div className="bg-background z-20">
        {/* Profile Header */}
        <div className="border-b border-border/50">
          <div className="max-w-5xl mx-auto px-6">
            <div className="py-8">
              <ProfileHeader 
                user={userDisplay} 
                isOwnProfile={isOwnProfile} 
                onFollowChange={handleFollowChange}
                onStartChat={handleStartChat}
              />
            </div>
          </div>
        </div>

        {/* Profile Tabs - Sticky ngay dưới global header khi scroll */}
        <div className="border-b border-border/50 bg-background">
          <div className="max-w-5xl mx-auto px-6">
            <ProfileTabs activeTab={activeTab} onTabChange={setActiveTab} isOwnProfile={isOwnProfile} />
          </div>
        </div>
      </div>

      {/* Content Area with Sidebar */}
      <div className="flex gap-6 bg-background max-w-5xl mx-auto px-6">
        {/* Main Content */}
        <div className="flex-1 min-w-0 py-6">
          <ProfileContent
            activeTab={activeTab}
            posts={posts}
            loading={loading}
            isOwnProfile={isOwnProfile}
            onUpvote={handleUpvote}
            onDownvote={handleDownvote}
            onComment={handleComment}
            onShare={handleShare}
            onSave={handleSave}
            onAuthorClick={handleAuthorClick}
            onFollow={handleFollowChange}
            onCommunityClick={handleCommunityClick}
          />
        </div>

        {/* Profile Sidebar - Thống kê user, achievements, settings */}
        <div className="hidden xl:block w-80 flex-shrink-0 py-6">
          <div className="sticky top-28">
            <ProfileSidebar key={statsKey} user={userDisplay} isOwnProfile={isOwnProfile} />
          </div>
        </div>
      </div>
    </div>
  );
}
