import { useState, useRef } from "react";
import { PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { useToast } from "../ui";

const CreatePostModal = ({ isOpen, onClose, onSubmit }) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const toast = useToast();

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast.error("Vui lòng chọn file hình ảnh");
      return;
    }

    if (images.length + imageFiles.length > 5) {
      toast.warning("Tối đa 5 hình ảnh");
      return;
    }

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImages((prev) => [...prev, { file, preview: e.target.result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim() && !content.trim()) {
      toast.error("Vui lòng nhập tiêu đề hoặc nội dung");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        images: images.map((img) => img.file),
      });
      toast.success("Đã tạo bài viết thành công!");
      handleClose();
    } catch (error) {
      toast.error("Có lỗi xảy ra khi tạo bài viết");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setContent("");
    setImages([]);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Tạo bài viết mới"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            Đăng bài
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Tiêu đề (tùy chọn)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nhập tiêu đề..."
          maxLength={200}
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Nội dung
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Bạn đang nghĩ gì?"
            rows={6}
            className="w-full rounded-lg border border-border bg-card px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors resize-none"
            maxLength={5000}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {content.length}/5000 ký tự
          </p>
        </div>

        {images.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Hình ảnh ({images.length}/5)
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {images.map((img, index) => (
                <div key={index} className="relative group">
                  <img
                    src={img.preview}
                    alt={`Preview ${index + 1}`}
                    className="h-32 w-full rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={images.length >= 5}
          >
            <PhotoIcon className="mr-2 h-5 w-5" />
            {images.length === 0 ? "Thêm hình ảnh" : "Thêm thêm hình ảnh"} ({images.length}/5)
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CreatePostModal;

