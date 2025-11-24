import clsx from "clsx";

const Avatar = ({ src, alt, name, size = "md", className, onClick }) => {
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-lg",
  };

  const getInitials = (name) => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  return (
    <div
      className={clsx(
        "flex items-center justify-center rounded-full bg-primary font-bold text-primary-foreground",
        sizes[size],
        onClick && "cursor-pointer transition-opacity hover:opacity-80",
        className
      )}
      onClick={onClick}
    >
      {src ? (
        <img
          src={src}
          alt={alt || name}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span>{getInitials(name || alt || "User")}</span>
      )}
    </div>
  );
};

export default Avatar;

