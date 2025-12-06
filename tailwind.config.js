/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
    "!./src/functions/**",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Open Sans"', 'sans-serif'],
        heading: ['"Poppins"', 'sans-serif'],
      },
      transitionTimingFunction: {
        // Una curva che "supera" leggermente il punto finale e torna indietro (effetto molla)
        'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)', 
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}