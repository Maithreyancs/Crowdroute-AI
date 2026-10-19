/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gov: {
          navy: '#0f172a',
          'navy-dark': '#090e17',
          'navy-light': '#1e293b',
          blue: '#0284c7',
          'blue-dark': '#0369a1',
          'blue-light': '#e0f2fe',
          orange: '#ea580c',
          'orange-dark': '#c2410c',
          'orange-light': '#fff7ed',
          teal: '#0d9488',
        }
      },
      fontFamily: {
        heading: ['Outfit', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
