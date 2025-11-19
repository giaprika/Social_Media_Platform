import { ShareIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

const ProfileHeader = ({ user, isOwnProfile = false }) => {
  const displayName = user?.displayName || user?.fullName || user?.username || "User";
  const username = user?.username || "username";
  const avatar = user?.avatar;

  return (
    <div className="flex items-center gap-4">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {avatar ? (
          <img
            src={avatar}
            alt={displayName}
            className="h-16 w-16 rounded-full object-cover ring-2 ring-card"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-2xl font-bold text-primary-foreground ring-2 ring-card">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-foreground mb-0.5">
          {displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          u/{username}
        </p>
      </div>

      {/* Share Button */}
      <button
        type="button"
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-foreground hover:bg-muted/80 transition-colors"
      >
        <ShareIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Share</span>
      </button>
    </div>
  );
};

export default ProfileHeader;

