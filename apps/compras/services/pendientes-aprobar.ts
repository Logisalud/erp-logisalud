import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import {
  diasEsperando, fuentesQueMeTocan, meTocaEstaOS, meTocaEstaReposicion,
  ordenarPorAntiguedad, quienDecideCajaChica,
  ESTADOS_QUE_ESPERAN_DECISION,
  type FilaPendiente, type FuenteAprobacion, type PerfilAprobador,
} from '@/domain/pendientes-aprobar'
import { totalesDeLote } from '@/domain/propuesta-permisos'
import { puedeDecidirSobre } from '@/domain/auto-aprobacion'

/**
 * "Pendientes de aprobar": todo lo que espera una decisión de la persona que
 * está mirando, de las SIETE fuentes con gate de aprobación real.
 *
 * Mismo patrón que services/mis-operaciones.ts — consultas en paralelo y
 * merge en JS, NO una vista SQL: PostgREST no cruza schemas en un solo
 * `.select()` (ver CLAUDE.md) y el gate es lógica de dominio testeada en
 * domain/pendientes-aprobar.ts, no un CASE en SQL duplicando lo mismo.
 *
 * La diferencia con "Mis operaciones" es que el gate tiene DOS niveles:
 * grueso por perfil (qué consultas correr) y fino por fila (Caja Chica y OS
 * dependen del área de cada registro). El nivel fino necesita saber de qué
 * áreas es responsable la persona: eso sale de una única consulta previa a
 * `public.area_responsables`, que es el equivalente de `es_jefe_de()`.
 *
 * Planilla e Impuestos se sumaron en 2026-09-16: habían nacido después de
 * esta pantalla y nunca se agregaron a FUENTES_APROBACION, así que sus
 * cargas esperaban conformidad sin que ninguna bandeja las mostrara. Es el
 * mismo olvido que ya había tenido `propuesta`.
 */
