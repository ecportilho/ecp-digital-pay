import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0b0f14',
        surface: '#131c28',
        'secondary-bg': '#0f1620',
        border: '#27364a',
        lime: {
          DEFAULT: '#b7ff2a',
          pressed: '#7ed100',
          dim: 'rgba(183, 255, 42, 0.12)',
        },
        'text-primary': '#eaf2ff',
        'text-secondary': '#a9b7cc',
        'text-tertiary': '#7b8aa3',
        success: '#3dff8b',
        warning: '#ffcc00',
        danger: '#ff4d4d',
        info: '#4da3ff',
      },
      borderRadius: {
        card: '18px',
        control: '13px',
        badge: '20px',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
