import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Aurora palette (oklch) — see globals.css.
        ground: "var(--ground)",
        surface: "var(--surface)",
        raised: "var(--raised)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        "accent-soft": "var(--accent-soft)",
        "accent-ink": "var(--accent-ink)",
        positive: "var(--positive)",
        negative: "var(--negative)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 4px oklch(0.5 0.12 283 / 0.06), 0 14px 34px oklch(0.5 0.12 283 / 0.1)",
        glow: "0 10px 26px oklch(0.55 0.19 281 / 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
