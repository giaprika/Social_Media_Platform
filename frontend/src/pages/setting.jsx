import { useState } from "react";

export default function Settings() {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: false,
    darkMode: true,
    privateProfile: false,
  });

  const handleToggle = (key) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-8 text-3xl font-bold text-foreground">Settings</h1>

      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-bold text-foreground">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Email Notifications</p>
              <p className="text-sm text-muted-foreground">
                Receive email updates
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggle("emailNotifications")}
              className={`flex h-6 w-12 items-center rounded-full transition-colors ${
                settings.emailNotifications ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white transition-transform ${
                  settings.emailNotifications ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Push Notifications</p>
              <p className="text-sm text-muted-foreground">
                Receive push notifications
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggle("pushNotifications")}
              className={`flex h-6 w-12 items-center rounded-full transition-colors ${
                settings.pushNotifications ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white transition-transform ${
                  settings.pushNotifications ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-bold text-foreground">Privacy</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Private Profile</p>
              <p className="text-sm text-muted-foreground">
                Only approved followers can see your posts
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggle("privateProfile")}
              className={`flex h-6 w-12 items-center rounded-full transition-colors ${
                settings.privateProfile ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white transition-transform ${
                  settings.privateProfile ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-bold text-foreground">Account</h2>
        <div className="space-y-3">
          <button
            type="button"
            className="w-full rounded-lg bg-muted px-4 py-3 text-left font-medium text-foreground transition-colors hover:bg-muted/80"
          >
            Change Password
          </button>
          <button
            type="button"
            className="w-full rounded-lg bg-muted px-4 py-3 text-left font-medium text-foreground transition-colors hover:bg-muted/80"
          >
            Two-Factor Authentication
          </button>
          <button
            type="button"
            className="w-full rounded-lg bg-destructive/10 px-4 py-3 text-left font-medium text-destructive transition-colors hover:bg-destructive/20"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
