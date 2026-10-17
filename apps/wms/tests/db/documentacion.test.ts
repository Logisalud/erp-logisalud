// S6b (migración 0019): guía de remisión registrada a mano con los lotes confirmados, paquete documental por salida y alerta de documentación incompleta.
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux1: string
let sandra: string
let dt: string
let n = 0

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}
async function productoConRs(): Promise<string> {
  n += 1
  const id = (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`DF-${n}-${randomUUID().slice(0, 4)}`, `Producto documentación ${n}`])).id as string
  await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en) values ($1, 'EG-9', '2031-01-01', 'VALIDADO', $2, $2, now())`, [id, dt])
  await subir(dt, 'REGISTRO_SANITARIO', id)
  return id
}
async function sembrar(prod: string, pos: string, lote: string, vence: string, cantidad: number) {
  const posId = await idPosicion(base.admin, pos)
  const existente = await uno(`select id from wms.lotes where producto_id = $1 and codigo = $2 and propietario_id = $3`, [prod, lote, logissa])
  const loteId = existente?.id ?? (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, logissa])).id
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return loteId as string
}
const subir = (quien: string, tipo: string, alcance: string, o: { desde?: string | null; hasta?: string | null } = {}) =>
  como(quien, async (c) => (await c.query('select wms.subir_documento_regulatorio($1, $2, $3, $4, $5, $6, $7, $8, null, null) id', [tipo, alcance, 'doc.pdf', `docs/${randomUUID()}.pdf`, sha(randomUUID()), 1234, o.desde ?? null, o.hasta ?? null])).rows[0].id as string)

/** Una salida con su orden de picking y todo pickeado (sin conformidad todavía). */
async function salidaPickeada(prod: string, cantidad: number) {
  const salida = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
  const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [salida])).rows[0].id as string)
  const lineas = await q('select id, cantidad from wms.ordenes_picking_lineas where orden_id = $1 order by id', [orden])
  for (const l of lineas) await como(aux1, (c) => c.query('select wms.registrar_picking($1, $2, $3, $4)', [l.id, 'PICKEADA', l.cantidad, null]))
  return { salida, orden, lineas: lineas.map((l) => l.id as string) }
}
const conformar = (linea: string) => como(sandra, (c) => c.query('select wms.dar_conformidad($1, $2, $3, null, $4)', [linea, 'CONFORME', null, null]))
const registrar = (quien: string, salida: string, numero: string, nota: string | null = null) => como(quien, async (c) => (await c.query('select wms.registrar_gre($1, $2, $3) id', [salida, numero, nota])).rows[0].id as string)
const paquete = (salida: string) => como(jt, async (c) => (await c.query('select * from wms.paquete_documental($1)', [salida])).rows as { lote: string; tipo: string; exigido: boolean; estado: string; cantidad: number }[])

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  dt = base.personas.katia.id
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-6', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-6' where clave = 'posicion_despacho_defecto'`)
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('guía de remisión registrada a mano', () => {
  it('solo se registra con TODO el pedido conforme; sus líneas salen de lo confirmado (dos lotes, cada uno con su cantidad)', async () => {
    const p = await productoConRs()
    await sembrar(p, 'F-2.1', 'LOTE-GA', en(120), 6)
    await sembrar(p, 'F-2.2', 'LOTE-GB', en(300), 20)
    const { salida, lineas } = await salidaPickeada(p, 10)
    expect(lineas).toHaveLength(2)
    expect((await falla(registrar(jt, salida, 'T001-00001234'))).message).toMatch(/cuando todo el pedido tiene la conformidad/)
    await conformar(lineas[0])
    expect((await falla(registrar(jt, salida, 'T001-00001234'))).message).toMatch(/cuando todo el pedido tiene la conformidad/)
    await conformar(lineas[1])
    const id = await registrar(jt, salida, ' t001-00001234 ', 'Entregada a Charlie')
    const g = await uno('select * from wms.guias_remision where id = $1', [id])
    expect(g).toMatchObject({ numero: 'T001-00001234', estado: 'VIGENTE', nota: 'Entregada a Charlie' })
    expect(g.lineas).toEqual([
      expect.objectContaining({ lote: 'LOTE-GA', cantidad: 6 }),
      expect.objectContaining({ lote: 'LOTE-GB', cantidad: 4 }),
    ])
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'gre_registrada' and entidad_id = $1`, [id])).n).toBe(1)
  })

  it('el número tiene serie y correlativo, una salida tiene una guía viva y un número no se usa en dos salidas', async () => {
    const p = await productoConRs()
    await sembrar(p, 'F-2.3', 'LOTE-GC', en(200), 50)
    const a = await salidaPickeada(p, 5); const b = await salidaPickeada(p, 5)
    for (const x of [a, b]) for (const l of x.lineas) await conformar(l)
    for (const mal of ['1234', 'T001', 'T001-', 'T0-1', 'T001-123456789', '']) expect((await falla(registrar(jt, a.salida, mal))).message, mal).toMatch(/serie, guion y número/)
    await registrar(jt, a.salida, 'EG07-00002031')
    expect((await falla(registrar(jt, a.salida, 'EG07-00002032'))).message).toMatch(/ya tiene una guía registrada/)
    expect((await falla(registrar(jt, b.salida, 'EG07-00002031'))).message).toMatch(/ya está registrada en otra salida/)
  })

  it('una guía no se edita ni se borra: se anula con motivo y se registra otra (el número anulado queda libre)', async () => {
    const p = await productoConRs()
    await sembrar(p, 'F-2.4', 'LOTE-GD', en(200), 50)
    const { salida, lineas } = await salidaPickeada(p, 5)
    for (const l of lineas) await conformar(l)
    const id = await registrar(jt, salida, 'T002-00000010')
    expect((await falla(base.admin.query(`update wms.guias_remision set numero = 'T002-00000011' where id = $1`, [id]))).message).toMatch(/no se edita/)
    expect((await falla(base.admin.query('delete from wms.guias_remision where id = $1', [id]))).message).toMatch(/no se borra/)
    expect((await falla(como(jt, (c) => c.query('select wms.anular_gre($1, $2)', [id, '  '])))).message).toMatch(/por qué se anula/)
    await como(jt, (c) => c.query('select wms.anular_gre($1, $2)', [id, 'Error de digitación en el número']))
    expect(await uno('select estado, motivo_anulacion from wms.guias_remision where id = $1', [id])).toMatchObject({ estado: 'ANULADA', motivo_anulacion: 'Error de digitación en el número' })
    expect((await falla(como(jt, (c) => c.query('select wms.anular_gre($1, $2)', [id, 'otra vez'])))).message).toMatch(/ya está anulada/)
    expect((await falla(base.admin.query(`update wms.guias_remision set estado = 'VIGENTE', anulada_en = null, motivo_anulacion = null where id = $1`, [id]))).message).toMatch(/no se edita/)
    const nueva = await registrar(jt, salida, 'T002-00000010')   // el mismo número ya no está vivo
    expect(nueva).not.toBe(id)
    expect((await q('select estado from wms.guias_remision where salida_id = $1 order by registrada_en', [salida])).map((r) => r.estado)).toEqual(['ANULADA', 'VIGENTE'])
  })

  it('quienes registran la guía: Transporte, asistente de DT y DT; Jefe de Almacén «solo», auxiliar, auditoría y quien no tiene rol, no', async () => {
    const p = await productoConRs()
    await sembrar(p, 'F-5.1', 'LOTE-GE', en(200), 50)
    const { salida, lineas } = await salidaPickeada(p, 5)
    for (const l of lineas) await conformar(l)
    for (const quien of [aux1, base.personas.charlie.id, base.personas.sinRol.id, base.personas.auditor.id]) expect((await falla(registrar(quien, salida, 'T003-00000001'))).message, quien).toMatch(/No tienes permiso para registrar la guía/)
    await registrar(sandra, salida, 'T003-00000001')
  })
})

describe('paquete documental y alerta', () => {
  it('por cada lote que sale: COA del lote, registro sanitario del producto y BPM si el perfil lo pide; con su estado', async () => {
    const p = await productoConRs()
    const la = await sembrar(p, 'F-3.1', 'LOTE-PA', en(150), 4)
    const lb = await sembrar(p, 'F-3.2', 'LOTE-PB', en(350), 20)
    const { salida } = await salidaPickeada(p, 10)
    let rows = await paquete(salida)
    expect(rows.filter((r) => r.exigido).map((r) => `${r.lote}:${r.tipo}:${r.estado}`).sort()).toEqual(['LOTE-PA:COA:FALTA', 'LOTE-PA:REGISTRO_SANITARIO:OK', 'LOTE-PB:COA:FALTA', 'LOTE-PB:REGISTRO_SANITARIO:OK'])
    expect(rows.find((r) => r.lote === 'LOTE-PA' && r.tipo === 'COA')).toMatchObject({ cantidad: 4 })
    await subir(sandra, 'COA', la, { desde: en(-30), hasta: en(-1) })               // vencido
    await subir(sandra, 'COA', lb)                                  // vigente
    rows = await paquete(salida)
    expect(rows.find((r) => r.lote === 'LOTE-PA' && r.tipo === 'COA')?.estado).toBe('VENCIDO')
    expect(rows.find((r) => r.lote === 'LOTE-PB' && r.tipo === 'COA')?.estado).toBe('OK')
    const resumen = await como(jt, async (c) => (await c.query('select * from wms.documentacion_resumen()')).rows as { salida_id: string; guia_numero: string | null; faltantes: number }[])
    expect(resumen.find((r) => r.salida_id === salida)).toMatchObject({ guia_numero: null, faltantes: 1 })
  })

  it('al dar la última conformidad con documentos faltantes o vencidos nace UNA alerta para Transporte; con el paquete completo no', async () => {
    const p1 = await productoConRs(); const p2 = await productoConRs()
    await sembrar(p1, 'F-3.3', 'LOTE-AL1', en(200), 30)
    const l2 = await sembrar(p2, 'F-3.4', 'LOTE-AL2', en(200), 30)
    await subir(sandra, 'COA', l2)
    const incompleto = await salidaPickeada(p1, 5)
    const completo = await salidaPickeada(p2, 5)
    for (const l of incompleto.lineas) await conformar(l)
    for (const l of completo.lineas) await conformar(l)
    const numero = (await uno('select numero from wms.salidas where id = $1', [incompleto.salida])).numero
    const alertas = await q(`select * from wms.alertas where tipo = 'DOCUMENTACION_INCOMPLETA' and clave = $1`, [`doc-salida:${incompleto.salida}`])
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatchObject({ destinatario_rol: 'jefe_transporte', estado: 'ABIERTA' })
    expect(alertas[0].mensaje).toContain(numero)
    expect(alertas[0].mensaje).toContain('COA del lote LOTE-AL1 (falta)')
    expect(await q(`select 1 from wms.alertas where clave = $1`, [`doc-salida:${completo.salida}`])).toHaveLength(0)
  })

  it('el perfil del cliente cambia lo que se exige: con BPM exigido y sin documento, el paquete queda incompleto', async () => {
    const p = await productoConRs()
    await sembrar(p, 'F-4.1', 'LOTE-BP', en(200), 30)
    const { salida } = await salidaPickeada(p, 5)
    const ped = randomUUID()
    await base.admin.query(`update wms.salidas set referencia_tipo = 'pedido', referencia_id = $2 where id = $1`, [salida, ped])
    await base.admin.query(`insert into wms.perfil_documental_cliente (ruc, exige_coa, exige_registro_sanitario, exige_bpm, copias, actualizado_por) values ('20555555551', false, true, true, 2, $1)`, [dt])
    await base.admin.query(`insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, snapshot, cambios, vigente, importado_por)
                            values ($1, 1, 'PED-DOC-1', current_date, 'c1', 'Cliente con BPM', '20555555551', '{}'::jsonb, '{}', true, $2)`, [ped, dt])
    const rows = await paquete(salida)
    expect(rows.filter((r) => r.exigido).map((r) => `${r.tipo}:${r.estado}`).sort()).toEqual(['BPM:FALTA', 'REGISTRO_SANITARIO:OK'])
  })
})

describe('migración 0019', () => {
  it('es re-ejecutable', async () => {
    const { SQL } = await import('./helpers')
    await base.admin.query(SQL.m0019()); await base.admin.query(SQL.m0019())
    expect((await uno(`select count(*)::int n from wms.permisos_rol where accion = 'registrar_documentacion'`)).n).toBe(3)
  })
})
