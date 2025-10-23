import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightOnRectangleIcon,
  BanknotesIcon,
  BellIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PencilSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrophyIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { PATHS } from "src/constants/paths";
import useAuth from "src/hooks/useAuth";

const navItems = [
  { id: "home", label: "Home", to: PATHS.FEED },
  { id: "popular", label: "Popular", to: PATHS.FEED },
  { id: "explore", label: "Explore", to: PATHS.FEED },
];

const Header = ({ activeNav = "home", onActiveNavChange, isChatOpen = false, onToggleChat }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDarkModeEnabled, setIsDarkModeEnabled] = useState(true);
  const profileMenuRef = useRef(null);
  const profileButtonRef = useRef(null);
  const { user, logout } = useAuth();

  const displayName = user?.displayName || user?.fullName || user?.username || "SocialUser";
  const userHandle = user?.username ? `u/${user.username}` : "u/socialuser";

  const handleNavClick = (item) => {
    onActiveNavChange?.(item.id);
    if (item.to) {
      navigate(item.to);
    }
  };
  
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

  const toggleDarkMode = () => {
    setIsDarkModeEnabled((prev) => !prev);
  };

  const profileMenuItems = [
    {
      id: "view-profile",
      label: "View Profile",
      description: userHandle,
      icon: UserCircleIcon,
      action: () => navigate(PATHS.PROFILE),
    },
    {
      id: "edit-avatar",
      label: "Edit Avatar",
      icon: PencilSquareIcon,
      action: () => undefined,
    },
    {
      id: "drafts",
      label: "Drafts",
      description: "Saved posts",
      icon: DocumentDuplicateIcon,
      action: () => undefined,
    },
    {
      id: "achievements",
      label: "Achievements",
      description: "5 unlocked",
      icon: TrophyIcon,
      action: () => undefined,
    },
    {
      id: "earn",
      label: "Earn",
      description: "Earn cash on SocialApp",
      icon: BanknotesIcon,
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
      label: "Dark Mode",
      icon: MoonIcon,
      type: "toggle",
      action: toggleDarkMode,
    },
    {
      id: "logout",
      label: "Log Out",
      icon: ArrowRightOnRectangleIcon,
      tone: "destructive",
      action: handleLogout,
      closeOnAction: false,
    },
  ];

  const footerMenuItems = [
    {
      id: "settings",
      label: "Settings",
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
              isDarkModeEnabled ? "bg-primary/80" : "bg-muted"
            )}
          >
            <span
              className={clsx(
                "h-4 w-4 rounded-full bg-card shadow transition-transform",
                isDarkModeEnabled ? "translate-x-5" : "translate-x-0"
              )}
            />
          </span>
        )}
      </button>
    );
  };

  return (
    <header className="fixed top-0 left-72 right-0 z-40 border-b border-border bg-card">
      <div className="relative flex h-16 items-center gap-6 px-6">
        <nav className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item)}
              className={clsx(
                "rounded-full px-4 py-2 transition-colors",
                activeNav === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search SocialApp"
            className="w-full rounded-full border border-border bg-muted py-2 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <PlusIcon className="h-5 w-5" />
            Create Post
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
          <button
            type="button"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Notifications"
          >
            <BellIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            ref={profileButtonRef}
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            className={clsx(
              "flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground transition-opacity",
              isProfileMenuOpen ? "opacity-90" : "hover:opacity-90"
            )}
            aria-label="Account"
          >
            {displayName.charAt(0).toUpperCase()}
          </button>
        </div>
        {isProfileMenuOpen && (
          <div
            ref={profileMenuRef}
            className="absolute right-0 top-[calc(100%+0.75rem)] w-72 rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="space-y-1 p-3">
              <div className="flex items-center gap-3 rounded-2xl bg-muted px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-foreground">{displayName}</span>
                  <span className="text-xs text-muted-foreground">{userHandle}</span>
                </div>
              </div>

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
