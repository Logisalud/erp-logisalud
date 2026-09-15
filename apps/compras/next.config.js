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
  experimental: {
  // `@react-pdf/renderer` pinta los PDF de OC/OS con las fuentes estándar de
  // PDF (fontFamily: 'Helvetica' en services/pdf-documentos.tsx). Para eso
  // `@react-pdf/font` hace `import 'pdfkit/standard-fonts/Helvetica'`, que el
  // campo `exports` de pdfkit resuelve a `js/standard-fonts/Helvetica.cjs`.
  // El output file tracing de Next no sigue ese salto por `exports`, así que
  // el archivo NUNCA se subía al lambda: local existe, en /var/task no.
  //
  // El síntoma no era "el PDF sale mal" sino algo bastante peor: el require
  // fallido llega como Unhandled Rejection y se lleva puesta la instancia
  // entera junto con la petición que estuviera en vuelo. En los logs de
  // Vercel eso son 920 ocurrencias en 34 rutas y 9 usuarios en cuatro días,
  // casi todas en páginas que no generan ningún PDF — caían de rebote.
  //
  // Se incluye el directorio completo y no solo Helvetica*: el fallback de
  // @react-pdf importa las 14 fuentes estándar de arranque, así que con una
  // sola que falte vuelve el mismo crash. Son ~200 kB en total.
  //
  // La ruta arranca con ../../ porque node_modules está izado a la raíz del
  // monorepo (npm workspaces), no dentro de apps/compras.
  outputFileTracingIncludes: {
    '**/*': ['../../node_modules/pdfkit/js/standard-fonts/**'],
  },
    // Sin esto el límite del body de una Server Action es 1 MB (default de
    // Next 14) — y TODO formulario del módulo que sube un archivo pasa por
    // una Server Action. Una foto de celular pesa 2-6 MB, así que el pedido
    // se rechazaba ANTES de llegar al código: `useFormState` no recibía
    // ningún estado, no había error que mostrar, y el botón "Enviar
    // solicitud" simplemente no hacía nada. Ese es el síntoma reportado al
    // pedir un anticipo adjuntando la cotización.
    //
    // 4 MB y no 20 (el límite real de los buckets de Supabase) porque en
    // Vercel el body de una función serverless topa en 4.5 MB: poner 20
    // acá solo movería el rechazo silencioso a la plataforma, donde ya no
    // lo controlamos. El formulario avisa antes de enviar cuando el
    // archivo no entra — ver TAMANO_MAXIMO_ARCHIVO en domain/archivo.ts.
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};
module.exports = nextConfig;
