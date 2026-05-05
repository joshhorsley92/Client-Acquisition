import type { Config } from 'tailwindcss';

// Mirrors the sibling Dashboard config so brand classes (brand.mint,
// brand.charcoal, etc.) map identically across both apps. The semantic
// extras (surface, border, danger, success) are CRM-specific because we
// have admin/audit chrome the Dashboard doesn't have.

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          charcoal: '#1B2838',
          mint: '#00D4AA',
          'mint-dark': '#00B894',
          'mint-light': '#E6FAF6',
          gray: '#64748B',
          'gray-light': '#94A3B8',
        },
        primary: '#1B2838',
        accent: '#00D4AA',
        // CRM-specific semantic tokens
        ink: {
          DEFAULT: '#1B2838',
          muted: '#64748B',
          faint: '#94A3B8',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          alt: '#F1F5F9',
          page: '#F7F8FA',
        },
        edge: {
          DEFAULT: '#E2E6EB',
          strong: '#CBD5E1',
        },
        danger: {
          DEFAULT: '#DC2626',
          strong: '#991B1B',
          bg: '#FEF2F2',
          border: '#FCA5A5',
        },
        success: {
          DEFAULT: '#047857',
          bg: '#ECFDF5',
          border: '#6EE7B7',
        },
        warning: {
          DEFAULT: '#B45309',
          bg: '#FFFBEB',
          border: '#FCD34D',
        },
      },
      fontFamily: {
        heading: ['Outfit', 'system-ui', 'sans-serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'skeleton-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 160ms ease-out',
        'skeleton': 'skeleton-shimmer 1.4s ease-in-out infinite',
      },
      boxShadow: {
        'card': '0 4px 16px rgba(0,0,0,0.08)',
        'modal': '0 8px 32px rgba(0,0,0,0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