export async function listarPendientesDeAprobar(): Promise<FilaPendiente[]> {
  const usuario = await exigirUsuario()
  const perfil = (await perfilActual()) as PerfilAprobador
  const supabase = crearClienteServidor()

  const misAreas = await areasQueLidero(usuario.id)
  const fuentes = fuentesQueMeTocan(perfil, misAreas)
  if (fuentes.length === 0) return []

  const corre = (f: FuenteAprobacion) => fuentes.includes(f)
  const ahora = new Date().toISOString()

  const [
    pagosDirectos, solicitudes, reposiciones, propuestas, ordenesServicio,
    planillas, impuestos,
  ] = await Promise.all([
    corre('pago_directo')
      ? supabase
          .schema('cuentas_x_pagar')
          .from('obligaciones')
          .select('id, codigo, estado, moneda, total, created_at, created_by, creador_correo, observaciones, categoria_pago_directo_id')
          .eq('origen', 'gasto_directo')
          .in('estado', ESTADOS_QUE_ESPERAN_DECISION.pago_directo)
      : null,
    corre('gasto')
      ? supabase
          .schema('gastos')
          .from('solicitudes_gasto')
          .select('id, codigo, tipo, estado, moneda, monto_solicitado, created_at, solicitante_id, creador_correo, fecha_requerida, descripcion, categoria_id')
          .in('tipo', ['anticipo', 'reembolso'])
          .in('estado', ESTADOS_QUE_ESPERAN_DECISION.gasto)
      : null,
    corre('caja_chica')
      ? supabase
          .schema('caja_chica')
          .from('reposiciones')
          .select('id, codigo, estado, monto_solicitado, created_at, aprobado_jefe_fecha, fondo_id')
          .in('estado', ESTADOS_QUE_ESPERAN_DECISION.caja_chica)
      : null,
    corre('propuesta')
      ? supabase
          .schema('cuentas_x_pagar')
          .from('propuestas_pago')
          .select('id, codigo, periodo, estado, created_at, creado_por')
          .in('estado', ESTADOS_QUE_ESPERAN_DECISION.propuesta)
      : null,
    corre('os')
      ? supabase
          .schema('servicios')
          .from('ordenes_servicio')
          .select('id, codigo, estado, moneda, monto_estimado, created_at, solicitante_id, creador_correo, area_solicitante, descripcion_servicio')
          .in('estado', ESTADOS_QUE_ESPERAN_DECISION.os)
      : null,
    corre('planilla')
      ? supabase
          .schema('planilla')
          .from('pagos_planilla')
          .select('id, codigo, estado, periodo, secuencia, monto, moneda, fecha_pago, created_at, cargado_por')
          .in('estado', ESTADOS_QUE_ESPERAN_DECISION.planilla)
      : null,
    corre('impuesto')
      ? supabase
          .schema('impuestos')
          .from('obligaciones_tributarias')
          .select('id, estado, periodo, monto, moneda, fecha_vencimiento, created_at, cargado_por, tipo_impuesto_id')
          .in('estado', ESTADOS_QUE_ESPERAN_DECISION.impuesto)
      : null,
  ])

  const filasPD = (pagosDirectos?.data ?? []) as any[]
  const filasSol = (solicitudes?.data ?? []) as any[]
  const filasRep = (reposiciones?.data ?? []) as any[]
  const filasOS = (ordenesServicio?.data ?? []) as any[]
  const filasProp = (propuestas?.data ?? []) as any[]
  const filasPlanilla = (planillas?.data ?? []) as any[]
  const filasImpuesto = (impuestos?.data ?? []) as any[]

  // El fondo trae el área (para el filtro del jefe), la moneda y el custodio
  // — `reposiciones` no tiene ninguno de los tres.
  const fondos = await mapaFondos(filasRep.map((r) => r.fondo_id))

  const filasRepMias = filasRep.filter((r) =>
    meTocaEstaReposicion(r.estado, fondos.get(r.fondo_id)?.area ?? null, perfil, misAreas)
  )
  const filasOSMias = filasOS.filter((os) => meTocaEstaOS(os.estado, os.area_solicitante, perfil, misAreas))

  // Los nombres salen de public.perfiles, cuya RLS SÍ está activa (el flag
  // de acceso abierto no la toca): `id = auth.uid() OR es_admin() OR
  // area_en('contabilidad')`. Un jefe de área que no sea de Contabilidad no
  // puede leer el nombre de otra persona, así que se cae a `creador_correo`
  // — la columna que dejó la 0042 justo para no depender de esa lectura.
  const [categoriasPD, categoriasGasto, tiposImpuesto] = await Promise.all([
    mapaCategorias('cuentas_x_pagar', 'categorias_pago_directo', filasPD.map((o) => o.categoria_pago_directo_id)),
    mapaCategorias('gastos', 'categorias_gasto', filasSol.map((s) => s.categoria_id)),
    // Mismo patrón: el nombre del impuesto vive en otra tabla y PostgREST no
    // lo embebe desde acá.
    mapaCategorias('impuestos', 'tipos_impuesto', filasImpuesto.map((i) => i.tipo_impuesto_id)),
  ])

  const personas = await mapaPersonas([
    ...filasPD.map((o) => o.created_by),
    ...filasSol.map((s) => s.solicitante_id),
    ...filasRepMias.map((r) => fondos.get(r.fondo_id)?.custodioId ?? null),
    ...filasOSMias.map((os) => os.solicitante_id),
    ...filasProp.map((p) => p.creado_por),
    ...filasPlanilla.map((p) => p.cargado_por),
    ...filasImpuesto.map((i) => i.cargado_por),
  ])
  const quien = (id: string | null, correo: string | null): string | null =>
    (id ? personas.get(id) ?? null : null) ?? correo ?? null

  const pendientesPlanilla: FilaPendiente[] = filasPlanilla.map((pl) => ({
    id: pl.id,
    tipo: 'planilla',
    estado: pl.estado,
    codigo: pl.codigo,
    quienLoCreo: quien(pl.cargado_por, null),
    esperandoDesde: pl.created_at,
    diasEsperando: diasEsperando(pl.created_at, ahora),
    monto: Number(pl.monto),
    moneda: pl.moneda,
    totalPorMoneda: [{ moneda: pl.moneda, monto: Number(pl.monto) }],
    // Más ancho que el resto: Tesorería también da conformidad acá.
    quienDecide: 'Contabilidad o Tesorería',
    // `fecha_pago` de una planilla es un compromiso duro, no una estimación
    // (ver la migración 0055): entra como fecha requerida para que una
    // planilla del 15 sin aprobar el 14 salga en rojo.
    fechaRequerida: pl.fecha_pago ?? null,
    concepto: `Planilla ${pl.periodo} · pago ${pl.secuencia}`,
    href: `/planilla/${pl.id}`,
  }))

  const pendientesImpuesto: FilaPendiente[] = filasImpuesto.map((im) => ({
    id: im.id,
    tipo: 'impuesto',
    estado: im.estado,
    // `obligaciones_tributarias` no tiene columna `codigo`: se identifica por
    // tipo + periodo, que es como se la nombra en la pantalla de Impuestos.
    codigo: `${tiposImpuesto.get(im.tipo_impuesto_id) ?? 'Impuesto'} ${im.periodo}`,
    quienLoCreo: quien(im.cargado_por, null),
    esperandoDesde: im.created_at,
    diasEsperando: diasEsperando(im.created_at, ahora),
    monto: Number(im.monto),
    moneda: im.moneda,
    totalPorMoneda: [{ moneda: im.moneda, monto: Number(im.monto) }],
    quienDecide: 'Contabilidad',
    fechaRequerida: im.fecha_vencimiento ?? null,
    concepto: `${tiposImpuesto.get(im.tipo_impuesto_id) ?? 'Impuesto'} · periodo ${im.periodo}`,
    href: `/impuestos`,
  }))

  const pendientesPD: FilaPendiente[] = filasPD.map((pd) => ({
    id: pd.id,
    tipo: 'pago_directo',
    estado: pd.estado,
    codigo: pd.codigo,
    quienLoCreo: quien(pd.created_by, pd.creador_correo),
    esperandoDesde: pd.created_at,
    diasEsperando: diasEsperando(pd.created_at, ahora),
    monto: Number(pd.total),
    moneda: pd.moneda,
    totalPorMoneda: [{ moneda: pd.moneda, monto: Number(pd.total) }],
    quienDecide: 'Contabilidad',
    fechaRequerida: null,
    concepto: unirConcepto(categoriasPD.get(pd.categoria_pago_directo_id), pd.observaciones),
    href: `/cuentas-por-pagar/${pd.id}`,
  }))

  const pendientesSol: FilaPendiente[] = filasSol.map((sol) => ({
    id: sol.id,
    tipo: sol.tipo === 'anticipo' ? 'anticipo' : 'reembolso',
    estado: sol.estado,
    codigo: sol.codigo,
    quienLoCreo: quien(sol.solicitante_id, sol.creador_correo),
    esperandoDesde: sol.created_at,
    diasEsperando: diasEsperando(sol.created_at, ahora),
    monto: Number(sol.monto_solicitado),
    moneda: sol.moneda,
    totalPorMoneda: [{ moneda: sol.moneda, monto: Number(sol.monto_solicitado) }],
    quienDecide: 'Contabilidad',
    fechaRequerida: sol.fecha_requerida ?? null,
    concepto: unirConcepto(categoriasGasto.get(sol.categoria_id), sol.descripcion),
    href: `/gastos/${sol.id}`,
  }))

  const pendientesRep: FilaPendiente[] = filasRepMias.map((rep) => {
    const fondo = fondos.get(rep.fondo_id)
    // En `pendiente_contabilidad` la espera arranca cuando el jefe aprobó,
    // no cuando se creó: los días del jefe no son espera de Contabilidad.
    const desde = rep.estado === 'pendiente_contabilidad' ? rep.aprobado_jefe_fecha ?? rep.created_at : rep.created_at
    return {
      id: rep.id,
      tipo: 'caja_chica' as const,
      estado: rep.estado,
      codigo: rep.codigo,
      quienLoCreo: quien(fondo?.custodioId ?? null, null),
      esperandoDesde: desde,
      diasEsperando: diasEsperando(desde, ahora),
      monto: Number(rep.monto_solicitado),
      moneda: fondo?.moneda ?? 'PEN',
      totalPorMoneda: [{ moneda: fondo?.moneda ?? 'PEN', monto: Number(rep.monto_solicitado) }],
      quienDecide:
        quienDecideCajaChica(rep.estado) === 'contabilidad'
          ? 'Contabilidad'
          : `Jefe de ${fondo?.area ?? 'área'}`,
      fechaRequerida: null,
      // La reposición no tiene concepto propio: es la suma de movimientos
      // que ya se registraron uno por uno. Lo más útil es de qué fondo es.
      concepto: fondo?.descripcion ? `Fondo: ${fondo.descripcion}` : null,
      href: `/caja-chica/reposiciones/${rep.id}`,
    }
  })

  const pendientesOS: FilaPendiente[] = filasOSMias.map((os) => ({
    id: os.id,
    tipo: 'os',
    estado: os.estado,
    codigo: os.codigo,
    quienLoCreo: quien(os.solicitante_id, os.creador_correo),
    esperandoDesde: os.created_at,
    diasEsperando: diasEsperando(os.created_at, ahora),
    monto: Number(os.monto_estimado),
    moneda: os.moneda,
    totalPorMoneda: [{ moneda: os.moneda, monto: Number(os.monto_estimado) }],
    quienDecide: `Jefe de ${os.area_solicitante ?? 'área'}`,
    fechaRequerida: null,
    concepto: os.descripcion_servicio ?? null,
    href: `/servicios/${os.id}`,
  }))

  // Una propuesta es un LOTE, no un registro suelto: el monto es el total
  // del lote y el "concepto" dice cuántas obligaciones agrupa, en vez de
  // inventarle un proveedor a una fila que junta varios.
  const totalesPorPropuesta = await totalesDeCadaPropuesta(filasProp.map((p) => p.id))
  const pendientesProp: FilaPendiente[] = filasProp
    // La auto-aprobación se evalúa contra quien ARMÓ el lote (Tesorería),
    // que es el único "creador" que tiene una propuesta.
    .filter((p) => puedeDecidirSobre(perfil, usuario.id, p.creado_por ?? null))
    .map((p) => {
      const resumen = totalesPorPropuesta.get(p.id)
      const primera = resumen?.totalPorMoneda[0]
      return {
        id: p.id,
        tipo: 'propuesta' as const,
        estado: p.estado,
        codigo: p.codigo,
        quienLoCreo: quien(p.creado_por, null),
        esperandoDesde: p.created_at,
        diasEsperando: diasEsperando(p.created_at, ahora),
        // Si el lote mezcla monedas se muestra la primera y el concepto
        // aclara el resto — la columna Monto es una sola celda.
        monto: primera?.monto ?? 0,
        moneda: primera?.moneda ?? 'PEN',
        // El total COMPLETO, no solo la primera moneda: es lo que suma el
        // aviso antes de aprobar varias propuestas juntas.
        totalPorMoneda: resumen?.totalPorMoneda ?? [],
        quienDecide: 'Contabilidad',
        fechaRequerida: null,
        concepto: conceptoDeLote(resumen, p.periodo),
        href: `/cuentas-por-pagar/propuestas/${p.id}`,
      }
    })

  return ordenarPorAntiguedad([
    ...pendientesPD, ...pendientesSol, ...pendientesRep, ...pendientesOS, ...pendientesProp,
    ...pendientesPlanilla, ...pendientesImpuesto,
  ])
}

