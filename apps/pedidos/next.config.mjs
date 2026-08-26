/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Las listas de precios de proveedor (.xlsx) pueden superar el
    // límite por defecto de 1mb para Server Actions.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
