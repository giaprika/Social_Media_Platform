import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlusIcon, CheckIcon } from "@heroicons/react/24/outline";
import Avatar from "../ui/Avatar";

const SuggestedUsers = ({ users = [] }) => {
  const navigate = useNavigate();
  const [followedUsers, setFollowedUsers] = useState(new Set());

  // Mock data nếu không có
  const defaultUsers = [
    {
      id: "1",
      name: "Alex Johnson",
      username: "alexj",
      avatar: null,
      bio: "Full-stack developer | Open source enthusiast",
      followers: 1250,
      isVerified: true,
    },
    {
      id: "2",
      name: "Sarah Chen",
      username: "sarahc",
      avatar: null,
      bio: "UI/UX Designer | Making the web beautiful",
      followers: 3400,
      isVerified: false,
    },
    {
      id: "3",
      name: "Mike Rodriguez",
      username: "mikerodz",
      avatar: null,
      bio: "Tech blogger | AI & ML researcher",
      followers: 2100,
      isVerified: true,
    },
    {
      id: "4",
      name: "Emily Taylor",
      username: "emilyt",
      avatar: null,
      bio: "Product Manager | Building cool stuff",
      followers: 890,
      isVerified: false,
    },
  ];

  const displayUsers = users.length > 0 ? users : defaultUsers;

  const formatNumber = (num) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const handleFollow = (userId) => {
    setFollowedUsers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const isFollowing = (userId) => followedUsers.has(userId);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Suggested for You
        </h3>
      </div>

      <div className="divide-y divide-border">
        {displayUsers.map((user) => (
          <div
            key={user.id}
            className="px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => navigate(`/app/profile/${user.id}`)}
          >
            <div className="flex items-center gap-2.5">
              {/* Avatar */}
              <Avatar
                src={user.avatar}
                name={user.name}
                size="sm"
                className="flex-shrink-0"
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <h4 className="text-xs font-semibold text-foreground truncate">
                    {user.name}
                  </h4>
                  {user.isVerified && (
                    <svg
                      className="h-3 w-3 text-primary flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  u/{user.username}
                </p>
              </div>

              {/* Follow Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleFollow(user.id);
                }}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                  isFollowing(user.id)
                    ? "bg-muted text-foreground hover:bg-muted/80"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {isFollowing(user.id) ? "Following" : "Follow"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full px-3 py-2.5 text-xs font-medium text-primary hover:bg-muted/50 transition-colors border-t border-border">
        See More
      </button>
    </div>
  );
};

export default SuggestedUsers;
