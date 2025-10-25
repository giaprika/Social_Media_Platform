import { useState } from "react";

const tabs = ["posts", "about", "settings"];

export default function Profile() {
  const [activeTab, setActiveTab] = useState("posts");

  const userStats = {
    posts: 42,
    followers: 1234,
    following: 567,
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="h-32 bg-gradient-to-r from-primary to-primary/50" />

        <div className="px-6 pb-6">
          <div className="-mt-16 mb-4 flex items-end gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-card bg-primary text-3xl font-bold text-primary-foreground">
              JD
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">John Doe</h1>
              <p className="text-muted-foreground">@johndoe</p>
            </div>
            <button
              type="button"
              className="rounded-full bg-primary px-6 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Edit Profile
            </button>
          </div>

          <p className="mb-4 text-foreground">
            Passionate about technology, design, and coffee ☕
          </p>

          <div className="flex gap-6">
            <div>
              <p className="text-lg font-bold text-foreground">{userStats.posts}</p>
              <p className="text-sm text-muted-foreground">Posts</p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{userStats.followers}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{userStats.following}</p>
              <p className="text-sm text-muted-foreground">Following</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 flex gap-4 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-4 py-3 font-semibold capitalize transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "posts" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 font-bold text-foreground">My First Post</h3>
            <p className="text-muted-foreground">
              This is a sample post from your profile.
            </p>
          </div>
        </div>
      )}

      {activeTab === "about" && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 font-bold text-foreground">About</h3>
          <div className="space-y-3 text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">Location:</span>{" "}
              San Francisco, CA
            </p>
            <p>
              <span className="font-semibold text-foreground">Joined:</span>{" "}
              January 2024
            </p>
            <p>
              <span className="font-semibold text-foreground">Website:</span>{" "}
              johndoe.com
            </p>
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 font-bold text-foreground">Profile Settings</h3>
          <div className="space-y-4">
            <button
              type="button"
              className="w-full rounded-lg bg-muted px-4 py-2 text-left text-foreground transition-colors hover:bg-muted/80"
            >
              Change Password
            </button>
            <button
              type="button"
              className="w-full rounded-lg bg-muted px-4 py-2 text-left text-foreground transition-colors hover:bg-muted/80"
            >
              Privacy Settings
            </button>
            <button
              type="button"
              className="w-full rounded-lg bg-destructive/10 px-4 py-2 text-left text-destructive transition-colors hover:bg-destructive/20"
            >
              Delete Account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
