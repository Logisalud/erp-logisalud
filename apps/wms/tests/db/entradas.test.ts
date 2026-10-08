// Flujo real de ingreso (addendum del 2026-10-08) contra Postgres 16 local:
// Solicitud de Ingreso (primaria, SI-AAAA-NNNNN) → recepción física que la VERIFICA → acta prellenada → ledger.
// Incluye los ejemplos 20–23 del addendum (cantidades OC / factura / física) y D-31..D-35.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, sembrarStock } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })
const P = () => base.personas
const IMG = 'data:image/png;base64,' + 'A'.repeat(200)
const j = JSON.stringify

/** Una OC de Compras (stub) con una línea de `pedida` unidades; `recibida` = lo que Compras ya tiene registrado. */
async function ordenDeCompra(producto: string, pedida: number, recibida = 0) {
  const prov = (await base.admin.query(
    `insert into compras.proveedores (ruc, razon_social) values ($1, 'Proveedor de prueba') returning id`,
    [String(Math.floor(Math.random() * 1e11)).padStart(11, '2')])).rows[0].id
  const oc = (await base.admin.query(
    `insert into compras.ordenes_compra (codigo, proveedor_id) values ($1, $2) returning id, codigo`,
    ['OC-T-' + randomUUID().slice(0, 6), prov])).rows[0]
  const oi = (await base.admin.query(
    `insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida, cantidad_recibida) values ($1, $2, $3, $4) returning id`,
    [oc.id, producto, pedida, recibida])).rows[0].id
  return { oc: oc.id as string, codigo: oc.codigo as string, oi: oi as string }
}

/** Sandra (o quien se indique) crea y autoriza la solicitud de una compra a partir de la OC. */
async function solicitudDeCompra(producto: string, pedida: number, cantidad: number, lote = 'L-' + randomUUID().slice(0, 6), opts: { recibida?: number; autorizar?: boolean; vence?: string } = {}) {
  const o = await ordenDeCompra(producto, pedida, opts.recibida ?? 0)
  const logissa = await idPropietario(base.admin, 'LOGISSA')
  const sol = await base.como(P().sandra.id, async (c) => (await c.query(
    `select wms.crear_solicitud('COMPRA_LOCAL', $1, $2::jsonb, $3::jsonb, $4) id`,
    [logissa, j({ oc_id: o.oc, guia_numero: 'T001-0001' }),
      j([{ oc_item_id: o.oi, lote, vence: opts.vence ?? '2028-06-30', cantidad }]), opts.autorizar ?? true])).rows[0].id as string)
  const linea = (await base.admin.query('select id from wms.solicitud_ingreso_lineas where solicitud_id = $1 order by creado_en limit 1', [sol])).rows[0].id as string
  return { sol, linea, ...o, lote }
}

const recibir = (sol: string) => base.como(P().charlie.id, async (c) => (await c.query('select wms.iniciar_recepcion($1) id', [sol])).rows[0].id as string)
const pos = (codigo = 'A-6') => idPosicion(base.admin, codigo)
const verificar = async (linea: string, coincide: boolean, o: { cantidad?: number; lote?: string; vence?: string; motivo?: string; posicion?: string } = {}) =>
  base.como(P().charlie.id, async (c) => (await c.query('select wms.verificar_linea($1, $2, $3, $4, $5, null, $6, $7) r',
    [linea, coincide, o.cantidad ?? null, o.lote ?? null, o.vence ?? null, o.posicion ?? await pos(), o.motivo ?? null])).rows[0].r)

const datosDeRecepcion = (ingreso: string, temp = 20) =>
  base.como(P().charlie.id, (c) => c.query('select wms.editar_ingreso($1, $2::jsonb)', [ingreso,
    j({ temperatura_c: temp, bultos: 3, paletas: 1, placa: 'ABC-123', marca_vehiculo: 'Hyundai', tipo_conteo: 'TOTAL' })]))

