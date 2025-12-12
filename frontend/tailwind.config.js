/** @type {import('tailwindcss').Config} */
const withOpacityValue =
  (variable) =>
  ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variable}) / ${opacityValue})`;
    }
    return `rgb(var(${variable}))`;
  };

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        background: withOpacityValue("--background"),
        foreground: withOpacityValue("--foreground"),
        card: withOpacityValue("--card"),
        "card-foreground": withOpacityValue("--card-foreground"),
        primary: withOpacityValue("--primary"),
        "primary-foreground": withOpacityValue("--primary-foreground"),
        secondary: withOpacityValue("--secondary"),
        "secondary-foreground": withOpacityValue("--secondary-foreground"),
        muted: withOpacityValue("--muted"),
        "muted-foreground": withOpacityValue("--muted-foreground"),
        accent: withOpacityValue("--accent"),
        "accent-foreground": withOpacityValue("--accent-foreground"),
        destructive: withOpacityValue("--destructive"),
        "destructive-foreground": withOpacityValue("--destructive-foreground"),
        border: withOpacityValue("--border"),
        input: withOpacityValue("--input"),
        ring: withOpacityValue("--ring"),
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
