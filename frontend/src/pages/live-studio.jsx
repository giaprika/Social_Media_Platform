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
  const [chatMessages, setChatMessages] = useState([
    { id: 1, user: "System", message: "Chào mừng đến phiên live! 🎉", time: new Date() },
  ]);

  useEffect(() => {
    if (!streamData) {
      toast.error("Không tìm thấy thông tin stream");
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
    toast.success("Đã bắt đầu phát live!");
    
    // Simulate viewer count increase
    const viewerInterval = setInterval(() => {
      setViewerCount((prev) => prev + Math.floor(Math.random() * 3));
    }, 5000);
    
    return () => clearInterval(viewerInterval);
  }, [toast]);

  const handleStopStream = useCallback(() => {
    if (!window.confirm("Bạn có chắc muốn dừng phiên live?")) return;
    
    setIsStreaming(false);
    setSessionStart(null);
    setSessionTick(0);
    toast.info("Đã dừng phiên live");
  }, [toast]);

  const handleEndSession = useCallback(() => {
    if (!window.confirm("Kết thúc phiên và quay về trang chính?")) return;
    
    setIsStreaming(false);
    navigate("/live");
    toast.success("Đã kết thúc phiên live");
  }, [navigate, toast]);

  const handleCopyLink = useCallback(() => {
    if (!streamData?.hls_url) return;
    navigator.clipboard.writeText(streamData.hls_url);
    toast.success("Đã copy link xem stream");
  }, [streamData, toast]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!streamData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl text-white/70 hover:text-white"
                onClick={() => navigate("/live")}
              >
                <ArrowLeftIcon className="h-5 w-5" />
                Quay lại
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">{streamData.title}</h1>
                <p className="text-sm text-white/50">{streamData.description || "Live Studio Control"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm text-white">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    isStreaming ? "animate-pulse bg-red-500" : "bg-gray-500"
                  }`}
                />
                <span className="font-semibold">
                  {isStreaming ? "ĐANG PHÁT" : "OFFLINE"}
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
                  Dừng phát
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="rounded-xl bg-red-500 hover:bg-red-600"
                  onClick={handleStartStream}
                >
                  <VideoCameraIcon className="h-4 w-4" />
                  Bắt đầu phát
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
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-4 shadow-2xl backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <VideoCameraIcon className="h-5 w-5 text-white/70" />
                  <span className="text-sm font-semibold uppercase tracking-wide text-white/70">
                    Live Preview
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <SignalIcon className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs text-emerald-400">Kết nối tốt</span>
                </div>
              </div>

              <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-black">
                <video
                  key={streamData.hls_url}
                  controls
                  autoPlay
                  muted
                  className="h-full w-full"
                  src={streamData.hls_url}
                />
                {!isStreaming && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="text-center">
                      <VideoCameraIcon className="mx-auto h-16 w-16 text-white/30" />
                      <p className="mt-4 text-sm text-white/70">
                        Ấn "Bắt đầu phát" để lên sóng
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-blue-400">
                  <ClockIcon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Thời gian</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-white">
                  {isStreaming && sessionStart ? formatTime(sessionTick) : "00:00"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-purple-400">
                  <EyeIcon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Người xem</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-white">{viewerCount}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-emerald-400">
                  <SignalIcon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Bitrate</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-white">Auto</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-amber-400">
                  <CheckCircleIcon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Trạng thái</span>
                </div>
                <p className="mt-2 text-base font-bold text-white">
                  {isStreaming ? "Đang live" : "Sẵn sàng"}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">
                Thao tác nhanh
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-white/20 text-white hover:bg-white/10"
                  onClick={handleCopyLink}
                >
                  <ShareIcon className="h-4 w-4" />
                  Chia sẻ link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-white/20 text-white hover:bg-white/10"
                  onClick={() => toast.info("Tính năng đang phát triển")}
                >
                  <Cog6ToothIcon className="h-4 w-4" />
                  Cài đặt
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="ml-auto rounded-xl"
                  onClick={handleEndSession}
                >
                  Kết thúc phiên
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column - Chat & Activity */}
          <div className="space-y-6">
            {/* Chat Panel */}
            <div className="flex h-[calc(100vh-200px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
              <div className="border-b border-white/10 p-4">
                <div className="flex items-center gap-2">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-white/70" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
                    Chat & Hoạt động
                  </h3>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{msg.user}</span>
                      <span className="text-xs text-white/50">
                        {new Date(msg.time).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-white/70">{msg.message}</p>
                  </div>
                ))}

                {isStreaming && chatMessages.length === 1 && (
                  <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 text-center text-sm text-white/50">
                    Đang chờ người xem tham gia chat...
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Gửi tin nhắn..."
                    className="flex-1 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
                    disabled
                  />
                  <Button size="sm" className="rounded-xl" disabled>
                    Gửi
                  </Button>
                </div>
                <p className="mt-2 text-xs text-white/40">
                  Chat tương tác sẽ được tích hợp WebSocket
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
