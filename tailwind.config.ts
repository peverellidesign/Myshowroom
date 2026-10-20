import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAFAF8",
        card: "#FFFFFF",
        ink: "#171717",
        soft: "#777773",
        muted: "#888882",
        line: "#E8E8E4",
        selected: "#F0F0ED",
        charcoal: "#222222",
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "20px" },
      letterSpacing: { brand: "0.42em" },
      keyframes: {
        fadein: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        sheet: { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
      },
      animation: { fadein: "fadein .25s ease-out backwards", sheet: "sheet .32s cubic-bezier(.2,.8,.2,1) backwards" },
    },
  },
  plugins: [],
} satisfies Config;
