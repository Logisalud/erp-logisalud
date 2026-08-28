/** @type {import('next').NextConfig} */
const nextConfig = {
  // La app se sirve bajo erp.logisalud.com/compras, vía un rewrite desde
  // apps/cobranzas (que es la que tiene el dominio). basePath hace que todas
  // las rutas y los assets de _next/ salgan ya prefijados con /compras, así
  // el rewrite es un pasamanos directo y no hay que reescribir assets aparte.
  basePath: '/compras',
  // Next antepone el basePath solo, pero SOLO a next/link, next/image y a la
  // navegación del router — un fetch('/api/...') de cliente a un path que
  // arranca con "/" pide siempre la raíz del host (erp.logisalud.com, que es
  // cobranzas), no /compras/api/... Sin esto, cualquier combobox con
  // búsqueda en el servidor (ver components/buscador-producto.tsx) pega
  // contra una ruta que no existe y responde vacío, no un error.
  env: {
    NEXT_PUBLIC_BASE_PATH: '/compras',
  },
  // El proxy /_next/image (optimizador de Vercel) devuelve 404 para el logo
  // aunque el path y el basePath están bien — confirmado con fetch directo a
  // producción: la URL exacta que genera next/image 404, pero el archivo
  // crudo equivalente (/compras/brand/...png) responde 200. Todo indica que
  // el optimizador no funciona a través del rewrite entre proyectos Vercel
  // (cobranzas → compras). unoptimized hace que next/image pida el archivo
  // crudo directo, sin pasar por ese proxy.
  images: {
    unoptimized: true,
  },
};
module.exports = nextConfig;
