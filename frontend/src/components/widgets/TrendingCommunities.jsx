import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import clsx from "clsx";
import * as communityApi from "src/api/community";

// Category icons mapping
const CATEGORY_ICONS = {
  Technology: "💻",
  Gaming: "🎮",
  Art: "🎨",
  Music: "🎵",
  Sports: "⚽",
  Education: "📚",
  Business: "💼",
  Entertainment: "🎬",
  Lifestyle: "🌟",
  Science: "🔬",
  News: "📰",
  Food: "🍕",
  Travel: "✈️",
  Health: "💪",
  Finance: "💰",
  Photography: "📷",
  Movies: "🎥",
  Books: "📖",
  Anime: "🎌",
  Memes: "😂",
  Other: "🌐",
};

// Get icon for a community based on category or name
const getCommunityIcon = (community) => {
  // If has avatar, return null (will show image)
  if (community.avatar_url) return null;

  // Get icon from category
  if (community.category && CATEGORY_ICONS[community.category]) {
    return CATEGORY_ICONS[community.category];
  }

  // Try to match by name
  const name = community.name?.toLowerCase() || "";
  if (name.includes("tech") || name.includes("programming") || name.includes("dev") || name.includes("code")) {
    return "💻";
  }
  if (name.includes("game") || name.includes("gaming")) {
    return "🎮";
  }
  if (name.includes("art") || name.includes("design")) {
    return "🎨";
  }
  if (name.includes("music")) {
    return "🎵";
  }

  return "🌐"; // Default icon
};

const TrendingCommunities = () => {
  const navigate = useNavigate();
  const [communities, setCommunities] = useState([]);
  const [myCommunities, setMyCommunities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningId, setJoiningId] = useState(null);

  // My community IDs for checking joined status
  const myCommunitySlugs = new Set(myCommunities.map((c) => c.slug));

  // Load trending communities
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load trending communities (sorted by popular)
        const data = await communityApi.getCommunities({
          sort: "popular",
          limit: 5,
        });
        setCommunities(data.communities || []);

        // Try to load my communities
        try {
          const myData = await communityApi.getMyCommunities();
          setMyCommunities(myData || []);
        } catch {
          // User might not be logged in
        }
      } catch (err) {
        console.error("Failed to load communities:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const formatNumber = (num) => {
    if (!num) return "0";
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const handleJoin = async (e, community) => {
    e.stopPropagation();
    e.preventDefault();

    if (myCommunitySlugs.has(community.slug)) {
      // Already joined - do nothing or leave
      return;
    }

    setJoiningId(community.id);
    try {
      await communityApi.joinCommunity(community.id, "approved");
      setMyCommunities((prev) => [...prev, community]);
    } catch (err) {
      console.error("Failed to join community:", err);
    } finally {
      setJoiningId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
          Trending Communities
        </h3>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2 animate-pulse">
              <div className="w-4 h-4 bg-muted rounded" />
              <div className="w-8 h-8 bg-muted rounded-lg" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-muted rounded w-20" />
                <div className="h-2 bg-muted rounded w-16" />
              </div>
              <div className="h-6 bg-muted rounded-full w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (communities.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
          Trending Communities
        </h3>
        <p className="text-sm text-muted-foreground text-center py-4">
          No communities yet
        </p>
        <Link
          to="/app/communities/create"
          className="block text-center text-sm font-medium text-primary hover:underline"
        >
          Create First Community
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Trending Communities
        </h3>
      </div>

      <div className="divide-y divide-border">
        {communities.map((community, index) => {
          const icon = getCommunityIcon(community);
          const isJoined = myCommunitySlugs.has(community.slug);
          const isJoining = joiningId === community.id;

          return (
            <Link
              key={community.id}
              to={`/c/${community.slug}`}
              className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors group"
            >
              {/* Rank */}
              <span className="text-xs font-bold text-muted-foreground w-4">
                {index + 1}
              </span>

              {/* Icon/Avatar */}
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {community.avatar_url ? (
                  <img
                    src={community.avatar_url}
                    alt={community.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-lg">{icon}</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                  c/{community.slug || community.name}
                </h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatNumber(community.member_count)} members</span>
                </div>
              </div>

              {/* Join Button */}
              <button
                onClick={(e) => handleJoin(e, community)}
                disabled={isJoining || isJoined}
                className={clsx(
                  "px-2.5 py-1 rounded-full text-xs font-semibold transition-colors",
                  isJoined
                    ? "bg-muted text-foreground"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                )}
              >
                {isJoining ? "..." : isJoined ? "Joined" : "Join"}
              </button>
            </Link>
          );
        })}
      </div>

      <Link
        to="/app/communities"
        className="block w-full px-3 py-2.5 text-xs font-medium text-primary hover:bg-muted/50 transition-colors border-t border-border text-center"
      >
        View All
      </Link>
    </div>
  );
};

export default TrendingCommunities;
