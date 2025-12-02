import clsx from "clsx";
import Card from "src/components/ui/Card";

const ProfileTabs = ({ activeTab = "overview", onTabChange, isOwnProfile = false }) => {
  // Tabs đầy đủ cho profile của mình
  const allTabs = [
    { id: "overview", label: "Overview" },
    { id: "posts", label: "Posts" },
    { id: "comments", label: "Comments" },
    { id: "saved", label: "Saved" },
    { id: "history", label: "History" },
    { id: "hidden", label: "Hidden" },
    { id: "upvoted", label: "Upvoted" },
    { id: "downvoted", label: "Downvoted" },
  ];

  // Tabs giới hạn cho profile người khác
  const publicTabs = [
    { id: "overview", label: "Overview" },
    { id: "posts", label: "Posts" },
    { id: "comments", label: "Comments" },
  ];

  const tabs = isOwnProfile ? allTabs : publicTabs;

  return (
    <div className="py-6">
      <Card className="p-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className={clsx(
                "px-4 py-2 text-sm font-medium whitespace-nowrap transition-all rounded-md relative",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary font-semibold shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default ProfileTabs;

