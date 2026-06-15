/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coffee: {
          50: '#fbf7f4',
          100: '#f4ece6',
          200: '#ebdcd0',
          300: '#dcbeab',
          400: '#c5977d',
          500: '#b17b5f',
          600: '#a2664d',
          700: '#87513e',
          800: '#6e4334',
          900: '#59382c',
          950: '#301c15',
        }
      }
    },
  },
  plugins: [],
}