/** Genera el acta y la firman las cuatro partes. */
async function firmarTodo(ingreso: string) {
  const acta = await base.como(P().charlie.id, async (c) => (await c.query('select wms.generar_acta_recepcion($1) id', [ingreso])).rows[0].id as string)
  await base.como(P().charlie.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'JEFE_ALMACEN', 'Charlie Chancco')`, [acta]))
  await base.como(P().katia.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'DIRECCION_TECNICA', 'Katia Zapata')`, [acta]))
  await base.como(P().aux.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'RESPONSABLE_CONTEO', 'Christians')`, [acta]))
  await base.como(P().charlie.id, (c) => c.query(
    `select wms.firmar_acta_recepcion($1, 'TRANSPORTISTA', 'Pedro Quispe', '45678912', 'ABC-123', $2) r`, [acta, IMG]))
  return { acta }
}

const confirmar = (ingreso: string) =>
  base.como(P().charlie.id, async (c) => (await c.query('select wms.confirmar_ingreso($1) id', [ingreso])).rows[0].id as string)

/** Compra completa: solicitud autorizada → recepción → la línea coincide → acta firmada → confirmada. */
async function compraConfirmada(producto: string, pedida: number, cantidad: number, lote?: string) {
  const x = await solicitudDeCompra(producto, pedida, cantidad, lote)
  const ing = await recibir(x.sol)
  await verificar(x.linea, true)
  await datosDeRecepcion(ing)
  const f = await firmarTodo(ing)
  await confirmar(ing)
  return { ...x, id: ing, acta: f.acta }
}

const saldos = (ingreso: string) => base.admin.query(
  `select ps.codigo as posicion, s.estado, s.cantidad::int, lt.codigo as lote, o.codigo as propietario
     from wms.saldos s join wms.ingreso_lotes il on il.id = s.procedencia_id
     join wms.posiciones ps on ps.id = s.posicion_id join wms.lotes lt on lt.id = s.lote_id
     join wms.propietarios o on o.id = s.propietario_id where il.ingreso_id = $1 and s.cantidad > 0 order by lt.codigo`, [ingreso]).then((r) => r.rows)

const cambios = (sol: string) => base.admin.query(
  `select campo, antes, despues, motivo, usuario, version from wms.solicitud_ingreso_cambios where solicitud_id = $1 order by id`, [sol]).then((r) => r.rows)
const estadoCompras = (sol: string) => base.admin.query('select * from wms.estado_registro_compras($1)', [sol]).then((r) => r.rows)

/** Katia/Sandra: llena y decide el acta organoléptica de un lote. */
async function decidirOrg(ingreso: string, lote: string, decision: 'APROBADO' | 'BAJAS_RECHAZADOS', conclusion = 'CONFORME') {
  const org = (await base.admin.query(
    `select ao.id from wms.actas_organolepticas ao join wms.ingreso_lotes il on il.id = ao.ingreso_lote_id
       join wms.lotes lt on lt.id = il.lote_id where ao.ingreso_id = $1 and lt.codigo = $2`, [ingreso, lote])).rows[0].id as string
  await base.como(P().sandra.id, (c) => c.query('select wms.guardar_acta_organoleptica($1, $2::jsonb, true)', [org,
    j({ cert_analisis: true, checklist: { embalaje_cerrado: 'C', envase_ok: 'C' }, destino_sugerido: 'APROBADO', conclusion })]))
  return { org, decidir: () => base.como(P().katia.id, (c) => c.query('select wms.decidir_acta_organoleptica($1, $2, null)', [org, decision])) }
}

// Compatibilidad con los tests del acta organoléptica y del expediente (mismos nombres que en el Batch 2).
const ingresoCompletoCompra = (producto: string, cantidad: number, partes: Array<[string, number]>) => {
  if (partes.length !== 1) throw new Error('ingresoCompletoCompra: una línea por solicitud en este flujo')
  return compraConfirmada(producto, cantidad, partes[0][1], partes[0][0])
}

describe('flujo real: solicitud → verificación → acta → Cuarentena', () => {
  it('SI-AAAA-NNNNN por año; la solicitud nace sin inventario; quien no prepara no la crea', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 6, 6)
    const s = (await base.admin.query('select numero, estado, tipo, origen_creacion from wms.solicitudes_ingreso where id = $1', [x.sol])).rows[0]
    expect(s.numero).toMatch(new RegExp(`^SI-${new Date().getFullYear()}-\\d{5}$`))
    expect(s).toMatchObject({ estado: 'PROGRAMADA', tipo: 'COMPRA_LOCAL' })
    expect((await base.admin.query('select count(*)::int n from wms.partidas p join wms.ingreso_lotes il on il.id = p.procedencia_id where il.solicitud_linea_id = $1', [x.linea])).rows[0].n).toBe(0)
    const y = await solicitudDeCompra(base.productos.dapa, 6, 6)
    const n = (id: string) => base.admin.query('select numero from wms.solicitudes_ingreso where id = $1', [id]).then((r) => Number(r.rows[0].numero.slice(-5)))
    expect(await n(y.sol)).toBe((await n(x.sol)) + 1)
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    for (const quien of [P().charlie.id, P().aux.id, P().sinRol.id]) {
      expect((await falla(base.como(quien, (c) => c.query(`select wms.crear_solicitud('COMPRA_LOCAL', $1, $2::jsonb, '[]'::jsonb)`, [logissa, j({ oc_id: x.oc })])))).message).toMatch(/Sandra|Dirección Técnica|permiso/i)
    }
  })

  it('(1) compra 6, coincide → confirma y nace en Cuarentena en A-6..A-9', async () => {
    const x = await compraConfirmada(base.productos.dapa, 6, 6)
    const s = await saldos(x.id)
    expect(s.map((r) => r.cantidad)).toEqual([6])
    expect(s[0].estado).toBe('CUARENTENA')
    expect(['A-6', 'A-7', 'A-8', 'A-9']).toContain(s[0].posicion)
    expect(s[0].propietario).toBe('LOGISSA')
    expect((await base.admin.query('select estado from wms.solicitudes_ingreso where id = $1', [x.sol])).rows[0].estado).toBe('CERRADA')
    expect((await base.admin.query('select * from wms.verificar_saldos()')).rows).toHaveLength(0)
  })

  it('el lote solo existe al confirmar, y la recepción no puede empezar sin autorizar', async () => {
    const b = await solicitudDeCompra(base.productos.dapa, 4, 4, 'L-BORR', { autorizar: false })
    expect((await falla(recibir(b.sol))).message).toMatch(/solo una solicitud programada/)
    await base.como(P().katia.id, (c) => c.query('select wms.autorizar_solicitud($1)', [b.sol]))
    const ing = await recibir(b.sol)
    expect((await base.admin.query(`select count(*)::int n from wms.lotes where codigo = 'L-BORR'`)).rows[0].n).toBe(0)
    await verificar(b.linea, true)
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    await confirmar(ing)
    expect((await base.admin.query(`select count(*)::int n from wms.lotes where codigo = 'L-BORR'`)).rows[0].n).toBe(1)
  })

  it('sin verificar, sin posición o sin temperatura no hay acta; sin acta firmada no se confirma', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 3, 3)
    const ing = await recibir(x.sol)
    const acta = () => base.como(P().charlie.id, (c) => c.query('select wms.generar_acta_recepcion($1)', [ing]))
    expect((await falla(acta())).message).toMatch(/Falta verificar/)
    await verificar(x.linea, true)
    expect((await falla(acta())).message).toMatch(/temperatura/i)
    await datosDeRecepcion(ing)
    expect((await falla(confirmar(ing))).message).toMatch(/firmada por las cuatro partes/)
  })

  it('el inventario nuevo solo nace en Cuarentena: otra zona se rechaza', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 3, 3)
    await recibir(x.sol)
    expect((await falla(verificar(x.linea, true, { posicion: await pos('A-10.2') }))).message).toMatch(/nace en Cuarentena/)
  })
})

describe('integración de solo lectura con Compras', () => {
  it('v_oc_items muestra solo OC que pueden recibir y trae lo facturado', async () => {
    const prov = (await base.admin.query(`insert into compras.proveedores (ruc, razon_social) values ('20111111111', 'P') returning id`)).rows[0].id
    const mk = async (estado: string) => {
      const oc = (await base.admin.query(`insert into compras.ordenes_compra (codigo, proveedor_id, estado) values ($1, $2, $3) returning id`, ['OC-V-' + estado, prov, estado])).rows[0].id
      await base.admin.query(`insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida, cantidad_facturada) values ($1, $2, 10, 7)`, [oc, base.productos.dapa])
    }
    for (const e of ['borrador', 'enviada', 'confirmada', 'parcialmente_recibida', 'recibida_completa', 'anulada']) await mk(e)
    const r = (await base.admin.query(`select oc_codigo, cantidad_facturada::int f from wms.v_oc_items where oc_codigo like 'OC-V-%' order by 1`)).rows
    expect(r.map((x) => x.oc_codigo)).toEqual(['OC-V-confirmada', 'OC-V-enviada', 'OC-V-parcialmente_recibida'])
    expect(r.every((x) => x.f === 7)).toBe(true)
  })
})

describe('ejemplos 20–23 del addendum: cuatro cantidades, cada dueño con la suya', () => {
  it('(20) OC 50 · factura 45 · física 45: la solicitud pasa de 50 a 45 y Compras debe registrar 45', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 50, 50, 'L-E20')
    const ing = await recibir(x.sol)
    await verificar(x.linea, false, { cantidad: 45, motivo: 'La factura y la caja traen 45' })
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    await confirmar(ing)
    expect((await saldos(ing))[0].cantidad).toBe(45)
    const l = (await base.admin.query('select cantidad_oc_pedida::int pedida, cantidad_inicial inicial, cantidad final, estado_linea from wms.solicitud_ingreso_lineas where id = $1', [x.linea])).rows[0]
    expect(l).toEqual({ pedida: 50, inicial: 50, final: 45, estado_linea: 'AJUSTADA' })
    // Compras todavía no lo tiene: FALTA. Cuando lo copian a mano: OK.
    expect(await estadoCompras(x.sol)).toEqual([expect.objectContaining({ fisica: '45', estado: 'FALTA' })])
    await base.admin.query('update compras.ordenes_compra_items set cantidad_recibida = 45 where id = $1', [x.oi])
    expect((await estadoCompras(x.sol))[0].estado).toBe('OK')
    // Aunque Compras cierre la OC (sale de la lista de "por recibir"), la conciliación sigue viéndola.
    await base.admin.query(`update compras.ordenes_compra set estado = 'recibida_completa' where id = $1`, [x.oc])
    expect((await base.admin.query('select 1 from wms.v_oc_items where oc_id = $1', [x.oc])).rows).toHaveLength(0)
    expect((await estadoCompras(x.sol))[0].estado).toBe('OK')
  })

  it('(21) OC 50 · factura 50 · física 45: WMS registra 45; si Compras copia 50 → NO COINCIDE', async () => {
    const x = await compraConfirmadaConDiferencia(base.productos.dapa, 50, 45, 'L-E21')
    expect((await saldos(x.ing))[0].cantidad).toBe(45)
    await base.admin.query('update compras.ordenes_compra_items set cantidad_recibida = 50 where id = $1', [x.oi])
    expect((await estadoCompras(x.sol))[0]).toMatchObject({ esperado: '45.000', registrado: '50.000', estado: 'NO_COINCIDE' })
    await base.como(P().charlie.id, (c) => c.query('select wms.revisar_registro_compras()'))
    const a = (await base.admin.query(`select tipo, destinatario_rol from wms.alertas where solicitud_id = $1 and tipo = 'NO_COINCIDE_CON_COMPRAS' order by destinatario_rol`, [x.sol])).rows
    expect(a.map((r) => r.destinatario_rol)).toEqual(['direccion_tecnica', 'jefe_almacen'])
  })

  it('(22) OC 50 · factura 45 · física 50: coincide con la solicitud; WMS no toca la factura', async () => {
    const x = await compraConfirmada(base.productos.dapa, 50, 50, 'L-E22')
    expect((await saldos(x.id))[0].cantidad).toBe(50)
    expect((await cambios(x.sol)).filter((c) => c.campo === 'cantidad')).toHaveLength(0)
    expect((await base.admin.query(`select count(*)::int n from wms.alertas where solicitud_id = $1 and tipo = 'SOLICITUD_AJUSTADA'`, [x.sol])).rows[0].n).toBe(0)
  })

  it('(23) OC 50, llegan 55 → se registra lo físico y se alerta EXCEDE_OC; WMS no lo resuelve', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 50, 50, 'L-E23')
    const ing = await recibir(x.sol)
    await verificar(x.linea, false, { cantidad: 55, motivo: 'Llegaron 5 cajas de más' })
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    await confirmar(ing)
    expect((await saldos(ing))[0].cantidad).toBe(55)
    const a = (await base.admin.query(`select destinatario_rol, mensaje from wms.alertas where solicitud_id = $1 and tipo = 'EXCEDE_OC'`, [x.sol])).rows
    expect(a).toHaveLength(1)
    expect(a[0].destinatario_rol).toBe('direccion_tecnica')
    expect(a[0].mensaje).toMatch(/sobran 5/)
    expect((await base.admin.query('select estado from wms.solicitudes_ingreso where id = $1', [x.sol])).rows[0].estado).toBe('CERRADA')
  })

  async function compraConfirmadaConDiferencia(producto: string, pedida: number, fisica: number, lote: string) {
    const x = await solicitudDeCompra(producto, pedida, pedida, lote)
    const ing = await recibir(x.sol)
    await verificar(x.linea, false, { cantidad: fisica, motivo: 'Faltaron unidades' })
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    await confirmar(ing)
    return { ...x, ing }
  }
})

describe('la solicitud se corrige en el mismo correlativo, con historial campo a campo (D-34, D-35)', () => {
  it('50 → 45 queda con quién, cuándo y por qué; Sandra y Katia reciben el aviso', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 50, 50, 'L-H1')
    await recibir(x.sol)
    const num = (await base.admin.query('select numero from wms.solicitudes_ingreso where id = $1', [x.sol])).rows[0].numero
    await verificar(x.linea, false, { cantidad: 45, motivo: 'Faltaron 5' })
    const c = await cambios(x.sol)
    expect(c.filter((r) => r.campo === 'cantidad')).toEqual([expect.objectContaining({ antes: '50', despues: '45', motivo: 'Faltaron 5', usuario: P().charlie.id })])
    // Mismo correlativo, versión nueva.
    expect((await base.admin.query('select numero, version_actual from wms.solicitudes_ingreso where id = $1', [x.sol])).rows[0]).toMatchObject({ numero: num })
    const v = (await base.admin.query('select version from wms.solicitud_ingreso_versiones where solicitud_id = $1 order by version', [x.sol])).rows
    expect(v.length).toBeGreaterThanOrEqual(3)
    const a = (await base.admin.query(`select destinatario_rol, mensaje from wms.alertas where solicitud_id = $1 and tipo = 'SOLICITUD_AJUSTADA' order by destinatario_rol`, [x.sol])).rows
    expect(a.map((r) => r.destinatario_rol)).toEqual(['asistente_dt', 'direccion_tecnica'])
    expect(a[0].mensaje).toMatch(/cantidad 50 → 45/)
    // Sin lazo límite: una segunda corrección sobre la misma solicitud.
    await verificar(x.linea, false, { cantidad: 44, motivo: 'Se rompió una caja' })
    expect((await cambios(x.sol)).filter((r) => r.campo === 'cantidad').map((r) => r.despues)).toEqual(['45', '44'])
    // Lo anunciado no se reescribe.
    expect((await falla(base.admin.query('update wms.solicitud_ingreso_lineas set cantidad_inicial = 1 where id = $1', [x.linea]))).message).toMatch(/no se reescribe/)
    expect((await falla(base.admin.query('update wms.solicitud_ingreso_cambios set despues = $1', ['x']))).message).toMatch(/inmutable/i)
  })

  it('un cambio después de autorizar exige motivo; antes de autorizar, no', async () => {
    const b = await solicitudDeCompra(base.productos.dapa, 8, 8, 'L-H2', { autorizar: false })
    await base.como(P().sandra.id, (c) => c.query('select wms.ajustar_solicitud($1, $2::jsonb)', [b.sol, j([{ op: 'LINEA', linea_id: b.linea, campo: 'cantidad', valor: '7' }])]))
    expect((await base.admin.query(`select count(*)::int n from wms.alertas where solicitud_id = $1 and tipo = 'SOLICITUD_AJUSTADA'`, [b.sol])).rows[0].n).toBe(0)
    await base.como(P().katia.id, (c) => c.query('select wms.autorizar_solicitud($1)', [b.sol]))
    expect((await base.admin.query('select cantidad_inicial from wms.solicitud_ingreso_lineas where id = $1', [b.linea])).rows[0].cantidad_inicial).toBe(7)
    expect((await falla(base.como(P().sandra.id, (c) => c.query('select wms.ajustar_solicitud($1, $2::jsonb)', [b.sol, j([{ op: 'LINEA', linea_id: b.linea, campo: 'cantidad', valor: '6' }])])))).message).toMatch(/necesita su motivo/)
  })

  it('(D-35) lote distinto al declarado: ajuste explícito con motivo, no rechazo automático', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 5, 5, 'L-DECL')
    const ing = await recibir(x.sol)
    expect((await falla(verificar(x.linea, false, { lote: 'L-REAL' }))).message).toMatch(/motivo/)
    await verificar(x.linea, false, { lote: 'L-REAL', motivo: 'La etiqueta dice L-REAL' })
    expect((await cambios(x.sol)).filter((r) => r.campo === 'lote')).toEqual([expect.objectContaining({ antes: 'L-DECL', despues: 'L-REAL' })])
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    await confirmar(ing)
    expect((await saldos(ing))[0].lote).toBe('L-REAL')
  })

  it('un mismo lote no puede tener dos vencimientos: el camino es el ajuste explícito', async () => {
    await compraConfirmada(base.productos.dapa, 2, 2, 'L-DUP')
    const b = await solicitudDeCompra(base.productos.dapa, 2, 2, 'L-DUP', { vence: '2029-01-31' })
    const ing = await recibir(b.sol)
    await verificar(b.linea, true)
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    const e = await falla(confirmar(ing))
    expect(e.message).toMatch(/otro vencimiento/)
    expect(e.message).toMatch(/Ajusta el dato de la solicitud/)
  })

  it('anular una solicitud exige motivo; una cerrada no se anula', async () => {
    const b = await solicitudDeCompra(base.productos.dapa, 3, 3)
    expect((await falla(base.como(P().sandra.id, (c) => c.query('select wms.anular_solicitud($1, $2)', [b.sol, ' '])))).message).toMatch(/motivo/)
    await base.como(P().sandra.id, (c) => c.query('select wms.anular_solicitud($1, $2)', [b.sol, 'Se canceló el envío']))
    expect((await base.admin.query('select estado from wms.solicitudes_ingreso where id = $1', [b.sol])).rows[0].estado).toBe('ANULADA')
    const c2 = await compraConfirmada(base.productos.dapa, 3, 3)
    expect((await falla(base.como(P().sandra.id, (c) => c.query('select wms.anular_solicitud($1, $2)', [c2.sol, 'tarde'])))).message).toMatch(/ya está cerrada/)
  })
})

describe('devolución e ingreso de cliente', () => {
  const crear = (tipo: string, prop: string, datos: object, lineas: object[]) =>
    base.como(P().sandra.id, async (c) => (await c.query('select wms.crear_solicitud($1, $2, $3::jsonb, $4::jsonb, true) id', [tipo, prop, j(datos), j(lineas)])).rows[0].id as string)

  it('(3) devolución sin factura o boleta original → no se registra', async () => {
    const dip = await idPropietario(base.admin, 'DIPHASAC')
    const e = await falla(crear('DEVOLUCION', dip, { guia_numero: 'G-1', motivo: 'Vencido' }, [{ producto_id: base.productos.dapa, lote: 'D-1', vence: '2028-01-31', cantidad: 5 }]))
    expect(e.message).toMatch(/factura o boleta original/)
    const e2 = await falla(base.admin.query(`insert into wms.solicitudes_ingreso (numero, tipo, propietario_id, guia_numero) values ('SI-X', 'DEVOLUCION', $1, 'G-1')`, [dip]))
    expect(e2.message).toMatch(/check/i)
  })

  it('(D-31) la devolución nace en Devoluciones, nunca en Cuarentena, y sale por su Acta Organoléptica', async () => {
    const dip = await idPropietario(base.admin, 'DIPHASAC')
    const sol = await crear('DEVOLUCION', dip, { guia_numero: 'G-2', doc_original_tipo: 'FACTURA', doc_original_numero: 'F001-123', motivo: 'Cliente devolvió' },
      [{ producto_id: base.productos.dapa, lote: 'L-DEV1', vence: '2028-01-31', cantidad: 5 }])
    const linea = (await base.admin.query('select id from wms.solicitud_ingreso_lineas where solicitud_id = $1', [sol])).rows[0].id
    const ing = await recibir(sol)
    expect((await falla(verificar(linea, true, { posicion: await pos('A-6') }))).message).toMatch(/Área de Devoluciones: nunca pasa por Cuarentena/)
    await verificar(linea, true, { posicion: await pos('A-10.1') })
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    await confirmar(ing)
    expect((await saldos(ing))[0]).toMatchObject({ estado: 'DEVOLUCIONES', cantidad: 5, propietario: 'DIPHASAC' })
    expect((await base.admin.query(`select count(*)::int n from wms.partidas p join wms.ingreso_lotes il on il.id = p.procedencia_id where il.ingreso_id = $1 and p.estado = 'CUARENTENA'`, [ing])).rows[0].n).toBe(0)
    // Sale de Devoluciones con su acta: a Aprobado.
    await (await decidirOrg(ing, 'L-DEV1', 'APROBADO')).decidir()
    expect((await saldos(ing))[0].estado).toBe('APROBADO')
  })

  it('(D-31) la devolución rechazada va a Bajas/Rechazados', async () => {
    const dip = await idPropietario(base.admin, 'DIPHASAC')
    const sol = await crear('DEVOLUCION', dip, { guia_numero: 'G-3', doc_original_tipo: 'BOLETA', doc_original_numero: 'B001-9', motivo: 'Dañado' },
      [{ producto_id: base.productos.dapa, lote: 'L-DEV2', vence: '2028-01-31', cantidad: 2 }])
    const linea = (await base.admin.query('select id from wms.solicitud_ingreso_lineas where solicitud_id = $1', [sol])).rows[0].id
    const ing = await recibir(sol)
    await verificar(linea, true, { posicion: await pos('A-10.1') })
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    await confirmar(ing)
    const o = await decidirOrg(ing, 'L-DEV2', 'BAJAS_RECHAZADOS', 'NO_CONFORME')
    await o.decidir()
    expect((await saldos(ing))[0].estado).toBe('BAJAS_RECHAZADOS')
  })

  it('(4) ingreso de cliente: a nombre del cliente, con su guía, y nace en Cuarentena', async () => {
    const dip = await idPropietario(base.admin, 'DIPHASAC')
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const lineas = [{ producto_id: base.productos.dapa, lote: 'L-CLI1', vence: '2028-06-30', cantidad: 10 }]
    expect((await falla(crear('INGRESO_CLIENTE', logissa, { guia_numero: 'G-CLI-9' }, lineas))).message).toMatch(/a nombre del cliente/)
    expect((await falla(crear('INGRESO_CLIENTE', dip, {}, lineas))).message).toMatch(/guía del cliente/)
    const sol = await crear('INGRESO_CLIENTE', dip, { guia_numero: 'G-CLI-9', contraparte_nombre: 'Diphasac' }, lineas)
    const linea = (await base.admin.query('select id from wms.solicitud_ingreso_lineas where solicitud_id = $1', [sol])).rows[0].id
    const ing = await recibir(sol)
    await verificar(linea, true)
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    await confirmar(ing)
    expect((await saldos(ing)).map((r) => [r.propietario, r.estado, r.cantidad])).toEqual([['DIPHASAC', 'CUARENTENA', 10]])
  })
})

describe('acta de recepción', () => {
  it('prellenada desde la solicitud final: lleva su número, la cantidad inicial y la física', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 50, 50, 'L-PRE')
    const ing = await recibir(x.sol)
    await verificar(x.linea, false, { cantidad: 45, motivo: 'Faltaron 5' })
    await datosDeRecepcion(ing)
    const { acta } = await firmarTodo(ing)
    const c = (await base.admin.query('select contenido from wms.actas_recepcion where id = $1', [acta])).rows[0].contenido
    expect(c.solicitud.numero).toMatch(/^SI-/)
    expect(c.lineas[0]).toMatchObject({ cantidad_establecida: 45, cantidad_recibida: 45 })
    expect(c.lineas[0].lotes[0]).toMatchObject({ lote: 'L-PRE', cantidad: 45, cantidad_inicial: 50 })
  })

  it('numera I-AAAAMM-correlativo y guarda el hash de cada firma', async () => {
    const x = await compraConfirmada(base.productos.dapa, 2, 2)
    const a = (await base.admin.query('select numero, estado, hash_contenido from wms.actas_recepcion where id = $1', [x.acta])).rows[0]
    expect(a.numero).toMatch(/^I-\d{6}-\d{4}$/)
    expect(a.estado).toBe('FIRMADA')
    const f = (await base.admin.query('select rol_firma, hash_contenido, user_id, dni, placa from wms.acta_firmas where acta_id = $1 order by rol_firma', [x.acta])).rows
    expect(f.map((r) => r.rol_firma)).toEqual(['DIRECCION_TECNICA', 'JEFE_ALMACEN', 'RESPONSABLE_CONTEO', 'TRANSPORTISTA'])
    expect(new Set(f.map((r) => r.hash_contenido))).toEqual(new Set([a.hash_contenido]))
    expect(f.find((r) => r.rol_firma === 'TRANSPORTISTA')).toMatchObject({ user_id: null, dni: '45678912', placa: 'ABC-123' })
  })

  it('(D-37) un acta firmada conserva los datos regulatorios vigentes al firmar, aunque luego se editen', async () => {
    const x = await compraConfirmada(base.productos.dapa, 3, 3)
    const antes = (await base.admin.query('select contenido, hash_contenido from wms.actas_recepcion where id = $1', [x.acta])).rows[0]
    await base.como(P().sandra.id, (c) => c.query(
      `select wms.editar_regulatorio($1, '{"fabricante":"Fabricante nuevo","registro_sanitario":"EG-NUEVO","rs_vence":"2035-01-01"}'::jsonb, 'Prueba de acta inmutable')`, [base.productos.dapa]))
    const despues = (await base.admin.query('select contenido, hash_contenido from wms.actas_recepcion where id = $1', [x.acta])).rows[0]
    expect(despues.contenido).toEqual(antes.contenido)
    expect(despues.hash_contenido).toBe(antes.hash_contenido)
  })

  it('(D-31) el origen del ingreso es un dato aparte del estado y el stock se filtra por él', async () => {
    const x = await compraConfirmada(base.productos.dapa, 4, 4, 'L-ORIGEN')
    const r = (await base.admin.query(`select estado, origen from wms.v_stock_por_origen where lote_id = (select id from wms.lotes where codigo = 'L-ORIGEN' limit 1)`)).rows
    expect(r.length).toBeGreaterThan(0)
    expect(r[0]).toMatchObject({ estado: 'CUARENTENA', origen: 'COMPRA_LOCAL' })
    expect(x.id).toBeTruthy()
  })

  it('(D-29) el código del formato de Kardex es un parámetro configurable, provisional', async () => {
    const r = (await base.admin.query(`select valor from wms.parametros where clave = 'kardex_codigo_formato'`)).rows[0]
    expect(r.valor).toBe('LS-FR-KDX (provisional)')
  })

  it('cada rol firma con su rol, y el transportista exige DNI, placa y firma', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 2, 2)
    const ing = await recibir(x.sol)
    await verificar(x.linea, true)
    await datosDeRecepcion(ing)
    const acta = await base.como(P().charlie.id, async (c) => (await c.query('select wms.generar_acta_recepcion($1) id', [ing])).rows[0].id as string)
    const firma = (quien: string, ...args: unknown[]) => falla(base.como(quien, (c) => c.query('select wms.firmar_acta_recepcion($1, $2, $3, $4, $5, $6)', [acta, ...args, ...Array(5 - args.length).fill(null)].slice(0, 6))))
    expect((await firma(P().aux.id, 'JEFE_ALMACEN', 'Christians')).message).toMatch(/Jefe de Almacén/)
    expect((await firma(P().charlie.id, 'DIRECCION_TECNICA', 'Charlie')).message).toMatch(/Dirección Técnica/)
    expect((await firma(P().charlie.id, 'TRANSPORTISTA', 'Pedro', '123', 'ABC-1', IMG)).message).toMatch(/8 dígitos/)
    expect((await firma(P().charlie.id, 'TRANSPORTISTA', 'Pedro', '45678912', '', IMG)).message).toMatch(/placa/)
    expect((await firma(P().charlie.id, 'TRANSPORTISTA', 'Pedro', '45678912', 'ABC-1', 'x')).message).toMatch(/firma del transportista/)
    expect((await firma(P().sinRol.id, 'RESPONSABLE_CONTEO', 'Nadie')).message).toMatch(/personal de almacén/)
    await base.como(P().charlie.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'JEFE_ALMACEN', 'Charlie')`, [acta]))
    expect((await firma(P().charlie.id, 'JEFE_ALMACEN', 'Charlie')).message).toMatch(/ya firmó/)
  })

  it('(5) acta firmada no se edita; anular y reemitir conserva ambas (el número anulado no se reutiliza)', async () => {
    const x = await compraConfirmada(base.productos.dapa, 2, 2)
    for (const sql of [
      `update wms.actas_recepcion set contenido = '{}'::jsonb where id = $1`,
      `update wms.actas_recepcion set estado = 'BORRADOR' where id = $1`,
      `delete from wms.actas_recepcion where id = $1`,
    ]) expect((await falla(base.admin.query(sql, [x.acta]))).message).toMatch(/firmada no se edita|no se borra/)
    expect((await falla(base.admin.query(`update wms.acta_firmas set nombre = 'otro' where acta_id = $1`, [x.acta]))).message).toMatch(/inmutable/i)
    expect((await falla(datosDeRecepcion(x.id, 21))).message).toMatch(/anúlala con motivo/)
    expect((await falla(base.como(P().sandra.id, (c) => c.query('select wms.ajustar_solicitud($1, $2::jsonb, $3)', [x.sol, j([{ op: 'LINEA', linea_id: x.linea, campo: 'cantidad', valor: '1' }]), 'x'])))).message).toMatch(/Solicitud|cerrada|firmas/i)
    expect((await falla(base.como(P().charlie.id, (c) => c.query('select wms.anular_acta_recepcion($1, $2)', [x.acta, ' '])))).message).toMatch(/motivo/)
    expect((await falla(base.como(P().aux.id, (c) => c.query('select wms.anular_acta_recepcion($1, $2)', [x.acta, 'error'])))).message).toMatch(/Jefe de Almacén/)
    await base.como(P().charlie.id, (c) => c.query('select wms.anular_acta_recepcion($1, $2)', [x.acta, 'Placa mal escrita']))
    expect((await falla(base.admin.query(`update wms.actas_recepcion set motivo_anulacion = 'x' where id = $1`, [x.acta]))).message).toMatch(/ya está anulada/)
    await base.como(P().charlie.id, (c) => c.query(`select wms.editar_ingreso($1, '{"placa":"XYZ-999"}'::jsonb)`, [x.id]))
    const nueva = await base.como(P().charlie.id, async (c) => (await c.query('select wms.reemitir_acta_recepcion($1) id', [x.acta])).rows[0].id as string)
    const r = (await base.admin.query('select id, numero, estado, reemplaza_a, contenido->\'ingreso\'->>\'placa\' as placa from wms.actas_recepcion where ingreso_id = $1 order by generada_en', [x.id])).rows
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ id: x.acta, estado: 'ANULADA', placa: 'ABC-123' })
    expect(r[1]).toMatchObject({ id: nueva, estado: 'BORRADOR', reemplaza_a: x.acta, placa: 'XYZ-999' })
    expect(r[1].numero).not.toBe(r[0].numero)
    expect((await saldos(x.id)).map((s) => s.cantidad)).toEqual([2])
    expect((await falla(base.como(P().charlie.id, (c) => c.query('select wms.reemitir_acta_recepcion($1)', [x.acta])))).message).toMatch(/ya fue reemitida/)
  })
})

