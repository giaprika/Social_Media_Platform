import { useState, useEffect } from "react";
import { 
  CakeIcon,
  DocumentTextIcon,
  HeartIcon,
  UsersIcon,
  ClockIcon,
  XMarkIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { differenceInDays } from "date-fns";
import { getUserStats } from "src/api/user";

// Modal Component
const StatsModal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-card border border-border rounded-lg w-full max-w-sm mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-muted transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
};

const ProfileSidebar = ({ user, stats: initialStats, isOwnProfile = false }) => {
  const username = user?.username || "username";
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(!initialStats);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [showContributionsModal, setShowContributionsModal] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        const response = await getUserStats(user.id);
        setStats(response.data);
      } catch (error) {
        console.error("Error fetching user stats:", error);
        // Fallback to default stats if API fails
        setStats({
          followers: 0,
          likes: 0,
          contributions: 0,
          created_at: user?.created_at || new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    };

    if (!initialStats && user?.id) {
      fetchStats();
    }
  }, [user?.id, initialStats]);

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const getSocialAge = () => {
    if (!stats?.created_at) return "0 ngày";
    
    try {
      const createdDate = new Date(stats.created_at);
      const now = new Date();
      
      const totalDays = differenceInDays(now, createdDate);
      
      if (totalDays < 0) return "0 ngày";
      if (totalDays === 0) return "Hôm nay";
      
      const years = Math.floor(totalDays / 365);
      const remainingDaysAfterYears = totalDays % 365;
      const months = Math.floor(remainingDaysAfterYears / 30);
      const days = remainingDaysAfterYears % 30;
      
      if (years > 0) {
        const parts = [`${years} ${years === 1 ? 'năm' : 'năm'}`];
        if (months > 0) parts.push(`${months} ${months === 1 ? 'tháng' : 'tháng'}`);
        return parts.join(' ');
      } else if (months > 0) {
        const parts = [`${months} ${months === 1 ? 'tháng' : 'tháng'}`];
        if (days > 0) parts.push(`${days} ${days === 1 ? 'ngày' : 'ngày'}`);
        return parts.join(' ');
      } else {
        return `${totalDays} ${totalDays === 1 ? 'ngày' : 'ngày'}`;
      }
    } catch {
      return "0 ngày";
    }
  };

  const userStats = stats || {
    followers: 0,
    following: 0,
    likes: 0,
    posts: 0,
    comments: 0,
    created_at: user?.created_at || new Date().toISOString(),
  };

  return (
    <div className="space-y-3">
      {/* Follow Modal */}
      <StatsModal 
        isOpen={showFollowModal} 
        onClose={() => setShowFollowModal(false)}
        title="Follow"
      >
        <p className="text-sm text-muted-foreground mb-4">Followers and following</p>
        <div className="flex gap-4">
          <div className="flex-1 text-center py-3 border-r border-border">
            <div className="text-2xl font-bold text-foreground">
              {formatNumber(userStats.followers)}
            </div>
            <div className="text-xs text-muted-foreground">Followers</div>
          </div>
          <div className="flex-1 text-center py-3">
            <div className="text-2xl font-bold text-foreground">
              {formatNumber(userStats.following || 0)}
            </div>
            <div className="text-xs text-muted-foreground">Following</div>
          </div>
        </div>
      </StatsModal>

      {/* Contributions Modal */}
      <StatsModal 
        isOpen={showContributionsModal} 
        onClose={() => setShowContributionsModal(false)}
        title="Contributions"
      >
        <p className="text-sm text-muted-foreground mb-4">Total posts and comments</p>
        <div className="flex gap-4 mb-4">
          <div className="flex-1 text-center py-3 border-r border-border">
            <div className="text-2xl font-bold text-foreground">
              {formatNumber(userStats.posts || 0)}
            </div>
            <div className="text-xs text-muted-foreground">Posts</div>
          </div>
          <div className="flex-1 text-center py-3">
            <div className="text-2xl font-bold text-foreground">
              {formatNumber(userStats.comments || 0)}
            </div>
            <div className="text-xs text-muted-foreground">Comments</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <InformationCircleIcon className="h-4 w-4" />
          <span>Updates every 24 hours</span>
        </div>
      </StatsModal>

      {/* Stats Card */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-primary/5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">
              {user?.displayName || username}
            </h2>
            <button className="text-xs font-medium text-primary hover:underline">
              Share
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Follow - Gộp Followers và Following */}
          <button 
            onClick={() => setShowFollowModal(true)}
            className="w-full flex items-center justify-between hover:bg-muted/50 rounded-md transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground group-hover:text-foreground">Follow</span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              {loading ? "..." : formatNumber(userStats.followers + (userStats.following || 0))}
            </span>
          </button>

          {/* Likes */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartIcon className="h-4 w-4 text-destructive" />
              <span className="text-sm text-muted-foreground">Likes</span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              {loading ? "..." : formatNumber(userStats.likes || 0)}
            </span>
          </div>

          {/* Contributions */}
          <button 
            onClick={() => setShowContributionsModal(true)}
            className="w-full flex items-center justify-between hover:bg-muted/50 rounded-md transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="h-4 w-4 text-info" />
              <span className="text-sm text-muted-foreground group-hover:text-foreground">Contributions</span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              {loading ? "..." : formatNumber((userStats.posts || 0) + (userStats.comments || 0))}
            </span>
          </button>

          {/* Social Age */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CakeIcon className="h-4 w-4 text-accent" />
              <span className="text-sm text-muted-foreground">Social Age</span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              {loading ? "..." : getSocialAge()}
            </span>
          </div>

          {/* Active In */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClockIcon className="h-4 w-4 text-success" />
              <span className="text-sm text-muted-foreground">Active in</span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              {userStats.activeIn || 0} {(userStats.activeIn || 0) === 1 ? 'community' : 'communities'} &gt;
            </span>
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Achievements
            </h3>
            <button className="text-xs font-medium text-primary hover:underline">
              View All
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <span className="text-sm">0 unlocked</span>
          </div>
        </div>
      </div>

      {/* Settings - Chỉ hiển thị cho profile của mình */}
      {isOwnProfile && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Settings
            </h3>
          </div>

          <div className="divide-y divide-border">
            <div className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-lg">👤</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-foreground mb-0.5">
                    Profile
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Customize your profile
                  </p>
                </div>
                <button className="px-3 py-1 rounded-full bg-muted text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors">
                  Update
                </button>
              </div>
            </div>

            <div className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-lg">👁️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-foreground mb-0.5">
                    Curate your profile
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Manage what people see when they visit your profile
                  </p>
                </div>
                <button className="px-3 py-1 rounded-full bg-muted text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors">
                  Update
                </button>
              </div>
            </div>

            <div className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-lg">👕</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-foreground mb-0.5">
                    Avatar
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Style your avatar
                  </p>
                </div>
                <button className="px-3 py-1 rounded-full bg-muted text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors">
                  Update
                </button>
              </div>
            </div>

            <div className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-lg">🛡️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-foreground mb-0.5">
                    Mod Tools
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Moderate your profile
                  </p>
                </div>
                <button className="px-3 py-1 rounded-full bg-muted text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors">
                  Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Social Links */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Social Links
          </h3>
        </div>

        <div className="p-4">
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
            <span className="text-lg">➕</span>
            Add Social Link
          </button>
        </div>
      </div>

      {/* Trophy Case */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Trophy Case
          </h3>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <span className="text-sm">No trophies yet</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSidebar;