/**
 * Lo que el menú necesita saber: si a esta persona le toca decidir sobre
 * ALGUNA de las cuatro fuentes (si no, la entrada no se renderiza) y cuántas
 * filas la esperan (para el contador).
 *
 * `califica` y `total` son distintos a propósito: alguien que sí decide pero
 * está al día ve la entrada en 0, así puede entrar a confirmarlo. Quien no
 * decide nada no la ve nunca — y ahí no se toca la base.
 *
 * Reusa la lista entera en vez de un `count` por fuente: Caja Chica y OS se
 * filtran por fila en JS, así que un count en SQL contaría de más.
 */
export async function resumenPendientesDeAprobar(): Promise<{ califica: boolean; total: number }> {
  const usuario = await exigirUsuario()
  const perfil = (await perfilActual()) as PerfilAprobador
  const misAreas = await areasQueLidero(usuario.id)
  if (fuentesQueMeTocan(perfil, misAreas).length === 0) return { califica: false, total: 0 }
  return { califica: true, total: (await listarPendientesDeAprobar()).length }
}

/** Las áreas de las que soy responsable — el `es_jefe_de()` de las policies, en JS. */
async function areasQueLidero(usuarioId: string): Promise<string[]> {
  const supabase = crearClienteServidor()
  const { data } = await supabase.from('area_responsables').select('area').eq('responsable_id', usuarioId)
  return (data ?? []).map((f: any) => f.area as string)
}