describe('alertas', () => {
  it('temperatura fuera de 15–25 °C: se recibe y se alerta a Katia', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 2, 2)
    const ing = await recibir(x.sol)
    await verificar(x.linea, true)
    await datosDeRecepcion(ing, 31.5)
    const a = (await base.admin.query(`select tipo, destinatario_rol, estado, mensaje from wms.alertas where clave = $1`, ['temp:' + ing])).rows
    expect(a).toEqual([expect.objectContaining({ tipo: 'TEMPERATURA', destinatario_rol: 'direccion_tecnica', estado: 'ABIERTA' })])
    expect(a[0].mensaje).toMatch(/31\.5/)
    await firmarTodo(ing)
    await confirmar(ing)
    expect((await saldos(ing))[0].cantidad).toBe(2)
  })

  it('solo el destinatario atiende la alerta', async () => {
    const x = await solicitudDeCompra(base.productos.dapa, 2, 2)
    const ing = await recibir(x.sol)
    await datosDeRecepcion(ing, 3)
    const id = (await base.admin.query(`select id from wms.alertas where clave = $1`, ['temp:' + ing])).rows[0].id
    expect((await falla(base.como(P().aux.id, (c) => c.query('select wms.atender_alerta($1, $2)', [id, 'ok'])))).message).toMatch(/Dirección Técnica/)
    await base.como(P().katia.id, (c) => c.query('select wms.atender_alerta($1, $2)', [id, 'Revisado']))
    expect((await base.admin.query('select estado from wms.alertas where id = $1', [id])).rows[0].estado).toBe('ATENDIDA')
  })

  it('(7) registro sanitario vencido: alerta al crear la solicitud y aprobación bloqueada', async () => {
    const x = await solicitudDeCompra(base.productos.lizi, 5, 5, 'L-RSV')
    const al = (await base.admin.query(`select tipo, destinatario_rol from wms.alertas where clave = $1`, ['rs:' + base.productos.lizi])).rows
    expect(al).toEqual([{ tipo: 'RS_VENCIDO', destinatario_rol: 'direccion_tecnica' }])
    const ing = await recibir(x.sol)
    await verificar(x.linea, true)
    await datosDeRecepcion(ing)
    await firmarTodo(ing)
    await confirmar(ing)
    const o = await decidirOrg(ing, 'L-RSV', 'APROBADO')
    expect((await falla(o.decidir())).message).toMatch(/registro sanitario está vencido/)
    expect((await base.admin.query('select estado from wms.actas_organolepticas where id = $1', [o.org])).rows[0].estado).toBe('PENDIENTE_DT')
    expect((await saldos(ing))[0].estado).toBe('CUARENTENA')
  })
})

