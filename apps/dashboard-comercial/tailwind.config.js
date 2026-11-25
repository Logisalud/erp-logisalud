/**
 * Tailwind mínimo, solo para las pantallas de sesión.
 *
 * El tablero no lo usa: `public/tablero.html` es un archivo suelto con su
 * propio CSS, el mismo que corre en el artifact. Lo que sí lo necesita es
 * el login, que vive en `packages/auth` y está escrito con clases de
 * Tailwind — sin esto el formulario sale sin estilos, con el degradé de
 * marca ocupando todo el ancho y los campos en bruto.
 *
 * No se importa el preset de `@logisalud/design-system` como `presets:`
 * por el mismo motivo que cobranzas (ver su DESIGN.md): ese preset pisa
 * `gray`, `green`, `rounded-*` y `shadow-*` por defecto, y el login está
 * escrito contra esos valores. Pisarlos haría que esta pantalla se vea
 * distinta de la de cobranzas y compras sin tocar una línea suya. Se
 * declaran a mano los dos colores y el alias de fuente que el login pide,
 * y nada más.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // El login vive en el paquete compartido: sin esta línea Tailwind no
    // genera ninguna de sus clases.
    '../../packages/auth/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        logisalud: {
          green: '#4BB168',
          teal: '#4ABCC2',
        },
      },
      fontFamily: {
        // Nombres que usa packages/auth, para que la pantalla se vea igual
        // en las tres apps aunque cada una nombre sus fuentes distinto.
        heading: ['var(--font-oswald)', 'sans-serif'],
        body: ['var(--font-poppins)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
