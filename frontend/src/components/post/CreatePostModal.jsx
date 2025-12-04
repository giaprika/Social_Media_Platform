import { useState, useRef, useEffect } from "react";
import { 
  PhotoIcon, 
  XMarkIcon, 
  VideoCameraIcon,
  GlobeAltIcon,
  UserGroupIcon,
  LockClosedIcon,
  HashtagIcon,
  XCircleIcon
} from "@heroicons/react/24/outline";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { useToast } from "../ui";

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Công khai", icon: GlobeAltIcon, description: "Mọi người đều có thể xem" },
  { value: "friends", label: "Bạn bè", icon: UserGroupIcon, description: "Chỉ bạn bè mới xem được" },
  { value: "private", label: "Riêng tư", icon: LockClosedIcon, description: "Chỉ mình bạn xem được" },
];

const CreatePostModal = ({ isOpen, onClose, onSubmit, initialData = null, isEditing = false }) => {
  const [content, setContent] = useState("");
  const [media, setMedia] = useState([]); // { file, preview, type: 'image'|'video', isExisting?: boolean }
  const [visibility, setVisibility] = useState("public");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const fileInputRef = useRef(null);
  const toast = useToast();

  // Initialize form with initialData when editing
  useEffect(() => {
    if (isOpen && initialData) {
      setContent(initialData.content || "");
      setVisibility(initialData.visibility || "public");
      setTags(initialData.tags || []);
      
      // Handle existing media (URLs from server)
      if (initialData.images && initialData.images.length > 0) {
        const existingMedia = initialData.images.map((url) => {
          const isVideo = /\.(mp4|webm|mov|avi|mkv|m4v|ogg)$/i.test(url);
          return {
            file: null,
            preview: url,
            type: isVideo ? "video" : "image",
            isExisting: true,
            url,
          };
        });
        setMedia(existingMedia);
      }
    } else if (isOpen && !initialData) {
      // Reset form when opening for new post
      setContent("");
      setMedia([]);
      setVisibility("public");
      setTags([]);
      setTagInput("");
    }
  }, [isOpen, initialData]);

  const handleMediaSelect = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    if (validFiles.length === 0) {
      toast.error("Vui lòng chọn file ảnh hoặc video");
      return;
    }

    if (media.length + validFiles.length > 5) {
      toast.warning("Tối đa 5 file media");
      return;
    }

    validFiles.forEach((file) => {
      const isVideo = file.type.startsWith("video/");
      
      if (isVideo) {
        // Create video thumbnail
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          video.currentTime = 1; // Seek to 1 second for thumbnail
        };
        video.onseeked = () => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0);
          const thumbnail = canvas.toDataURL("image/jpeg");
          setMedia((prev) => [...prev, { file, preview: thumbnail, type: "video", isExisting: false }]);
          URL.revokeObjectURL(video.src);
        };
        video.src = URL.createObjectURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          setMedia((prev) => [...prev, { file, preview: e.target.result, type: "image", isExisting: false }]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const removeMedia = (index) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddTag = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = tagInput.trim().replace(/^#/, "");
      if (tag && !tags.includes(tag) && tags.length < 5) {
        setTags((prev) => [...prev, tag]);
        setTagInput("");
      } else if (tags.length >= 5) {
        toast.warning("Tối đa 5 tags");
      }
    }
  };

  const removeTag = (tagToRemove) => {
    setTags((prev) => prev.filter((tag) => tag !== tagToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!content.trim() && media.length === 0) {
      toast.error("Vui lòng nhập nội dung hoặc thêm media");
      return;
    }

    setLoading(true);
    try {
      // Only include new files (not existing URLs)
      const newFiles = media.filter((m) => !m.isExisting && m.file).map((m) => m.file);
      
      await onSubmit({
        content: content.trim(),
        files: newFiles.length > 0 ? newFiles : undefined,
        visibility,
        tags: tags.length > 0 ? tags : undefined,
      });
      handleClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setContent("");
    setMedia([]);
    setVisibility("public");
    setTags([]);
    setTagInput("");
    setShowVisibilityMenu(false);
    onClose();
  };

  const selectedVisibility = VISIBILITY_OPTIONS.find((v) => v.value === visibility);
  const VisibilityIcon = selectedVisibility?.icon || GlobeAltIcon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditing ? "Chỉnh sửa bài viết" : "Tạo bài viết mới"}
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          {/* Visibility selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowVisibilityMenu(!showVisibilityMenu)}
              className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <VisibilityIcon className="h-4 w-4" />
              <span>{selectedVisibility?.label}</span>
            </button>
            
            {showVisibilityMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-border bg-card shadow-lg z-10">
                {VISIBILITY_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setVisibility(option.value);
                        setShowVisibilityMenu(false);
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl ${
                        visibility === option.value
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Hủy
            </Button>
            <Button onClick={handleSubmit} loading={loading}>
              {isEditing ? "Cập nhật" : "Đăng bài"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Content textarea */}
        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Bạn đang nghĩ gì?"
            rows={5}
            className="w-full rounded-xl border-0 bg-transparent px-0 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 resize-none text-lg"
            maxLength={5000}
            autoFocus
          />
          <div className="flex items-center justify-between border-t border-border pt-2">
            <p className="text-xs text-muted-foreground">
              {content.length}/5000 ký tự
            </p>
          </div>
        </div>

        {/* Tags input */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-muted-foreground">
              <HashtagIcon className="h-4 w-4" />
              <span className="text-sm">Tags:</span>
            </div>
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="rounded-full hover:bg-primary/20 p-0.5"
                >
                  <XCircleIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {tags.length < 5 && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Thêm tag..."
                className="flex-1 min-w-[100px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Nhấn Enter để thêm tag (tối đa 5)
          </p>
        </div>

        {/* Media preview */}
        {media.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Media ({media.length}/5)
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {media.map((item, index) => (
                <div key={index} className="relative group aspect-square">
                  <img
                    src={item.preview}
                    alt={`Preview ${index + 1}`}
                    className="h-full w-full rounded-xl object-cover"
                  />
                  {item.type === "video" && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full bg-black/60 p-2">
                        <VideoCameraIcon className="h-6 w-6 text-white" />
                      </div>
                    </div>
                  )}
                  {item.isExisting && (
                    <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                      Hiện có
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(index)}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Media upload buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleMediaSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={media.length >= 5}
            className="gap-2"
          >
            <PhotoIcon className="h-5 w-5 text-green-500" />
            <span className="text-muted-foreground">Ảnh</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={media.length >= 5}
            className="gap-2"
          >
            <VideoCameraIcon className="h-5 w-5 text-red-500" />
            <span className="text-muted-foreground">Video</span>
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {media.length}/5 file
          </span>
        </div>
      </form>
    </Modal>
  );
};

export default CreatePostModal;