describe('acta organoléptica', () => {
  it('(6) muestra = techo(raíz(unidades)) + 1', async () => {
    const m = async (n: number) => (await base.admin.query('select wms.muestra_organoleptica($1) m', [n])).rows[0].m
    expect([await m(1), await m(4), await m(5), await m(9), await m(10), await m(100), await m(101)]).toEqual([2, 3, 4, 4, 5, 11, 12])
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-M1', 4]])
    const r = await base.admin.query('select cantidad_lote, cantidad_muestra from wms.actas_organolepticas where ingreso_id = $1 order by cantidad_lote desc', [x.id])
    expect(r.rows).toEqual([{ cantidad_lote: 4, cantidad_muestra: 3 }])
  })

  it('hay un acta organoléptica por producto y lote, con su correlativo', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-N1', 4]])
    const r = (await base.admin.query('select numero from wms.actas_organolepticas where ingreso_id = $1 order by numero', [x.id])).rows
    expect(r).toHaveLength(1)
    expect(r[0].numero).toMatch(/^O-\d{6}-\d{4}$/)
  })

  it('(8) Cuarentena → Aprobado con acta firmada por Katia (en su lugar: queda por trasladar)', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-AP1', 4]])
    const o = await decidirOrg(x.id, 'L-AP1', 'APROBADO')
    const posAntes = (await saldos(x.id))[0].posicion
    await o.decidir()
    const s = await saldos(x.id)
    expect(s).toEqual([expect.objectContaining({ estado: 'APROBADO', cantidad: 4, posicion: posAntes })])
    const a = (await base.admin.query('select estado, decision, hash_contenido, decidido_por from wms.actas_organolepticas where id = $1', [o.org])).rows[0]
    expect(a).toMatchObject({ estado: 'FIRMADA', decision: 'APROBADO', decidido_por: P().katia.id })
    expect(a.hash_contenido).toMatch(/^[0-9a-f]{64}$/)
    // El cambio de estado quedó sustentado por el acta.
    const m = (await base.admin.query(`select tipo, sustento_tipo, sustento_id from wms.movimientos where referencia_id = $1`, [o.org])).rows[0]
    expect(m).toEqual({ tipo: 'CAMBIO_ESTADO', sustento_tipo: 'ACTA_ORGANOLEPTICA', sustento_id: o.org })
    // Firmada: no se edita, y no se firma dos veces.
    expect((await falla(base.admin.query(`update wms.actas_organolepticas set observacion = 'x' where id = $1`, [o.org]))).message).toMatch(/no se edita/)
    expect((await falla(o.decidir())).message).toMatch(/ya está firmada/)
  })

  it('solo Katia decide; Sandra la llena pero no decide; no se aprueba lo no conforme', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-AP2', 4]])
    const o = await decidirOrg(x.id, 'L-AP2', 'APROBADO', 'NO_CONFORME')
    for (const quien of [P().sandra.id, P().charlie.id, P().aux.id]) {
      expect((await falla(base.como(quien, (c) => c.query('select wms.decidir_acta_organoleptica($1, $2, null)', [o.org, 'APROBADO'])))).message).toMatch(/Solo Dirección Técnica/)
    }
    expect((await falla(o.decidir())).message).toMatch(/NO CONFORME/)
    // Pero sí puede rechazarlo.
    await base.como(P().katia.id, (c) => c.query(`select wms.decidir_acta_organoleptica($1, 'BAJAS_RECHAZADOS', 'Envase roto')`, [o.org]))
    expect((await saldos(x.id))[0].estado).toBe('BAJAS_RECHAZADOS')
  })

  it('el acta no llega a Katia sin estar completa', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-AP3', 4]])
    const org = (await base.admin.query('select id from wms.actas_organolepticas where ingreso_id = $1', [x.id])).rows[0].id
    expect((await falla(base.como(P().sandra.id, (c) => c.query(`select wms.guardar_acta_organoleptica($1, '{}'::jsonb, true)`, [org])))).message).toMatch(/completa el checklist/)
    expect((await falla(base.como(P().katia.id, (c) => c.query(`select wms.decidir_acta_organoleptica($1, 'APROBADO', null)`, [org])))).message).toMatch(/todavía no está completa/)
    expect((await falla(base.como(P().aux.id, (c) => c.query(`select wms.guardar_acta_organoleptica($1, '{}'::jsonb)`, [org])))).message).toMatch(/asistente/)
  })

  it('el lote ABC aprobado y una nueva entrega del mismo lote: la nueva nace en Cuarentena y no hereda', async () => {
    const x1 = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-ABC', 4]])
    await (await decidirOrg(x1.id, 'L-ABC', 'APROBADO')).decidir()
    const x2 = await ingresoCompletoCompra(base.productos.dapa, 3, [['L-ABC', 3]])
    expect((await saldos(x2.id)).map((s) => [s.estado, s.cantidad])).toEqual([['CUARENTENA', 3]])
    expect((await saldos(x1.id)).map((s) => [s.estado, s.cantidad])).toEqual([['APROBADO', 4]])
    // Aprobar la segunda solo mueve las 3 unidades suyas.
    await (await decidirOrg(x2.id, 'L-ABC', 'APROBADO')).decidir()
    expect((await saldos(x2.id)).map((s) => [s.estado, s.cantidad])).toEqual([['APROBADO', 3]])
    expect((await saldos(x1.id)).map((s) => [s.estado, s.cantidad])).toEqual([['APROBADO', 4]])
  })

  it('(9) Aprobado → Cuarentena sigue prohibido por la base', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-AP9', 4]])
    await (await decidirOrg(x.id, 'L-AP9', 'APROBADO')).decidir()
    const s = (await base.admin.query(
      `select posicion_id, producto_id, lote_id, propietario_id, procedencia_id from wms.saldos s
        where procedencia_id = (select id from wms.ingreso_lotes where ingreso_id = $1)`, [x.id])).rows[0]
    const p = (estado: string, delta: number) => ({ ...s, estado, origen: 'COMPRA_LOCAL', delta })
    const e = await falla(base.como(P().katia.id, (c) => c.query(
      `select wms.postear_movimiento('CAMBIO_ESTADO', 'x', $1::jsonb, null, null, 'ACTA', 'X', null)`,
      [JSON.stringify([p('APROBADO', -4), p('CUARENTENA', 4)])])))
    expect(e.message).toMatch(/Transición no permitida/)
  })
})

