import { useState, useEffect, useRef } from "react";
import { ChevronRightIcon, CheckIcon, EyeIcon, WrenchScrewdriverIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import useAuth from "src/hooks/useAuth";
import Card from "src/components/ui/Card";
import Modal from "src/components/ui/Modal";
import Input from "src/components/ui/Input";
import Button from "src/components/ui/Button";
import Avatar from "src/components/ui/Avatar";
import { useToast } from "src/components/ui";
import { updateUser, updatePassword, getUserSettings, updateUserSettings } from "src/api/user";

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

const SettingItem = ({ label, value, description, onClick, rightElement }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between py-3 px-4 text-left hover:bg-muted/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{value || "Not set"}</p>
        )}
      </div>
      <div className="ml-4 flex-shrink-0">
        {rightElement || <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />}
      </div>
    </button>
  );
};

const ToggleSwitch = ({ enabled, onChange, label, description, disabled = false }) => {
  return (
    <div className={clsx(
      "flex items-center justify-between py-3 px-4",
      disabled && "opacity-50 cursor-not-allowed"
    )}>
      <div className="flex-1 min-w-0">
        <p className={clsx(
          "text-sm font-medium",
          disabled ? "text-muted-foreground" : "text-foreground"
        )}>{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        className={clsx(
          "ml-4 relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
          enabled ? "bg-primary" : "bg-muted",
          disabled && "cursor-not-allowed opacity-50"
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

const RadioButton = ({ checked, onChange, label, description, icon: Icon }) => {
  return (
    <button
      type="button"
      onClick={onChange}
      className={clsx(
        "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors",
        checked ? "bg-muted/50" : "hover:bg-muted/30"
      )}
    >
      <div className={clsx(
        "mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
        checked ? "border-primary" : "border-border"
      )}>
        {checked && <div className="h-2 w-2 rounded-full bg-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </button>
  );
};

const Checkbox = ({ checked, onChange, label, description }) => {
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
        onClick={() => onChange(!checked)}
        className={clsx(
          "ml-4 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
          checked
            ? "bg-primary border-primary"
            : "border-border hover:border-primary/50"
        )}
      >
        {checked && <CheckIcon className="h-3 w-3 text-primary-foreground" />}
      </button>
    </div>
  );
};

export default function Settings() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("account");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  
  // Modal states
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [fullNameModalOpen, setFullNameModalOpen] = useState(false);
  const [birthDateModalOpen, setBirthDateModalOpen] = useState(false);
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  
  // Form states
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newBirthDate, setNewBirthDate] = useState("");
  const [selectedGender, setSelectedGender] = useState(user?.gender || "Man");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Profile states
  const [displayName, setDisplayName] = useState(user?.username || "");
  const [aboutDescription, setAboutDescription] = useState("");
  const [contentVisibility, setContentVisibility] = useState("show_all"); // show_all, customize, hide_all
  const [showFollowerCount, setShowFollowerCount] = useState(true);
  
  // Privacy states
  const [allowFollow, setAllowFollow] = useState(true);
  const [chatRequests, setChatRequests] = useState("everyone"); // everyone, accounts_only, nobody
  const [showInSearch, setShowInSearch] = useState(true);
  
  // Email states
  const [adminNotifications, setAdminNotifications] = useState(false);
  const [chatRequestsEmail, setChatRequestsEmail] = useState(false);
  const [newUserWelcome, setNewUserWelcome] = useState(false);
  const [commentsOnPosts, setCommentsOnPosts] = useState(false);
  const [repliesToComments, setRepliesToComments] = useState(false);
  const [likesOnPosts, setLikesOnPosts] = useState(false);
  const [likesOnComments, setLikesOnComments] = useState(false);
  const [usernameMentions, setUsernameMentions] = useState(false);
  const [newFollowers, setNewFollowers] = useState(false);
  const [weeklyRecap, setWeeklyRecap] = useState(true);
  const [weeklyTopic, setWeeklyTopic] = useState(false);
  const [unsubscribeAll, setUnsubscribeAll] = useState(false);
  
  // Notifications states
  const [adminNotificationsNotif, setAdminNotificationsNotif] = useState(false);
  const [chatRequestsNotif, setChatRequestsNotif] = useState(false);
  const [newUserWelcomeNotif, setNewUserWelcomeNotif] = useState(false);
  const [commentsOnPostsNotif, setCommentsOnPostsNotif] = useState(false);
  const [repliesToCommentsNotif, setRepliesToCommentsNotif] = useState(false);
  const [likesOnPostsNotif, setLikesOnPostsNotif] = useState(false);
  const [likesOnCommentsNotif, setLikesOnCommentsNotif] = useState(false);
  const [usernameMentionsNotif, setUsernameMentionsNotif] = useState(false);
  const [newFollowersNotif, setNewFollowersNotif] = useState(false);
  const [weeklyRecapNotif, setWeeklyRecapNotif] = useState(true);
  const [weeklyTopicNotif, setWeeklyTopicNotif] = useState(false);
  const [unsubscribeAllNotif, setUnsubscribeAllNotif] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load settings from API
  useEffect(() => {
    const loadSettings = async () => {
      if (!user?.id || settingsLoaded) return;
      
      try {
        const { data } = await getUserSettings(user.id);
        if (data) {
          // Profile settings
          if (data.profile) {
            setDisplayName(data.profile.displayName || user?.username || "");
            setAboutDescription(data.profile.aboutDescription || "");
            setContentVisibility(data.profile.contentVisibility || "show_all");
            setShowFollowerCount(data.profile.showFollowerCount !== undefined ? data.profile.showFollowerCount : true);
          }
          
          // Privacy settings
          if (data.privacy) {
            setAllowFollow(data.privacy.allowFollow !== undefined ? data.privacy.allowFollow : true);
            setChatRequests(data.privacy.chatRequests || "everyone");
            setShowInSearch(data.privacy.showInSearch !== undefined ? data.privacy.showInSearch : true);
          }
          
          // Email settings
          if (data.email) {
            setAdminNotifications(data.email.adminNotifications || false);
            setChatRequestsEmail(data.email.chatRequests || false);
            setNewUserWelcome(data.email.newUserWelcome || false);
            setCommentsOnPosts(data.email.commentsOnPosts || false);
            setRepliesToComments(data.email.repliesToComments || false);
            setLikesOnPosts(data.email.likesOnPosts || false);
            setLikesOnComments(data.email.likesOnComments || false);
            setUsernameMentions(data.email.usernameMentions || false);
            setNewFollowers(data.email.newFollowers || false);
            setWeeklyRecap(data.email.weeklyRecap !== undefined ? data.email.weeklyRecap : true);
            setWeeklyTopic(data.email.weeklyTopic || false);
            setUnsubscribeAll(data.email.unsubscribeAll || false);
          }
          
          // Notifications settings
          if (data.notifications) {
            setAdminNotificationsNotif(data.notifications.adminNotifications || false);
            setChatRequestsNotif(data.notifications.chatRequests || false);
            setNewUserWelcomeNotif(data.notifications.newUserWelcome || false);
            setCommentsOnPostsNotif(data.notifications.commentsOnPosts || false);
            setRepliesToCommentsNotif(data.notifications.repliesToComments || false);
            setLikesOnPostsNotif(data.notifications.likesOnPosts || false);
            setLikesOnCommentsNotif(data.notifications.likesOnComments || false);
            setUsernameMentionsNotif(data.notifications.usernameMentions || false);
            setNewFollowersNotif(data.notifications.newFollowers || false);
            setWeeklyRecapNotif(data.notifications.weeklyRecap !== undefined ? data.notifications.weeklyRecap : true);
            setWeeklyTopicNotif(data.notifications.weeklyTopic || false);
            setUnsubscribeAllNotif(data.notifications.unsubscribeAll || false);
          }
        }
        setSettingsLoaded(true);
      } catch (error) {
        console.error("Error loading settings:", error);
        // Use default values if loading fails
        setSettingsLoaded(true);
      }
    };
    
    loadSettings();
  }, [user?.id, settingsLoaded]);

  // Auto-save settings with debounce - using ref to avoid infinite loop
  const saveTimeoutRef = useRef(null);
  
  useEffect(() => {
    if (!settingsLoaded || !user?.id) return;
    
    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout
    saveTimeoutRef.current = setTimeout(() => {
      const settings = {
        profile: {
          displayName,
          aboutDescription,
          contentVisibility,
          showFollowerCount,
        },
        privacy: {
          allowFollow,
          chatRequests,
          showInSearch,
        },
        email: {
          adminNotifications,
          chatRequests: chatRequestsEmail,
          newUserWelcome,
          commentsOnPosts,
          repliesToComments,
          likesOnPosts,
          likesOnComments,
          usernameMentions,
          newFollowers,
          weeklyRecap,
          weeklyTopic,
          unsubscribeAll,
        },
        notifications: {
          adminNotifications: adminNotificationsNotif,
          chatRequests: chatRequestsNotif,
          newUserWelcome: newUserWelcomeNotif,
          commentsOnPosts: commentsOnPostsNotif,
          repliesToComments: repliesToCommentsNotif,
          likesOnPosts: likesOnPostsNotif,
          likesOnComments: likesOnCommentsNotif,
          usernameMentions: usernameMentionsNotif,
          newFollowers: newFollowersNotif,
          weeklyRecap: weeklyRecapNotif,
          weeklyTopic: weeklyTopicNotif,
          unsubscribeAll: unsubscribeAllNotif,
        },
      };
      
      updateUserSettings(user.id, settings).catch((error) => {
        console.error("Error saving settings:", error);
      });
    }, 1000); // Debounce 1 second
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    settingsLoaded,
    user?.id,
    displayName,
    aboutDescription,
    contentVisibility,
    showFollowerCount,
    allowFollow,
    chatRequests,
    showInSearch,
    adminNotifications,
    chatRequestsEmail,
    newUserWelcome,
    commentsOnPosts,
    repliesToComments,
    likesOnPosts,
    likesOnComments,
    usernameMentions,
    newFollowers,
    weeklyRecap,
    weeklyTopic,
    unsubscribeAll,
    adminNotificationsNotif,
    chatRequestsNotif,
    newUserWelcomeNotif,
    commentsOnPostsNotif,
    repliesToCommentsNotif,
    likesOnPostsNotif,
    likesOnCommentsNotif,
    usernameMentionsNotif,
    newFollowersNotif,
    weeklyRecapNotif,
    weeklyTopicNotif,
    unsubscribeAllNotif,
  ]);
  
  // Profile modals
  const [displayNameModalOpen, setDisplayNameModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [socialLinksModalOpen, setSocialLinksModalOpen] = useState(false);

  const handleSaveEmail = async () => {
    if (!newEmail.trim()) {
      toast.error("Vui lòng nhập email mới");
      return;
    }
    if (!user?.id) {
      toast.error("Không tìm thấy thông tin người dùng");
      return;
    }
    
    setLoading(true);
    try {
      await updateUser(user.id, { email: newEmail.trim() });
      toast.success("Đã cập nhật email thành công");
      setEmailModalOpen(false);
      setNewEmail("");
      await refresh(); // Refresh user data
    } catch (error) {
      toast.error(error.response?.data?.error || "Có lỗi xảy ra khi cập nhật email");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFullName = async () => {
    if (!newFullName.trim()) {
      toast.error("Vui lòng nhập tên đầy đủ");
      return;
    }
    if (!user?.id) {
      toast.error("Không tìm thấy thông tin người dùng");
      return;
    }
    
    setLoading(true);
    try {
      console.log("Updating full_name:", { userId: user.id, full_name: newFullName.trim() });
      const response = await updateUser(user.id, { full_name: newFullName.trim() });
      console.log("Update response:", response.data);
      toast.success("Đã cập nhật tên đầy đủ thành công");
      setFullNameModalOpen(false);
      setNewFullName("");
      await refresh(); // Refresh user data
    } catch (error) {
      console.error("Error updating full_name:", error);
      toast.error(error.response?.data?.error || "Có lỗi xảy ra khi cập nhật tên");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBirthDate = async () => {
    if (!newBirthDate) {
      toast.error("Vui lòng chọn ngày sinh");
      return;
    }
    if (!user?.id) {
      toast.error("Không tìm thấy thông tin người dùng");
      return;
    }
    
    setLoading(true);
    try {
      console.log("Updating birth_date:", { userId: user.id, birth_date: newBirthDate });
      const response = await updateUser(user.id, { birth_date: newBirthDate });
      console.log("Update response:", response.data);
      toast.success("Đã cập nhật ngày sinh thành công");
      setBirthDateModalOpen(false);
      setNewBirthDate("");
      await refresh(); // Refresh user data
    } catch (error) {
      console.error("Error updating birth_date:", error);
      toast.error(error.response?.data?.error || "Có lỗi xảy ra khi cập nhật ngày sinh");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGender = async () => {
    if (!user?.id) {
      toast.error("Không tìm thấy thông tin người dùng");
      return;
    }
    
    setLoading(true);
    try {
      console.log("Updating gender:", { userId: user.id, gender: selectedGender });
      const response = await updateUser(user.id, { gender: selectedGender });
      console.log("Update response:", response.data);
      toast.success("Đã cập nhật giới tính thành công");
      setGenderModalOpen(false);
      await refresh(); // Refresh user data
    } catch (error) {
      console.error("Error updating gender:", error);
      toast.error(error.response?.data?.error || "Có lỗi xảy ra khi cập nhật giới tính");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePassword = async () => {
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
    if (!user?.id) {
      toast.error("Không tìm thấy thông tin người dùng");
      return;
    }
    
    setLoading(true);
    try {
      await updatePassword(user.id, currentPassword, newPassword);
      toast.success("Đã đổi mật khẩu thành công");
      setPasswordModalOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error.response?.data?.error || "Có lỗi xảy ra khi đổi mật khẩu");
    } finally {
      setLoading(false);
    }
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

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const renderAccountTab = () => (
    <div className="space-y-8">
      {/* General */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          General
        </h3>
        <Card className="p-0 divide-y divide-border">
          <SettingItem
            label="Full name"
            value={user?.full_name}
            onClick={() => {
              setNewFullName(user?.full_name || "");
              setFullNameModalOpen(true);
            }}
          />
          <SettingItem
            label="Email address"
            value={user?.email}
            onClick={() => {
              setNewEmail(user?.email || "");
              setEmailModalOpen(true);
            }}
          />
          <SettingItem
            label="Birth date"
            value={user?.birth_date ? formatDate(user.birth_date) : null}
            onClick={() => {
              setNewBirthDate(user?.birth_date || "");
              setBirthDateModalOpen(true);
            }}
          />
          <SettingItem
            label="Gender"
            value={user?.gender || selectedGender}
            onClick={() => {
              setSelectedGender(user?.gender || "Man");
              setGenderModalOpen(true);
            }}
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

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) {
      toast.error("Vui lòng nhập tên người dùng");
      return;
    }
    const username = displayName.trim().toLowerCase();
    if (username.length < 3 || username.length > 20) {
      toast.error("Tên người dùng phải có từ 3 đến 20 ký tự");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      toast.error("Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới");
      return;
    }
    if (!user?.id) {
      toast.error("Không tìm thấy thông tin người dùng");
      return;
    }
    
    setLoading(true);
    try {
      await updateUser(user.id, { username });
      toast.success("Đã cập nhật tên người dùng thành công");
      setDisplayNameModalOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.error || "Có lỗi xảy ra khi cập nhật tên người dùng");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAbout = async () => {
    // TODO: API call for about description
    toast.success("Đã cập nhật mô tả thành công");
    setAboutModalOpen(false);
  };

  const renderProfileTab = () => (
    <div className="space-y-8">
      {/* General */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          General
        </h3>
        <Card className="p-0 divide-y divide-border">
          <SettingItem
            label="Display name"
            description="Changing your display name won't change your username."
            value={user?.username || "Not set"}
            onClick={() => {
              setDisplayName(user?.username || "");
              setDisplayNameModalOpen(true);
            }}
          />
          <SettingItem
            label="About description"
            onClick={() => {
              setAboutDescription("");
              setAboutModalOpen(true);
            }}
          />
          <SettingItem
            label="Avatar"
            description="Edit your avatar or upload an image."
            onClick={() => setAvatarModalOpen(true)}
          />
          <SettingItem
            label="Banner"
            description="Upload a profile background image."
            onClick={() => setBannerModalOpen(true)}
          />
          <SettingItem
            label="Social links"
            onClick={() => setSocialLinksModalOpen(true)}
          />
        </Card>
      </div>

      {/* Curate your profile */}
            <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          Curate your profile
        </h3>
        <Card className="p-0">
          <div className="p-4 border-b border-border">
            <h4 className="text-sm font-semibold text-foreground mb-1">Curate your profile</h4>
            <p className="text-xs text-muted-foreground">Manage what content shows on your profile.</p>
          </div>
          <div className="p-4">
            <div className="mb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">Content and activity</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {contentVisibility === "show_all" ? "Show all" : contentVisibility === "customize" ? "Customize" : "Hide all"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Posts, comments, and communities you're active in.
              </p>
            </div>
            <div className="space-y-2">
              <RadioButton
                checked={contentVisibility === "show_all"}
                onChange={() => setContentVisibility("show_all")}
                label="Show all"
                description="Show all posts, comments, and communities you're active in on your profile."
                icon={EyeIcon}
              />
              <RadioButton
                checked={contentVisibility === "customize"}
                onChange={() => setContentVisibility("customize")}
                label="Customize"
                description="Choose what posts, comments, and communities you're active in show on your profile."
                icon={WrenchScrewdriverIcon}
              />
              <RadioButton
                checked={contentVisibility === "hide_all"}
                onChange={() => setContentVisibility("hide_all")}
                label="Hide all"
                description="Hide all posts, comments, and communities you're active in on your profile."
                icon={EyeSlashIcon}
              />
            </div>
          </div>
        </Card>
          </div>

      {/* Followers */}
            <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          Followers
        </h3>
        <Card className="p-0">
          <Checkbox
            checked={showFollowerCount}
            onChange={setShowFollowerCount}
            label="Show your follower count"
          />
        </Card>
      </div>

      {/* Note */}
      <div className="text-xs text-muted-foreground">
        <p>
          <span className="text-primary">Profile curation</span> only applies to your profile and your content stays visible in communities. Mods of communities you participate in and redditors whose profile posts you engage with can still see your full profile for moderation.
        </p>
      </div>
    </div>
  );

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear your post views history? This action cannot be undone.")) {
      // TODO: API call
      toast.success("History cleared successfully");
    }
  };

  const renderPrivacyTab = () => (
    <div className="space-y-8">
      {/* Social interactions */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          Social interactions
        </h3>
        <Card className="p-0 divide-y divide-border">
          <ToggleSwitch
            enabled={allowFollow}
            onChange={setAllowFollow}
            label="Allow people to follow you"
            description="Let people follow you to see your profile posts in their home feed"
          />
          <SettingItem
            label="Who can send you chat requests"
            value={chatRequests === "everyone" ? "Everyone" : chatRequests === "accounts_only" ? "Accounts only" : "Nobody"}
            onClick={() => {
              // TODO: Open modal for chat requests settings
              toast.info("Chat requests settings coming soon");
            }}
          />
          <SettingItem
            label="Blocked accounts"
            onClick={() => {
              // TODO: Navigate to blocked accounts page
              toast.info("Blocked accounts page coming soon");
            }}
          />
        </Card>
      </div>

      {/* Discoverability */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          Discoverability
        </h3>
        <Card className="p-0 divide-y divide-border">
          <ToggleSwitch
            enabled={showInSearch}
            onChange={setShowInSearch}
            label="Show up in search results"
            description="Allow search engines like Google to link to your profile in their search results"
          />
        </Card>
      </div>

      {/* Advanced */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
          Advanced
        </h3>
        <Card className="p-0">
          <div className="flex items-center justify-between py-3 px-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Clear history</p>
              <p className="text-xs text-muted-foreground mt-0.5">Delete your post views history</p>
            </div>
            <button
              type="button"
              onClick={handleClearHistory}
              className="ml-4 flex-shrink-0 px-4 py-1.5 text-xs font-medium rounded-full bg-muted text-foreground hover:bg-muted/80 transition-colors"
            >
              Clear
            </button>
          </div>
        </Card>
      </div>
    </div>
  );

  const renderPreferencesTab = () => (
    <div className="space-y-8">
      <Card>
        <p className="text-sm text-muted-foreground">Preferences settings coming soon...</p>
      </Card>
    </div>
  );

  const renderNotificationsTab = () => {
    const isUnsubscribed = unsubscribeAllNotif;
    
    return (
      <div className="space-y-8">
        {/* Messages */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
            Messages
          </h3>
          <Card className="p-0 divide-y divide-border">
            <ToggleSwitch
              enabled={adminNotificationsNotif}
              onChange={setAdminNotificationsNotif}
              label="Admin notifications"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={chatRequestsNotif}
              onChange={setChatRequestsNotif}
              label="Chat requests"
              disabled={isUnsubscribed}
            />
          </Card>
        </div>

        {/* Activity */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
            Activity
          </h3>
          <Card className="p-0 divide-y divide-border">
            <ToggleSwitch
              enabled={newUserWelcomeNotif}
              onChange={setNewUserWelcomeNotif}
              label="New user welcome"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={commentsOnPostsNotif}
              onChange={setCommentsOnPostsNotif}
              label="Comments on your posts"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={repliesToCommentsNotif}
              onChange={setRepliesToCommentsNotif}
              label="Replies to your comments"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={likesOnPostsNotif}
              onChange={setLikesOnPostsNotif}
              label="Likes on your posts"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={likesOnCommentsNotif}
              onChange={setLikesOnCommentsNotif}
              label="Likes on your comments"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={usernameMentionsNotif}
              onChange={setUsernameMentionsNotif}
              label="Username mentions"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={newFollowersNotif}
              onChange={setNewFollowersNotif}
              label="New followers"
              disabled={isUnsubscribed}
            />
          </Card>
        </div>

        {/* Newsletters */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
            Newsletters
          </h3>
          <Card className="p-0 divide-y divide-border">
            <ToggleSwitch
              enabled={weeklyRecapNotif}
              onChange={setWeeklyRecapNotif}
              label="Weekly Recap"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={weeklyTopicNotif}
              onChange={setWeeklyTopicNotif}
              label="Weekly Topic"
              disabled={isUnsubscribed}
            />
          </Card>
        </div>

        {/* Advanced */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
            Advanced
          </h3>
          <Card className="p-0">
            <ToggleSwitch
              enabled={unsubscribeAllNotif}
              onChange={setUnsubscribeAllNotif}
              label="Unsubscribe from all notifications"
            />
          </Card>
        </div>
      </div>
    );
  };

  const renderEmailTab = () => {
    const isUnsubscribed = unsubscribeAll;
    
    return (
      <div className="space-y-8">
        {/* Messages */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
            Messages
          </h3>
          <Card className="p-0 divide-y divide-border">
            <ToggleSwitch
              enabled={adminNotifications}
              onChange={setAdminNotifications}
              label="Admin notifications"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={chatRequestsEmail}
              onChange={setChatRequestsEmail}
              label="Chat requests"
              disabled={isUnsubscribed}
            />
          </Card>
        </div>

        {/* Activity */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
            Activity
          </h3>
          <Card className="p-0 divide-y divide-border">
            <ToggleSwitch
              enabled={newUserWelcome}
              onChange={setNewUserWelcome}
              label="New user welcome"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={commentsOnPosts}
              onChange={setCommentsOnPosts}
              label="Comments on your posts"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={repliesToComments}
              onChange={setRepliesToComments}
              label="Replies to your comments"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={likesOnPosts}
              onChange={setLikesOnPosts}
              label="Likes on your posts"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={likesOnComments}
              onChange={setLikesOnComments}
              label="Likes on your comments"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={usernameMentions}
              onChange={setUsernameMentions}
              label="Username mentions"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={newFollowers}
              onChange={setNewFollowers}
              label="New followers"
              disabled={isUnsubscribed}
            />
          </Card>
        </div>

        {/* Newsletters */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
            Newsletters
          </h3>
          <Card className="p-0 divide-y divide-border">
            <ToggleSwitch
              enabled={weeklyRecap}
              onChange={setWeeklyRecap}
              label="Weekly Recap"
              disabled={isUnsubscribed}
            />
            <ToggleSwitch
              enabled={weeklyTopic}
              onChange={setWeeklyTopic}
              label="Weekly Topic"
              disabled={isUnsubscribed}
            />
          </Card>
        </div>

        {/* Advanced */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">
            Advanced
          </h3>
          <Card className="p-0">
            <ToggleSwitch
              enabled={unsubscribeAll}
              onChange={setUnsubscribeAll}
              label="Unsubscribe from all emails"
            />
          </Card>
        </div>
      </div>
    );
  };

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

      {/* Full Name Modal */}
      <Modal
        isOpen={fullNameModalOpen}
        onClose={() => {
          setFullNameModalOpen(false);
          setNewFullName("");
        }}
        title="Full name"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setFullNameModalOpen(false);
                setNewFullName("");
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveFullName} loading={loading}>
              Save
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          This information may be used to improve your recommendations and ads.
        </p>
        <Input
          label="Full name"
          type="text"
          value={newFullName}
          onChange={(e) => setNewFullName(e.target.value)}
          placeholder="Enter your full name"
        />
      </Modal>

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
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEmail} loading={loading}>
              Save
            </Button>
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

      {/* Birth Date Modal */}
      <Modal
        isOpen={birthDateModalOpen}
        onClose={() => {
          setBirthDateModalOpen(false);
          setNewBirthDate("");
        }}
        title="Birth date"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBirthDateModalOpen(false);
                setNewBirthDate("");
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveBirthDate} loading={loading}>
              Save
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          This information may be used to improve your recommendations and ads.
        </p>
        <Input
          label="Birth date"
          type="date"
          value={newBirthDate}
          onChange={(e) => setNewBirthDate(e.target.value)}
          max={new Date().toISOString().split("T")[0]}
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
            <Button
              variant="outline"
              onClick={() => setGenderModalOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveGender} loading={loading}>
              Save
            </Button>
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
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSavePassword} loading={loading}>
              Save
            </Button>
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

      {/* Display Name Modal */}
      <Modal
        isOpen={displayNameModalOpen}
        onClose={() => {
          setDisplayNameModalOpen(false);
          setDisplayName(user?.username || "");
        }}
        title="Display name"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDisplayNameModalOpen(false);
                setDisplayName(user?.username || "");
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveDisplayName} loading={loading}>
              Save
            </Button>
      </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          Changing your display name won't change your username.
        </p>
        <Input
          label="Display name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={user?.username || "Enter your display name"}
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_]+"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          3-20 characters, letters, numbers, and underscores only
        </p>
      </Modal>

      {/* About Description Modal */}
      <Modal
        isOpen={aboutModalOpen}
        onClose={() => {
          setAboutModalOpen(false);
          setAboutDescription("");
        }}
        title="About description"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAboutModalOpen(false);
                setAboutDescription("");
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveAbout} loading={loading}>
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              About
            </label>
            <textarea
              value={aboutDescription}
              onChange={(e) => setAboutDescription(e.target.value)}
              placeholder="Tell us about yourself"
              rows={6}
              className="w-full rounded-lg border border-border bg-card px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors resize-none"
              maxLength={500}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {aboutDescription.length}/500 characters
            </p>
          </div>
        </div>
      </Modal>

      {/* Avatar Modal */}
      <Modal
        isOpen={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        title="Avatar"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAvatarModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast.success("Avatar updated successfully");
              setAvatarModalOpen(false);
            }}>
              Save
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          Edit your avatar or upload an image.
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <Avatar
              src={user?.avatar || user?.avatar_url}
              name={user?.username || user?.full_name}
              size="3xl"
            />
          </div>
          <input
            type="file"
            accept="image/*"
            className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            onChange={(e) => {
              // TODO: Handle file upload
              console.log("Avatar file selected:", e.target.files[0]);
            }}
          />
        </div>
      </Modal>

      {/* Banner Modal */}
      <Modal
        isOpen={bannerModalOpen}
        onClose={() => setBannerModalOpen(false)}
        title="Banner"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBannerModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast.success("Banner updated successfully");
              setBannerModalOpen(false);
            }}>
              Save
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          Upload a profile background image.
        </p>
        <div className="space-y-4">
          <div className="h-32 w-full rounded-lg bg-muted flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Banner preview</span>
          </div>
          <input
            type="file"
            accept="image/*"
            className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            onChange={(e) => {
              // TODO: Handle file upload
              console.log("Banner file selected:", e.target.files[0]);
            }}
          />
        </div>
      </Modal>

      {/* Social Links Modal */}
      <Modal
        isOpen={socialLinksModalOpen}
        onClose={() => setSocialLinksModalOpen(false)}
        title="Social links"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSocialLinksModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast.success("Social links updated successfully");
              setSocialLinksModalOpen(false);
            }}>
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Website"
            type="url"
            placeholder="https://example.com"
          />
          <Input
            label="Twitter"
            type="text"
            placeholder="@username"
          />
          <Input
            label="Instagram"
            type="text"
            placeholder="@username"
          />
          <Input
            label="Facebook"
            type="url"
            placeholder="https://facebook.com/username"
          />
      </div>
      </Modal>
    </div>
  );
}
