import clsx from "clsx";

const FeedTabs = ({ activeTab = "forYou", onTabChange }) => {
  const tabs = [
    {
      id: "forYou",
      label: "For You",
    },
    {
      id: "following",
      label: "Following",
    },
  ];

  const handleTabClick = (tabId) => {
    onTabChange?.(tabId);
  };

  return (
    <div className="border-b border-border bg-card sticky top-16 lg:top-20 z-10">
      <div className="flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={clsx(
              "flex-1 flex items-center justify-center px-4 py-3.5 text-sm font-semibold transition-colors relative",
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {tab.label}
            
            {/* Active indicator */}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-sm" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FeedTabs;

