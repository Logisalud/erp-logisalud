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
  theme: {
    extend: {
      // El latido suave del paso actual del seguimiento (0069). Se usa SOLO con `motion-safe:`: con «reducir movimiento» no hay animación.
      keyframes: { latido: { '0%, 100%': { boxShadow: '0 0 0 0 rgba(75, 177, 104, 0.45)' }, '50%': { boxShadow: '0 0 0 8px rgba(75, 177, 104, 0)' } } },
      animation: { latido: 'latido 2.4s ease-in-out infinite' },
    },
  },
  plugins: [],
};
