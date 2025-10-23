import { useState } from "react";
import { Outlet } from "react-router-dom";
import Header from "src/components/layout/Header";
import Sidebar from "src/components/layout/Sidebar";
import ChatPanel from "src/components/layout/ChatPanel";

const DefaultLayout = () => {
  const [activeNav, setActiveNav] = useState("home");
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar activeNav={activeNav} onActiveNavChange={setActiveNav} />
      <div className="ml-72 min-h-screen bg-background">
        <Header
          activeNav={activeNav}
          onActiveNavChange={setActiveNav}
          isChatOpen={isChatOpen}
          onToggleChat={() => setIsChatOpen((prev) => !prev)}
        />
        <main className="px-6 pb-8 pt-20">
          <Outlet />
        </main>
      </div>
      <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
};

export default DefaultLayout;
