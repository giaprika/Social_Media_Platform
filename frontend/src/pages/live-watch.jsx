import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Hls from "hls.js";
import {
    ArrowLeftIcon,
    ChatBubbleLeftRightIcon,
    EyeIcon,
    HeartIcon,
    PaperAirplaneIcon,
    ShareIcon,
    SpeakerWaveIcon,
    SpeakerXMarkIcon,
    ArrowsPointingOutIcon,
    SignalIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { useToast } from "src/components/ui";
import Button from "src/components/ui/Button";
import { getStreamDetail, getViewerCount, LIVE_SERVICE_BASE_URL } from "src/api/live";
import Cookies from "universal-cookie";

const LIVE_CDN_BASE_URL = process.env.REACT_APP_LIVE_CDN_URL?.replace(/\/$/, "") || "https://cdn.extase.dev";

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
        this.maxReconnectAttempts = 0; // Prevent reconnection
        this.ws?.close();
    }
}

const LiveWatch = () => {
    const toast = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const { streamId } = useParams();
    const cookies = new Cookies();

    // Refs
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const chatClientRef = useRef(null);
    const chatContainerRef = useRef(null);
    const viewerIntervalRef = useRef(null);

    // State
    const [streamData, setStreamData] = useState(location.state?.stream || null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [viewerCount, setViewerCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [isChatOpen, setIsChatOpen] = useState(true);
    const [hlsStatus, setHlsStatus] = useState("loading"); // loading, playing, error, ended

    // User info
    const userId = cookies.get("x-user-id") || `viewer_${Date.now()}`;
    const username = cookies.get("username") || "Viewer";

    // Load stream data if not passed via state
    useEffect(() => {
        const loadStreamData = async () => {
            if (!streamId) {
                setError("Stream ID not found");
                setLoading(false);
                return;
            }

            try {
                const { data } = await getStreamDetail(streamId);
                setStreamData(data);
                setLoading(false);
            } catch (err) {
                console.error("Failed to load stream:", err);
                setError(err.response?.data?.message || "Stream not found or has ended");
                setLoading(false);
            }
        };

        if (!streamData) {
            loadStreamData();
        } else {
            setLoading(false);
        }
    }, [streamId, streamData]);

    // Initialize HLS player
    useEffect(() => {
        if (!streamData || !videoRef.current) return;

        const hlsUrl = streamData.hls_url || `${LIVE_CDN_BASE_URL}/live/${streamData.id}.m3u8`;
        console.log("[HLS] Loading stream from:", hlsUrl);

        let connectionTimeout;
        let retryCount = 0;
        const maxRetries = 3;

        const initHls = () => {
            if (Hls.isSupported()) {
                const hls = new Hls({
                    lowLatencyMode: true,
                    liveSyncDuration: 3,
                    liveMaxLatencyDuration: 10,
                    liveDurationInfinity: true,
                    enableWorker: true,
                    manifestLoadingTimeOut: 10000,
                    manifestLoadingMaxRetry: 2,
                    levelLoadingTimeOut: 10000,
                    fragLoadingTimeOut: 20000,
                });

                hls.loadSource(hlsUrl);
                hls.attachMedia(videoRef.current);

                // Set a timeout for initial connection
                connectionTimeout = setTimeout(() => {
                    if (hlsStatus === "loading") {
                        console.warn("[HLS] Connection timeout");
                        setHlsStatus("error");
                    }
                }, 15000);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log("[HLS] Manifest parsed successfully");
                    clearTimeout(connectionTimeout);
                    setHlsStatus("playing");
                    videoRef.current?.play().catch((err) => {
                        console.log("[HLS] Autoplay blocked:", err);
                        setIsPlaying(false);
                    });
                });

                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error("[HLS] Error:", data.type, data.details);

                    if (data.fatal) {
                        clearTimeout(connectionTimeout);

                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                console.log("[HLS] Network error, attempting recovery...");
                                if (retryCount < maxRetries) {
                                    retryCount++;
                                    setTimeout(() => hls.startLoad(), 2000);
                                } else {
                                    setHlsStatus("error");
                                }
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.log("[HLS] Media error, attempting recovery...");
                                hls.recoverMediaError();
                                break;
                            default:
                                setHlsStatus("error");
                                break;
                        }
                    }
                });

                hlsRef.current = hls;
            } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
                // Safari native HLS
                videoRef.current.src = hlsUrl;

                connectionTimeout = setTimeout(() => {
                    if (hlsStatus === "loading") {
                        setHlsStatus("error");
                    }
                }, 15000);

                videoRef.current.addEventListener("loadedmetadata", () => {
                    clearTimeout(connectionTimeout);
                    setHlsStatus("playing");
                    videoRef.current?.play();
                });

                videoRef.current.addEventListener("error", () => {
                    clearTimeout(connectionTimeout);
                    setHlsStatus("error");
                });
            } else {
                setError("Your browser does not support HLS playback");
            }
        };

        initHls();

        return () => {
            clearTimeout(connectionTimeout);
            hlsRef.current?.destroy();
        };
    }, [streamData, hlsStatus]);

    // Video event handlers
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => setHlsStatus("ended");

        video.addEventListener("play", handlePlay);
        video.addEventListener("pause", handlePause);
        video.addEventListener("ended", handleEnded);

        return () => {
            video.removeEventListener("play", handlePlay);
            video.removeEventListener("pause", handlePause);
            video.removeEventListener("ended", handleEnded);
        };
    }, []);

    // Connect to chat
    useEffect(() => {
        if (!streamData?.id || !userId) return;

        chatClientRef.current = new LiveChatClient(
            streamData.id,
            userId,
            username,
            (msg) => {
                setChatMessages((prev) => [...prev.slice(-100), msg]); // Keep last 100 messages
            },
            (count) => setViewerCount(count),
            (error) => console.error("Chat error:", error)
        );
        chatClientRef.current.connect();

        return () => {
            chatClientRef.current?.disconnect();
        };
    }, [streamData?.id, userId, username]);

    // Viewer count polling (backup)
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
        viewerIntervalRef.current = setInterval(fetchViewers, 10000);

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

    const handleToggleMute = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setIsMuted(videoRef.current.muted);
        }
    }, []);

    const handleToggleFullscreen = useCallback(() => {
        if (videoRef.current) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                videoRef.current.requestFullscreen();
            }
        }
    }, []);

    const handleSendMessage = useCallback(() => {
        if (!chatInput.trim()) return;

        const sent = chatClientRef.current?.sendMessage(chatInput.trim());
        if (sent) {
            setChatInput("");
        } else {
            toast.error("Failed to send message");
        }
    }, [chatInput, toast]);

    const handleShare = useCallback(() => {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        toast.success("Stream link copied!");
    }, [toast]);

    const handleLike = useCallback(() => {
        setIsLiked((prev) => !prev);
        if (!isLiked) {
            toast.success("Added to favorites!");
        }
    }, [isLiked, toast]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="mt-4 text-muted-foreground">Loading stream...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <p className="text-lg font-semibold text-foreground">Stream Unavailable</p>
                    <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                    <Button className="mt-4" onClick={() => navigate("/app/live")}>
                        Back to Live Streams
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
                <div className="container mx-auto flex items-center justify-between px-4 py-3">
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
                        <div className="hidden sm:block">
                            <h1 className="text-lg font-bold text-foreground line-clamp-1">
                                {streamData?.title || "Live Stream"}
                            </h1>
                            <p className="text-xs text-muted-foreground">
                                {streamData?.username || "Streamer"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1.5 text-sm">
                            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="font-semibold text-red-500">LIVE</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <EyeIcon className="h-4 w-4" />
                            <span>{viewerCount.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="container mx-auto px-4 py-4">
                <div className={`grid gap-4 ${isChatOpen ? "lg:grid-cols-[1fr_380px]" : ""}`}>
                    {/* Video Player */}
                    <div className="space-y-4">
                        <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
                            <video
                                ref={videoRef}
                                className="h-full w-full"
                                playsInline
                                autoPlay
                                muted={isMuted}
                                onClick={() => {
                                    if (videoRef.current?.paused) {
                                        videoRef.current.play();
                                    } else {
                                        videoRef.current?.pause();
                                    }
                                }}
                            />

                            {/* Video Overlay */}
                            {hlsStatus === "loading" && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                    <div className="text-center">
                                        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
                                        <p className="mt-3 text-sm text-white">Connecting to stream...</p>
                                    </div>
                                </div>
                            )}

                            {hlsStatus === "error" && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                                    <div className="text-center max-w-sm px-6">
                                        <SignalIcon className="mx-auto h-16 w-16 text-red-500/80" />
                                        <p className="mt-4 text-lg font-semibold text-white">Stream Unavailable</p>
                                        <p className="mt-2 text-sm text-gray-400">
                                            The streamer may not be live yet, or the stream has ended.
                                        </p>
                                        <div className="mt-6 flex flex-col gap-3">
                                            <Button
                                                onClick={() => {
                                                    setHlsStatus("loading");
                                                }}
                                                className="w-full"
                                            >
                                                Try Again
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => navigate("/app/live")}
                                                className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20"
                                            >
                                                Back to Live Streams
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {hlsStatus === "ended" && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                                    <div className="text-center">
                                        <p className="text-lg font-semibold text-white">Stream has ended</p>
                                        <Button className="mt-4" onClick={() => navigate("/app/live")}>
                                            Browse other streams
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Video Controls */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleToggleMute}
                                            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition"
                                        >
                                            {isMuted ? (
                                                <SpeakerXMarkIcon className="h-5 w-5" />
                                            ) : (
                                                <SpeakerWaveIcon className="h-5 w-5" />
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleToggleFullscreen}
                                            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition"
                                        >
                                            <ArrowsPointingOutIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Live Badge */}
                            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">
                                <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                LIVE
                            </div>
                        </div>

                        {/* Stream Info & Actions */}
                        <div className="rounded-2xl border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <h2 className="text-xl font-bold text-foreground">{streamData?.title}</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {streamData?.description || "No description"}
                                    </p>
                                    <div className="mt-3 flex items-center gap-3">
                                        <img
                                            src={`https://api.dicebear.com/7.x/shapes/svg?seed=${streamData?.user_id || streamData?.id}`}
                                            alt="Streamer"
                                            className="h-10 w-10 rounded-full border border-border"
                                        />
                                        <div>
                                            <p className="font-semibold text-foreground">
                                                {streamData?.username || "Streamer"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {viewerCount} watching now
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant={isLiked ? "primary" : "outline"}
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={handleLike}
                                    >
                                        {isLiked ? (
                                            <HeartSolidIcon className="h-4 w-4 text-red-500" />
                                        ) : (
                                            <HeartIcon className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={handleShare}
                                    >
                                        <ShareIcon className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-xl lg:hidden"
                                        onClick={() => setIsChatOpen(!isChatOpen)}
                                    >
                                        <ChatBubbleLeftRightIcon className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Chat Panel */}
                    {isChatOpen && (
                        <div className="flex h-[calc(100vh-200px)] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:h-[calc(100vh-120px)]">
                            <div className="flex items-center justify-between border-b border-border p-4">
                                <div className="flex items-center gap-2">
                                    <ChatBubbleLeftRightIcon className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="font-semibold text-foreground">Live Chat</h3>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {viewerCount} viewers
                                </span>
                            </div>

                            <div
                                ref={chatContainerRef}
                                className="flex-1 space-y-2 overflow-y-auto p-4"
                            >
                                {chatMessages.length === 0 && (
                                    <div className="flex h-full items-center justify-center">
                                        <p className="text-sm text-muted-foreground">
                                            No messages yet. Say hello! 👋
                                        </p>
                                    </div>
                                )}
                                {chatMessages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className="rounded-lg bg-muted/50 px-3 py-2 text-sm"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-foreground">{msg.user}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(msg.time).toLocaleTimeString("en-US", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-muted-foreground">{msg.message}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-border p-4">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Send a message..."
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                                        maxLength={200}
                                        className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                    <Button
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={handleSendMessage}
                                        disabled={!chatInput.trim()}
                                    >
                                        <PaperAirplaneIcon className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LiveWatch;
