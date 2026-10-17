// OS-1 (migración 0022): siete áreas habilitadas (Despacho absorbe Embalaje), estado Reserva del lote, permisos de los jefes y Kardex LS-FR.41.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let ja: string
let aux1: string
let sandra: string
let dt: string
let n = 0

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}
async function producto(): Promise<string> {
  n += 1
  return (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`RV-${n}-${randomUUID().slice(0, 4)}`, `Producto reserva ${n}`])).id as string
}
async function sembrar(prod: string, pos: string, lote: string, vence: string, cantidad: number) {
  const posId = await idPosicion(base.admin, pos)
  const existente = await uno(`select id from wms.lotes where producto_id = $1 and codigo = $2 and propietario_id = $3`, [prod, lote, logissa])
  const loteId = existente?.id ?? (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, logissa])).id
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return loteId as string
}
const reservar = (quien: string, lote: string, motivo: string | null) => como(quien, async (c) => (await c.query('select wms.aplicar_reserva_lote($1, $2) id', [lote, motivo])).rows[0].id as string)
const quitar = (quien: string, lote: string, motivo: string | null) => como(quien, (c) => c.query('select wms.quitar_reserva_lote($1, $2)', [lote, motivo]))
const crearSalida = (prod: string, cantidad: number) =>
  como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
