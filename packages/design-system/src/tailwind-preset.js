/**
 * Preset de Tailwind del sistema de diseño real de Logisalud (paquete
 * `Sistema_de_Disen_o_Logisalud.zip` — ver tokens/*.css en este mismo
 * paquete para los valores fuente en CSS, y `guidelines/` para el porqué de
 * cada uno). Los valores acá son la traducción 1:1 de esos tokens al
 * lenguaje de Tailwind — no se inventa ningún color/radio/sombra que no
 * esté en el kit de marca.
 *
 * Una app lo consume así en su propio tailwind.config.js:
 *
 *   module.exports = {
 *     presets: [require('@logisalud/design-system/tailwind-preset')],
 *     content: [...],
 *   }
 *
 * Decisión de mapeo: en vez de agregar nombres nuevos (`rounded-card`,
 * `bg-neutral-50`...) que habría que salir a aplicar pantalla por pantalla,
 * este preset PISA la escala numérica por defecto de Tailwind
 * (`gray`/`green`/`teal`, `rounded-sm/md/lg`, `shadow-sm/md`) con los
 * valores exactos de marca. Como el código ya existente en cada app usa esa
 * escala por defecto (`bg-gray-50`, `rounded-md` en inputs, `.card` con
 * `rounded-lg`+`shadow-sm`...), pisarla reskinea todas las pantallas ya
 * construidas sin tocarlas una por una — es la app la que decide si además
 * quiere usar nombres nuevos para casos puntuales (ver `pill`/`card` como
 * alias explícitos más abajo, disponibles pero no obligatorios).
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-oswald)', 'Oswald', 'Impact', 'sans-serif'],
        body: ['var(--font-poppins)', 'Poppins', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Verde institucional — primario. Ramp completo tomado de
        // tokens/colors.css (--green-50…900), hue-locked a #4BB168.
        green: {
          50: '#EEF9F1', 100: '#D8F1DF', 200: '#B2E4C2', 300: '#87D3A0',
          400: '#63C282', 500: '#4BB168', 600: '#3B9455', 700: '#2F7644',
          800: '#255C36', 900: '#1B4127',
        },
        // Celeste/teal institucional — secundario. Nunca se mezcla con el
        // verde en gradiente (regla de marca explícita).
        teal: {
          50: '#EDF9FA', 100: '#D5F1F2', 200: '#ABE3E6', 300: '#7FD2D7',
          400: '#5FC6CB', 500: '#4ABCC2', 600: '#3A9BA1', 700: '#2E7C80',
          800: '#256266', 900: '#1B4649',
        },
        // Neutrales con un pelo de verde — pisa el `gray` de Tailwind para
        // que "negro/blanco plano" (gray por defecto) se vuelva la escala
        // de marca en toda pantalla ya construida sin tocarla.
        gray: {
          50: '#F6F8F7', 100: '#EDF1EF', 200: '#DFE5E2', 300: '#C5CFCA',
          400: '#9AA6A0', 500: '#728079', 600: '#55625B', 700: '#3D4842',
          800: '#2A332E', 900: '#1A201D',
        },
        // Alias históricos: mucho código ya usa bg-logisalud-green /
        // text-logisalud-teal — se mantienen para no forzar un rename.
        logisalud: { green: '#4BB168', teal: '#4ABCC2' },
      },
      // Pisa la escala numérica para que rounded-sm/md/lg calcen con los
      // usos reales del código ya existente: inputs (rounded-md, ~120
      // usos) pasan a radius-input (8px) y .card (rounded-lg) pasa a
      // radius-card (16px), sin tocar ningún archivo. rounded-full ya era
      // el pill de Tailwind — botones lo usan explícitamente en globals.css.
      borderRadius: {
        sm: '4px',   // radius-xs
        md: '8px',   // radius-input — el que usan los inputs hoy
        lg: '16px',  // radius-card — el que usa .card/.card-highlight hoy
        xl: '24px',  // radius-xl
        '2xl': '32px', // radius-2xl
        pill: '9999px', // alias explícito — igual a rounded-full
        card: '16px',   // alias explícito — igual a rounded-lg acá
        input: '8px',   // alias explícito — igual a rounded-md acá
        image: '12px',  // radius-image, sin equivalente numérico pisado
      },
      // Sombras suaves, tintadas de neutral-900 verdoso — nunca negro puro.
      boxShadow: {
        xs: '0 1px 2px rgb(26 32 29 / .05)',
        sm: '0 1px 3px rgb(26 32 29 / .06), 0 1px 2px rgb(26 32 29 / .04)',
        md: '0 4px 12px rgb(26 32 29 / .07)',
        lg: '0 10px 28px rgb(26 32 29 / .09)',
        xl: '0 20px 48px rgb(26 32 29 / .12)',
        brand: '0 8px 24px rgb(75 177 104 / .22)',
      },
      transitionDuration: {
        fast: '140ms',
        base: '220ms',
        slow: '340ms',
        slower: '520ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,.2,1)',
        out: 'cubic-bezier(.16,1,.3,1)',
      },
      letterSpacing: {
        display: '0.01em',
        'display-caps': '0.045em',
        eyebrow: '0.14em',
      },
    },
  },
}
