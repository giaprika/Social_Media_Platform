import { useEffect, useRef, useState } from "react";
import { BellIcon } from "@heroicons/react/24/outline";
import { BellIcon as BellIconSolid } from "@heroicons/react/24/solid";
import clsx from "clsx";
import Badge from "../ui/Badge";
import Avatar from "../ui/Avatar";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

const NotificationDropdown = ({ notifications = [], isOpen, onClose, onToggle }) => {
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

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
    if (!timestamp) return "Vừa xong";
    try {
      return formatDistanceToNow(new Date(timestamp), {
        addSuffix: true,
        locale: vi,
      });
    } catch {
      return "Vừa xong";
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

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
              <h3 className="text-lg font-bold text-foreground">Thông báo</h3>
              {unreadCount > 0 && (
                <button className="text-sm text-primary hover:underline">
                  Đánh dấu tất cả đã đọc
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <BellIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Chưa có thông báo nào
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={clsx(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-muted",
                      !notification.read && "bg-primary/5"
                    )}
                    onClick={() => {
                      // Handle notification click
                      onClose();
                    }}
                  >
                    <div className="flex gap-3">
                      <Avatar
                        src={notification.avatar}
                        name={notification.sender || "System"}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={clsx(
                            "text-sm",
                            !notification.read
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {notification.title || notification.message}
                        </p>
                        {notification.content && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {notification.content}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatTime(notification.createdAt || notification.timestamp)}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <button className="w-full text-center text-sm font-medium text-primary hover:underline">
                Xem tất cả thông báo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;

