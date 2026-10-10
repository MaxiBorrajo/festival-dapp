/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: token('bg'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        line: token('line'),
        fg: token('fg'),
        muted: token('muted'),
        accent: { DEFAULT: token('accent'), fg: token('accent-fg') },
        ok: { DEFAULT: token('ok'), soft: token('ok-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
      }
    },
  },
  plugins: [],
}
