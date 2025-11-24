import { useState } from "react";
import { ChevronRightIcon, CheckIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import useAuth from "src/hooks/useAuth";
import Card from "src/components/ui/Card";
import Modal from "src/components/ui/Modal";
import Input from "src/components/ui/Input";
import Button from "src/components/ui/Button";
import { useToast } from "src/components/ui";
import { updateUser, updatePassword } from "src/api/user";

const SettingsTabs = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: "account", label: "Account" },
    { id: "profile", label: "Profile" },
    { id: "privacy", label: "Privacy" },
    { id: "preferences", label: "Preferences" },
    { id: "notifications", label: "Notifications" },
    { id: "email", label: "Email" },
  ];

  return (
    <div className="mb-6">
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-muted/30 p-1.5 rounded-lg border border-border/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange?.(tab.id)}
            className={clsx(
              "px-4 py-2 text-sm font-medium whitespace-nowrap transition-all rounded-md relative",
              activeTab === tab.id
                ? "bg-card text-primary font-semibold shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const SettingItem = ({ label, value, onClick, rightElement }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between py-3 px-4 text-left hover:bg-muted/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {value && <p className="text-xs text-muted-foreground mt-0.5 truncate">{value}</p>}
      </div>
      <div className="ml-4 flex-shrink-0">
        {rightElement || <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />}
      </div>
    </button>
  );
};

