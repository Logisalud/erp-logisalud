/** @type {import('next').NextConfig} */
const nextConfig = {
  // La app se sirve bajo erp.logisalud.com/compras, vía un rewrite desde
  // apps/cobranzas (que es la que tiene el dominio). basePath hace que todas
  // las rutas y los assets de _next/ salgan ya prefijados con /compras, así
  // el rewrite es un pasamanos directo y no hay que reescribir assets aparte.
  basePath: '/compras',
};
module.exports = nextConfig;
