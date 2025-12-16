import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellIcon } from "@heroicons/react/24/outline";
import { BellIcon as BellIconSolid } from "@heroicons/react/24/solid";
import clsx from "clsx";
import Avatar from "../ui/Avatar";
import { formatDistanceToNow } from "date-fns";
import { markAsRead } from "../../api/notification";

const NotificationDropdown = ({
  notifications = [],
  unreadCount: propUnreadCount,
  isOpen,
  onClose,
  onToggle,
  onMarkAsRead,
  onMarkAllAsRead,
}) => {
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();
  const [expandedNotificationId, setExpandedNotificationId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const formatTime = (timestamp) => {
    if (!timestamp) return "Just now";
    try {
      return formatDistanceToNow(new Date(timestamp), {
        addSuffix: true,
      });
    } catch {
      return "Just now";
    }
  };

  // Use prop unreadCount if provided, otherwise calculate
  const unreadCount =
    propUnreadCount ?? notifications.filter((n) => !n.is_readed).length;

  const handleNotificationClick = async (notification, event) => {
    // Prevent event if clicking on expand area
    if (event?.target?.closest('.expand-toggle')) {
      event.stopPropagation();
      setExpandedNotificationId(
        expandedNotificationId === notification.id ? null : notification.id
      );
      return;
    }

    // Mark as read if not already
    if (!notification.is_readed) {
      try {
        await markAsRead(notification.id);
        // Call parent callback if provided
        if (onMarkAsRead) {
          onMarkAsRead(notification.id);
        }
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }

    // Navigate to link if provided
    if (notification.link_url) {
      navigate(notification.link_url);
    }

    onClose();
  };

  const handleMarkAllRead = () => {
    if (onMarkAllAsRead) {
      onMarkAllAsRead();
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <BellIconSolid className="h-5 w-5 text-primary" />
        ) : (
          <BellIcon className="h-5 w-5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-xl"
        >
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-sm text-primary hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <BellIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No notifications yet
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => {
                  const isExpanded = expandedNotificationId === notification.id;
                  const bodyText = notification.body_template || notification.content || notification.message || "";
                  const shouldTruncate = bodyText.length > 100;

                  return (
                    <div
                      key={notification.id}
                      className={clsx(
                        "w-full transition-colors",
                        !notification.is_readed && "bg-primary/5"
                      )}
                    >
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-muted"
                        onClick={(e) => handleNotificationClick(notification, e)}
                      >
                        <div className="flex gap-3">
                          <Avatar
                            src={notification.avatar}
                            name={
                              notification.sender ||
                              notification.last_actor_name ||
                              "System"
                            }
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className={clsx(
                                "text-sm",
                                !notification.is_readed
                                  ? "font-semibold text-foreground"
                                  : "text-muted-foreground"
                              )}
                            >
                              {notification.title_template || notification.title}
                            </p>
                            <p className={clsx(
                              "mt-0.5 text-sm text-muted-foreground",
                              !isExpanded && shouldTruncate && "line-clamp-2"
                            )}>
                              {bodyText}
                            </p>
                            {shouldTruncate && (
                              <button
                                className="expand-toggle mt-1 text-xs text-primary hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedNotificationId(
                                    isExpanded ? null : notification.id
                                  );
                                }}
                              >
                                {isExpanded ? "Show less" : "Show more"}
                              </button>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground/70">
                              {formatTime(
                                notification.created_at || notification.createdAt || notification.timestamp
                              )}
                            </p>
                          </div>
                          {!notification.is_readed && (
                            <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <button
                onClick={() => {
                  navigate("/app/notifications");
                  onClose();
                }}
                className="w-full text-center text-sm font-medium text-primary hover:underline"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
