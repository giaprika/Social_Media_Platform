import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AdjustmentsHorizontalIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EnvelopeOpenIcon,
  PlusCircleIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const filterOptions = [
  { id: "channels", label: "Chat channels" },
  { id: "groups", label: "Group chats" },
  { id: "direct", label: "Direct chats" },
  { id: "modmail", label: "Mod mail" },
];

const ChatPanel = ({ isOpen, onClose }) => {
  const panelRef = useRef(null);
  const dropdownRef = useRef(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState(() => new Set(filterOptions.map((option) => option.id)));
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const filtersSummary = useMemo(() => {
    if (selectedFilters.size === filterOptions.length && !showUnreadOnly) {
      return "All conversations";
    }

    const enabled = filterOptions
      .filter((option) => selectedFilters.has(option.id))
      .map((option) => option.label);

    const summary = enabled.length ? enabled.join(", ") : "No filters";
    return showUnreadOnly ? `${summary} • Unread` : summary;
  }, [selectedFilters, showUnreadOnly]);

  const toggleFilter = (id) => {
    setSelectedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const resetFilters = () => {
    setSelectedFilters(new Set(filterOptions.map((option) => option.id)));
    setShowUnreadOnly(false);
  };

  const handleClose = useCallback(() => {
    setIsFiltersOpen(false);
    setIsMinimized(false);
    setIsExpanded(false);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        if (isFiltersOpen) {
          setIsFiltersOpen(false);
        } else {
          handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, isFiltersOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) {
      setIsFiltersOpen(false);
      setIsMinimized(false);
    }
  }, [isOpen]);

  // Floating button when closed
  if (!isOpen) {
    return null;
  }

  // Minimized state - just header bar
  if (isMinimized) {
    return (
      <div 
        ref={panelRef} 
        className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <header 
          className="flex items-center justify-between bg-background px-4 py-2.5 cursor-pointer"
          onClick={() => setIsMinimized(false)}
        >
          <div className="flex items-center gap-2">
            <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">Chats</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(false);
              }}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Expand"
            >
              <ChevronUpIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div 
      ref={panelRef} 
      className={clsx(
        "fixed z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-200",
        isExpanded 
          ? "bottom-4 right-4 left-4 top-20 sm:left-auto sm:w-[800px] sm:top-auto sm:h-[600px]" 
          : "bottom-4 right-4 w-[360px] sm:w-[400px]"
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-background px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold text-foreground">Chats</span>
        </div>

        <div className="flex items-center gap-0.5 text-muted-foreground">
          <button
            type="button"
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Mark all as read"
            title="Mark all as read"
          >
            <EnvelopeOpenIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="New chat"
            title="New chat"
          >
            <PlusCircleIcon className="h-4 w-4" />
          </button>
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsFiltersOpen((prev) => !prev)}
              className={clsx(
                "flex items-center rounded-full p-1.5 transition-colors",
                isFiltersOpen ? "bg-primary/15 text-primary" : "hover:bg-muted hover:text-foreground"
              )}
              aria-label="Filter"
              title="Filter chats"
            >
              <UserGroupIcon className="h-4 w-4" />
              <ChevronDownIcon className="h-3 w-3" />
            </button>

            {isFiltersOpen && (
              <div className="absolute right-0 top-9 w-56 rounded-xl border border-border bg-card p-3 shadow-lg z-10">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Threads</span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Reset
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-foreground">
                  {filterOptions.map((option) => (
                    <label key={option.id} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedFilters.has(option.id)}
                        onChange={() => toggleFilter(option.id)}
                        className="h-3.5 w-3.5 rounded border-border bg-card text-primary focus:ring-primary"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>

                <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                    <span
                      className={clsx(
                        "relative inline-flex h-4 w-8 items-center rounded-full transition-colors",
                        showUnreadOnly ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={clsx(
                          "absolute left-0.5 h-3 w-3 rounded-full bg-card shadow transition-transform",
                          showUnreadOnly ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </span>
                    Unread
                    <input
                      type="checkbox"
                      checked={showUnreadOnly}
                      onChange={() => setShowUnreadOnly((prev) => !prev)}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(false)}
                    className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Open in new window"
            title="Open in new window"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ArrowsPointingInIcon className="h-4 w-4" />
            ) : (
              <ArrowsPointingOutIcon className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Minimize"
            title="Minimize"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Close"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className={clsx(
        "grid",
        isExpanded ? "grid-cols-[200px_1fr] h-[calc(100%-45px)]" : "grid-cols-1"
      )}>
        {/* Sidebar - only show when expanded */}
        {isExpanded && (
          <aside className="border-r border-border bg-background/80 overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <button
                type="button"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-foreground">Threads</span>
            </div>

            <div className="px-3 py-3">
              <p className="text-xs text-muted-foreground">No threads yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                They'll show up here.
              </p>
            </div>
          </aside>
        )}

        {/* Main content */}
        <section className={clsx(
          "flex flex-col items-center justify-center gap-3 bg-muted/20 text-center",
          isExpanded ? "py-8" : "py-10"
        )}>
          <div className={clsx(
            "flex items-center justify-center rounded-full bg-primary/10",
            isExpanded ? "h-20 w-20" : "h-16 w-16"
          )}>
            <ChatBubbleOvalLeftEllipsisIcon className={clsx(
              "text-primary",
              isExpanded ? "h-10 w-10" : "h-8 w-8"
            )} />
          </div>
          <div className="px-4">
            <h3 className={clsx(
              "font-semibold text-foreground",
              isExpanded ? "text-lg" : "text-base"
            )}>Welcome to chat!</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-[240px]">
              Start a direct or group chat with other users.
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <PlusCircleIcon className="h-4 w-4" />
            Start new chat
          </button>
        </section>
      </div>
    </div>
  );
};

export default ChatPanel;
