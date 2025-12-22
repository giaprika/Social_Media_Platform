import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  PlayCircleIcon,
  SparklesIcon,
  VideoCameraIcon,
  WifiIcon,
} from "@heroicons/react/24/outline";
import { differenceInMinutes, formatDistanceToNow } from "date-fns";
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
  const LIVE_DEMO_BASE_URL = sanitizeBaseUrl(
    process.env.REACT_APP_LIVE_DEMO_URL || `${LIVE_SERVICE_URL}/demo`
  );
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

  const upcomingSessions = [
    {
      id: "floating-market",
      title: "Floating Market Walkthrough",
      host: "Bao & Linh",
      start: "Tonight • 21:00 ICT",
      timezone: "Streaming from Bangkok",
    },
    {
      id: "midnight-circuit",
      title: "Midnight Circuit B2B",
      host: "DJ Sora",
      start: "Tomorrow • 00:30 JST",
      timezone: "Shibuya rooftop",
    },
    {
      id: "maker-lab",
      title: "Wearable Sensor Sprint",
      host: "Astro Lab",
      start: "Fri • 15:00 CET",
      timezone: "Lisbon garage",
    },
  ];

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
    const [streams, setStreams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeFilter, setActiveFilter] = useState(FILTER_OPTIONS[0].id);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createForm, setCreateForm] = useState({ title: "", description: "" });
    const [creating, setCreating] = useState(false);
    const [createdStream, setCreatedStream] = useState(null);

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
          err.response?.data?.message || "Không thể tải danh sách live stream. Thử lại sau."
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
          { id: "streams", label: "Active streams", value: "—", icon: VideoCameraIcon },
          { id: "viewers", label: "Total viewers", value: "—", icon: EyeIcon },
          { id: "duration", label: "Avg runtime", value: "—", icon: ClockIcon },
        ];
      }

      const totalViewers = streams.reduce((sum, stream) => sum + stream.viewerCount, 0);
      const avgMinutes =
        streams.reduce((sum, stream) => sum + (stream.minutesLive ?? 0), 0) / streams.length;

      return [
        { id: "streams", label: "Active streams", value: streams.length, icon: VideoCameraIcon },
        {
          id: "viewers",
          label: "Total viewers",
          value: numberFormatter.format(totalViewers),
          icon: EyeIcon,
        },
        {
          id: "duration",
          label: "Avg runtime",
          value: `${Math.max(1, Math.round(avgMinutes || 1))} min`,
          icon: ClockIcon,
        },
      ];
    }, [streams]);

    const spotlightStreams = useMemo(() => streams.slice(0, 3), [streams]);

    const buildViewerUrl = (streamId) =>
      `${LIVE_DEMO_BASE_URL}/player.html?server=${LIVE_SERVICE_HOST}&id=${streamId}&autoplay=1`;
    const buildPublisherUrl = (streamId, streamKey) =>
      `${LIVE_DEMO_BASE_URL}/index.html?server=${LIVE_SERVICE_HOST}&id=${streamId}&token=${streamKey}`;

    const handleJoinStream = (stream) => {
      const viewerUrl = buildViewerUrl(stream.id);
      window.open(viewerUrl, "_blank", "noopener,noreferrer");
    };

    const handleCopy = async (value, label) => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        toast.success(`${label} đã được copy`);
      } catch (err) {
        console.error("Copy failed", err);
        toast.error("Không thể copy. Hãy thử thủ công");
      }
    };

    const handleCreateStreamSubmit = async (event) => {
      event.preventDefault();
      if (!createForm.title.trim()) {
        toast.error("Hãy đặt tên cho stream");
        return;
      }

      setCreating(true);
      try {
        const payload = {
          title: createForm.title.trim(),
          description: createForm.description.trim() || undefined,
        };
        const { data } = await createStream(payload);
        setCreatedStream(data);
        toast.success("Đã tạo stream. Bắt đầu phát để lên sóng!");
      } catch (err) {
        console.error("Failed to create stream", err);
        const message =
          err.response?.data?.message || "Không thể tạo stream. Vui lòng thử lại.";
        toast.error(message);
      } finally {
        setCreating(false);
      }
    };

    const resetModalState = () => {
      setCreateForm({ title: "", description: "" });
      setCreating(false);
    };

    const CredentialField = ({ label, value, hint }) => (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
          <code className="flex-1 truncate text-sm text-foreground">{value}</code>
          <button
            type="button"
            onClick={() => handleCopy(value, label)}
            className="rounded-lg border border-border/60 p-2 text-muted-foreground transition hover:text-foreground"
          >
            <DocumentDuplicateIcon className="h-4 w-4" />
          </button>
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    );

    return (
      <div className="space-y-10 text-foreground">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-slate-950 text-white shadow-[0_20px_80px_rgba(15,23,42,0.45)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.35),_transparent_45%)]" />
          <div className="relative grid gap-8 px-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
            <div className="space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.2em] text-white/80">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Live control room
              </p>
              <div>
                <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Live Streams</h1>
                <p className="mt-4 max-w-xl text-base text-white/70">
                  Theo dõi các phòng đang phát trực tiếp, kéo người xem về stream của bạn và cắt kết nối khi cần chỉ với vài thao tác.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-white/90"
                  onClick={() => {
                    setIsCreateModalOpen(true);
                    resetModalState();
                  }}
                >
                  <VideoCameraIcon className="h-5 w-5" />
                  Go live now
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold text-white/90 hover:border-white"
                  onClick={() => window.open(`${LIVE_DEMO_BASE_URL}/index.html?server=${LIVE_SERVICE_HOST}`, "_blank", "noopener,noreferrer")}
                >
                  <PlayCircleIcon className="h-5 w-5" />
                  Open studio demo
                </Button>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm text-white/70">Network pulse</p>
              <div className="grid grid-cols-3 gap-4">
                {heroStats.map(({ id, label, value, icon: Icon }) => (
                  <div key={id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <Icon className="h-5 w-5 text-indigo-200" />
                    <p className="mt-4 text-2xl font-semibold">{value}</p>
                    <span className="text-xs uppercase tracking-wide text-white/50">{label}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-relaxed text-white/70">
                <p className="text-white">Push rule-based moderations trực tiếp từ cùng 1 dashboard.</p>
                <p>Server live tại {LIVE_SERVICE_HOST}, CDN playback tại {LIVE_CDN_BASE_URL}.</p>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-center justify-between">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={loadStreams}>
                Thử lại
              </Button>
            </div>
          </div>
        )}

        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Active rooms</h2>
              <p className="text-sm text-muted-foreground">Chọn phòng muốn xem hoặc nhảy sang player demo.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setActiveFilter(option.id)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                    activeFilter === option.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
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
                  className="h-80 animate-pulse rounded-2xl border border-border/60 bg-muted/40"
                />
              ))}

            {!loading && !filteredStreams.length && (
              <div className="col-span-full rounded-2xl border border-border bg-card/70 p-10 text-center">
                <p className="text-lg font-semibold">Chưa có stream nào đang phát</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Là người đầu tiên mở sóng bằng nút “Go live now”, hoặc kiểm tra lại sau.
                </p>
              </div>
            )}

            {!loading &&
              filteredStreams.map((stream) => (
                <article
                  key={stream.id}
                  className="group relative flex flex-col gap-5 rounded-2xl border border-border bg-card/80 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur"
                >
                  <div className="relative overflow-hidden rounded-2xl border border-white/5">
                    <img src={stream.cover} alt={stream.title} className="h-44 w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
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
                    <img src={stream.avatar} alt={stream.host} className="h-12 w-12 rounded-2xl object-cover" />
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
                    <p className="mt-1 text-sm text-muted-foreground">{stream.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                      <WifiIcon className="h-4 w-4" />
                      {stream.quality}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                      <ClockIcon className="h-4 w-4" />
                      Live for {stream.liveForLabel}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                      {stream.location}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="flex-1 rounded-2xl bg-foreground/90 text-background hover:bg-foreground"
                      onClick={() => handleJoinStream(stream)}
                    >
                      <PlayCircleIcon className="h-5 w-5" />
                      Join stream
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

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-border bg-card/80 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Spotlight</p>
                <h3 className="mt-2 text-2xl font-semibold">High-energy studios</h3>
              </div>
              <SparklesIcon className="h-8 w-8 text-primary" />
            </div>
            <div className="mt-6 space-y-4">
              {spotlightStreams.length === 0 && (
                <p className="text-sm text-muted-foreground">Không có phiên nào nổi bật ngay lúc này.</p>
              )}
              {spotlightStreams.map((stream) => (
                <div key={stream.id} className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/60 p-4">
                  <div className="relative h-16 w-28 overflow-hidden rounded-xl">
                    <img src={stream.cover} alt={stream.title} className="h-full w-full object-cover" />
                    <span className="absolute inset-x-2 bottom-2 rounded-full bg-black/70 px-2 py-0.5 text-center text-xs text-white">
                      {numberFormatter.format(stream.viewerCount)} live
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{stream.title}</p>
                    <p className="text-xs text-muted-foreground">{stream.host} • {stream.location}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{stream.energy}</p>
                    <p className="font-semibold text-foreground">{stream.latency} latency</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card/80 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Upcoming</p>
            <h3 className="mt-2 text-2xl font-semibold">Scheduled drops</h3>
            <div className="mt-6 space-y-4">
              {upcomingSessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="text-sm font-semibold text-foreground">{session.title}</p>
                  <p className="text-xs text-muted-foreground">{session.host}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <ClockIcon className="h-4 w-4" />
                      {session.start}
                    </span>
                    <span>{session.timezone}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <p className="text-center text-sm text-muted-foreground">
          Live data được đọc trực tiếp từ {LIVE_SERVICE_HOST}. CDN playback: {LIVE_CDN_BASE_URL}.
        </p>

        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            resetModalState();
          }}
          title="Create live session"
          size="lg"
        >
          <div className="space-y-6">
            <form className="space-y-4" onSubmit={handleCreateStreamSubmit}>
              <div>
                <label className="text-sm font-medium text-foreground">Title *</label>
                <input
                  type="text"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Ví dụ: Building realtime feed"
                  value={createForm.title}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Description</label>
                <textarea
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  rows={3}
                  placeholder="Nội dung chính, khách mời, công cụ demo..."
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    resetModalState();
                    setIsCreateModalOpen(false);
                  }}
                >
                  Huỷ
                </Button>
                <Button type="submit" loading={creating}>
                  Tạo stream
                </Button>
              </div>
            </form>

            {createdStream && (
              <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-emerald-500">
                  <CheckCircleIcon className="h-5 w-5" />
                  <p>Stream đã sẵn sàng. Mở tool phát để bắt đầu.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <CredentialField label="Stream ID" value={createdStream.id} hint="Public identifier để share cho viewer." />
                  <CredentialField
                    label="Stream Key"
                    value={createdStream.stream_key}
                    hint="Secret token, chỉ dùng cho publisher."
                  />
                  <CredentialField label="WebRTC publish URL" value={createdStream.webrtc_url} />
                  <CredentialField label="RTMP URL" value={createdStream.rtmp_url} />
                  <CredentialField label="HLS playback" value={createdStream.hls_url} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        buildPublisherUrl(createdStream.id, createdStream.stream_key),
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary"
                  >
                    Publisher demo
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(buildViewerUrl(createdStream.id), "_blank", "noopener,noreferrer")}
                    className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary"
                  >
                    Viewer demo
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      </div>
    );
  };

  export default LiveStreams;
