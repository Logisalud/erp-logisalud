/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        poppins: ['var(--font-poppins)', 'sans-serif'],
        oswald:  ['var(--font-oswald)', 'sans-serif'],
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
