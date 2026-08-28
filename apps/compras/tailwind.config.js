/** @type {import('tailwindcss').Config} */
module.exports = {
  // Los valores de marca (colores, radios, sombras, tipografía) viven en un
  // solo lugar: el preset del sistema de diseño real de Logisalud. Ver
  // packages/design-system/README.md.
  presets: [require('@logisalud/design-system/tailwind-preset')],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
    // Las pantallas de login viven en el paquete compartido: sin esto,
    // Tailwind no genera las clases que usan.
    '../../packages/auth/src/**/*.{js,ts,jsx,tsx}',
  ],
  plugins: [],
};
