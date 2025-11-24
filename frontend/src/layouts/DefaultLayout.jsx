import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import clsx from "clsx";
import Header from "src/components/layout/Header";
import Sidebar from "src/components/layout/Sidebar";
import ChatPanel from "src/components/layout/ChatPanel";
import RecentPostsSidebar from "src/components/layout/RecentPostsSidebar";
import { PATHS } from "src/constants/paths";

const DefaultLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeNav, setActiveNav] = useState("home");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [recentPosts, setRecentPosts] = useState([]);
  
  // Kiểm tra xem có đang ở trang profile không
  const isProfilePage = location.pathname.includes("/profile");

  const handleCreatePost = () => {
    // Navigate to feed and trigger create post modal
    navigate(PATHS.FEED, { state: { openCreateModal: true } });
  };

  const addRecentPost = (post) => {
    setRecentPosts((prev) => {
      // Add to beginning, remove duplicates, limit to 10
      const filtered = prev.filter((p) => p.id !== post.id);
      return [post, ...filtered].slice(0, 10);
    });
  };

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar with responsive classes */}
      <div
        className={clsx(
          "fixed left-0 top-0 z-30 lg:translate-x-0 transition-transform duration-300",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar activeNav={activeNav} onActiveNavChange={setActiveNav} />
      </div>

      {/* Main content */}
      <div className={clsx(
        "lg:ml-72 min-h-screen bg-background",
        !isProfilePage && "xl:mr-80"
      )}>
        <Header
          activeNav={activeNav}
          onActiveNavChange={setActiveNav}
          isChatOpen={isChatOpen}
          onToggleChat={() => setIsChatOpen((prev) => !prev)}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onCreatePost={handleCreatePost}
        />
        <main className="px-3 sm:px-4 lg:px-6 pb-8 pt-16 lg:pt-20">
          <Outlet context={{ addRecentPost }} />
        </main>
      </div>

      {/* Recent Posts Sidebar - Ẩn khi ở trang profile */}
      {!isProfilePage && (
        <RecentPostsSidebar
          posts={recentPosts}
          onClear={() => setRecentPosts([])}
        />
      )}

      <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
};

export default DefaultLayout;
