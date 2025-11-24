import clsx from "clsx";

const ProfileTabs = ({ activeTab = "overview", onTabChange }) => {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "posts", label: "Posts" },
    { id: "comments", label: "Comments" },
    { id: "saved", label: "Saved" },
    { id: "history", label: "History" },
    { id: "hidden", label: "Hidden" },
    { id: "upvoted", label: "Upvoted" },
    { id: "downvoted", label: "Downvoted" },
  ];

  return (
    <div className="bg-card border-b border-border">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className={clsx(
                "px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative",
                activeTab === tab.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-lg"
              )}
            >
              {tab.label}
              
              {/* Active indicator */}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProfileTabs;

