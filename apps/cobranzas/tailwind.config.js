/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // Las pantallas de login viven en el paquete compartido: sin esto,
    // Tailwind no genera las clases que usan.
    '../../packages/auth/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        poppins: ['var(--font-poppins)', 'sans-serif'],
        oswald:  ['var(--font-oswald)', 'sans-serif'],
        // Alias que usa packages/auth, para que las pantallas compartidas se
        // vean igual en las dos apps aunque cada una nombre sus fuentes
        // distinto.
        heading: ['var(--font-oswald)', 'sans-serif'],
        body:    ['var(--font-poppins)', 'sans-serif'],
      },
      colors: {
        logisalud: {
          green: '#4BB168',
          teal:  '#4ABCC2',
        },
      },
    },
  },
  plugins: [],
};