describe('"por trasladar" y conciliación con Compras', () => {
  it('(D-28) Aprobado en Cuarentena más allá del plazo → alerta al Jefe de Almacén', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-PT1', 4]])
    await (await decidirOrg(x.id, 'L-PT1', 'APROBADO')).decidir()
    expect((await base.como(P().charlie.id, async (c) => (await c.query('select wms.revisar_por_trasladar() n')).rows[0].n))).toBe(0)
    await base.admin.query(`update wms.parametros set valor = '0' where clave = 'plazo_por_trasladar_horas'`)
    const n = await base.como(P().charlie.id, async (c) => (await c.query('select wms.revisar_por_trasladar() n')).rows[0].n)
    expect(n).toBeGreaterThan(0)
    const a = (await base.admin.query(`select destinatario_rol from wms.alertas where tipo = 'POR_TRASLADAR_VENCIDO' and mensaje like '%L-PT1%'`)).rows
    expect(a[0].destinatario_rol).toBe('jefe_almacen')
    await base.como(P().charlie.id, (c) => c.query('select wms.revisar_por_trasladar()'))
    expect((await base.admin.query(`select count(*)::int n from wms.alertas where tipo = 'POR_TRASLADAR_VENCIDO' and mensaje like '%L-PT1%'`)).rows[0].n).toBe(1)
    await base.admin.query(`update wms.parametros set valor = '24' where clave = 'plazo_por_trasladar_horas'`)
  })

  it('integración manual: pasado el plazo sin registrar en Compras → POR_REGISTRAR_EN_COMPRAS; al copiarlo, la alerta se cierra sola', async () => {
    const x = await compraConfirmada(base.productos.dapa, 6, 6, 'L-RC1')
    const revisar = () => base.como(P().charlie.id, (c) => c.query('select wms.revisar_registro_compras()'))
    await revisar()
    expect((await base.admin.query(`select count(*)::int n from wms.alertas where solicitud_id = $1`, [x.sol])).rows[0].n).toBe(0) // aún en plazo
    await base.admin.query(`update wms.solicitudes_ingreso set cerrada_en = now() - interval '2 days' where id = $1`, [x.sol])
    await revisar()
    const a = (await base.admin.query(`select tipo, destinatario_rol, mensaje, estado from wms.alertas where solicitud_id = $1 and tipo = 'POR_REGISTRAR_EN_COMPRAS'`, [x.sol])).rows
    expect(a).toEqual([expect.objectContaining({ destinatario_rol: 'jefe_almacen', estado: 'ABIERTA' })])
    expect(a[0].mensaje).toMatch(/cantidad física confirmada es 6/)
    await base.admin.query('update compras.ordenes_compra_items set cantidad_recibida = 6 where id = $1', [x.oi])
    await revisar()
    expect((await base.admin.query(`select estado from wms.alertas where solicitud_id = $1 and tipo = 'POR_REGISTRAR_EN_COMPRAS'`, [x.sol])).rows[0].estado).toBe('ATENDIDA')
  })

  it('dos solicitudes de una misma línea de OC: lo esperado en Compras suma ambas entregas', async () => {
    const o = await ordenDeCompra(base.productos.dapa, 10)
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const cerrar = async (cant: number, lote: string) => {
      const sol = await base.como(P().sandra.id, async (c) => (await c.query(`select wms.crear_solicitud('COMPRA_LOCAL', $1, $2::jsonb, $3::jsonb, true) id`,
        [logissa, j({ oc_id: o.oc, guia_numero: 'G-' + lote }), j([{ oc_item_id: o.oi, lote, vence: '2028-06-30', cantidad: cant }])])).rows[0].id as string)
      const linea = (await base.admin.query('select id from wms.solicitud_ingreso_lineas where solicitud_id = $1', [sol])).rows[0].id
      const ing = await recibir(sol)
      await verificar(linea, true)
      await datosDeRecepcion(ing)
      await firmarTodo(ing)
      await confirmar(ing)
      return sol
    }
    const s1 = await cerrar(6, 'L-P1')
    const s2 = await cerrar(4, 'L-P2')
    expect((await estadoCompras(s2))[0]).toMatchObject({ esperado: '10.000', registrado: '0.000', estado: 'FALTA' })
    await base.admin.query('update compras.ordenes_compra_items set cantidad_recibida = 10 where id = $1', [o.oi])
    expect((await estadoCompras(s1))[0].estado).toBe('OK')
    expect((await estadoCompras(s2))[0].estado).toBe('OK')
  })
})

