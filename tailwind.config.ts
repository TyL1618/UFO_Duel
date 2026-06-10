import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neon: {
          blue: '#00d4ff',
          purple: '#9d00ff',
          green: '#00ff88',
          red: '#ff3366',
          yellow: '#ffdd00',
        },
        dark: {
          bg: '#0a0a1a',
          panel: '#12122a',
          border: '#1e1e3a',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
} satisfies Config