const ToggleSwitch = ({ enabled, onChange, label, description }) => {
  return (
    <div className="flex items-center justify-between py-3 px-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={clsx(
          "ml-4 relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
          enabled ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={clsx(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
            enabled ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
};

const ConnectButton = ({ connected, onConnect, onDisconnect, label, description }) => {
  return (
    <div className="flex items-center justify-between py-3 px-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={connected ? onDisconnect : onConnect}
        className={clsx(
          "ml-4 flex-shrink-0 px-4 py-1.5 text-xs font-medium rounded-full transition-colors",
          connected
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {connected ? "Disconnect" : "Connect"}
      </button>
    </div>
  );
};

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("account");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  
  // Modal states
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  
  // Form states
  const [newEmail, setNewEmail] = useState("");
  const [selectedGender, setSelectedGender] = useState(user?.gender || "Man");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSaveEmail = () => {
    if (!newEmail.trim()) {
      toast.error("Vui lòng nhập email mới");
      return;
    }
    // TODO: API call
    toast.success("Đã cập nhật email thành công");
    setEmailModalOpen(false);
    setNewEmail("");
  };

  const handleSaveGender = () => {
    // TODO: API call
    toast.success("Đã cập nhật giới tính thành công");
    setGenderModalOpen(false);
  };

  const handleSavePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    // TODO: API call
    toast.success("Đã đổi mật khẩu thành công");
    setPasswordModalOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleDeleteAccount = () => {
    // TODO: API call
    toast.success("Tài khoản đã được xóa");
    setDeleteAccountModalOpen(false);
  };

  const genderOptions = [
    { value: "Woman", label: "Woman" },
    { value: "Man", label: "Man" },
    { value: "Non-binary", label: "Non-binary" },
    { value: "I prefer not to say", label: "I prefer not to say" },
    { value: "custom", label: "I refer to myself as..." },
  ];

  const renderAccountTab = () => (
    <div className="space-y-8">
      {/* General */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          General
        </h3>
        <Card className="p-0 divide-y divide-border">
          <SettingItem
            label="Email address"
            value={user?.email || "nmc27705@gmail.com"}
            onClick={() => setEmailModalOpen(true)}
          />
          <SettingItem
            label="Gender"
            value={user?.gender || selectedGender}
            onClick={() => setGenderModalOpen(true)}
          />
          <SettingItem
            label="Location customization"
            value="Use approximate location (based on IP)"
            onClick={() => console.log("Edit location")}
          />
        </Card>
      </div>

      {/* Account authorization */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          Account authorization
        </h3>
        <Card className="p-0 divide-y divide-border">
          <ConnectButton
            connected={googleConnected}
            onConnect={() => setGoogleConnected(true)}
            onDisconnect={() => setGoogleConnected(false)}
            label="Google"
            description="Connect to log in to SocialApp with your Google account"
          />
          <ToggleSwitch
            enabled={twoFactorEnabled}
            onChange={setTwoFactorEnabled}
            label="Two-factor authentication"
          />
        </Card>
      </div>

      {/* Security */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          Security
        </h3>
        <Card className="p-0">
          <SettingItem
            label="Change password"
            onClick={() => setPasswordModalOpen(true)}
          />
        </Card>
      </div>

      {/* Advanced */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          Advanced
        </h3>
        <Card className="p-0">
          <SettingItem
            label="Delete account"
            onClick={() => setDeleteAccountModalOpen(true)}
            rightElement={
              <span className="text-destructive text-sm font-medium">Delete</span>
            }
          />
        </Card>
      </div>
    </div>
  );

  const renderProfileTab = () => (
    <div className="space-y-8">
      <Card>
        <p className="text-sm text-muted-foreground">Profile settings coming soon...</p>
      </Card>
    </div>
  );

  const renderPrivacyTab = () => (
    <div className="space-y-8">
      <Card>
        <p className="text-sm text-muted-foreground">Privacy settings coming soon...</p>
      </Card>
    </div>
  );

  const renderPreferencesTab = () => (
    <div className="space-y-8">
      <Card>
        <p className="text-sm text-muted-foreground">Preferences settings coming soon...</p>
      </Card>
    </div>
  );

  const renderNotificationsTab = () => (
    <div className="space-y-8">
      <Card>
        <p className="text-sm text-muted-foreground">Notification settings coming soon...</p>
      </Card>
    </div>
  );

  const renderEmailTab = () => (
    <div className="space-y-8">
      <Card>
        <p className="text-sm text-muted-foreground">Email settings coming soon...</p>
      </Card>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "account":
        return renderAccountTab();
      case "profile":
        return renderProfileTab();
      case "privacy":
        return renderPrivacyTab();
      case "preferences":
        return renderPreferencesTab();
      case "notifications":
        return renderNotificationsTab();
      case "email":
        return renderEmailTab();
      default:
        return renderAccountTab();
    }
  };

  return (
    <div className="bg-background min-h-screen">
      {/* Header Section */}
      <div className="bg-background border-b border-border/50 sticky top-16 lg:top-20 z-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="py-8">
            <h1 className="text-2xl font-bold text-foreground mb-6">Settings</h1>
            <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {renderTabContent()}
      </div>

      {/* Email Modal */}
      <Modal
        isOpen={emailModalOpen}
        onClose={() => {
          setEmailModalOpen(false);
          setNewEmail("");
        }}
        title="Email"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEmailModalOpen(false);
                setNewEmail("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEmail}>Save</Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          This information may be used to improve your recommendations and ads.
        </p>
        <Input
          label="Email address"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder={user?.email || "nmc27705@gmail.com"}
        />
      </Modal>

      {/* Gender Modal */}
      <Modal
        isOpen={genderModalOpen}
        onClose={() => setGenderModalOpen(false)}
        title="Gender"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setGenderModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveGender}>Save</Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          This information may be used to improve your recommendations and ads.
        </p>
        <div className="space-y-1">
          {genderOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedGender(option.value)}
              className={clsx(
                "w-full flex items-center justify-between py-3 px-4 rounded-lg text-left transition-colors",
                selectedGender === option.value
                  ? "bg-muted/50"
                  : "hover:bg-muted/30"
              )}
            >
              <span className="text-sm font-medium text-foreground">{option.label}</span>
              {selectedGender === option.value && (
                <CheckIcon className="h-5 w-5 text-primary" />
              )}
            </button>
          ))}
        </div>
      </Modal>

      {/* Password Modal */}
      <Modal
        isOpen={passwordModalOpen}
        onClose={() => {
          setPasswordModalOpen(false);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        }}
        title="Change password"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPasswordModalOpen(false);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSavePassword}>Save</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
          />
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            helperText="Must be at least 6 characters"
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />
        </div>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        isOpen={deleteAccountModalOpen}
        onClose={() => setDeleteAccountModalOpen(false)}
        title="Delete account"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteAccountModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          Are you sure you want to delete your account? This action cannot be undone. All your data will be permanently deleted.
        </p>
      </Modal>
    </div>
  );
}
