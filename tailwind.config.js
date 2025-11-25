/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // "sans" è il default di Tailwind: lo impostiamo su Open Sans
        sans: ['"Open Sans"', 'sans-serif'],
        
        // Creiamo una classe personalizzata "font-heading" per i titoli in Poppins
        heading: ['"Poppins"', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}