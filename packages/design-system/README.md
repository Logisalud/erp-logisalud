# @logisalud/design-system

Sistema de diseño real de Logisalud — no referencias sueltas ("verde
#4BB168, Oswald, Poppins"), sino los tokens exactos y el logo oficial de la
marca. Compartido entre `apps/compras`, `apps/cobranzas` y `apps/pedidos`.

Fuente: `Sistema_de_Disen_o_Logisalud.zip` (construido para logisalud.com,
el sitio corporativo/marketing — este paquete solo toma lo que aplica a un
panel administrativo: tokens, `core/`, `forms/`, `feedback/`, la parte de
`navigation/` que aplica, y los logos. Los componentes de marketing
(`ObjectiveCard`, `Testimonial`, `TrustStrip`, `PromoBanner`,
`CertificationRow`, `ValueCard`) no están acá — son de `logisalud.com`, no
de un panel interno).

## Qué hay

- **`src/tokens/*.css`** — los tokens originales del kit de marca
  (`colors.css`, `fonts.css`, `typography.css`, `spacing.css`, `radius.css`,
  `elevation.css`, `motion.css`, `base.css`), tal cual, como referencia y
  para consumo fuera de Tailwind si hiciera falta (emails, PDFs).
- **`src/tailwind-preset.js`** — la traducción de esos tokens al lenguaje
  de Tailwind. **Esta es la forma real de consumir el sistema** dentro de
  una app Next.js — ver el comentario del archivo para el criterio de
  mapeo (pisa la escala numérica por defecto de Tailwind en vez de agregar
  nombres nuevos, así reskinea pantallas ya construidas sin tocarlas).
- **`src/assets/`** — los 9 archivos de logo oficiales (color/negro/blanco ×
  horizontal/stacked/icono).
- **`src/componentes/BrandMark.tsx`** — renderiza el logo correcto según
  layout + colorway. Asume que la app consumidora copió los PNG de
  `src/assets/` a su propio `public/brand/` (Next.js sirve estáticos desde
  el `public/` de cada app, no desde `node_modules`).

## Cómo lo consume una app

```js
// tailwind.config.js
module.exports = {
  presets: [require('@logisalud/design-system/tailwind-preset')],
  content: [...],
}
```

```tsx
import { BrandMark } from '@logisalud/design-system/componentes'
<BrandMark layout="horizontal" colorway="color" height={28} />
```

Y copiar los assets una vez: `cp packages/design-system/src/assets/*.png apps/<app>/public/brand/`.

## Qué falta (fuera de alcance de este paquete por ahora)

- `core/`, `forms/`, `feedback/` como componentes React reales — hoy cada
  app sigue usando sus propias clases utilitarias de Tailwind
  (`.btn-primary`, `.card`, inputs inline) alineadas a los mismos tokens,
  no los componentes JSX del kit original. Migrar a componentes
  compartidos de verdad es un paso aparte, más grande.
- `apps/cobranzas` y `apps/pedidos` todavía no consumen este preset — cada
  una define sus propios valores de marca por separado. Unificarlas es un
  PR aparte (o varios), no parte de este primer corte en `apps/compras`.
