import clsx from "clsx";

const Skeleton = ({ className, variant = "rectangular", ...props }) => {
  const baseStyles = "animate-pulse bg-muted rounded";
  
  const variants = {
    rectangular: "",
    circular: "rounded-full",
    text: "h-4",
  };

  return (
    <div
      className={clsx(baseStyles, variants[variant], className)}
      {...props}
    />
  );
};

export default Skeleton;

