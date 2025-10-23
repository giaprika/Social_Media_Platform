import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AdjustmentsHorizontalIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsPointingOutIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ChevronDownIcon,
  EnvelopeOpenIcon,
  PlusCircleIcon,
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
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      const panelNode = panelRef.current;
      const dropdownNode = dropdownRef.current;

      if (panelNode && !panelNode.contains(event.target)) {
        handleClose();
        return;
      }

      if (dropdownNode && !dropdownNode.contains(event.target)) {
        setIsFiltersOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) {
      setIsFiltersOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div ref={panelRef} className="fixed bottom-6 right-6 z-50 w-[720px] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
          <div className="flex items-center gap-2">
            <ChatBubbleOvalLeftEllipsisIcon className="h-6 w-6 text-primary" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-foreground">Chats</span>
              <span className="text-xs text-muted-foreground">{filtersSummary}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-muted-foreground">
            <button
              type="button"
              className="rounded-full p-2 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Mark all messages as read"
            >
              <EnvelopeOpenIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="rounded-full p-2 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Start a new chat"
            >
              <PlusCircleIcon className="h-5 w-5" />
            </button>
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsFiltersOpen((prev) => !prev)}
                className={clsx(
                  "flex items-center gap-1 rounded-full p-2 transition-colors",
                  isFiltersOpen ? "bg-primary/15 text-primary" : "hover:bg-muted hover:text-foreground"
                )}
                aria-expanded={isFiltersOpen}
                aria-haspopup="menu"
                aria-label="Filter chats"
              >
                <AdjustmentsHorizontalIcon className="h-5 w-5" />
                <ChevronDownIcon className="h-4 w-4" />
              </button>

              {isFiltersOpen && (
                <div className="absolute right-0 top-11 w-64 rounded-2xl border border-border bg-card p-3 shadow-lg">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Threads</span>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="space-y-2 text-sm text-foreground">
                    {filterOptions.map((option) => (
                      <label key={option.id} className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedFilters.has(option.id)}
                          onChange={() => toggleFilter(option.id)}
                          className="h-4 w-4 rounded border-border bg-card text-primary focus:ring-primary"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <label className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
                      <span
                        className={clsx(
                          "relative inline-flex h-5 w-10 items-center rounded-full transition-colors",
                          showUnreadOnly ? "bg-primary" : "bg-muted"
                        )}
                      >
                        <span
                          className={clsx(
                            "absolute left-1 h-4 w-4 rounded-full bg-card shadow transition-transform",
                            showUnreadOnly ? "translate-x-5" : "translate-x-0"
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
                      className="rounded-full bg-primary px-4 py-1 text-sm font-semibold text-primary-foreground"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className="rounded-full p-2 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Open chat in new window"
            >
              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="rounded-full p-2 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Expand chat"
            >
              <ArrowsPointingOutIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full p-2 transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="Close chat"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-r border-border bg-background/80">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <button
                type="button"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-foreground">Threads</span>
            </div>

            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground">You don't have any threads yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                When you do, they'll show up here.
              </p>
            </div>
          </aside>

          <section className="flex flex-col items-center justify-center gap-4 bg-muted/20 py-12 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
              <ChatBubbleOvalLeftEllipsisIcon className="h-12 w-12 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Welcome to chat!</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a direct or group chat with other people in the community.
              </p>
            </div>
            <button
              type="button"
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start new chat
            </button>
          </section>
        </div>
    </div>
  );
};

export default ChatPanel;