describe('vencimiento de lotes en el inventario (D-30)', () => {
  const abiertas = (lote: string) => base.admin.query(
    `select tipo, destinatario_rol, estado, mensaje from wms.alertas where clave like $1 order by creada_en`, [`%${lote}`]).then((r) => r.rows)
  async function lote(codigo: string, diasHastaVencer: number, estado: 'APROBADO' | 'BAJAS_RECHAZADOS' = 'APROBADO', posicion = 'A-14.1') {
    const x = await sembrarStock(base, { posicion, producto: base.productos.dapa, lote: codigo, propietario: 'DIPHASAC', cantidad: 10, estado })
    await base.admin.query(`update wms.lotes set vence = current_date + $1::int where id = $2`, [diasHastaVencer, x.loteId])
    return x.loteId
  }
  const revisar = () => base.como(P().charlie.id, async (c) => (await c.query('select wms.revisar_vencimientos() n')).rows[0].n as number)

  it('por vencer → Jefe de Almacén; vencido → Dirección Técnica; sin duplicar; la de "por vencer" se cierra sola', async () => {
    const id = await lote('V-PRONTO', 40)
    await lote('V-LEJOS', 400, 'APROBADO', 'A-15.1')
    await revisar()
    expect(await abiertas('V-LEJOS')).toHaveLength(0)
    const a = await abiertas(id)
    expect(a).toEqual([expect.objectContaining({ tipo: 'LOTE_POR_VENCER', destinatario_rol: 'jefe_almacen', estado: 'ABIERTA' })])
    expect(a[0].mensaje).toMatch(/vence el .* \(en 40 días\): 10 unidades en A-14\.1/)
    await revisar()
    expect(await abiertas(id)).toHaveLength(1)
    // El lote se vence: la alerta cambia de destinatario y la anterior se cierra.
    await base.admin.query(`update wms.lotes set vence = current_date - 3 where id = $1`, [id])
    await revisar()
    const b = await abiertas(id)
    expect(b.map((x) => [x.tipo, x.estado])).toEqual([['LOTE_POR_VENCER', 'ATENDIDA'], ['LOTE_VENCIDO', 'ABIERTA']])
    expect(b[1]).toMatchObject({ destinatario_rol: 'direccion_tecnica' })
    expect(b[1].mensaje).toMatch(/venció el .* \(hace 3 días\) y sigue en el inventario/)
  })

  it('lo que ya está en Bajas/Rechazados no alerta; el umbral es un parámetro', async () => {
    const baja = await lote('V-BAJA', -5, 'BAJAS_RECHAZADOS', 'J-12.1')
    const margen = await lote('V-100', 100, 'APROBADO', 'A-18.1')
    await revisar()
    expect(await abiertas(baja)).toHaveLength(0)
    expect(await abiertas(margen)).toHaveLength(0)
    await base.admin.query(`update wms.parametros set valor = '120' where clave = 'lote_dias_alerta_vencimiento'`)
    await revisar()
    expect(await abiertas(margen)).toHaveLength(1)
    await base.admin.query(`update wms.parametros set valor = '90' where clave = 'lote_dias_alerta_vencimiento'`)
  })

  it('sin rol no se puede disparar la revisión', async () => {
    expect((await falla(base.como(P().sinRol.id, (c) => c.query('select wms.revisar_vencimientos()')))).message).toMatch(/Sin permiso/)
  })
})

