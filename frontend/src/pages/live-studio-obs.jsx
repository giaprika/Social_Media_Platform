import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Hls from "hls.js";
import {
    ArrowLeftIcon,
    CheckCircleIcon,
    ClockIcon,
    EyeIcon,
    ShareIcon,
    VideoCameraIcon,
    ChatBubbleLeftRightIcon,
    SignalIcon,
    Cog6ToothIcon,
    DocumentDuplicateIcon,
    PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "src/components/ui";
import Button from "src/components/ui/Button";
import { getViewerCount, LIVE_SERVICE_BASE_URL } from "src/api/live";
import Cookies from "universal-cookie";

const LIVE_CDN_BASE_URL = process.env.REACT_APP_LIVE_CDN_URL?.replace(/\/$/, "") || "https://cdn.extase.dev";
const LIVE_SERVICE_HOST = process.env.REACT_APP_LIVE_SERVER_HOST || "api.extase.dev";

// WebSocket Chat Client
class LiveChatClient {
    constructor(streamId, userId, username, onMessage, onViewerUpdate, onError) {
        this.streamId = streamId;
        this.userId = userId;
        this.username = username;
        this.onMessage = onMessage;
        this.onViewerUpdate = onViewerUpdate;
        this.onError = onError;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connect() {
        const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

        let wsUrl;
        if (isLocal) {
            const baseUrl = LIVE_SERVICE_BASE_URL || "https://api.extase.dev";
            const wsBase = baseUrl.replace(/^https?:/, wsProtocol);
            wsUrl = `${wsBase}/ws/live/${this.streamId}?user_id=${this.userId}&username=${encodeURIComponent(this.username)}`;
        } else {
            wsUrl = `${wsProtocol}//${window.location.host}/ws/live/${this.streamId}?user_id=${this.userId}&username=${encodeURIComponent(this.username)}`;
        }

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log("Chat connected");
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    switch (msg.type) {
                        case "CHAT_BROADCAST":
                            this.onMessage?.({
                                id: Date.now(),
                                user: msg.username,
                                userId: msg.user_id,
                                message: msg.content,
                                time: new Date(msg.timestamp),
                            });
                            break;
                        case "VIEW_UPDATE":
                        case "JOINED":
                            this.onViewerUpdate?.(msg.count);
                            break;
                        case "ERROR":
                            this.onError?.(msg.content);
                            break;
                        default:
                            break;
                    }
                } catch (e) {
                    console.error("Failed to parse WS message:", e);
                }
            };

            this.ws.onclose = () => {
                console.log("Chat disconnected");
                this.tryReconnect();
            };

            this.ws.onerror = (error) => {
                console.error("WebSocket error:", error);
            };
        } catch (e) {
            console.error("Failed to connect WebSocket:", e);
        }
    }

    tryReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
        }
    }

    sendMessage(content) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "CHAT", content }));
            return true;
        }
        return false;
    }

    disconnect() {
        this.maxReconnectAttempts = 0;
        this.ws?.close();
    }
}

