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
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
