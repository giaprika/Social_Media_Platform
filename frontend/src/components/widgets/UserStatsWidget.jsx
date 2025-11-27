import { 
  ChatBubbleLeftIcon, 
  DocumentTextIcon, 
  HeartIcon,
  CakeIcon,
} from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import useAuth from "src/hooks/useAuth";

const UserStatsWidget = () => {
  const { user } = useAuth();

  // Mock stats - sẽ thay bằng API
  const stats = {
    karma: 2847,
    posts: 42,
    comments: 186,
    cakeDay: new Date(2024, 0, 15), // Jan 15, 2024
    awards: 5,
    followers: 124,
    following: 89,
  };

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const getCakeDayText = (date) => {
    try {
      return formatDistanceToNow(date, { addSuffix: false, locale: vi });
    } catch {
      return "1 năm";
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header with gradient */}
      <div className="h-16 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20" />
      
      {/* Profile Section */}
      <div className="px-4 pb-4">
        <div className="flex items-end gap-3 -mt-8 mb-3">
          <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground font-bold text-2xl flex items-center justify-center border-4 border-card">
            {(user?.displayName || user?.username || "U").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 pt-2">
            <h3 className="text-sm font-bold text-foreground">
              {user?.displayName || user?.username || "User"}
            </h3>
            <p className="text-xs text-muted-foreground">
              u/{user?.username || "username"}
            </p>
          </div>
        </div>

        {/* Likes Section */}
        <div className="mb-3 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Likes</span>
            <HeartIcon className="h-4 w-4 text-destructive" />
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatNumber(stats.karma)}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <DocumentTextIcon className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Posts</span>
            </div>
            <p className="text-lg font-semibold text-foreground">
              {stats.posts}
            </p>
          </div>

          <div className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <ChatBubbleLeftIcon className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Comments</span>
            </div>
            <p className="text-lg font-semibold text-foreground">
              {stats.comments}
            </p>
          </div>

          <div className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <HeartIcon className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Followers</span>
            </div>
            <p className="text-lg font-semibold text-foreground">
              {stats.followers}
            </p>
          </div>

          <div className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <HeartIcon className="h-4 w-4 text-success" />
              <span className="text-xs text-muted-foreground">Following</span>
            </div>
            <p className="text-lg font-semibold text-foreground">
              {stats.following}
            </p>
          </div>
        </div>

        {/* Cake Day */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/10 border border-accent/20">
          <CakeIcon className="h-4 w-4 text-accent" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Cake Day</p>
            <p className="text-xs font-medium text-foreground">
              {getCakeDayText(stats.cakeDay)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserStatsWidget;