const LiveStudioOBS = () => {
    const toast = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const cookies = new Cookies();

    // Stream data from navigation state
    const streamData = location.state?.stream;

    // Refs
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const chatClientRef = useRef(null);
    const chatContainerRef = useRef(null);
    const viewerIntervalRef = useRef(null);
    const hlsInitializedRef = useRef(false);
    const liveMessageShownRef = useRef(false);

    // State
    const [streamStatus, setStreamStatus] = useState("waiting"); // waiting, live, ended
    const [viewerCount, setViewerCount] = useState(0);
    // eslint-disable-next-line no-unused-vars
    const [sessionStart, setSessionStart] = useState(null);
    const [sessionTick, setSessionTick] = useState(0);
    const [isStreaming, setIsStreaming] = useState(false);
    const [chatMessages, setChatMessages] = useState([
        { id: 1, user: "System", message: "Waiting for OBS to start streaming... 📡", time: new Date() },
    ]);
    const [chatInput, setChatInput] = useState("");
    const [copied, setCopied] = useState(false);

    // User info
    const userId = cookies.get("x-user-id") || `streamer_${Date.now()}`;
    const username = cookies.get("username") || "Streamer";

    // Redirect if no stream data
    useEffect(() => {
        if (!streamData) {
            toast.error("Stream information not found");
            navigate("/app/live");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamData]);

    // Duration timer
    useEffect(() => {
        if (!isStreaming) return;

        const interval = setInterval(() => {
            setSessionTick((prev) => prev + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [isStreaming]);

    // Format time like webcam studio
    const formatTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
        }
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    // Initialize HLS player and poll for stream
    useEffect(() => {
        if (!streamData || !videoRef.current || hlsInitializedRef.current) return;

        hlsInitializedRef.current = true;

        const hlsUrl = streamData.hls_url || `${LIVE_CDN_BASE_URL}/live/${streamData.id}.m3u8`;
        console.log("[OBS Studio] Waiting for stream at:", hlsUrl);

        let hls = null;
        let isDestroyed = false;
        let wasLive = false;
        let errorCount = 0;

        const initHls = () => {
            if (isDestroyed) return;

            if (Hls.isSupported()) {
                hls = new Hls({
                    // Balanced settings for streamer preview
                    lowLatencyMode: false,       // More stable for preview
                    liveSyncDuration: 3,         // 3 seconds behind live edge
                    liveMaxLatencyDuration: 12,  // Max 12 seconds behind
                    liveDurationInfinity: true,

                    // Buffer settings
                    maxBufferLength: 20,
                    maxMaxBufferLength: 40,
                    maxBufferSize: 40 * 1000 * 1000, // 40MB

                    // Loading - retry for waiting state
                    enableWorker: true,
                    manifestLoadingTimeOut: 8000,
                    manifestLoadingMaxRetry: 0,   // Don't retry on error (stream may not be ready)
                    levelLoadingTimeOut: 8000,
                    fragLoadingTimeOut: 15000,
                    fragLoadingMaxRetry: 2,

                    // Prefetch for smoother start
                    startFragPrefetch: true,
                });

                hls.loadSource(hlsUrl);
                hls.attachMedia(videoRef.current);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (isDestroyed) return;
                    console.log("[OBS Studio] Stream is now live!");
                    wasLive = true;
                    errorCount = 0;
                    setStreamStatus("live");
                    setIsStreaming(true);
                    setSessionStart(new Date());
                    videoRef.current?.play().catch(() => { });

                    // Add system message only once
                    if (!liveMessageShownRef.current) {
                        liveMessageShownRef.current = true;
                        setChatMessages((prev) => [
                            ...prev,
                            { id: Date.now(), user: "System", message: "🔴 Stream is now LIVE!", time: new Date() },
                        ]);
                    }
                });

                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (isDestroyed) return;

                    if (data.fatal) {
                        errorCount++;

                        // If was live and now getting errors, stream likely ended
                        if (wasLive && errorCount >= 3) {
                            console.log("[OBS Studio] Stream ended, redirecting...");
                            setStreamStatus("ended");
                            setIsStreaming(false);

                            setTimeout(() => {
                                navigate("/app/live");
                            }, 2000);
                            return;
                        }

                        console.log("[OBS Studio] Stream not available yet, retrying in 3s...");
                        hls.destroy();
                        setTimeout(() => {
                            if (!isDestroyed) {
                                initHls();
                            }
                        }, 3000);
                    }
                });

                hlsRef.current = hls;
            } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
                // Safari native HLS
                videoRef.current.src = hlsUrl;
                videoRef.current.addEventListener("loadedmetadata", () => {
                    if (!isDestroyed) {
                        wasLive = true;
                        setStreamStatus("live");
                        setIsStreaming(true);
                        setSessionStart(new Date());
                        videoRef.current?.play();
                    }
                });
            }
        };

        initHls();

        return () => {
            isDestroyed = true;
            hls?.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamData]);

    // Connect to chat
    useEffect(() => {
        if (!streamData?.id || !userId || chatClientRef.current) return;

        // Track seen message IDs to prevent duplicates
        const seenMessageIds = new Set();

        chatClientRef.current = new LiveChatClient(
            streamData.id,
            userId,
            username,
            (msg) => {
                // Deduplicate messages by ID
                const msgKey = `${msg.userId || msg.user}_${msg.time?.getTime?.() || Date.now()}_${msg.message?.slice(0, 20)}`;
                if (seenMessageIds.has(msgKey)) {
                    console.log("[Chat] Duplicate message ignored:", msgKey);
                    return;
                }
                seenMessageIds.add(msgKey);

                // Keep set size manageable
                if (seenMessageIds.size > 200) {
                    const entries = Array.from(seenMessageIds);
                    entries.slice(0, 100).forEach(id => seenMessageIds.delete(id));
                }

                setChatMessages((prev) => [...prev.slice(-100), msg]);
            },
            (count) => setViewerCount(count),
            (error) => console.error("Chat error:", error)
        );
        chatClientRef.current.connect();

        return () => {
            chatClientRef.current?.disconnect();
            chatClientRef.current = null;
        };
    }, [streamData?.id, userId, username]);

    // Viewer count polling
    useEffect(() => {
        if (!streamData?.id) return;

        const fetchViewers = async () => {
            try {
                const response = await getViewerCount(streamData.id);
                setViewerCount((prev) => response.data?.viewer_count || prev);
            } catch (e) {
                // Silently fail
            }
        };

        fetchViewers();
        viewerIntervalRef.current = setInterval(fetchViewers, 5000);

        return () => {
            if (viewerIntervalRef.current) {
                clearInterval(viewerIntervalRef.current);
            }
        };
    }, [streamData?.id]);

    // Auto-scroll chat
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            chatClientRef.current?.disconnect();
            if (viewerIntervalRef.current) clearInterval(viewerIntervalRef.current);
            hlsRef.current?.destroy();
        };
    }, []);

    const handleCopyStreamKey = async () => {
        const streamKey = `${streamData.id}?token=${streamData.stream_key}`;
        try {
            await navigator.clipboard.writeText(streamKey);
            setCopied(true);
            toast.success("Stream Key copied!");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    };

    const handleCopyLink = useCallback(() => {
        const hlsUrl = `${LIVE_CDN_BASE_URL}/live/${streamData?.id}.m3u8`;
        navigator.clipboard.writeText(hlsUrl);
        toast.success("HLS link copied!");
    }, [streamData, toast]);

    const handleSendChatMessage = useCallback(() => {
        if (!chatInput.trim()) return;

        const sent = chatClientRef.current?.sendMessage(chatInput.trim());
        if (sent) {
            setChatInput("");
        } else {
            toast.error("Failed to send message");
        }
    }, [chatInput, toast]);

    const getStatusColor = () => {
        switch (streamStatus) {
            case "live":
                return "text-green-500";
            case "ended":
                return "text-red-500";
            default:
                return "text-amber-500";
        }
    };

    const getStatusDotColor = () => {
        switch (streamStatus) {
            case "live":
                return "bg-red-500";
            case "ended":
                return "bg-gray-500";
            default:
                return "bg-amber-400 animate-pulse";
        }
    };

    if (!streamData) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <p className="text-lg font-semibold text-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-xl"
                                onClick={() => navigate("/app/live")}
                            >
                                <ArrowLeftIcon className="h-5 w-5" />
                                Back
                            </Button>
                            <div>
                                <h1 className="text-xl font-bold text-foreground">OBS Studio Control</h1>
                                <p className="text-sm text-muted-foreground">{streamData.title || "Untitled Stream"}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm text-foreground">
                                <div className={`h-2.5 w-2.5 rounded-full ${getStatusDotColor()}`} />
                                <span className="font-semibold">
                                    {streamStatus === "live" ? "LIVE" : streamStatus === "ended" ? "ENDED" : "WAITING"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="container mx-auto px-4 py-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                    {/* Left Column - Video Preview & Controls */}
                    <div className="space-y-6">
                        {/* Video Preview */}
                        <div className="overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <VideoCameraIcon className="h-5 w-5 text-muted-foreground" />
                                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                        Live Preview
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {streamStatus === "live" ? (
                                        <>
                                            <SignalIcon className="h-4 w-4 text-green-500" />
                                            <span className="text-xs text-green-600">Connected</span>
                                        </>
                                    ) : streamStatus === "ended" ? (
                                        <span className="text-xs text-red-500">Stream ended</span>
                                    ) : (
                                        <span className="text-xs text-amber-500">Waiting for OBS...</span>
                                    )}
                                </div>
                            </div>

                            <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    className="h-full w-full object-cover"
                                />

                                {/* Waiting Overlay */}
                                {!isStreaming && streamStatus !== "ended" && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                                        <div className="text-center">
                                            <VideoCameraIcon className="mx-auto h-16 w-16 text-muted-foreground/50" />
                                            <p className="mt-4 text-sm text-muted-foreground">
                                                Start streaming from OBS to see preview
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Live Badge */}
                                {isStreaming && (
                                    <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white">
                                        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                        LIVE
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Stats Cards */}
                        <div className="grid gap-4 sm:grid-cols-4">
                            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                                <div className="flex items-center gap-2 text-blue-500">
                                    <ClockIcon className="h-5 w-5" />
                                    <span className="text-xs font-semibold uppercase tracking-wide">Duration</span>
                                </div>
                                <p className="mt-2 text-2xl font-bold text-foreground">
                                    {isStreaming ? formatTime(sessionTick) : "00:00"}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                                <div className="flex items-center gap-2 text-purple-500">
                                    <EyeIcon className="h-5 w-5" />
                                    <span className="text-xs font-semibold uppercase tracking-wide">Viewers</span>
                                </div>
                                <p className="mt-2 text-2xl font-bold text-foreground">{viewerCount}</p>
                            </div>

                            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                                <div className="flex items-center gap-2 text-green-500">
                                    <SignalIcon className="h-5 w-5" />
                                    <span className="text-xs font-semibold uppercase tracking-wide">Source</span>
                                </div>
                                <p className="mt-2 text-lg font-bold text-foreground">OBS</p>
                            </div>

                            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                                <div className="flex items-center gap-2 text-amber-500">
                                    <CheckCircleIcon className="h-5 w-5" />
                                    <span className="text-xs font-semibold uppercase tracking-wide">Status</span>
                                </div>
                                <p className={`mt-2 text-base font-bold ${getStatusColor()}`}>
                                    {streamStatus === "live" ? "Streaming" : streamStatus === "ended" ? "Ended" : "Waiting"}
                                </p>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                Quick Actions
                            </h3>
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={handleCopyStreamKey}
                                >
                                    {copied ? (
                                        <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <DocumentDuplicateIcon className="h-4 w-4" />
                                    )}
                                    Copy Stream Key
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={handleCopyLink}
                                >
                                    <ShareIcon className="h-4 w-4" />
                                    Share HLS Link
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => {
                                        const hlsUrl = `${LIVE_CDN_BASE_URL}/live/${streamData?.id}.m3u8`;
                                        window.open(hlsUrl, "_blank");
                                    }}
                                >
                                    <EyeIcon className="h-4 w-4" />
                                    Preview HLS
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => toast.info("Feature in development")}
                                >
                                    <Cog6ToothIcon className="h-4 w-4" />
                                    Settings
                                </Button>
                            </div>
                        </div>

                        {/* Stream Info */}
                        <div className="rounded-2xl border border-border bg-muted/30 p-4">
                            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Stream Info</h3>
                            <div className="space-y-1 text-xs text-muted-foreground">
                                <p><span className="font-medium">Stream ID:</span> {streamData.id}</p>
                                <p><span className="font-medium">HLS URL:</span> {LIVE_CDN_BASE_URL}/live/{streamData.id}.m3u8</p>
                                <p><span className="font-medium">RTMP Server:</span> rtmp://{LIVE_SERVICE_HOST}:1935/live</p>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Chat & Activity */}
                    <div className="space-y-6">
                        {/* Chat Panel */}
                        <div className="flex h-[calc(100vh-200px)] flex-col overflow-hidden rounded-3xl border border-border bg-card">
                            <div className="border-b border-border p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ChatBubbleLeftRightIcon className="h-5 w-5 text-muted-foreground" />
                                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                            Live Chat
                                        </h3>
                                    </div>
                                    {isStreaming && (
                                        <span className="text-xs text-muted-foreground">
                                            {viewerCount} watching
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div
                                ref={chatContainerRef}
                                className="flex-1 space-y-3 overflow-y-auto p-4"
                            >
                                {chatMessages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`rounded-xl border border-border p-3 text-sm ${msg.user === "System" ? "bg-primary/10 border-primary/20" : "bg-muted/50"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`font-semibold ${msg.user === "System" ? "text-primary" : "text-foreground"
                                                }`}>
                                                {msg.user}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(msg.time).toLocaleTimeString("en-US", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-muted-foreground">{msg.message}</p>
                                    </div>
                                ))}

                                {isStreaming && chatMessages.length === 1 && (
                                    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                                        Waiting for viewers to join the chat...
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-border p-4">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Send a message..."
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                                        className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        disabled={!isStreaming}
                                    />
                                    <Button
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={handleSendChatMessage}
                                        disabled={!isStreaming || !chatInput.trim()}
                                    >
                                        <PaperAirplaneIcon className="h-4 w-4" />
                                        Send
                                    </Button>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {isStreaming ? "Chat is live!" : "Start streaming to enable chat"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LiveStudioOBS;
