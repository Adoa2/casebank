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
        'brand-teal': {
          50: '#E0F2F1',
          100: '#B2DFDB',
          200: '#80CBC4',
          300: '#4DB6AC',
          400: '#26A69A',
          500: '#00897B',
          600: '#00796B',
          700: '#00695C',
          900: '#004D40',
        },
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