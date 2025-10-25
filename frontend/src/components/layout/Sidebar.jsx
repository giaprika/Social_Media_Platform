import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bars3BottomLeftIcon,
  BoltIcon,
  BookOpenIcon,
  ChatBubbleBottomCenterTextIcon,
  ChevronDownIcon,
  CursorArrowRaysIcon,
  FireIcon,
  GlobeAltIcon,
  HomeIcon,
  MusicalNoteIcon,
  QuestionMarkCircleIcon,
  RectangleGroupIcon,
  Squares2X2Icon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { PATHS } from "src/constants/paths";
import useAuth from "src/hooks/useAuth";

const navSections = [
  {
    key: "main",
    title: "Main",
    items: [
      { id: "home", label: "Home", to: PATHS.FEED, icon: HomeIcon },
      { id: "popular", label: "Popular", to: PATHS.FEED, icon: FireIcon },
      { id: "answers", label: "Answers", to: PATHS.FEED, icon: QuestionMarkCircleIcon, badge: "Beta" },
      { id: "explore", label: "Explore", to: PATHS.FEED, icon: GlobeAltIcon },
      { id: "all", label: "All", to: PATHS.FEED, icon: Squares2X2Icon },
    ],
  },
  {
    key: "games",
    title: "Games on SocialApp",
    collapsible: true,
    items: [
      { id: "trending", label: "Trending", to: PATHS.FEED, icon: BoltIcon },
      { id: "new-releases", label: "New Releases", to: PATHS.FEED, icon: CursorArrowRaysIcon },
    ],
  },
  {
    key: "custom",
    title: "Custom Feeds",
    collapsible: true,
    items: [
      { id: "create-feed", label: "Create Feed", to: PATHS.FEED, icon: RectangleGroupIcon },
      { id: "music", label: "Music", to: PATHS.FEED, icon: MusicalNoteIcon },
    ],
  },
  {
    key: "communities",
    title: "Communities",
    collapsible: true,
    items: [
      { id: "profile", label: "My Profile", to: PATHS.PROFILE, icon: UserGroupIcon },
      { id: "recent", label: "Recent", to: PATHS.FEED, icon: Bars3BottomLeftIcon },
    ],
  },
  {
    key: "resources",
    title: "Resources",
    items: [
      { id: "help-center", label: "Help Center", to: PATHS.SETTINGS, icon: QuestionMarkCircleIcon },
      { id: "blog", label: "Blog", external: "https://redditblog.com", icon: BookOpenIcon },
      { id: "contact", label: "Contact", to: PATHS.SETTINGS, icon: ChatBubbleBottomCenterTextIcon },
    ],
  },
];

const Sidebar = ({ activeNav, onActiveNavChange }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState({ games: true, custom: true, communities: false });

  const flattenedNavItems = useMemo(
    () => navSections.flatMap((section) => section.items ?? []),
    []
  );

  const getDefaultActiveItem = () => {
    const matchedItem = flattenedNavItems.find((item) => item.to === location.pathname);
    return matchedItem?.id ?? "home";
  };

  const [activeItemId, setActiveItemId] = useState(() => activeNav ?? getDefaultActiveItem());

  const updateActiveItem = (id) => {
    setActiveItemId(id);
    onActiveNavChange?.(id);
  };

  useEffect(() => {
    const matchedItem = flattenedNavItems.find((item) => item.to === location.pathname);
    if (matchedItem && matchedItem.id !== activeItemId) {
      const duplicates = flattenedNavItems.filter((item) => item.to === matchedItem.to);
      if (duplicates.length === 1) {
        updateActiveItem(matchedItem.id);
      } else if (!duplicates.some((item) => item.id === activeItemId)) {
        updateActiveItem("home");
      }
    }
  }, [location.pathname, flattenedNavItems, activeItemId]);

  useEffect(() => {
    if (activeNav && activeNav !== activeItemId) {
      setActiveItemId(activeNav);
    }
  }, [activeNav, activeItemId]);

  const handleToggle = (sectionKey) => {
    setCollapsed((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate(PATHS.LOGIN, { replace: true });
    }
  };

  const renderItem = (item) => {
    const Icon = item.icon;
    const isActive = activeItemId === item.id;

    if (item.external) {
      return (
        <a
          key={item.id}
          href={item.external}
          target="_blank"
          rel="noreferrer"
          onClick={() => updateActiveItem(item.id)}
          className={clsx(
            "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <span className="flex items-center gap-3">
            <Icon className="h-5 w-5" />
            {item.label}
          </span>
          <span className="text-xs text-muted-foreground">↗</span>
        </a>
      );
    }

    return (
      <NavLink
        key={item.id}
        to={item.to}
        onClick={() => updateActiveItem(item.id)}
        className={clsx(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && (
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{item.badge}</span>
        )}
      </NavLink>
    );
  };

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-72 flex-col overflow-y-auto border-r border-border bg-card pt-4">
      <div className="mb-6 px-4">
        <button
          type="button"
          onClick={() => navigate(PATHS.FEED)}
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
            S
          </span>
          <span className="text-lg font-bold text-foreground">SocialApp</span>
        </button>
      </div>

      <div className="flex-1 space-y-8 px-4">
        {navSections.map((section) => {
          const isCollapsible = section.collapsible;
          const isCollapsed = collapsed[section.key];

          return (
            <div key={section.key} className="space-y-3">
              <button
                type="button"
                onClick={() => (isCollapsible ? handleToggle(section.key) : null)}
                className={clsx(
                  "flex w-full items-center justify-between px-2 text-xs font-semibold uppercase text-muted-foreground",
                  isCollapsible ? "hover:text-foreground" : "cursor-default"
                )}
              >
                {section.title}
                {isCollapsible && (
                  <ChevronDownIcon
                    className={clsx(
                      "h-4 w-4 transition-transform",
                      isCollapsed ? "rotate-180" : ""
                    )}
                  />
                )}
              </button>

              {(!isCollapsible || !isCollapsed) && (
                <div className="space-y-1">
                  {section.items.map((item) => renderItem(item))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border px-4 py-6">
        <div className="space-y-2 text-sm text-muted-foreground">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted hover:text-foreground"
          >
            <QuestionMarkCircleIcon className="h-5 w-5" />
            Help Center
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <span className="text-lg">🚪</span>
            Logout
          </button>
          <p className="pt-2 text-xs text-muted-foreground">© {new Date().getFullYear()} SocialApp. All rights reserved.</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
