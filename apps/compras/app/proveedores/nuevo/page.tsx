import { Encabezado } from '@/components/nav'
import { FormularioProveedor } from './formulario'
import type { TipoProveedorUnificado } from '@/domain/proveedor'

export const dynamic = 'force-dynamic'

const TIPOS_VALIDOS: TipoProveedorUnificado[] = ['mercaderia', 'bien', 'ambos', 'servicio']

/** Acceso abierto a toda persona logueada mientras dure
 * `compras.flags.acceso_abierto_temporal` (mismo criterio que la policy RLS
 * `proveedores_acceso_temporal`) — sin gate por área acá.
 *
 * Un solo formulario para las dos tablas (mercadería/bien/ambos en
 * compras.proveedores, servicio en servicios.proveedores_servicio) — antes
 * eran dos botones y dos pantallas separadas en /proveedores; la persona no
 * tiene por qué saber de antemano en qué schema vive cada proveedor. */
export default async function NuevoProveedor({
  searchParams,
}: {
  searchParams: { tipo?: string; volver?: string }
}) {
  const tipoInicial = TIPOS_VALIDOS.includes(searchParams.tipo as TipoProveedorUnificado)
    ? (searchParams.tipo as TipoProveedorUnificado)
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
