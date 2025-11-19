import { useNavigate } from "react-router-dom";
import { FireIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

const TrendingCommunities = ({ communities = [] }) => {
  const navigate = useNavigate();

  // Mock data nếu không có
  const defaultCommunities = [
    {
      id: "1",
      name: "webdev",
      description: "Web Development Community",
      members: 125000,
      online: 8500,
      icon: "💻",
      isJoined: false,
    },
    {
      id: "2",
      name: "technology",
      description: "Latest Tech News",
      members: 85000,
      online: 5200,
      icon: "🚀",
      isJoined: true,
    },
    {
      id: "3",
      name: "programming",
      description: "Programming Discussion",
      members: 95000,
      online: 6800,
      icon: "👨‍💻",
      isJoined: false,
    },
    {
      id: "4",
      name: "design",
      description: "UI/UX Design",
      members: 65000,
      online: 3400,
      icon: "🎨",
      isJoined: false,
    },
    {
      id: "5",
      name: "gaming",
      description: "Gaming Community",
      members: 150000,
      online: 12000,
      icon: "🎮",
      isJoined: false,
    },
  ];

  const displayCommunities = communities.length > 0 ? communities : defaultCommunities;

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Trending Communities
        </h3>
      </div>

      <div className="divide-y divide-border">
        {displayCommunities.map((community, index) => (
          <div
            key={community.id}
            className="px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer group"
            onClick={() => navigate(`/community/${community.name}`)}
          >
            <div className="flex items-center gap-2">
              {/* Rank */}
              <span className="text-xs font-bold text-muted-foreground w-4">
                {index + 1}
              </span>

              {/* Icon */}
              <span className="text-lg">{community.icon}</span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  s/{community.name}
                </h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatNumber(community.members)} members</span>
                </div>
              </div>

              {/* Join Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Handle join/leave
                }}
                className={clsx(
                  "px-2.5 py-1 rounded-full text-xs font-semibold transition-colors",
                  community.isJoined
                    ? "bg-muted text-foreground hover:bg-muted/80"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                )}
              >
                {community.isJoined ? "Joined" : "Join"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate("/communities")}
        className="w-full px-3 py-2.5 text-xs font-medium text-primary hover:bg-muted/50 transition-colors border-t border-border"
      >
        View All
      </button>
    </div>
  );
};

export default TrendingCommunities;

