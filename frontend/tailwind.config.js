/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        indigo: '#362FA8',
        'brand-blue': '#155EEF',
        'sky-cyan': '#1FDDF2',
        teal: '#0CD6A3',
        'spark-gold': '#FFB020',
        paper: '#F7F9FC',
        ink: '#0B1220',
        slate: '#64748B',
        line: '#E2E8F0',
        'brand-red': {
          50: '#FDECEC',
          100: '#FAD4D4',
          400: '#E8817C',
          500: '#D9534F',
          600: '#C0392B',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}