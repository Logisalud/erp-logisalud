/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Disable Router Cache for dynamic pages (prevents React state from being
    // restored on back-navigation without re-running useEffect/re-fetching data)
    staleTimes: {
      dynamic: 0,
    },
  },

  // erp.logisalud.com apunta a este proyecto, así que las rutas /compras se
  // reenvían al deployment de apps/compras. Esa app tiene basePath '/compras',
  // así que el destino conserva el prefijo y sus assets de /compras/_next/
  // entran por el mismo :path*.
  //
  // Servir las dos apps bajo el MISMO host es lo que hace que la sesión se
  // comparta: la cookie de Supabase queda scopeada a erp.logisalud.com y vale
  // para las dos, sin necesidad de NEXT_PUBLIC_AUTH_COOKIE_DOMAIN.
  //
  // COMPRAS_APP_URL es la URL de producción del proyecto de Vercel de compras
  // (ej. https://erp-logisalud-compras.vercel.app). Sin esa variable no se
  // registra el rewrite y /compras devuelve 404 — así un deploy de cobranzas
  // nunca queda proxeando a un destino inexistente.
  // Las pantallas de Cobranzas se mudaron de "/" a "/cobranzas" para dejar la
  // raíz libre para la pantalla de módulos. Hay gente con /estado-cuenta y
  // /registrar-pago en favoritos: sin esto les queda un 404.
  //
  // NO se redirige "/", que ahora es la pantalla de módulos, ni "/v/:token"
  // ni "/api/*", que no se movieron.
  async redirects() {
    const movidas = [
      'estado-cuenta', 'registrar-pago', 'cobranza', 'clientes', 'letras',
      'conciliacion', 'contados-pendientes', 'pagos-sin-confirmar',
      'efectivo-por-depositar', 'concentracion-cartera', 'importar',
      'importar-cartera', 'vendedores-links', 'accesos',
    ];
    return movidas.flatMap((r) => [
      { source: `/${r}`, destination: `/cobranzas/${r}`, permanent: true },
      { source: `/${r}/:path*`, destination: `/cobranzas/${r}/:path*`, permanent: true },
    ]);
  },

  async rewrites() {
    const destino = process.env.COMPRAS_APP_URL?.replace(/\/$/, '');
    if (!destino) return [];
    return [
      { source: '/compras', destination: `${destino}/compras` },
      { source: '/compras/:path*', destination: `${destino}/compras/:path*` },
    ];
  },
};
module.exports = nextConfig;
