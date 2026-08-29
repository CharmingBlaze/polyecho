/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ui: {
          root: 'var(--ui-bg-root)',
          panel: 'var(--ui-bg-panel)',
          header: 'var(--ui-bg-header)',
          surface: 'var(--ui-bg-surface)',
          input: 'var(--ui-bg-input)',
          hover: 'var(--ui-bg-hover)',
          active: 'var(--ui-bg-active)',
          borderSubtle: 'var(--ui-border-subtle)',
          borderDefault: 'var(--ui-border-default)',
          borderStrong: 'var(--ui-border-strong)',
          borderFocus: 'var(--ui-border-focus)',
          accent: 'var(--ui-accent)',
          accentHover: 'var(--ui-accent-hover)',
          accentSubtle: 'var(--ui-accent-subtle)',
          textPrimary: 'var(--ui-text-primary)',
          textSecondary: 'var(--ui-text-secondary)',
          textMuted: 'var(--ui-text-muted)',
          textAccent: 'var(--ui-text-accent)',
        },
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
      borderRadius: {
        'xs': '2px',
        'sm': '3px',
        'md': '4px',
      },
      height: {
        'ui-header': 'var(--ui-h-header)',
        'ui-toolbar': 'var(--ui-h-toolbar)',
        'ui-control': 'var(--ui-h-control)',
        'ui-control-sm': 'var(--ui-h-control-sm)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
        pixel: ['"Press Start 2P"', 'monospace', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
