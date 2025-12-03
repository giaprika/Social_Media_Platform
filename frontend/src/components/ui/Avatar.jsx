import clsx from "clsx";

// Màu nền cho avatar - đa dạng và dễ nhìn
const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500", 
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
  "bg-rose-500",
];

// Tạo màu dựa trên string (consistent cho cùng 1 user)
const getColorFromString = (str) => {
  if (!str) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

const Avatar = ({ src, alt, name, size = "md", className, onClick }) => {
  const sizes = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-lg",
    "2xl": "h-20 w-20 text-2xl",
    "3xl": "h-32 w-32 text-4xl",
  };

  const getInitials = (name) => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const displayName = name || alt || "User";
  const bgColor = getColorFromString(displayName);

  return (
    <div
      className={clsx(
        "flex items-center justify-center rounded-full font-bold text-white",
        sizes[size],
        !src && bgColor,
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
        <span>{getInitials(displayName)}</span>
      )}
    </div>
  );
};

export default Avatar;

