// Valores del sistema de diseño real de Logisalud, leídos directo del
// preset compartido (`@logisalud/design-system/tailwind-preset`) para que
// cobranzas quede sincronizada con él sin copiar números a mano. NO se
// importa el preset como `presets: [...]` — ese preset PISA gray/green/teal
// y rounded-sm/md/lg/shadow-sm/md por defecto de Tailwind, y esta app
// comparte un solo build con /v/[token] (vista del vendedor, sin login) y
// con /login (de `packages/auth`). Pisar esas clases cambiaría su
// apariencia sin tocar ni un archivo suyo. En vez de eso, se toman los
// mismos valores y se exponen bajo nombres NUEVOS (`brand-*`, `ink-*`,
// radios/sombras con nombre propio) que conviven con la escala de Tailwind
// sin reemplazarla. Ver DESIGN.md para el detalle y cómo resincronizar.
const dsPreset = require('@logisalud/design-system/tailwind-preset');
const dsColors = dsPreset.theme.extend.colors;
const dsRadius = dsPreset.theme.extend.borderRadius;
const dsShadow = dsPreset.theme.extend.boxShadow;

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
        // Mismos valores que `gray`/`green`/`teal` del preset compartido,
        // bajo nombres aditivos — las pantallas rediseñadas usan estos;
        // `gray`/`green`/`teal` de Tailwind quedan en sus valores por
        // defecto para que /v/[token] y /login no cambien.
        'brand-green': dsColors.green,
        'brand-teal':  dsColors.teal,
        ink:           dsColors.gray,
      },
      borderRadius: {
        // Nombres propios — NO se tocan `sm`/`md`/`lg` por defecto.
        'ds-xs':   dsRadius.sm,
        'ds-input': dsRadius.md,
        'ds-card':  dsRadius.lg,
        'ds-xl':    dsRadius.xl,
        'ds-2xl':   dsRadius['2xl'],
      },
      boxShadow: {
        // Nombres propios — NO se tocan `sm`/`md` por defecto.
        'ds-xs': dsShadow.xs,
        'ds-sm': dsShadow.sm,
        'ds-md': dsShadow.md,
        'ds-lg': dsShadow.lg,
        'ds-xl': dsShadow.xl,
        'ds-brand': dsShadow.brand,
      },
    },
  },
  plugins: [],
};
