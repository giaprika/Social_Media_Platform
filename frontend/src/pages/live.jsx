import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BoltIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  PlayCircleIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  VideoCameraIcon,
  WifiIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";
import { differenceInMinutes, formatDistanceToNow, format } from "date-fns";
import { useToast } from "src/components/ui";
import Modal from "src/components/ui/Modal";
import Button from "src/components/ui/Button";
import { createStream, getLiveFeed, LIVE_SERVICE_BASE_URL } from "src/api/live";

const sanitizeBaseUrl = (value) => (value ? value.replace(/\/$/, "") : "");
const extractHost = (value) => {
  try {
    return new URL(value).host;
  } catch (error) {
    return value?.replace(/^https?:\/\//, "") || "api.extase.dev";
  }
};

const LIVE_SERVICE_URL = sanitizeBaseUrl(LIVE_SERVICE_BASE_URL || "https://api.extase.dev");
const LIVE_SERVICE_HOST = process.env.REACT_APP_LIVE_SERVER_HOST || extractHost(LIVE_SERVICE_URL);
const LIVE_CDN_BASE_URL = sanitizeBaseUrl(
  process.env.REACT_APP_LIVE_CDN_URL || "https://cdn.extase.dev"
);

const COVER_IMAGES = [
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
];

const QUALITY_PRESETS = ["1080p", "1440p", "4K", "4K HDR"];
const LATENCY_PRESETS = ["0.8s", "1.1s", "1.4s", "1.7s"];

const FILTER_OPTIONS = [
  { id: "all", label: "All active", matcher: () => true },
  { id: "featured", label: "50+ viewers", matcher: (stream) => stream.categoryTags.featured },
  { id: "fresh", label: "Started < 15 min", matcher: (stream) => stream.categoryTags.fresh },
];

// LocalStorage key for scheduled streams
const SCHEDULED_STREAMS_KEY = "scheduled_live_streams";

const getScheduledStreams = () => {
  try {
    const stored = localStorage.getItem(SCHEDULED_STREAMS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveScheduledStreams = (streams) => {
  try {
    localStorage.setItem(SCHEDULED_STREAMS_KEY, JSON.stringify(streams));
  } catch (e) {
    console.error("Failed to save scheduled streams:", e);
  }
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const getEnergyLabel = (viewerCount) => {
  if (viewerCount >= 500) return "Chat exploding";
  if (viewerCount >= 150) return "Momentum rising";
  if (viewerCount >= 50) return "Steady groove";
  if (viewerCount > 0) return "Cozy room";
  return "Waiting room";
};

const hydrateStream = (stream, index) => {
  const startedAt = stream.started_at ? new Date(stream.started_at) : null;
  const minutesLive = startedAt ? Math.max(0, differenceInMinutes(new Date(), startedAt)) : null;
  const liveForLabel = startedAt ? formatDistanceToNow(startedAt, { addSuffix: false }) : "just now";
  const viewerCount = stream.viewer_count ?? 0;

  return {
    id: stream.id,
    title: stream.title || "Untitled stream",
    host: stream.username || `user_${(stream.user_id || "live").slice(0, 6)}`,
    handle: stream.user_id ? `@${(stream.user_id || "live").slice(0, 8)}` : "@live",
    viewerCount,
    hlsUrl: stream.hls_url || `${LIVE_CDN_BASE_URL}/live/${stream.id}.m3u8`,
    startedAt,
    liveForLabel,
    minutesLive,
    status: stream.status,
    cover: COVER_IMAGES[index % COVER_IMAGES.length],
    avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${stream.user_id || stream.id || index}`,
    quality: QUALITY_PRESETS[index % QUALITY_PRESETS.length],
    latency: LATENCY_PRESETS[index % LATENCY_PRESETS.length],
    energy: getEnergyLabel(viewerCount),
    location: stream.location || "Remote • Live",
    description:
      stream.description?.trim() ||
      "Streaming live on SocialApp. Join chat and help steer the show.",
    categoryTags: {
      featured: viewerCount >= 50,
      fresh: (minutesLive ?? Infinity) < 15,
    },
  };
};

const LiveStreams = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState(FILTER_OPTIONS[0].id);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState({ title: "", description: "" });
  const [scheduleForm, setScheduleForm] = useState({ title: "", description: "", scheduledAt: "" });
  const [creating, setCreating] = useState(false);

  // Scheduled streams from localStorage
  const [scheduledStreams, setScheduledStreams] = useState(() => getScheduledStreams());

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadStreams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getLiveFeed({ page: 1, limit: 12 });
      const normalized = (data.streams || []).map((stream, index) => hydrateStream(stream, index));
      setStreams(normalized);
    } catch (err) {
      console.error("Failed to load live feed", err);
      setError(
        err.response?.data?.message || "Unable to load live streams. Please try again later."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);

  const filteredStreams = useMemo(() => {
    const filter = FILTER_OPTIONS.find((option) => option.id === activeFilter);
    if (!filter) return streams;
    return streams.filter(filter.matcher);
  }, [streams, activeFilter]);

  const heroStats = useMemo(() => {
    if (!streams.length) {
      return [
        { id: "streams", label: "ACTIVE STREAMS", value: "0", icon: VideoCameraIcon, color: "text-primary" },
        { id: "viewers", label: "TOTAL VIEWERS", value: "0", icon: EyeIcon, color: "text-purple-500" },
        { id: "duration", label: "AVG RUNTIME", value: "0 min", icon: ClockIcon, color: "text-blue-500" },
      ];
    }

    const totalViewers = streams.reduce((sum, stream) => sum + stream.viewerCount, 0);
    const avgMinutes =
      streams.reduce((sum, stream) => sum + (stream.minutesLive ?? 0), 0) / streams.length;

    return [
      { id: "streams", label: "ACTIVE STREAMS", value: streams.length.toString(), icon: VideoCameraIcon, color: "text-primary" },
      { id: "viewers", label: "TOTAL VIEWERS", value: numberFormatter.format(totalViewers), icon: EyeIcon, color: "text-purple-500" },
      { id: "duration", label: "AVG RUNTIME", value: `${Math.max(1, Math.round(avgMinutes || 1))} min`, icon: ClockIcon, color: "text-blue-500" },
    ];
  }, [streams]);

  const spotlightStreams = useMemo(() => streams.slice(0, 3), [streams]);

  // Navigate to in-app watch page
  const handleJoinStream = (stream) => {
    navigate(`/app/live/watch/${stream.id}`, { state: { stream } });
  };

  // Create stream for Browser (WebRTC)
  const handleCreateBrowserStream = async (event) => {
    event.preventDefault();
    if (!createForm.title.trim()) {
      toast.error("Please enter a title for your stream");
      return;
    }

    setCreating(true);
    try {
      const payload = {
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
      };
      const { data } = await createStream(payload);
      toast.success("Stream ready! Redirecting to studio...");

      setTimeout(() => {
        navigate("/app/live/studio", {
          state: { stream: data }
        });
      }, 500);
    } catch (err) {
      console.error("Failed to create stream", err);
      const message =
        err.response?.data?.message || "Unable to create stream. Please try again.";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  // Create stream for OBS
  const handleCreateOBSStream = async (event) => {
    event.preventDefault();
    if (!createForm.title.trim()) {
      toast.error("Please enter a title for your stream");
      return;
    }

    setCreating(true);
    try {
      const payload = {
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
      };
      const { data } = await createStream(payload);
      toast.success("Stream created! Redirecting to OBS Studio...");

      // Navigate to OBS studio page
      setTimeout(() => {
        navigate("/app/live/studio-obs", {
          state: { stream: data }
        });
      }, 500);
    } catch (err) {
      console.error("Failed to create stream", err);
      const message =
        err.response?.data?.message || "Unable to create stream. Please try again.";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  // Schedule a stream
  const handleScheduleStream = (event) => {
    event.preventDefault();
    if (!scheduleForm.title.trim() || !scheduleForm.scheduledAt) {
      toast.error("Please fill in all required fields");
      return;
    }

    const newScheduled = {
      id: `scheduled-${Date.now()}`,
      title: scheduleForm.title.trim(),
      description: scheduleForm.description.trim(),
      scheduledAt: scheduleForm.scheduledAt,
      createdAt: new Date().toISOString(),
    };

    const updated = [...scheduledStreams, newScheduled];
    setScheduledStreams(updated);
    saveScheduledStreams(updated);

    setIsScheduleModalOpen(false);
    setScheduleForm({ title: "", description: "", scheduledAt: "" });
    toast.success("Stream scheduled successfully!");
  };

  // Delete scheduled stream
  const handleDeleteScheduled = (id) => {
    const updated = scheduledStreams.filter((s) => s.id !== id);
    setScheduledStreams(updated);
    saveScheduledStreams(updated);
    toast.info("Scheduled stream removed");
  };

  // Copy to clipboard
  const handleCopy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied!`);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const resetCreateForm = () => {
    setCreateForm({ title: "", description: "" });
    setCreating(false);
  };

  // Format scheduled date
  const formatScheduledDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return format(date, "EEE, MMM d • HH:mm");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Subtle animated background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-[600px] w-[600px] animate-pulse rounded-full bg-primary/5 blur-3xl" style={{ animationDuration: "4s" }} />
        <div className="absolute -right-1/4 top-1/3 h-[500px] w-[500px] animate-pulse rounded-full bg-accent/5 blur-3xl" style={{ animationDuration: "5s", animationDelay: "2s" }} />
      </div>

      <div className="relative z-10 space-y-10 px-4 py-8 text-foreground sm:px-6 lg:px-8">
        {/* Hero Section */}
        <section className="relative mx-auto max-w-7xl rounded-3xl border border-border bg-card shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
          <div className="relative grid gap-8 px-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
            <div className="space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Live control room
              </p>
              <div>
                <h1 className="text-4xl font-semibold leading-tight text-foreground sm:text-5xl">Live Streams</h1>
                <p className="mt-4 max-w-xl text-base text-muted-foreground">
                  Watch active live streams, attract viewers to your broadcast, and manage connections with just a few clicks.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {/* Go Live Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <Button
                    className="rounded-full px-5 py-2"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    <VideoCameraIcon className="h-5 w-5" />
                    Go Live
                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
                  </Button>

                  {isDropdownOpen && (
                    <div className="absolute left-0 top-full z-[100] mt-2 w-72 overflow-visible rounded-xl border border-border bg-card p-2 shadow-xl">
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted transition-colors"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          setCreateForm({ title: "", description: "", isOBS: false });
                          setIsCreateModalOpen(true);
                        }}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <VideoCameraIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Stream from Browser</p>
                          <p className="text-xs text-muted-foreground">Use webcam & microphone</p>
                        </div>
                      </button>
                      <div className="my-1 border-t border-border" />
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted transition-colors"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          setCreateForm({ title: "", description: "", isOBS: true });
                          setIsCreateModalOpen(true);
                        }}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                          <ComputerDesktopIcon className="h-5 w-5 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Stream with OBS</p>
                          <p className="text-xs text-muted-foreground">Get RTMP URL & Stream Key</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="rounded-full px-5 py-2"
                  onClick={() => setIsScheduleModalOpen(true)}
                >
                  <CalendarDaysIcon className="h-5 w-5" />
                  Plan Stream
                </Button>
              </div>
            </div>

            {/* Network Pulse - Improved Design */}
            <div className="rounded-3xl border border-border bg-gradient-to-br from-muted/50 to-muted/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-muted-foreground">Network pulse</p>
                <span className="flex items-center gap-1.5 text-xs text-green-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {heroStats.map(({ id, label, value, icon: Icon, color }) => (
                  <div key={id} className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md">
                    <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-xl" />
                    <Icon className={`relative h-6 w-6 ${color}`} />
                    <p className="relative mt-3 text-3xl font-bold text-foreground tracking-tight">{value}</p>
                    <span className="relative mt-1 block text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl space-y-8">
          {error && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex items-center justify-between">
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={loadStreams}>
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {/* Active Rooms Section */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Active Rooms</h2>
                <p className="text-sm text-muted-foreground">Select a room to watch or jump to the player demo.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setActiveFilter(option.id)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${activeFilter === option.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {loading &&
                Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="h-80 animate-pulse rounded-2xl border border-border bg-muted/40"
                  />
                ))}

              {!loading && !filteredStreams.length && (
                <div className="col-span-full rounded-2xl border border-border bg-card p-10 text-center">
                  <p className="text-lg font-semibold text-foreground">No streams currently live</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Be the first to go live by clicking "Go Live", or check back later.
                  </p>
                </div>
              )}

              {!loading &&
                filteredStreams.map((stream) => (
                  <article
                    key={stream.id}
                    className="group relative flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/30"
                  >
                    <div className="relative overflow-hidden rounded-2xl border border-border shadow-sm">
                      <img src={stream.cover} alt={stream.title} className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white">
                        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                        LIVE {stream.latency}
                      </div>
                      <div className="absolute bottom-3 left-3 flex items-center gap-3 text-white/90">
                        <div className="flex items-center gap-1 text-xs">
                          <EyeIcon className="h-4 w-4" />
                          {numberFormatter.format(stream.viewerCount)} watching
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <BoltIcon className="h-4 w-4" />
                          {stream.energy}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <img src={stream.avatar} alt={stream.host} className="h-12 w-12 rounded-2xl object-cover border border-border" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{stream.host}</p>
                        <p className="text-xs text-muted-foreground">{stream.handle}</p>
                      </div>
                      {stream.categoryTags.featured && (
                        <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          Featured
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{stream.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{stream.description}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <WifiIcon className="h-4 w-4" />
                        {stream.quality}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <ClockIcon className="h-4 w-4" />
                        {stream.liveForLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        className="flex-1 rounded-2xl"
                        onClick={() => handleJoinStream(stream)}
                      >
                        <PlayCircleIcon className="h-5 w-5" />
                        Join Stream
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => window.open(stream.hlsUrl, "_blank", "noopener,noreferrer")}
                      >
                        HLS
                      </Button>
                    </div>
                  </article>
                ))}
            </div>
          </section>

          {/* Spotlight & Scheduled */}
          <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Spotlight</p>
                  <h3 className="mt-2 text-2xl font-semibold text-foreground">High-energy Studios</h3>
                </div>
                <SparklesIcon className="h-8 w-8 text-primary" />
              </div>
              <div className="mt-6 space-y-4">
                {spotlightStreams.length === 0 && (
                  <p className="text-sm text-muted-foreground">No featured sessions right now.</p>
                )}
                {spotlightStreams.map((stream) => (
                  <div key={stream.id} className="flex items-center gap-4 rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="relative h-16 w-28 overflow-hidden rounded-xl">
                      <img src={stream.cover} alt={stream.title} className="h-full w-full object-cover" />
                      <span className="absolute inset-x-2 bottom-2 rounded-full bg-black/70 px-2 py-0.5 text-center text-xs text-white">
                        {numberFormatter.format(stream.viewerCount)} live
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{stream.title}</p>
                      <p className="text-xs text-muted-foreground">{stream.host}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{stream.energy}</p>
                      <p className="font-semibold text-foreground">{stream.latency}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scheduled Streams from LocalStorage */}
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Upcoming</p>
                  <h3 className="mt-2 text-2xl font-semibold text-foreground">Scheduled Drops</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setIsScheduleModalOpen(true)}
                >
                  <PlusIcon className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-4">
                {scheduledStreams.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                    <CalendarDaysIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">No scheduled streams</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => setIsScheduleModalOpen(true)}
                    >
                      Plan your first stream
                    </Button>
                  </div>
                )}
                {scheduledStreams.map((session) => (
                  <div key={session.id} className="group rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-semibold text-foreground">{session.title}</p>
                      <button
                        type="button"
                        onClick={() => handleDeleteScheduled(session.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {session.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{session.description}</p>
                    )}
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                        <ClockIcon className="h-4 w-4" />
                        {formatScheduledDate(session.scheduledAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Create Stream Modal (Browser/OBS) */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          resetCreateForm();
        }}
        title={createForm.isOBS ? "Stream with OBS Studio" : "Go Live from Browser"}
        size="lg"
      >
        <div className="space-y-6">
          <form className="space-y-4" onSubmit={createForm.isOBS ? handleCreateOBSStream : handleCreateBrowserStream}>
            <div>
              <label className="text-sm font-medium text-foreground">Stream Title *</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g., Building realtime feed"
                value={createForm.title}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                rows={3}
                placeholder="What will you be streaming about?"
                value={createForm.description}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            {createForm.isOBS && (
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <p className="font-medium text-foreground">💡 OBS Setup</p>
                <p className="mt-1 text-muted-foreground">
                  After creating, you'll receive an RTMP URL and Stream Key to use in OBS Studio.
                </p>
              </div>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  resetCreateForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={creating}>
                {createForm.isOBS ? "Get Stream Key" : "Start Streaming"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Schedule Stream Modal */}
      <Modal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setScheduleForm({ title: "", description: "", scheduledAt: "" });
        }}
        title="Plan a Stream"
        size="lg"
      >
        <form className="space-y-4" onSubmit={handleScheduleStream}>
          <div>
            <label className="text-sm font-medium text-foreground">Stream Title *</label>
            <input
              type="text"
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="What will you be streaming?"
              value={scheduleForm.title}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={2}
              placeholder="Brief description..."
              value={scheduleForm.description}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Scheduled Date & Time *</label>
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={scheduleForm.scheduledAt}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
              required
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsScheduleModalOpen(false);
                setScheduleForm({ title: "", description: "", scheduledAt: "" });
              }}
            >
              Cancel
            </Button>
            <Button type="submit">
              <CalendarDaysIcon className="h-4 w-4" />
              Schedule Stream
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default LiveStreams;
