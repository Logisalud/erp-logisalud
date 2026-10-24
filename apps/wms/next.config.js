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
  // Cada PDF de documentos regulatorios (≤ 15 MB) viaja en una acción del servidor
  experimental: {
    serverActions: { bodySizeLimit: '16mb' },
    // Las fuentes estándar de pdfkit (Helvetica, etc. — las usa @react-pdf/renderer en todos los PDF) se cargan con un
    // `require('#standard-fonts/…')` por «imports» del paquete: el rastreo de archivos de Vercel no lo ve y la función
    // serverless se despliega sin ellas («Cannot find module …/standard-fonts/Helvetica.cjs» → HTTP 500). Se incluyen a mano.
    // Ver D-177. Los dos prefijos cubren node_modules local de la app y el hoisted de la raíz del monorepo.
    outputFileTracingIncludes: {
      '/**/*': [
        './node_modules/pdfkit/package.json',
        './node_modules/pdfkit/js/pdfkit.node.mjs',
        './node_modules/pdfkit/js/standard-fonts/**',
        './node_modules/pdfkit/js/data/**',
        '../../node_modules/pdfkit/package.json',
        '../../node_modules/pdfkit/js/pdfkit.node.mjs',
        '../../node_modules/pdfkit/js/standard-fonts/**',
        '../../node_modules/pdfkit/js/data/**',
      ],
    },
  },
  images: {
    unoptimized: true,
  },
};
module.exports = nextConfig;
