/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff', 100: '#dce6ff', 200: '#b9ccff',
          400: '#6b94f7', 600: '#2f5de8', 800: '#1a3a9e', 900: '#0f2266',
        },
        surface: { 0: '#ffffff', 1: '#f8f9fc', 2: '#f0f2f8', 3: '#e4e8f4' },
        ink: { primary: '#0d1117', secondary: '#3d4557', tertiary: '#7c8499', muted: '#b0b8cc' }
      },
      animation: {
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
      },
      keyframes: {
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.3' } },
      }
    }
  },
  plugins: []
}
