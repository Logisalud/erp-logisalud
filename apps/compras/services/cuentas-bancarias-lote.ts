import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'

/**
 * Las cuentas bancarias de todo un lote de pago, en tres consultas fijas.
 *
 * Antes el detalle de la propuesta pedía las cuentas DENTRO del `.map()` de
 * las líneas: un lote de 40 obligaciones eran 40 idas a la base, justo
 * cuando el lote grande es el que más importa. Acá se traen todas juntas y
 * se cruzan con un `Map`, mismo patrón que `mapaProveedoresBasico`.
 *
 * Tres consultas porque hay tres tablas de cuentas y PostgREST no embebe
 * entre schemas: proveedores de compra (`compras`), proveedores de servicio
 * (`servicios`) y empleados (`public`). Las tres tienen las mismas columnas.
 *
 * "Empleados" incluye a las personas sin usuario (0081): su cuenta vive en
 * la misma tabla, con `persona_sin_usuario_id` en vez de `usuario_id`. Se
 * buscan los ids en las dos columnas y la clave del mapa es la que tenga.
 */

export type CuentaDeLote = {
  id: string
  banco: string
  tipo_cuenta: string | null
  numero_cuenta: string
  cci: string
  moneda: string
  es_principal: boolean
}

const COLUMNAS = 'id, banco, tipo_cuenta, numero_cuenta, cci, moneda, es_principal'

export type MapaCuentasDeLote = Map<string, CuentaDeLote[]>

export async function mapaCuentasDeLote({
  proveedoresCompra, proveedoresServicio, empleados,
}: {
  proveedoresCompra: string[]
  proveedoresServicio: string[]
  empleados: string[]
}): Promise<MapaCuentasDeLote> {
  const supabase = crearClienteServidor()
  const mapa: MapaCuentasDeLote = new Map()

  const agregar = (filas: any[] | null, claveFK: string) => {
    for (const fila of filas ?? []) {
      const clave = fila[claveFK] as string
      const lista = mapa.get(clave) ?? []
      const { [claveFK]: _fk, ...cuenta } = fila
      lista.push(cuenta as CuentaDeLote)
      mapa.set(clave, lista)
    }
  }

  const [compra, servicio, empleado] = await Promise.all([
    proveedoresCompra.length === 0
      ? Promise.resolve({ data: [] as any[] })
      : supabase.schema('compras').from('proveedor_cuentas_bancarias')
          .select(`proveedor_id, ${COLUMNAS}`)
          .in('proveedor_id', [...new Set(proveedoresCompra)])
          .order('es_principal', { ascending: false }),
    proveedoresServicio.length === 0
      ? Promise.resolve({ data: [] as any[] })
      : supabase.schema('servicios').from('proveedor_servicio_cuentas_bancarias')
          .select(`proveedor_servicio_id, ${COLUMNAS}`)
          .in('proveedor_servicio_id', [...new Set(proveedoresServicio)])
          .order('es_principal', { ascending: false }),
    empleados.length === 0
      ? Promise.resolve({ data: [] as any[] })
      : supabase.from('empleado_cuentas_bancarias')
          .select(`usuario_id, persona_sin_usuario_id, ${COLUMNAS}`)
          .or(filtroTitular([...new Set(empleados)]))
          .order('es_principal', { ascending: false }),
  ])

  agregar(compra.data as any[], 'proveedor_id')
  agregar(servicio.data as any[], 'proveedor_servicio_id')
  agregar(
    ((empleado.data as any[]) ?? []).map(({ usuario_id, persona_sin_usuario_id, ...cuenta }) => ({
      ...cuenta,
      titular: usuario_id ?? persona_sin_usuario_id,
    })),
    'titular'
  )
  return mapa
}

/** `usuario_id` o `persona_sin_usuario_id` en la lista — los ids son UUID,
 * así que van tal cual dentro del filtro de PostgREST. */
export function filtroTitular(ids: readonly string[]): string {
  const lista = ids.join(',')
  return `usuario_id.in.(${lista}),persona_sin_usuario_id.in.(${lista})`
}

/** La cuenta que Tesorería usaría por defecto: la principal, o la primera. */
export function cuentaPreferida(cuentas: readonly CuentaDeLote[]): CuentaDeLote | null {
  return cuentas.find((c) => c.es_principal) ?? cuentas[0] ?? null
}
