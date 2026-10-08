/** @type {import('next').NextConfig} */
//
// Se sirve como zona bajo erp.logisalud.com/wms (Multi-Zones), igual que
// apps/compras: basePath + rewrite desde apps/cobranzas (ese rewrite aún no
// existe: ver docs/wms/decisiones-pendientes.md D-23).
//
// ⚠️ `unoptimized` y `basePath` se afectan entre sí. Con `unoptimized`,
// next/image NO antepone el basePath: todo asset de public/ se arma a mano con
// NEXT_PUBLIC_BASE_PATH (ver components/marca.tsx). Mismo problema, documentado
// en apps/compras/next.config.js.
const nextConfig = {
  basePath: '/wms',
  env: {
    NEXT_PUBLIC_BASE_PATH: '/wms',
  },
  images: {
    unoptimized: true,
  },
};
module.exports = nextConfig;
