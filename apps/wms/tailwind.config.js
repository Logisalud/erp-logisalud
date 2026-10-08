/** @type {import('tailwindcss').Config} */
module.exports = {
  // Marca (colores, radios, sombras, tipografía): preset del sistema de diseño.
  presets: [require('@logisalud/design-system/tailwind-preset')],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // Las pantallas de login viven en el paquete compartido.
    '../../packages/auth/src/**/*.{js,ts,jsx,tsx}',
  ],
  plugins: [],
};
