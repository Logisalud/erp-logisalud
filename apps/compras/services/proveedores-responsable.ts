import 'server-only'
import { crearClienteServidor, perfilActual } from '@logisalud/auth/server'
import {
  desenlaceDe, esHallazgo, ordenarHallazgos,
  type FilaProveedorResponsable,
} from '@/domain/responsable-proveedor'

/**
 * "Proveedores sin responsable": quién tiene asignado cada proveedor, y si
 * la última OC/OS la generó esa misma persona o no.
 *
 * Mismo patrón que mis-operaciones.ts / pendientes-aprobar.ts: consultas en
 * paralelo y merge en JS. Acá el argumento es más fuerte que en esas dos,
 * porque el cruce es cross-schema en las DOS puntas — los proveedores viven
 * en `compras` y `servicios`, y su actividad en `compras.ordenes_compra` y
 * `servicios.ordenes_servicio`. PostgREST no resuelve eso en un `.select()`
 * (ver CLAUDE.md), y no hay ninguna vista SQL en el módulo.
 *
 * El volumen es chico por construcción (los proveedores de la empresa), así
 * que no hay paginación.
 */
export async function listarProveedoresPorResponsable(opciones?: {
  incluirInactivos?: boolean
}): Promise<{ hallazgos: FilaProveedorResponsable[]; sinActividad: FilaProveedorResponsable[] }> {
  const supabase = crearClienteServidor()
  const incluirInactivos = opciones?.incluirInactivos ?? false

  const [provCompras, provServicios, ocs, oss] = await Promise.all([
    supabase.schema('compras').from('proveedores').select('id, razon_social, ruc, responsable_id, activo'),
    supabase.schema('servicios').from('proveedores_servicio').select('id, razon_social, ruc, responsable_id, activo'),
    supabase.schema('compras').from('ordenes_compra').select('id, codigo, proveedor_id, creado_por, creador_correo, created_at'),
    supabase.schema('servicios').from('ordenes_servicio').select('id, codigo, proveedor_servicio_id, solicitante_id, creador_correo, created_at'),
  ])

  const filtrar = (filas: any[]) => (incluirInactivos ? filas : filas.filter((p) => p.activo !== false))
  const filasCompras = filtrar((provCompras.data ?? []) as any[])
  const filasServicios = filtrar((provServicios.data ?? []) as any[])

  const ultimaOC = ultimaActividadPor((ocs.data ?? []) as any[], 'proveedor_id', 'creado_por')
  const ultimaOS = ultimaActividadPor((oss.data ?? []) as any[], 'proveedor_servicio_id', 'solicitante_id')

  // Los nombres salen de public.perfiles, cuya RLS SÍ está activa: solo
  // admin y contabilidad leen la fila de otra persona. Por eso el reporte
  // se gatea a esas áreas (ver la pantalla) y se cae a `creador_correo`.
  const personas = await mapaPersonas([
    ...filasCompras.flatMap((p) => [p.responsable_id, ultimaOC.get(p.id)?.porId ?? null]),
    ...filasServicios.flatMap((p) => [p.responsable_id, ultimaOS.get(p.id)?.porId ?? null]),
  ])

  const armar = (
    p: any,
    fuente: 'compra' | 'servicio',
    actividad: { porId: string | null; correo: string | null; fecha: string; codigo: string } | undefined
  ): FilaProveedorResponsable => ({
    id: p.id,
    fuente,
    razonSocial: p.razon_social,
    ruc: p.ruc ?? null,
    responsable: p.responsable_id ? personas.get(p.responsable_id) ?? null : null,
    responsableId: p.responsable_id ?? null,
    ultimaActividadPor: actividad
      ? (actividad.porId ? personas.get(actividad.porId) ?? null : null) ?? actividad.correo
      : null,
    ultimaActividadPorId: actividad?.porId ?? null,
    ultimaActividadFecha: actividad?.fecha ?? null,
    ultimaActividadCodigo: actividad?.codigo ?? null,
    desenlace: desenlaceDe(p.responsable_id ?? null, actividad?.porId ?? null),
    href: fuente === 'compra' ? `/proveedores/${p.id}` : `/proveedores/servicio/${p.id}`,
  })

  const todas = [
    ...filasCompras.map((p) => armar(p, 'compra', ultimaOC.get(p.id))),
    ...filasServicios.map((p) => armar(p, 'servicio', ultimaOS.get(p.id))),
  ]

  return {
    hallazgos: ordenarHallazgos(todas.filter((f) => esHallazgo(f.desenlace))),
    sinActividad: ordenarHallazgos(todas.filter((f) => f.desenlace === 'sin_actividad')),
  }
}

/** ¿Quién generó la OC/OS más reciente de cada proveedor? */
function ultimaActividadPor(
  filas: any[],
  columnaProveedor: string,
  columnaAutor: string
): Map<string, { porId: string | null; correo: string | null; fecha: string; codigo: string }> {
  const mapa = new Map<string, { porId: string | null; correo: string | null; fecha: string; codigo: string }>()
  for (const fila of filas) {
    const proveedorId = fila[columnaProveedor] as string | null
    if (!proveedorId) continue
    const previa = mapa.get(proveedorId)
    if (previa && previa.fecha >= fila.created_at) continue
    mapa.set(proveedorId, {
      porId: fila[columnaAutor] ?? null,
      correo: fila.creador_correo ?? null,
      fecha: fila.created_at,
      codigo: fila.codigo,
    })
  }
  return mapa
}

async function mapaPersonas(ids: (string | null)[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const limpios = Array.from(new Set(ids.filter((id): id is string => !!id)))
  if (limpios.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', limpios)
  for (const p of (data ?? []) as any[]) mapa.set(p.id, p.nombre)
  return mapa
}

/** El reporte es de Contabilidad: es quien necesita saber a quién reclamarle. */
export async function puedeVerReporteResponsables(): Promise<boolean> {
  const perfil = await perfilActual()
  return perfil?.area === 'admin' || perfil?.area === 'contabilidad'
}
