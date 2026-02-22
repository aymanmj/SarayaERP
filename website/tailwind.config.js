/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1280px'
      }
    },
    extend: {
      fontFamily: {
        sans: ['Cairo', 'sans-serif'],
      },
      colors: {
        saraya: {
          blue: '#0f3460',
          dark: '#0a2240',
          light: '#1a5296',
          gold: '#c5a044',
          goldLight: '#d4b35e'
        }
      }
    },
  },
  plugins: [],
}