describe('expediente', () => {
  it('se arma al confirmar, con los faltantes, y Sandra lo cierra solo sin faltantes', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-EX1', 4]])
    const exp = (await base.admin.query('select e.* from wms.expedientes e join wms.ingresos i on i.expediente_id = e.id where i.id = $1', [x.id])).rows[0]
    expect(exp.tipo).toBe('OC')
    expect(exp.clave).toMatch(/^OC-T-/)
    const docs = (await base.admin.query('select tipo from wms.expediente_documentos where expediente_id = $1 order by tipo', [exp.id])).rows.map((r) => r.tipo)
    expect(docs).toEqual(expect.arrayContaining(['ACTA_RECEPCION', 'SOLICITUD_INGRESO', 'GUIA_REMISION']))
    const faltan = (await base.admin.query(`select tipo, responsable from wms.expediente_faltantes where expediente_id = $1 and estado = 'ABIERTO' order by tipo`, [exp.id])).rows
    expect(faltan.map((f) => f.tipo)).toEqual(['ACTA_ORGANOLEPTICA', 'FACTURA'])
    expect((await falla(base.como(P().sandra.id, (c) => c.query('select wms.cerrar_expediente($1)', [exp.id])))).message).toMatch(/2 faltante/)
    expect((await falla(base.como(P().charlie.id, (c) => c.query('select wms.cerrar_expediente($1)', [exp.id])))).message).toMatch(/Sandra/)
    // La factura se enlaza (no se duplica) y la organoléptica firmada resuelve su faltante.
    await base.como(P().sandra.id, (c) => c.query(`select wms.agregar_documento_expediente($1, 'FACTURA', 'Factura F001-55', 'factura', 'F001-55')`, [exp.id]))
    await (await decidirOrg(x.id, 'L-EX1', 'APROBADO')).decidir()
    await base.como(P().sandra.id, (c) => c.query('select wms.cerrar_expediente($1)', [exp.id]))
    expect((await base.admin.query('select estado from wms.expedientes where id = $1', [exp.id])).rows[0].estado).toBe('CERRADO')
    // Un faltante nuevo lo reabre.
    const f = await base.como(P().sandra.id, async (c) => (await c.query(`select wms.agregar_faltante($1, 'OTRO', 'Certificado de análisis', 'Proveedor') id`, [exp.id])).rows[0].id)
    expect((await base.admin.query('select estado from wms.expedientes where id = $1', [exp.id])).rows[0].estado).toBe('ABIERTO')
    await base.como(P().sandra.id, (c) => c.query('select wms.resolver_faltante($1, $2)', [f, 'Llegó por correo']))
  })

  it('una OC con varias recepciones comparte un solo expediente', async () => {
    const a = await ingresoCompletoCompra(base.productos.dapa, 2, [['L-EX2', 2]])
    const oc = (await base.admin.query('select oc_codigo from wms.ingresos where id = $1', [a.id])).rows[0].oc_codigo
    expect((await base.admin.query('select count(*)::int n from wms.expedientes where clave = $1', [oc])).rows[0].n).toBe(1)
  })
})

