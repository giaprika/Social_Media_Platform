import { useCallback, useEffect, useState } from "react";
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
} from "@heroicons/react/24/outline";
import { useToast } from "src/components/ui";
import Button from "src/components/ui/Button";

const LiveStudio = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const streamData = location.state?.stream;

  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionStart, setSessionStart] = useState(null);
  const [sessionTick, setSessionTick] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const [chatMessages, setChatMessages] = useState([
    { id: 1, user: "System", message: "Welcome to the live session! 🎉", time: new Date() },
  ]);

  useEffect(() => {
    if (!streamData) {
      toast.error("Stream information not found");
      navigate("/live");
      return;
    }
  }, [streamData, navigate, toast]);

  useEffect(() => {
    if (!isStreaming) return undefined;
    const timer = setInterval(() => setSessionTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  const handleStartStream = useCallback(() => {
    setIsStreaming(true);
    setSessionStart(new Date());
    setSessionTick(0);
    toast.success("You're now live!");

    // Simulate viewer count increase
    const viewerInterval = setInterval(() => {
      setViewerCount((prev) => prev + Math.floor(Math.random() * 3));
    }, 5000);

    return () => clearInterval(viewerInterval);
  }, [toast]);

  const handleStopStream = useCallback(() => {
    if (!window.confirm("Are you sure you want to stop the live stream?")) return;

    setIsStreaming(false);
    setSessionStart(null);
    setSessionTick(0);
    toast.info("Live stream stopped");
  }, [toast]);

  const handleEndSession = useCallback(() => {
    if (!window.confirm("End session and return to main page?")) return;

    setIsStreaming(false);
    navigate("/live");
    toast.success("Live session ended");
  }, [navigate, toast]);

  const handleCopyLink = useCallback(() => {
    if (!streamData?.hls_url) return;
    navigator.clipboard.writeText(streamData.hls_url);
    toast.success("Stream link copied to clipboard");
  }, [streamData, toast]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
                onClick={() => navigate("/live")}
              >
                <ArrowLeftIcon className="h-5 w-5" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">Live Studio Control</h1>
                <p className="text-sm text-muted-foreground">{streamData.title || "Untitled Stream"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm text-foreground">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${isStreaming ? "animate-pulse bg-red-500" : "bg-gray-400"
                    }`}
                />
                <span className="font-semibold">
                  {isStreaming ? "LIVE" : "OFFLINE"}
                </span>
              </div>

              {isStreaming ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-xl"
                  onClick={handleStopStream}
                >
                  <StopIcon className="h-4 w-4" />
                  Stop Stream
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="rounded-xl bg-red-500 hover:bg-red-600 text-white"
                  onClick={handleStartStream}
                >
                  <VideoCameraIcon className="h-4 w-4" />
                  Start Streaming
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
                  <SignalIcon className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-600">Good Connection</span>
                </div>
              </div>

              <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-muted">
                <video
                  key={streamData.hls_url}
                  controls
                  autoPlay
                  muted
                  className="h-full w-full"
                  src={streamData.hls_url}
                />
                {!isStreaming && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="text-center">
                      <VideoCameraIcon className="mx-auto h-16 w-16 text-muted-foreground/50" />
                      <p className="mt-4 text-sm text-muted-foreground">
                        Click "Start Streaming" to go live
                      </p>
                    </div>
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
                  {isStreaming && sessionStart ? formatTime(sessionTick) : "00:00"}
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
                  <span className="text-xs font-semibold uppercase tracking-wide">Bitrate</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-foreground">Auto</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 text-amber-500">
                  <CheckCircleIcon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Status</span>
                </div>
                <p className="mt-2 text-base font-bold text-foreground">
                  {isStreaming ? "Streaming" : "Ready"}
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
                  Share Link
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
                  onClick={handleEndSession}
                >
                  End Session
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column - Chat & Activity */}
          <div className="space-y-6">
            {/* Chat Panel */}
            <div className="flex h-[calc(100vh-200px)] flex-col overflow-hidden rounded-3xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Chat & Activity
                  </h3>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-border bg-muted/50 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{msg.user}</span>
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
                    className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <Button size="sm" className="rounded-xl">
                    Send
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Interactive chat will be integrated with WebSocket
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveStudio;
