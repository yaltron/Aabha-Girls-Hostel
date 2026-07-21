import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#755b00',
        'primary-container': '#c9a227',
        'on-primary': '#ffffff',
        background: '#fff8f4',
        surface: '#fff8f4',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#fff1e6',
        'surface-container': '#fdebda',
        'surface-container-high': '#f7e5d4',
        'surface-container-highest': '#f2dfcf',
        secondary: '#705a4c',
        'secondary-container': '#f8dac8',
        'on-background': '#231a10',
        'on-surface': '#231a10',
        'on-surface-variant': '#4d4635',
        outline: '#7f7663',
        'outline-variant': '#d1c5af',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        xxl: '24px',
      },
      spacing: {
        base: '8px',
        gutter: '24px',
        'margin-mobile': '20px',
        'margin-desktop': '64px',
        'section-gap': '80px',
      },
      maxWidth: {
        'container-max': '1200px',
      },
      boxShadow: {
        premium: '0px 4px 20px rgba(61,43,31,0.05)',
        'premium-lg': '0px 10px 30px rgba(61,43,31,0.1)',
      },
    },
  },
} satisfies Config
