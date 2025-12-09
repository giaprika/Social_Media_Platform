import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightOnRectangleIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
  PencilSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrophyIcon,
  UserCircleIcon,
  Bars3Icon,
} from "@heroicons/react/24/outline";
import { PATHS } from "src/constants/paths";
import Avatar from "../ui/Avatar";
import useAuth from "src/hooks/useAuth";
import { useTheme } from "src/contexts/ThemeContext";
import NotificationDropdown from "./NotificationDropdown";
import { useNotifications } from "src/contexts/NotificationsContext";

// Navigation items removed - search bar moved to left

const Header = ({ activeNav = "home", onActiveNavChange, isChatOpen = false, onToggleChat, onToggleSidebar, onCreatePost }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const profileButtonRef = useRef(null);
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { notifications, fetchNotifications } = useNotifications();

  const displayName = user?.displayName || user?.fullName || user?.username || "SocialUser";
  const userHandle = user?.username ? `u/${user.username}` : "u/socialuser";
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!isProfileMenuOpen) {
        return;
      }

      const menuNode = profileMenuRef.current;
      const buttonNode = profileButtonRef.current;

      if (menuNode && buttonNode && !menuNode.contains(event.target) && !buttonNode.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isProfileMenuOpen]);

  const closeMenu = () => setIsProfileMenuOpen(false);

  const handleLogout = async () => {
    await logout();
    closeMenu();
    navigate(PATHS.LOGIN, { replace: true });
  };

  const profileMenuItems = [
    {
      id: "edit-avatar",
      label: "Chỉnh sửa Avatar",
      icon: PencilSquareIcon,
      action: () => undefined,
    },
    {
      id: "drafts",
      label: "Bản nháp",
      description: "Bài viết đã lưu",
      icon: DocumentDuplicateIcon,
      action: () => undefined,
    },
    {
      id: "achievements",
      label: "Thành tựu",
      description: "Chưa có thành tựu",
      icon: TrophyIcon,
      action: () => undefined,
    },
    {
      id: "premium",
      label: "Premium",
      icon: ShieldCheckIcon,
      action: () => undefined,
    },
    {
      id: "dark-mode",
      label: isDark ? "Chế độ tối" : "Chế độ sáng",
      icon: isDark ? MoonIcon : SunIcon,
      type: "toggle",
      action: toggleTheme,
    },
    {
      id: "logout",
      label: "Đăng xuất",
      icon: ArrowRightOnRectangleIcon,
      tone: "destructive",
      action: handleLogout,
      closeOnAction: false,
    },
  ];

  const footerMenuItems = [
    {
      id: "settings",
      label: "Cài đặt",
      icon: Cog6ToothIcon,
      action: () => navigate(PATHS.SETTINGS),
    },
  ];

  const handleMenuItemClick = (item) => {
    item.action?.();

    if (item.type === "toggle") {
      return;
    }

    if (item.closeOnAction !== false) {
      closeMenu();
    }
  };

  const renderMenuItem = (item) => {
    const Icon = item.icon;
    const isToggle = item.type === "toggle";

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleMenuItemClick(item)}
        className={clsx(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
          item.tone === "destructive"
            ? "text-destructive hover:bg-destructive/10"
            : "text-foreground hover:bg-muted"
        )}
      >
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">{item.label}</span>
          {item.description && <span className="truncate text-xs text-muted-foreground">{item.description}</span>}
        </div>
        {isToggle && (
          <span
            className={clsx(
              "flex h-6 w-11 items-center rounded-full p-1 transition-colors",
              isDark ? "bg-primary/80" : "bg-muted"
            )}
          >
            <span
              className={clsx(
                "h-4 w-4 rounded-full bg-card shadow transition-transform",
                isDark ? "translate-x-5" : "translate-x-0"
              )}
            />
          </span>
        )}
      </button>
    );
  };

  return (
    <header className="fixed top-0 left-0 right-0 lg:left-72 z-40 border-b border-border bg-card">
      <div className="relative flex h-16 items-center gap-3 sm:gap-4 lg:gap-6 px-3 sm:px-4 lg:px-6">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lg:hidden rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <Bars3Icon className="h-6 w-6" />
        </button>

        {/* Search bar on the left */}
        <div className="relative flex-1 max-w-md lg:max-w-lg">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 lg:left-4 top-1/2 h-4 w-4 lg:h-5 lg:w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim()) {
                navigate(PATHS.SEARCH, { state: { query: searchQuery } });
              }
            }}
            placeholder="Search SocialApp"
            className="w-full rounded-full border border-border bg-muted py-2 pl-9 lg:pl-11 pr-3 lg:pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Action buttons on the right */}
        <div className="flex items-center gap-1 sm:gap-2 lg:gap-3 ml-auto">
          <button
            type="button"
            onClick={onCreatePost}
            className="hidden sm:flex items-center gap-2 rounded-full bg-primary px-3 lg:px-4 py-2 text-xs sm:text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <PlusIcon className="h-4 w-4 lg:h-5 lg:w-5" />
            <span className="inline">Create Post</span>
          </button>
          <button
            type="button"
            onClick={onCreatePost}
            className="sm:hidden rounded-full bg-primary p-2 text-primary-foreground transition-opacity hover:opacity-90"
            aria-label="Create Post"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onToggleChat?.()}
            className={clsx(
              "rounded-full p-2 transition-colors",
              isChatOpen
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-label="Messages"
            aria-pressed={isChatOpen}
          >
            <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" />
          </button>
          <NotificationDropdown
            notifications={notifications}
            isOpen={isNotificationOpen}
            onClose={() => setIsNotificationOpen(false)}
            onToggle={() => {
              setIsNotificationOpen((prev) => !prev);
              if (!isNotificationOpen) {
                fetchNotifications();
              }
            }}
          />
          <button
            type="button"
            ref={profileButtonRef}
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            className={clsx(
              "transition-opacity",
              isProfileMenuOpen ? "opacity-90" : "hover:opacity-90"
            )}
            aria-label="Account"
          >
            <Avatar
              src={user?.avatar_url || user?.avatar}
              name={user?.username || displayName}
              size="sm"
            />
          </button>
        </div>
        {isProfileMenuOpen && (
          <div
            ref={profileMenuRef}
            className="absolute right-2 sm:right-4 lg:right-6 top-[calc(100%+0.75rem)] w-72 max-w-[calc(100vw-1rem)] rounded-2xl border border-border bg-card shadow-xl z-50"
          >
            <div className="space-y-1 p-3">
              {/* Profile Header - Clickable */}
              <button
                type="button"
                onClick={() => {
                  navigate(PATHS.PROFILE);
                  closeMenu();
                }}
                className="w-full flex items-center gap-3 rounded-2xl bg-muted px-3 py-3 transition-colors hover:bg-muted/70 cursor-pointer"
              >
                <Avatar
                  src={user?.avatar_url || user?.avatar}
                  name={user?.username || displayName}
                  size="md"
                />
                <div className="flex min-w-0 flex-col text-left">
                  <span className="text-sm font-semibold text-foreground">{displayName}</span>
                  <span className="text-xs text-muted-foreground hover:text-foreground transition-colors">{userHandle}</span>
                </div>
              </button>

              {profileMenuItems.map((item) => renderMenuItem(item))}
            </div>

            <div className="border-t border-border p-3">
              {footerMenuItems.map((item) => renderMenuItem(item))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
