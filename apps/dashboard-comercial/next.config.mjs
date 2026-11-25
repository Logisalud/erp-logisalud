/** @type {import('next').NextConfig} */
const nextConfig = {
  // El tablero es un HTML suelto en `public/`, no una página de React: es el
  // mismo archivo que corre en el artifact de Claude, con su CSS y sus
  // dibujos de d3 intactos. Reescribirlo como componentes habría sido
  // reescribir 700 líneas que ya funcionan, y cada arreglo habría que
  // hacerlo dos veces.
  async rewrites() {
    return [{ source: '/', destination: '/tablero.html' }];
  },
};

export default nextConfig;