describe('expediente', () => {
  it('se arma al confirmar, con los faltantes, y Sandra lo cierra solo sin faltantes', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-EX1', 4]])
    const exp = (await base.admin.query('select e.* from wms.expedientes e join wms.ingresos i on i.expediente_id = e.id where i.id = $1', [x.id])).rows[0]
    expect(exp.tipo).toBe('OC')
    expect(exp.clave).toMatch(/^OC-T-/)
    const docs = (await base.admin.query('select tipo from wms.expediente_documentos where expediente_id = $1 order by tipo', [exp.id])).rows.map((r) => r.tipo)
    expect(docs).toEqual(expect.arrayContaining(['ACTA_RECEPCION', 'SOLICITUD_INGRESO', 'GUIA_REMISION']))
    const faltan = (await base.admin.query(`select tipo, responsable from wms.expediente_faltantes where expediente_id = $1 and estado = 'ABIERTO' order by tipo`, [exp.id])).rows
    expect(faltan.map((f) => f.tipo)).toEqual(['ACTA_ORGANOLEPTICA', 'FACTURA'])
    expect((await falla(base.como(P().sandra.id, (c) => c.query('select wms.cerrar_expediente($1)', [exp.id])))).message).toMatch(/2 faltante/)
    expect((await falla(base.como(P().charlie.id, (c) => c.query('select wms.cerrar_expediente($1)', [exp.id])))).message).toMatch(/Sandra/)
    // La factura se enlaza (no se duplica) y la organoléptica firmada resuelve su faltante.
    await base.como(P().sandra.id, (c) => c.query(`select wms.agregar_documento_expediente($1, 'FACTURA', 'Factura F001-55', 'factura', 'F001-55')`, [exp.id]))
    await (await decidirOrg(x.id, 'L-EX1', 'APROBADO')).decidir()
    await base.como(P().sandra.id, (c) => c.query('select wms.cerrar_expediente($1)', [exp.id]))
    expect((await base.admin.query('select estado from wms.expedientes where id = $1', [exp.id])).rows[0].estado).toBe('CERRADO')
    // Un faltante nuevo lo reabre.
    const f = await base.como(P().sandra.id, async (c) => (await c.query(`select wms.agregar_faltante($1, 'OTRO', 'Certificado de análisis', 'Proveedor') id`, [exp.id])).rows[0].id)
    expect((await base.admin.query('select estado from wms.expedientes where id = $1', [exp.id])).rows[0].estado).toBe('ABIERTO')
    await base.como(P().sandra.id, (c) => c.query('select wms.resolver_faltante($1, $2)', [f, 'Llegó por correo']))
  })

  it('una OC con varias recepciones comparte un solo expediente', async () => {
    const a = await ingresoCompletoCompra(base.productos.dapa, 2, [['L-EX2', 2]])
    const oc = (await base.admin.query('select oc_codigo from wms.ingresos where id = $1', [a.id])).rows[0].oc_codigo
    expect((await base.admin.query('select count(*)::int n from wms.expedientes where clave = $1', [oc])).rows[0].n).toBe(1)
  })
})

describe('permisos y RLS de las entradas', () => {
  it('(18) sin rol no se lee ni se escribe; el auditor solo lee', async () => {
    const s = await solicitudDeCompra(base.productos.dapa, 2, 2)
    const x = { id: await recibir(s.sol) }
    expect((await base.como(P().sinRol.id, (c) => c.query('select * from wms.ingresos'))).rows).toHaveLength(0)
    expect((await base.como(P().sinRol.id, (c) => c.query('select * from wms.solicitudes_ingreso'))).rows).toHaveLength(0)
    expect((await base.como(P().auditor.id, (c) => c.query('select * from wms.ingresos where id = $1', [x.id]))).rows).toHaveLength(1)
    for (const quien of [P().sinRol.id, P().auditor.id, P().katia.id]) {
      expect((await falla(base.como(quien, (c) => c.query(`select wms.editar_ingreso($1, '{"bultos":1}'::jsonb)`, [x.id])))).message).toMatch(/No tienes permiso/)
    }
    // DML directo: nadie.
    expect((await falla(base.como(P().charlie.id, (c) => c.query(`update wms.ingresos set estado = 'CONFIRMADO' where id = $1`, [x.id])))).message).toMatch(/permission denied/i)
    expect((await falla(base.como(P().charlie.id, (c) => c.query(`update wms.solicitud_ingreso_lineas set cantidad = 99`)))).message).toMatch(/permission denied/i)
    expect((await falla(base.como(P().charlie.id, (c) => c.query(`insert into wms.alertas (tipo, destinatario_rol, mensaje, clave) values ('TEMPERATURA','jefe_almacen','x','y')`)))).message).toMatch(/permission denied/i)
  })

  it('(20) la auditoría responde quién, qué, cuándo y por qué en el flujo de entradas', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 2, [['L-AU1', 2]])
    const ev = (await base.admin.query(`select evento, actor from wms.audit_events where entidad_id = any($1) order by id`,
      [[x.id, x.acta, x.linea, x.sol]])).rows
    expect(ev.map((e) => e.evento)).toEqual(expect.arrayContaining(['solicitud_creada', 'solicitud_autorizada', 'recepcion_iniciada', 'linea_verificada', 'ingreso_editado', 'acta_recepcion_generada', 'acta_recepcion_firmada', 'ingreso_confirmado']))
    expect(ev.every((e) => e.actor)).toBe(true)
  })
})