const asignar = (id: string) => como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [id]))
const lotesAsignados = async (salida: string) => (await q(`select lt.codigo, r.cantidad from wms.reservas r join wms.salida_lineas l on l.id = r.linea_id join wms.lotes lt on lt.id = r.lote_id where l.salida_id = $1 order by lt.codigo`, [salida])) as { codigo: string; cantidad: number }[]

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  dt = base.personas.katia.id
  ja = base.personas.charlie.id
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-9', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-9' where clave = 'posicion_despacho_defecto'`)
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('áreas habilitadas (DT, 2026-10-17)', () => {
  it('las siete áreas están en alcance; Embalaje, Pendiente de conformidad, Observado y Retorno reservado quedan retiradas', async () => {
    expect((await q(`select codigo from wms.tipos_area where en_alcance order by 1`)).map((r) => r.codigo))
      .toEqual(['APROBADOS', 'BAJAS_RECHAZADOS', 'CONTRAMUESTRA', 'CUARENTENA', 'DESPACHO', 'DEVOLUCIONES', 'RECEPCION'])
    expect((await q(`select codigo from wms.tipos_area where not en_alcance order by 1`)).map((r) => r.codigo))
      .toEqual(['EMBALAJE', 'OBSERVADO', 'PENDIENTE_CONFORMIDAD', 'RETORNO_RESERVADO'])
    expect(await q(`select 1 from wms.area_estado_admitido where tipo_area in ('EMBALAJE', 'PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO')`)).toHaveLength(0)
  })

  it('la mesa K-M2 es parte de Despacho y Despacho admite solo Aprobado', async () => {
    expect((await uno(`select tipo_area from wms.posiciones where codigo = 'K-M2'`)).tipo_area).toBe('DESPACHO')
    expect((await q(`select estado from wms.area_estado_admitido where tipo_area = 'DESPACHO'`)).map((r) => r.estado)).toEqual(['APROBADO'])
  })

  it('Contramuestra sigue siendo un área, pero hoy no aplica a Logissa (parámetro)', async () => {
    expect((await uno(`select valor from wms.parametros where clave = 'contramuestra_aplica_logissa'`)).valor).toBe('no')
    expect(await q(`select 1 from wms.tipos_area where codigo = 'CONTRAMUESTRA' and en_alcance`)).toHaveLength(1)
  })

  it('el retorno ya no es un movimiento propio ni tiene función: vuelve como una recepción tipo devolución', async () => {
    expect((await uno(`select habilitado from wms.tipos_movimiento where codigo = 'RETORNO'`)).habilitado).toBe(false)
    expect((await uno(`select to_regprocedure('wms.registrar_retorno(uuid, integer, uuid, text, uuid)') f`)).f).toBeNull()
  })

  it('el código controlado del Kardex es LS-FR.41', async () => {
    expect((await uno(`select valor from wms.parametros where clave = 'kardex_codigo_formato'`)).valor).toBe('LS-FR.41')
  })
})

describe('permisos de los jefes', () => {
  it('Jefe de Almacén y Jefe de Transporte tienen TODO lo que tiene el auxiliar', async () => {
    const aux = (await q(`select accion from wms.permisos_rol where rol = 'auxiliar'`)).map((r) => r.accion as string)
    expect(aux.length).toBeGreaterThan(3)
    for (const rol of ['jefe_almacen', 'jefe_transporte']) {
      const suyos = new Set((await q('select accion from wms.permisos_rol where rol = $1', [rol])).map((r) => r.accion as string))
      for (const a of aux) expect(suyos.has(a), `${rol} ${a}`).toBe(true)
    }
  })
})

describe('Reserva de un lote (es un estado, no un área)', () => {
  it('la aplican y la quitan el Jefe de Transporte y Dirección Técnica, con motivo; nadie más', async () => {
    const p = await producto()
    const lote = await sembrar(p, 'F-1.1', 'RES-A', en(300), 40)
    for (const quien of [ja, aux1, sandra]) expect((await falla(reservar(quien, lote, 'calidad'))).message).toMatch(/No tienes permiso para poner un lote en Reserva/)
    expect((await falla(reservar(jt, lote, '  '))).message).toMatch(/Cuéntanos el motivo/)
    expect(await q(`select wms.lote_bloqueado($1) b`, [lote])).toEqual([{ b: false }])
    const id = await reservar(jt, lote, 'Observación de calidad en revisión')
    expect(id).toBeTruthy()
    expect(await q(`select wms.lote_bloqueado($1) b`, [lote])).toEqual([{ b: true }])
    expect((await falla(reservar(dt, lote, 'otra vez'))).message).toMatch(/ya está en Reserva/)
    for (const quien of [ja, aux1, sandra]) expect((await falla(quitar(quien, lote, 'listo'))).message).toMatch(/No tienes permiso para quitar la Reserva/)
    expect((await falla(quitar(dt, lote, null))).message).toMatch(/Cuéntanos por qué se quita/)
    await quitar(dt, lote, 'Dirección Técnica la liberó tras revisar el COA')
    expect(await q(`select wms.lote_bloqueado($1) b`, [lote])).toEqual([{ b: false }])
    expect((await falla(quitar(dt, lote, 'de nuevo'))).message).toMatch(/no está en Reserva/)
    // la historia completa queda: quién, cuándo, por qué
    expect(await uno(`select motivo, aplicada_por, quitada_por, motivo_quita from wms.reservas_lote where lote_id = $1`, [lote]))
      .toMatchObject({ motivo: 'Observación de calidad en revisión', aplicada_por: jt, quitada_por: dt, motivo_quita: 'Dirección Técnica la liberó tras revisar el COA' })
    expect((await q(`select evento from wms.audit_events where entidad = 'lotes' and entidad_id = $1 order by id`, [lote])).map((r) => r.evento)).toEqual(['lote_en_reserva', 'reserva_de_lote_quitada'])
  })

  it('solo un lote Aprobado con stock entra en Reserva; el lote sigue Aprobado', async () => {
    const p = await producto()
    const sinStock = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, 'RES-VACIO', $2, $3) returning id`, [p, en(300), logissa])).id
    expect((await falla(reservar(jt, sinStock, 'prueba'))).message).toMatch(/Solo un lote Aprobado con stock/)
    const lote = await sembrar(p, 'F-1.2', 'RES-B', en(300), 10)
    await reservar(jt, lote, 'hold de calidad')
    expect(await q(`select estado, sum(cantidad)::int n from wms.saldos where lote_id = $1 group by estado`, [lote])).toEqual([{ estado: 'APROBADO', n: 10 }])
  })

  it('un lote en Reserva no se asigna a pedidos: el pedido toma el siguiente lote o queda sin stock', async () => {
    const p = await producto()
    const primero = await sembrar(p, 'F-1.3', 'RES-C1', en(100), 30)
    await sembrar(p, 'F-1.4', 'RES-C2', en(200), 30)
    await reservar(dt, primero, 'observación del proveedor')
    const s = await crearSalida(p, 20)
    await asignar(s)
    expect(await lotesAsignados(s)).toEqual([{ codigo: 'RES-C2', cantidad: 20 }])
    // si el único lote que queda también está en Reserva, no hay stock para vender
    const p2 = await producto()
    const unico = await sembrar(p2, 'F-2.2', 'RES-D1', en(200), 30)
    await reservar(jt, unico, 'calidad')
    const s2 = await crearSalida(p2, 5)
    await asignar(s2)
    expect(await lotesAsignados(s2)).toEqual([])
    expect((await uno(`select estado from wms.salida_lineas where salida_id = $1`, [s2])).estado).toBe('SIN_STOCK')
  })

  it('un lote ya asignado que pasa a Reserva avisa al Jefe de Transporte y no se puede pickear hasta cambiarlo o quitar la Reserva', async () => {
    const p = await producto()
    const lote = await sembrar(p, 'F-2.1', 'RES-E1', en(100), 30)
    const s = await crearSalida(p, 12)
    await asignar(s)
    const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [s])).rows[0].id as string)
    const [ol] = await q('select id, cantidad from wms.ordenes_picking_lineas where orden_id = $1', [orden])
    const rid = await reservar(dt, lote, 'alerta de DIGEMID en evaluación')
    const alerta = await uno(`select tipo, destinatario_rol, mensaje, estado from wms.alertas where clave = $1`, ['reserva-lote:' + rid])
    expect(alerta).toMatchObject({ tipo: 'LOTE_EN_RESERVA', destinatario_rol: 'jefe_transporte', estado: 'ABIERTA' })
    expect(alerta.mensaje).toMatch(/RES-E1 quedó en Reserva y tiene 12 unidades asignadas/)
    expect((await falla(como(aux1, (c) => c.query(`select wms.registrar_picking($1, 'PICKEADA', $2)`, [ol.id, ol.cantidad])))).message).toMatch(/está en Reserva: no se puede pickear/)
    // al quitar la Reserva la alerta se cierra sola y el picking sigue
    await quitar(jt, lote, 'DIGEMID confirmó que no aplica')
    expect((await uno(`select estado from wms.alertas where clave = $1`, ['reserva-lote:' + rid])).estado).toBe('ATENDIDA')
    await como(aux1, (c) => c.query(`select wms.registrar_picking($1, 'PICKEADA', $2)`, [ol.id, ol.cantidad]))
    expect((await uno('select picking from wms.ordenes_picking_lineas where id = $1', [ol.id])).picking).toBe('PICKEADA')
  })

  it('una orden de picking nueva tampoco toma un lote en Reserva', async () => {
    const p = await producto()
    const lote = await sembrar(p, 'F-3.3', 'RES-F1', en(100), 30)
    const s = await crearSalida(p, 5)
    await asignar(s)
    await reservar(jt, lote, 'calidad')
    expect((await falla(como(jt, (c) => c.query('select wms.generar_orden_picking($1)', [s])))).message).toMatch(/está en Reserva: no se puede pickear/)
  })

  it('la historia no se edita ni se borra, y un lote puede volver a ponerse en Reserva después de quitarla', async () => {
    const p = await producto()
    const lote = await sembrar(p, 'F-2.3', 'RES-G1', en(100), 30)
    await reservar(jt, lote, 'primera vez')
    await quitar(jt, lote, 'resuelto')
    const e1 = await falla(base.admin.query(`update wms.reservas_lote set motivo = 'otro' where lote_id = $1`, [lote]))
    expect(e1.message).toMatch(/ya se quitó/)
    const e2 = await falla(base.admin.query(`delete from wms.reservas_lote where lote_id = $1`, [lote]))
    expect(e2.message).toMatch(/no se borran/)
    await reservar(dt, lote, 'segunda vez')
    expect((await q(`select 1 from wms.reservas_lote where lote_id = $1`, [lote])).length).toBe(2)
    expect((await q(`select 1 from wms.reservas_lote where lote_id = $1 and quitada_en is null`, [lote])).length).toBe(1)
  })

  it('la lectura es para el personal y nadie escribe con DML directo', async () => {
    const p = await producto()
    const lote = await sembrar(p, 'F-2.4', 'RES-H1', en(100), 10)
    await reservar(jt, lote, 'prueba de RLS')
    expect((await como(aux1, (c) => c.query('select 1 from wms.reservas_lote where lote_id = $1', [lote]))).rows).toHaveLength(1)
    expect((await falla(como(jt, (c) => c.query(`insert into wms.reservas_lote (lote_id, motivo, aplicada_por) values ($1, 'x', $2)`, [lote, jt])))).message).toMatch(/permission denied|row-level security/)
  })
})

