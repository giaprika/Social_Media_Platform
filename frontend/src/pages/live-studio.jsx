import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  ShareIcon,
  StopIcon,
  VideoCameraIcon,
  ChatBubbleLeftRightIcon,
  SignalIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "src/components/ui";
import { useNotifications } from "src/hooks/useNotifications";
import Button from "src/components/ui/Button";
import ConfirmDialog from "src/components/ui/ConfirmDialog";
import {
  getWebRTCInfo,
  getViewerCount,
  LIVE_SERVICE_BASE_URL,
} from "src/api/live";
import { startLivestreamMonitoring } from "src/api/livestreamMonitor";
import Cookies from "universal-cookie";

// WebRTC Client for SRS Server (WHIP protocol)
class WebRTCPublisher {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.onStateChange = null;
    this.onError = null;
  }

  async getIceServers(streamId) {
    try {
      const response = await getWebRTCInfo(streamId);
      if (response.data?.ice_servers?.length > 0) {
        return response.data.ice_servers;
      }
    } catch (e) {
      console.warn("Failed to fetch ICE servers:", e);
    }
    // Fallback to Google STUN
    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];
  }

  async startPublish(streamId, streamKey, videoElement) {
    try {
      this.onStateChange?.("connecting", "Fetching ICE servers...");

      const iceServers = await this.getIceServers(streamId);

      this.onStateChange?.("connecting", "Requesting camera access...");

      // Get user media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });

      // Show local preview
      if (videoElement) {
        videoElement.srcObject = this.localStream;
      }

      this.onStateChange?.("connecting", "Establishing connection...");

      // Create peer connection
      this.peerConnection = new RTCPeerConnection({ iceServers });

      // Add tracks
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // ICE connection state
      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection?.iceConnectionState;
        if (state === "connected") {
          this.onStateChange?.("live", "You are now LIVE!");
        } else if (state === "failed" || state === "disconnected") {
          this.onStateChange?.("error", `Connection ${state}`);
        }
      };

      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Wait for ICE gathering
      await this.waitForICEGathering();

      // Send offer via WHIP with token authentication
      const whipUrl = this.buildWhipUrl(streamId, streamKey);

      const response = await fetch(whipUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: this.peerConnection.localDescription.sdp,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WHIP failed: ${response.status} - ${errorText}`);
      }

      const answerSDP = await response.text();
      await this.peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSDP,
      });

      this.onStateChange?.("live", "You are now LIVE!");
      return true;
    } catch (error) {
      console.error("Publish error:", error);
      this.onError?.(error.message);
      this.stop();
      return false;
    }
  }

  buildWhipUrl(streamId, streamKey) {
    // Determine base URL for WHIP endpoint
    // In production, use the same origin (Caddy proxies to SRS)
    // In local dev, we need to hit the SRS server directly
    const isLocal = ["localhost", "127.0.0.1"].includes(
      window.location.hostname
    );

    if (isLocal) {
      // Local development - use the live service URL
      const baseUrl = LIVE_SERVICE_BASE_URL || "https://api.extase.dev";
      return `${baseUrl}/rtc/v1/whip/?app=live&stream=${streamId}&token=${streamKey}`;
    }

    // Production - use relative URL (same origin)
    return `/rtc/v1/whip/?app=live&stream=${streamId}&token=${streamKey}`;
  }

  waitForICEGathering() {
    return new Promise((resolve) => {
      if (this.peerConnection?.iceGatheringState === "complete") {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.peerConnection?.iceGatheringState === "complete") {
          this.peerConnection?.removeEventListener(
            "icegatheringstatechange",
            checkState
          );
          resolve();
        }
      };

      this.peerConnection?.addEventListener(
        "icegatheringstatechange",
        checkState
      );

      // Timeout after 5 seconds
      setTimeout(() => {
        this.peerConnection?.removeEventListener(
          "icegatheringstatechange",
          checkState
        );
        resolve();
      }, 5000);
    });
  }

  stop() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  getVideoTrackSettings() {
    if (!this.localStream) return null;
    const videoTrack = this.localStream.getVideoTracks()[0];
    return videoTrack?.getSettings();
  }
}

// WebSocket Chat Client
class LiveChatClient {
  constructor(streamId, userId, username, onMessage, onViewerUpdate) {
    this.streamId = streamId;
    this.userId = userId;
    this.username = username;
    this.onMessage = onMessage;
    this.onViewerUpdate = onViewerUpdate;
    this.ws = null;
  }

  connect() {
    const isLocal = ["localhost", "127.0.0.1"].includes(
      window.location.hostname
    );
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

    let wsUrl;
    if (isLocal) {
      // Local development
      const baseUrl = LIVE_SERVICE_BASE_URL || "https://api.extase.dev";
      const wsBase = baseUrl.replace(/^https?:/, wsProtocol);
      wsUrl = `${wsBase}/ws/live/${this.streamId}?user_id=${
        this.userId
      }&username=${encodeURIComponent(this.username)}`;
    } else {
      // Production
      wsUrl = `${wsProtocol}//${window.location.host}/ws/live/${
        this.streamId
      }?user_id=${this.userId}&username=${encodeURIComponent(this.username)}`;
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "CHAT_BROADCAST":
            this.onMessage?.({
              id: Date.now(),
              user: msg.username,
              message: msg.content,
              time: new Date(msg.timestamp),
            });
            break;
          case "VIEW_UPDATE":
          case "JOINED":
            this.onViewerUpdate?.(msg.count);
            break;
          case "ERROR":
            console.error("Chat error:", msg.content);
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
    };
  }

  sendMessage(content) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "CHAT", content }));
    }
  }

  disconnect() {
    this.ws?.close();
  }
}

const LiveStudio = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const streamData = location.state?.stream;
  const cookies = new Cookies();

  // Get user info from cookies
  const userId = cookies.get("x-user-id");
  const username = cookies.get("username") || "Streamer";
  const token = cookies.get("accessToken");

  // Connect to notification socket
  const { socket } = useNotifications(token);

  // Refs
  const videoRef = useRef(null);
  const publisherRef = useRef(null);
  const chatClientRef = useRef(null);
  const viewerIntervalRef = useRef(null);

  // State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState("idle"); // idle, connecting, live, error
  const [statusMessage, setStatusMessage] = useState("Ready to stream");
  // eslint-disable-next-line no-unused-vars
  const [sessionStart, setSessionStart] = useState(null);
  const [sessionTick, setSessionTick] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [videoSettings, setVideoSettings] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      user: "System",
      message: "Welcome to the live session! 🎉",
      time: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  // Dialog states
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);

  useEffect(() => {
    if (!streamData) {
      toast.error("Stream information not found");
      navigate("/app/live");
      return;
    }
  }, [streamData, navigate, toast]);

  // Listen for livestream violation notifications
  useEffect(() => {
    if (!socket || !streamData?.id) return;

    const handleNotification = (data) => {
      try {
        // Parse metadata if it's a string
        const metadata =
          typeof data.metadata === "string"
            ? JSON.parse(data.metadata)
            : data.metadata;

        // Check if this is a livestream violation for our current stream
        if (
          metadata?.type === "LIVESTREAM_VIOLATION" &&
          metadata?.stream_id === streamData.id
        ) {
          console.log("⚠️ Livestream violation detected:", metadata);

          // Show error toast
          toast.error(`Livestream stopped: ${metadata.reason}`, {
            duration: 10000,
          });

          // Force stop the stream using confirmStopStream
          confirmStopStream();
        }
      } catch (error) {
        console.error("Error handling notification:", error);
      }
    };

    socket.on("notification", handleNotification);

    return () => {
      socket.off("notification", handleNotification);
    };
  }, [socket, streamData?.id, toast]);

  // Session timer
  useEffect(() => {
    if (!isStreaming) return undefined;
    const timer = setInterval(() => setSessionTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  // Fetch viewer count periodically
  const startViewerPolling = useCallback(() => {
    if (!streamData?.id) return;

    const fetchViewers = async () => {
      try {
        const response = await getViewerCount(streamData.id);
        setViewerCount(response.data?.viewer_count || 0);
      } catch (e) {
        console.warn("Failed to fetch viewer count:", e);
      }
    };

    fetchViewers();
    viewerIntervalRef.current = setInterval(fetchViewers, 5000);
  }, [streamData?.id]);

  const stopViewerPolling = useCallback(() => {
    if (viewerIntervalRef.current) {
      clearInterval(viewerIntervalRef.current);
      viewerIntervalRef.current = null;
    }
  }, []);

  // Connect to chat WebSocket
  // Track seen messages for deduplication
  const seenMessageIdsRef = useRef(new Set());

  const connectChat = useCallback(() => {
    if (!streamData?.id || !userId || chatClientRef.current) return;

    chatClientRef.current = new LiveChatClient(
      streamData.id,
      userId,
      username,
      (msg) => {
        // Deduplicate messages by key
        const msgKey = `${msg.userId || msg.user}_${
          msg.time?.getTime?.() || Date.now()
        }_${msg.message?.slice(0, 20)}`;
        if (seenMessageIdsRef.current.has(msgKey)) {
          console.log("[Chat] Duplicate message ignored:", msgKey);
          return;
        }
        seenMessageIdsRef.current.add(msgKey);

        // Keep set size manageable
        if (seenMessageIdsRef.current.size > 200) {
          const entries = Array.from(seenMessageIdsRef.current);
          entries
            .slice(0, 100)
            .forEach((id) => seenMessageIdsRef.current.delete(id));
        }

        setChatMessages((prev) => [...prev.slice(-100), msg]);
      },
      (count) => setViewerCount(count)
    );
    chatClientRef.current.connect();
  }, [streamData?.id, userId, username]);

  const disconnectChat = useCallback(() => {
    chatClientRef.current?.disconnect();
    chatClientRef.current = null;
    seenMessageIdsRef.current.clear();
  }, []);

  const handleStartStream = useCallback(async () => {
    if (!streamData?.id || !streamData?.stream_key) {
      toast.error("Missing stream credentials");
      return;
    }

    setStreamStatus("connecting");
    setStatusMessage("Starting stream...");

    // Create WebRTC publisher
    publisherRef.current = new WebRTCPublisher();

    publisherRef.current.onStateChange = (status, message) => {
      setStreamStatus(status);
      setStatusMessage(message);

      if (status === "live") {
        setIsStreaming(true);
        setSessionStart(new Date());
        setSessionTick(0);
        toast.success("You're now live!");

        // Get video settings
        const settings = publisherRef.current?.getVideoTrackSettings();
        setVideoSettings(settings);

        // Start viewer polling and chat
        startViewerPolling();
        connectChat();

        // Start AI content monitoring
        startLivestreamMonitoring(streamData.id, userId)
          .then((result) => {
            console.log("✅ Livestream monitoring started:", result);
          })
          .catch((error) => {
            console.error("❌ Failed to start monitoring:", error);
            // Don't fail the stream if monitoring fails
          });
      }
    };

    publisherRef.current.onError = (error) => {
      setStreamStatus("error");
      setStatusMessage(error);
      toast.error(`Stream error: ${error}`);
    };

    await publisherRef.current.startPublish(
      streamData.id,
      streamData.stream_key,
      videoRef.current
    );
  }, [streamData, toast, startViewerPolling, connectChat]);

  const handleStopStreamClick = useCallback(() => {
    setShowStopDialog(true);
  }, []);

  const confirmStopStream = useCallback(() => {
    setShowStopDialog(false);

    publisherRef.current?.stop();
    publisherRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setStreamStatus("idle");
    setStatusMessage("Stream ended");
    setSessionStart(null);
    setSessionTick(0);
    setVideoSettings(null);

    stopViewerPolling();
    disconnectChat();

    toast.info("Live stream stopped");
  }, [toast, stopViewerPolling, disconnectChat]);

  // Add confirmStopStream to violation listener dependencies
  useEffect(() => {
    // This effect ensures confirmStopStream is accessible in violation listener
    return () => {};
  }, [confirmStopStream]);

  const handleEndSessionClick = useCallback(() => {
    setShowEndDialog(true);
  }, []);

  const confirmEndSession = useCallback(() => {
    setShowEndDialog(false);

    publisherRef.current?.stop();
    stopViewerPolling();
    disconnectChat();

    navigate("/app/live");
    toast.success("Live session ended");
  }, [navigate, toast, stopViewerPolling, disconnectChat]);

  const handleCopyLink = useCallback(() => {
    const hlsUrl = `https://cdn.extase.dev/live/${streamData?.id}.m3u8`;
    navigator.clipboard.writeText(hlsUrl);
    toast.success("Stream link copied to clipboard");
  }, [streamData, toast]);

  const handleSendChatMessage = useCallback(() => {
    if (!chatInput.trim()) return;

    chatClientRef.current?.sendMessage(chatInput.trim());
    setChatInput("");
  }, [chatInput]);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const getStatusColor = () => {
    switch (streamStatus) {
      case "live":
        return "text-green-500";
      case "connecting":
        return "text-yellow-500";
      case "error":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusDotColor = () => {
    switch (streamStatus) {
      case "live":
        return "bg-red-500 animate-pulse";
      case "connecting":
        return "bg-yellow-500 animate-pulse";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      publisherRef.current?.stop();
      stopViewerPolling();
      disconnectChat();
    };
  }, [stopViewerPolling, disconnectChat]);

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
                <h1 className="text-xl font-bold text-foreground">
                  Live Studio Control
                </h1>
                <p className="text-sm text-muted-foreground">
                  {streamData.title || "Untitled Stream"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm text-foreground">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${getStatusDotColor()}`}
                />
                <span className="font-semibold">
                  {streamStatus === "live"
                    ? "LIVE"
                    : streamStatus === "connecting"
                    ? "CONNECTING"
                    : "OFFLINE"}
                </span>
              </div>

              {isStreaming ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-xl"
                  onClick={handleStopStreamClick}
                >
                  <StopIcon className="h-4 w-4" />
                  Stop Stream
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="rounded-xl bg-red-500 hover:bg-red-600 text-white"
                  onClick={handleStartStream}
                  disabled={streamStatus === "connecting"}
                >
                  <VideoCameraIcon className="h-4 w-4" />
                  {streamStatus === "connecting"
                    ? "Starting..."
                    : "Start Streaming"}
                </Button>
              )}
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
                      <span className="text-xs text-green-600">
                        {videoSettings
                          ? `${videoSettings.width}x${videoSettings.height}`
                          : "Connected"}
                      </span>
                    </>
                  ) : streamStatus === "error" ? (
                    <>
                      <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                      <span className="text-xs text-red-600">Error</span>
                    </>
                  ) : (
                    <span className={`text-xs ${getStatusColor()}`}>
                      {statusMessage}
                    </span>
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
                {!isStreaming && streamStatus !== "connecting" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="text-center">
                      <VideoCameraIcon className="mx-auto h-16 w-16 text-muted-foreground/50" />
                      <p className="mt-4 text-sm text-muted-foreground">
                        Click "Start Streaming" to go live
                      </p>
                    </div>
                  </div>
                )}
                {streamStatus === "connecting" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <div className="text-center">
                      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      <p className="mt-4 text-sm text-foreground">
                        {statusMessage}
                      </p>
                    </div>
                  </div>
                )}
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
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Duration
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {isStreaming ? formatTime(sessionTick) : "00:00"}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 text-purple-500">
                  <EyeIcon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Viewers
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {viewerCount}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 text-green-500">
                  <SignalIcon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Quality
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold text-foreground">
                  {videoSettings ? `${videoSettings.width}p` : "Auto"}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 text-amber-500">
                  <CheckCircleIcon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Status
                  </span>
                </div>
                <p className={`mt-2 text-base font-bold ${getStatusColor()}`}>
                  {streamStatus === "live"
                    ? "Streaming"
                    : streamStatus === "connecting"
                    ? "Connecting"
                    : "Ready"}
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
                    const hlsUrl = `https://cdn.extase.dev/live/${streamData?.id}.m3u8`;
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
                <Button
                  variant="destructive"
                  size="sm"
                  className="ml-auto rounded-xl"
                  onClick={handleEndSessionClick}
                >
                  End Session
                </Button>
              </div>
            </div>

            {/* Stream Info */}
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                Stream Info
              </h3>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium">Stream ID:</span>{" "}
                  {streamData.id}
                </p>
                <p>
                  <span className="font-medium">HLS URL:</span>{" "}
                  https://cdn.extase.dev/live/{streamData.id}.m3u8
                </p>
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

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-border bg-muted/50 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
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
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleSendChatMessage()
                    }
                    className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    disabled={!isStreaming}
                  />
                  <Button
                    size="sm"
                    className="rounded-xl"
                    onClick={handleSendChatMessage}
                    disabled={!isStreaming || !chatInput.trim()}
                  >
                    Send
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {isStreaming
                    ? "Chat is live!"
                    : "Start streaming to enable chat"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Stop Stream Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showStopDialog}
        onClose={() => setShowStopDialog(false)}
        onConfirm={confirmStopStream}
        title="Stop Live Stream?"
        message="Your stream will end immediately. Viewers will be disconnected and you'll need to start a new stream to go live again."
        confirmText="Yes, Stop Streaming"
        cancelText="Keep Streaming"
        variant="danger"
      />

      {/* End Session Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showEndDialog}
        onClose={() => setShowEndDialog(false)}
        onConfirm={confirmEndSession}
        title="End Live Session?"
        message="This will close your studio and return you to the main Live page. Any ongoing stream will be stopped."
        confirmText="Yes, End Session"
        cancelText="Stay in Studio"
        variant="warning"
      />
    </div>
  );
};

export default LiveStudio;
