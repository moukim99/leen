/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          linen: '#FAF6F0',
          warm: '#F4ECE1',
          olive: '#1A3020',
          clay: '#C87E60',
          sand: '#E5D5C5',
          gold: '#D4AF37',
          charcoal: '#2B2B2B',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'Cairo', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