type Fondo = { area: string | null; moneda: string | null; custodioId: string | null; descripcion: string | null }

async function mapaFondos(ids: (string | null)[]): Promise<Map<string, Fondo>> {
  const mapa = new Map<string, Fondo>()
  const limpios = [...new Set(ids.filter((id): id is string => !!id))]
  if (limpios.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema('caja_chica').from('fondos').select('id, area, moneda, custodio_id, descripcion').in('id', limpios)
  for (const f of (data ?? []) as any[]) {
    mapa.set(f.id, {
      area: f.area ?? null, moneda: f.moneda ?? null,
      custodioId: f.custodio_id ?? null, descripcion: f.descripcion ?? null,
    })
  }
  return mapa
}

/** Nombres de `public.perfiles`. Vuelve vacío sin romper si RLS no deja leerlos. */
async function mapaPersonas(ids: (string | null)[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const limpios = [...new Set(ids.filter((id): id is string => !!id))]
  if (limpios.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', limpios)
  for (const p of (data ?? []) as any[]) mapa.set(p.id, p.nombre)
  return mapa
}


/** Nombre de una categoría, resuelto en una segunda consulta (cross-schema). */
async function mapaCategorias(
  schema: 'cuentas_x_pagar' | 'gastos' | 'impuestos',
  tabla: string,
  ids: (string | null)[]
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const limpios = [...new Set(ids.filter((id): id is string => !!id))]
  if (limpios.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema(schema).from(tabla).select('id, nombre').in('id', limpios)
  for (const c of (data ?? []) as any[]) mapa.set(c.id, c.nombre)
  return mapa
}

/**
 * Categoría y texto libre en una sola celda. Si falta uno de los dos se
 * muestra el otro solo, en vez de un separador colgando.
 */
function unirConcepto(categoria: string | undefined, detalle: string | null | undefined): string | null {
  const partes = [categoria, detalle?.trim()].filter((p): p is string => !!p)
  return partes.length === 0 ? null : partes.join(' — ')
}


type ResumenLote = { obligaciones: number; totalPorMoneda: { moneda: string; monto: number }[] }

/** Cuántas obligaciones y cuánto suma cada lote, por moneda. */
async function totalesDeCadaPropuesta(propuestaIds: string[]): Promise<Map<string, ResumenLote>> {
  const mapa = new Map<string, ResumenLote>()
  const ids = [...new Set(propuestaIds)]
  if (ids.length === 0) return mapa
  const supabase = crearClienteServidor()

  const { data: detalle } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuesta_detalle')
    .select('propuesta_id, obligacion_id, monto_a_pagar')
    .in('propuesta_id', ids)
  const filas = (detalle ?? []) as any[]
  if (filas.length === 0) return mapa

  // La moneda vive en la obligación, no en el detalle.
  const { data: obligaciones } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, moneda')
    .in('id', [...new Set(filas.map((f) => f.obligacion_id))])
  const monedaDe = new Map((obligaciones ?? []).map((o: any) => [o.id, o.moneda as string]))

  for (const id of ids) {
    const propias = filas.filter((f) => f.propuesta_id === id)
    if (propias.length === 0) continue
    const { total } = totalesDeLote(
      propias.map((f) => ({
        moneda: monedaDe.get(f.obligacion_id) ?? 'PEN',
        montoAPagar: Number(f.monto_a_pagar),
        // Una propuesta pendiente de aprobación no tiene pagos todavía.
        yaPagada: false,
      }))
    )
    mapa.set(id, { obligaciones: propias.length, totalPorMoneda: total })
  }
  return mapa
}

function conceptoDeLote(resumen: ResumenLote | undefined, periodo: string | null): string {
  if (!resumen) return periodo ?? 'Lote sin obligaciones'
  const cuantas = `${resumen.obligaciones} ${resumen.obligaciones === 1 ? 'obligación' : 'obligaciones'}`
  const otrasMonedas = resumen.totalPorMoneda
    .slice(1)
    .map((t) => `${t.moneda} ${t.monto.toFixed(2)}`)
    .join(' · ')
  return [cuantas, periodo, otrasMonedas ? `+ ${otrasMonedas}` : null].filter(Boolean).join(' · ')
}
