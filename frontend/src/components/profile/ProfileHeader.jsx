import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShareIcon, UserPlusIcon, CheckIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { checkFollowStatus, followUser, unfollowUser } from "src/api/user";
import { useToast } from "src/components/ui";
import Avatar from "src/components/ui/Avatar";

const ProfileHeader = ({ user, isOwnProfile = false, onFollowChange, onStartChat }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const displayName = user?.displayName || user?.fullName || user?.full_name || user?.username || "User";
  const username = user?.username || "username";
  const avatar = user?.avatar || user?.avatar_url;
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  // Check follow status when user changes
  useEffect(() => {
    const fetchFollowStatus = async () => {
      if (!user?.id || isOwnProfile) return;
      
      try {
        const response = await checkFollowStatus(user.id);
        setIsFollowing(response.data.isFollowing);
      } catch (error) {
        console.error("Error checking follow status:", error);
      }
    };

    fetchFollowStatus();
  }, [user?.id, isOwnProfile]);

  const handleFollow = async () => {
    if (loadingFollow || !user?.id) return;
    
    setLoadingFollow(true);
    try {
      if (isFollowing) {
        await unfollowUser(user.id);
        setIsFollowing(false);
        toast.success("Đã unfollow!");
      } else {
        await followUser(user.id);
        setIsFollowing(true);
        toast.success("Đã follow!");
      }
      onFollowChange?.(!isFollowing);
    } catch (error) {
      console.error("Error toggling follow:", error);
      toast.error(error.response?.data?.error || "Có lỗi xảy ra");
    } finally {
      setLoadingFollow(false);
    }
  };

  const handleStartChat = () => {
    // Open chat panel
    onStartChat?.(user);
  };

  const handleShare = () => {
    const profileUrl = `${window.location.origin}/app/u/${username}`;
    navigator.clipboard.writeText(profileUrl);
    toast.success("Đã sao chép link profile!");
  };

  return (
    <div className="flex items-center gap-4">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar
          src={avatar}
          name={username || displayName}
          size="2xl"
          className="ring-2 ring-border/30"
        />
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-foreground mb-1">
          {displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          u/{username}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Follow Button - Only show for other users' profiles */}
        {!isOwnProfile && (
          <>
            <button
              type="button"
              onClick={handleFollow}
              disabled={loadingFollow}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors",
                loadingFollow && "opacity-50 cursor-not-allowed",
                isFollowing
                  ? "bg-muted text-foreground hover:bg-muted/80 border border-border/30"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              {isFollowing ? (
                <>
                  <CheckIcon className="h-4 w-4" />
                  <span className="text-sm">Following</span>
                </>
              ) : (
                <>
                  <UserPlusIcon className="h-4 w-4" />
                  <span className="text-sm">Follow</span>
                </>
              )}
            </button>

            {/* Start Chat Button */}
            <button
              type="button"
              onClick={handleStartChat}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 text-foreground hover:bg-muted transition-colors border border-border/30"
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4" />
              <span className="text-sm font-medium">Chat</span>
            </button>
          </>
        )}

        {/* Share Button */}
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 text-foreground hover:bg-muted transition-colors border border-border/30"
        >
          <ShareIcon className="h-4 w-4" />
          <span className="text-sm font-medium">Share</span>
        </button>
      </div>
    </div>
  );
};

export default ProfileHeader;

