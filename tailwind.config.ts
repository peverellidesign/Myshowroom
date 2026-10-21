import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Peverelli palette (peverellicode.com): pure white, cool greys, deep anthracite.
        canvas: "#FFFFFF",
        card: "#FFFFFF",
        surface: "#F7F7F7",
        mist: "#ECEDEF",
        ink: "#161A1A",
        soft: "#5F6363",
        muted: "#707070",
        line: "#DDDDDD",
        selected: "#ECEDEF",
        charcoal: "#292E2E",
        night: "#161A1A",
        danger: { DEFAULT: "#B42318", bg: "#FCEEEE", line: "#F2CFCC" },
        success: { DEFAULT: "#2E6B47", bg: "#ECF4EF" },
        warning: { DEFAULT: "#8A5A0F", bg: "#F8F1E4" },
        info: { DEFAULT: "#3B5B8C" },
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