describe('Despacho como zona de conformidad', () => {
  it('Mover a mano no entra ni sale de Despacho (incluida la mesa K-M2)', async () => {
    const p = await producto()
    const lote = await sembrar(p, 'F-3.1', 'DSP-1', en(100), 10)
    const origen = await idPosicion(base.admin, 'F-3.1')
    const m2 = await idPosicion(base.admin, 'K-M2')
    const orden = (await uno(`insert into wms.ordenes_movimiento (numero, motivo, ejecutor_id) values ('MI-RV-00001', 'prueba', $1) returning id`, [ja])).id
    const e = await falla(base.admin.query(
      `insert into wms.ordenes_movimiento_lineas (orden_id, producto_id, lote_id, propietario_id, estado, origen, procedencia_id, desde_posicion_id, hasta_posicion_id, cantidad)
       values ($1, $2, $3, $4, 'APROBADO', 'CARGA_INICIAL', $5, $6, $7, 1)`, [orden, p, lote, logissa, randomUUID(), origen, m2]))
    expect(e.message).toMatch(/Despacho se usa solo en las salidas/)
  })

  it('la conformidad deja el stock en la ubicación de Despacho por defecto (o la indicada)', async () => {
    const p = await producto()
    await sembrar(p, 'F-3.2', 'DSP-2', en(100), 10)
    const s = await crearSalida(p, 4)
    await asignar(s)
    const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [s])).rows[0].id as string)
    const [ol] = await q('select id, cantidad from wms.ordenes_picking_lineas where orden_id = $1', [orden])
    await como(aux1, (c) => c.query(`select wms.registrar_picking($1, 'PICKEADA', $2)`, [ol.id, ol.cantidad]))
    await como(sandra, (c) => c.query(`select wms.dar_conformidad($1, 'CONFORME')`, [ol.id]))
    expect(await q(`select p.codigo, s.cantidad::int n from wms.saldos s join wms.posiciones p on p.id = s.posicion_id where s.producto_id = $1 and p.tipo_area = 'DESPACHO'`, [p])).toEqual([{ codigo: 'STG-9', n: 4 }])
  })
})
