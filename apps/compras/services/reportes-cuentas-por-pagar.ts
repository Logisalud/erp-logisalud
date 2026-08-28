import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'

export type TotalPorMoneda = { moneda: string; total: number }

export type ObligacionResumen = {
  id: string
  codigo: string
  moneda: string
  neto_a_pagar: number
  fecha_vencimiento_real: string | null
  proveedor: { razon_social: string } | null
  beneficiario: { nombre: string | null } | null
}

export type ReporteCuentasPorPagar = {
  pendientesPorMoneda: TotalPorMoneda[]
  observadas: ObligacionResumen[]
  vencenEn7Dias: ObligacionResumen[]
  vencidas: ObligacionResumen[]
  pagadoEsteMesPorMoneda: TotalPorMoneda[]
}

/**
 * Reportes vs Registros (Fase 1.5): `/cuentas-por-pagar` es el listado crudo
 * (Registros) — esto es la vista de "qué necesita mi atención ahora",
 * agregada y accionable, siguiendo la Carta de Simplicidad UX regla 5
 * ("prioriza los loops abiertos, nunca métricas totales sueltas"). Cada
 * grupo de acá enlaza directo a los registros que lo componen.
 */
export async function obtenerReporteCuentasPorPagar(): Promise<ReporteCuentasPorPagar> {
  const supabase = crearClienteServidor()
  const hoy = new Date().toISOString().slice(0, 10)
  const en7Dias = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const inicioMes = `${hoy.slice(0, 7)}-01`

  const [{ data: pendientes }, { data: observadas }, { data: porVencer }, { data: pagadas }] = await Promise.all([
    supabase
      .schema('cuentas_x_pagar')
      .from('obligaciones')
      .select('moneda, neto_a_pagar')
      .in('estado', ['registrada', 'observada', 'conforme', 'en_propuesta']),
    supabase
      .schema('cuentas_x_pagar')
      .from('obligaciones')
      .select('id, codigo, moneda, neto_a_pagar, fecha_vencimiento_real, proveedor_id, beneficiario_persona')
      .eq('estado', 'observada')
      .order('fecha_vencimiento_real'),
    supabase
      .schema('cuentas_x_pagar')
      .from('obligaciones')
      .select('id, codigo, moneda, neto_a_pagar, fecha_vencimiento_real, proveedor_id, beneficiario_persona')
      .in('estado', ['registrada', 'observada', 'conforme', 'en_propuesta'])
      .not('fecha_vencimiento_real', 'is', null)
      .lte('fecha_vencimiento_real', en7Dias)
      .order('fecha_vencimiento_real'),
    supabase
      .schema('cuentas_x_pagar')
      .from('pagos')
      .select('moneda, monto_total')
      .gte('fecha_pago', inicioMes),
  ])

  // "Vencen en 7 días" y "vencidas" salen de la misma consulta (todo lo que
  // vence hasta dentro de 7 días): separar por fecha < hoy en JS evita pedir
  // la misma tabla dos veces con filtros casi idénticos.
  const porVencerLista = porVencer ?? []
  const vencidasRaw = porVencerLista.filter((o) => (o.fecha_vencimiento_real as string) < hoy)
  const vencenEn7Raw = porVencerLista.filter((o) => (o.fecha_vencimiento_real as string) >= hoy)

  const idsProveedor = new Set<string>()
  const idsBeneficiario = new Set<string>()
  for (const o of [...(observadas ?? []), ...porVencerLista]) {
    if (o.proveedor_id) idsProveedor.add(o.proveedor_id)
    if (o.beneficiario_persona) idsBeneficiario.add(o.beneficiario_persona)
  }
  const [proveedores, beneficiarios] = await Promise.all([
    mapaProveedores([...idsProveedor]),
    mapaBeneficiarios([...idsBeneficiario]),
  ])

  const aResumen = (o: any): ObligacionResumen => ({
    id: o.id,
    codigo: o.codigo,
    moneda: o.moneda,
    neto_a_pagar: Number(o.neto_a_pagar),
    fecha_vencimiento_real: o.fecha_vencimiento_real,
    proveedor: o.proveedor_id ? proveedores.get(o.proveedor_id) ?? null : null,
    beneficiario: o.beneficiario_persona ? beneficiarios.get(o.beneficiario_persona) ?? null : null,
  })

  return {
    pendientesPorMoneda: sumarPorMoneda((pendientes ?? []).map((p) => ({ moneda: p.moneda, monto: Number(p.neto_a_pagar) }))),
    observadas: (observadas ?? []).map(aResumen),
    vencenEn7Dias: vencenEn7Raw.map(aResumen),
    vencidas: vencidasRaw.map(aResumen),
    pagadoEsteMesPorMoneda: sumarPorMoneda((pagadas ?? []).map((p) => ({ moneda: p.moneda, monto: Number(p.monto_total) }))),
  }
}

function sumarPorMoneda(filas: { moneda: string; monto: number }[]): TotalPorMoneda[] {
  const mapa = new Map<string, number>()
  for (const f of filas) mapa.set(f.moneda, (mapa.get(f.moneda) ?? 0) + f.monto)
  return [...mapa.entries()].map(([moneda, total]) => ({ moneda, total }))
}

async function mapaProveedores(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.schema('compras').from('proveedores').select('id, razon_social').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { razon_social: p.razon_social }]))
}

async function mapaBeneficiarios(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { nombre: p.nombre }]))
}
