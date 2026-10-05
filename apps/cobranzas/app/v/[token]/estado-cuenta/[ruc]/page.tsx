'use client';

import EstadoCuentaCliente from '@/components/EstadoCuentaCliente';

/**
 * El extracto de un cliente visto desde el link del vendedor.
 *
 * Misma pantalla que la de Contabilidad —el componente es el mismo— con dos
 * diferencias que están todas en las URLs: las APIs llevan el token (única
 * credencial del vendedor) y responden 403 si el cliente no es de su cartera.
 */
export default function EstadoCuentaDelVendedorPage({
  params,
}: {
  params: { token: string; ruc: string };
}) {
  const { token, ruc } = params;
  const t = encodeURIComponent(token);
  return (
    <EstadoCuentaCliente
      ruc={ruc}
      apiHistorial={`/api/v/estado-cuenta/${encodeURIComponent(ruc)}?token=${t}`}
      apiBuscar={`/api/v/clientes/buscar?token=${t}`}
      apiExcel={`/api/v/exportar-estado-cuenta/${encodeURIComponent(ruc)}?token=${t}`}
      hrefCliente={(otro) => `/v/${token}/estado-cuenta/${otro}`}
      volverHref={`/v/${token}/estado-cuenta`}
      volverTexto="Buscar otro cliente"
      subtitulo="Estado de cuenta del cliente"
    />
  );
}
