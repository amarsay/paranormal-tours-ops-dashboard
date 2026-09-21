import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0b0c10",
          50: "#f4f5f7",
          100: "#e6e8ee",
          200: "#c9ced9",
          300: "#a4abb9",
          400: "#7a8294",
          500: "#5c6476",
          600: "#464c5c",
          700: "#353a47",
          800: "#232733",
          900: "#14171f",
          950: "#0b0c10",
        },
      },
      boxShadow: {
        glow: "0 0 40px rgba(139, 92, 246, 0.15)",
      },
      backgroundImage: {
        "radial-fade":
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124, 58, 237, 0.18), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(45, 212, 191, 0.08), transparent)",
      },
    },
  },
  plugins: [],
};
export default config;
