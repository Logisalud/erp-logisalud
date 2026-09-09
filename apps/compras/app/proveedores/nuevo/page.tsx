import { Encabezado } from '@/components/nav'
import { FormularioProveedor } from './formulario'
import type { TipoProveedor } from '@/services/proveedores'

export const dynamic = 'force-dynamic'

const TIPOS_VALIDOS: TipoProveedor[] = ['mercaderia', 'bien', 'ambos']

/** Acceso abierto a toda persona logueada mientras dure
 * `compras.flags.acceso_abierto_temporal` (mismo criterio que la policy RLS
 * `proveedores_acceso_temporal`) — sin gate por área acá. */
export default async function NuevoProveedor({
  searchParams,
}: {
  searchParams: { tipo?: string; volver?: string }
}) {
  const tipoInicial = TIPOS_VALIDOS.includes(searchParams.tipo as TipoProveedor)
    ? (searchParams.tipo as TipoProveedor)
    : 'mercaderia'
  // `volver` solo se acepta si es una ruta interna — nunca se redirige a una
  // URL externa que venga de un query param.
  const volver = searchParams.volver?.startsWith('/') ? searchParams.volver : undefined

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Registrar proveedor" atras={{ href: volver ?? '/proveedores', texto: volver ? 'Volver' : 'Proveedores' }} />
      <FormularioProveedor tipoInicial={tipoInicial} volver={volver} />
    </main>
  )
}
