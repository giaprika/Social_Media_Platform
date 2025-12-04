import { ExclamationTriangleIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Button from "./Button";

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Xác nhận",
  message = "Bạn có chắc chắn muốn thực hiện hành động này?",
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  variant = "danger", // 'danger' | 'warning' | 'info'
  loading = false,
}) => {
  if (!isOpen) return null;

  const variants = {
    danger: {
      icon: TrashIcon,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
      buttonVariant: "destructive",
    },
    warning: {
      icon: ExclamationTriangleIcon,
      iconBg: "bg-yellow-500/10",
      iconColor: "text-yellow-500",
      buttonVariant: "primary",
    },
    info: {
      icon: ExclamationTriangleIcon,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      buttonVariant: "primary",
    },
  };

  const currentVariant = variants[variant] || variants.danger;
  const Icon = currentVariant.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-50 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="p-6">
          {/* Icon */}
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${currentVariant.iconBg}`}>
            <Icon className={`h-7 w-7 ${currentVariant.iconColor}`} />
          </div>

          {/* Title */}
          <h3 className="mb-2 text-center text-lg font-bold text-foreground">
            {title}
          </h3>

          {/* Message */}
          <p className="mb-6 text-center text-sm text-muted-foreground">
            {message}
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={loading}
            >
              {cancelText}
            </Button>
            <Button
              variant={currentVariant.buttonVariant}
              className="flex-1"
              onClick={onConfirm}
              loading={loading}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
