/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dcc: {
          900: '#121316',
          850: '#181a1f',
          800: '#202228',
          750: '#282b33',
          700: '#323640',
          600: '#434855',
          500: '#646b7d',
          accent: '#6366f1',
          accentHover: '#4f46e5',
          retroYellow: '#f59e0b',
          retroGreen: '#10b981',
          retroCyan: '#06b6d4',
          retroMagenta: '#ec4899',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
        pixel: ['"Press Start 2P"', 'monospace', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
