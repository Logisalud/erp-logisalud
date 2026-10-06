'use client';

import EstadoCuentaCliente from '@/components/EstadoCuentaCliente';

/**
 * El extracto del cliente para el staff (sesión + `exigirArea`).
 *
 * La pantalla entera vive en `components/EstadoCuentaCliente`: la comparte
 * con el link del vendedor, que la abre con otras URLs y otro permiso. Acá
 * sólo se eligen esas URLs.
 */
export default function EstadoCuentaClientePage({ params }: { params: { ruc: string } }) {
  const ruc = params.ruc;
  return (
    <EstadoCuentaCliente
      ruc={ruc}
      apiHistorial={`/api/estado-cuenta/historial/${encodeURIComponent(ruc)}`}
      apiBuscar="/api/clientes/buscar"
      apiExcel={`/api/exportar/estado-cuenta-cliente/${encodeURIComponent(ruc)}`}
      hrefCliente={(otro) => `/cobranzas/clientes/${otro}/estado-cuenta`}
      volverHref="/cobranzas"
      volverTexto="Menú"
      subtitulo="Estado de cuenta del cliente"
    />
  );
}
