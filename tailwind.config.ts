import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

const config: Config = {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{ts,tsx,html}', './src/renderer/index.html'],
  theme: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
    },
    extend: {
      colors: {
        bg: {
          base: '#F2F2F7',
          card: '#FFFFFF',
        },
        accent: {
          DEFAULT: 'var(--color-accent, #0A84FF)',
          hover: 'var(--color-accent-hover, #0070E0)',
          light: 'var(--color-accent-light, rgba(10, 132, 255, 0.1))',
        },
        success: {
          DEFAULT: '#30D158',
          light: 'rgba(48, 209, 88, 0.1)',
        },
        danger: {
          DEFAULT: '#FF453A',
          light: 'rgba(255, 69, 58, 0.1)',
        },
        warning: {
          DEFAULT: '#FF9F0A',
          light: 'rgba(255, 159, 10, 0.1)',
        },
        text: {
          primary: '#1C1C1E',
          secondary: '#636366',
          tertiary: '#AEAEB2',
        },
        glass: {
          bg: 'rgba(255, 255, 255, 0.72)',
          border: 'rgba(255, 255, 255, 0.18)',
          'bg-dark': 'rgba(255, 255, 255, 0.55)',
        },
        border: {
          DEFAULT: '#E5E5EA',
          light: '#F2F2F7',
        },
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        ambient:
          '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.03)',
        'ambient-lg':
          '0 2px 6px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06), 0 16px 48px rgba(0,0,0,0.04)',
        'ambient-sm': '0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)',
        'layered-sm':
          '0 2px 4px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)',
        layered:
          '0 4px 8px rgba(0,0,0,0.03), 0 12px 28px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        'layered-lg':
          '0 10px 20px rgba(0,0,0,0.04), 0 20px 48px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)',
        'hero-glow':
          '0 12px 32px -4px rgba(10, 132, 255, 0.35), 0 4px 16px rgba(0,0,0,0.08)',
        glass: '0 8px 32px rgba(0,0,0,0.08)',
      },
      backdropBlur: {
        glass: '20px',
      },
      transitionDuration: {
        DEFAULT: '200ms',
        fast: '150ms',
        slow: '300ms',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-right': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-left': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(-100%)', opacity: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'slide-in-rtl': 'slide-in-left 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-out-rtl': 'slide-out-left 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        'fade-in': 'fade-in 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        'fade-out': 'fade-out 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scale-in 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.glass': {
          'background-color': 'rgba(255, 255, 255, 0.72)',
          'backdrop-filter': 'blur(20px)',
          '-webkit-backdrop-filter': 'blur(20px)',
          'border': '1px solid rgba(255, 255, 255, 0.18)',
        },
        '.glass-dark': {
          'background-color': 'rgba(255, 255, 255, 0.55)',
          'backdrop-filter': 'blur(20px)',
          '-webkit-backdrop-filter': 'blur(20px)',
          'border': '1px solid rgba(255, 255, 255, 0.12)',
        },
        '.tabular-nums': {
          'font-variant-numeric': 'tabular-nums',
        },
        '.btn-press': {
          'transition': 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:active': {
            transform: 'scale(0.97)',
          },
        },
      })
    }),
  ],
}

export default config
