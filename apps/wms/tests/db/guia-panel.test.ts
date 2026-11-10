// Piloto «como real» (migración 0036): la guía se emite en el panel de Nubefact y el WMS solo la registra (origen PANEL).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear, SQL } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux1: string
let sandra: string
let dt: string
let n = 0
let nPed = 0
let nGuia = 0
let nPan = 0

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
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
  return (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`GE-${n}-${randomUUID().slice(0, 4)}`, `Producto guía ${n}`])).id as string
}
async function sembrar(prod: string, pos: string, lote: string, cantidad: number) {
  const posId = await idPosicion(base.admin, pos)
  const loteId = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, '2030-06-30', $3) returning id`, [prod, lote, logissa])).id as string
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return loteId
}
const saldoEn = async (prod: string, pos: string) => Number((await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.posiciones p on p.id = s.posicion_id where s.producto_id = $1 and p.codigo = $2`, [prod, pos])).n)
const saldoEnZona = async (prod: string, area: string) => Number((await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.posiciones p on p.id = s.posicion_id where s.producto_id = $1 and p.tipo_area = $2`, [prod, area])).n)
const conformar = (quien: string, op: string, bultos = 2) =>
  como(quien, async (c) => (await c.query('select wms.conformar_orden($1, null, $2, null) r', [op, bultos])).rows[0].r as Record<string, unknown>)

/** Una Orden de Salida impresa con `aux1` como picker. */
async function orden(pos: string, cantidad: number) {
  const prod = await producto()
  await sembrar(prod, pos, `L-${randomUUID().slice(0, 6)}`, 100)
  const salida = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
  const op = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1, $2) id', [salida, aux1])).rows[0].id as string)
  const numero = (await uno('select numero from wms.salidas where id = $1', [salida])).numero as string
  return { prod, salida, op, numero, pos }
}
/** Pone el pedido en una ruta del día; `completa` = con vehículo y conductor. */
async function aRuta(salida: string, completa = true) {
  const veh = completa ? (await uno(`insert into wms.vehiculos (placa, calificado) values ($1, true) returning id`, [`G${randomUUID().slice(0, 5)}`.toUpperCase()])).id : null
  const cond = completa ? (await uno(`insert into wms.personal_transporte (nombre, funcion, dni) values ($1, 'CONDUCTOR', '12345678') returning id`, [`Conductor ${randomUUID().slice(0, 6)}`])).id : null
  const r = (await uno(`insert into wms.rutas (numero, fecha, estado, vehiculo_id, conductor_id, creada_por) values ($1, current_date, 'PLANIFICADA', $2, $3, $4) returning id`, [`RUT-G-${randomUUID().slice(0, 6)}`, veh, cond, jt])).id as string
  nPed += 1
  const ped = `PED-G-${nPed}`
  const pd = (await uno(`insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, snapshot, vigente, importado_por, salida_id)
    values ($1, 1, $1, current_date, 'c1', 'Botica Salud', '20512345671', '{"cliente":{"id":"c1","nombre":"Botica Salud"}}'::jsonb, true, $2, $3) returning id`, [ped, jt, salida])).id
  await base.admin.query(`insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, salida_id) values ($1, 1, $2, $3, $4)`, [r, ped, pd, salida])
  return { ruta: r, pedido: ped }
}
const SQL_0036 = () => SQL.m0036()
const anular = (quien: string, guia: string, caso: number, motivo = 'Error de digitación') =>
  como(quien, async (c) => (await c.query('select wms.anular_guia($1, $2, $3) r', [guia, caso, motivo])).rows[0].r as Record<string, unknown>)
const eventos = (guia: string) => q(`select tipo, estado, intentos, payload from wms.eventos_pedidos where guia_id = $1 order by creado_en, id`, [guia])
const panel = (quien: string, salida: string, numero?: string, extra: { fecha?: string; estado?: string; enlace?: string | null } = {}) => como(quien, async (c) =>
  (await c.query('select wms.registrar_guia_panel($1, $2, $3::date, $4, $5, null, $6) id',
    [salida, numero ?? `TTT1-${String(900 + ++nPan).padStart(8, '0')}`, extra.fecha ?? hoy, extra.estado ?? 'ACEPTADA', extra.enlace === undefined ? 'https://panel.nubefact.test/guia.pdf' : extra.enlace, 'Emitida por Roberto'])).rows[0].id as string)
const modo = (v: string) => base.admin.query(`update wms.parametros set valor = $1 where clave = 'guia_modo'`, [v])

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  dt = base.personas.katia.id
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-P', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-P' where clave = 'posicion_despacho_defecto'`)
}, 180_000)
afterAll(async () => { await base?.cerrar() })

describe('registrar una guía emitida en el panel (0036)', () => {
  it('la migración siembra guia_modo = PANEL, solo admite WMS o PANEL y la 0036 se puede volver a aplicar', async () => {
    expect((await uno(`select valor from wms.parametros where clave = 'guia_modo'`)).valor).toBe('PANEL')
    await expect(base.admin.query(`update wms.parametros set valor = 'OTRO' where clave = 'guia_modo'`)).rejects.toThrow(/WMS o PANEL/)
    await base.admin.query(`update wms.parametros set valor = 'panel' where clave = 'guia_modo'`)
    expect((await uno(`select valor from wms.parametros where clave = 'guia_modo'`)).valor).toBe('PANEL')
    await base.admin.query(SQL_0036())
    expect((await uno(`select valor from wms.parametros where clave = 'guia_modo'`)).valor).toBe('PANEL')
    expect((await uno(`select count(*)::int n from pg_constraint where conname = 'guias_remision_origen_chk'`)).n).toBe(1)
  })

  it('pide la conformidad y el permiso, valida serie-número, fecha, estado y enlace, y guarda origen PANEL con su fecha', async () => {
    const o = await orden('F-9.1', 10)
    expect((await falla(panel(jt, o.salida))).message).toMatch(/conformidad/)
    await conformar(sandra, o.op); await aRuta(o.salida)
    expect((await falla(panel(aux1, o.salida))).message).toMatch(/No tienes permiso/)
    for (const mal of ['1234', 'T001', 'T0-1', '']) expect((await falla(panel(jt, o.salida, mal))).message).toMatch(/serie, guion y número/)
    expect((await falla(panel(jt, o.salida, undefined, { fecha: '2999-01-01' }))).message).toMatch(/fecha de mañana/)
    expect((await falla(panel(jt, o.salida, undefined, { estado: 'RECHAZADA' }))).message).toMatch(/aceptada o sin respuesta/)
    expect((await falla(panel(jt, o.salida, undefined, { enlace: 'panel.nubefact.test/x' }))).message).toMatch(/https:\/\//)
    const id = await panel(jt, o.salida, ' ttt1-00000777 ')
    const g = await uno('select * from wms.guias_remision where id = $1', [id])
    expect(g).toMatchObject({ origen: 'PANEL', numero: 'TTT1-00000777', estado: 'VIGENTE', estado_sunat: 'ACEPTADA', bultos: 2, nota: 'Emitida por Roberto' })
    expect(String(g.fecha_emision).length).toBeGreaterThan(0)
    expect(g.enlace).toBe('https://panel.nubefact.test/guia.pdf')
    expect((g.lineas as { cantidad: number }[])[0].cantidad).toBe(10)
    await expect(base.admin.query(`update wms.guias_remision set fecha_emision = '2020-01-01' where id = $1`, [id])).rejects.toThrow(/no se edita/)
  })

  it('no admite duplicados (ni con una guía anulada) ni dos guías vivas en la misma salida; avisa a Pedidos y audita', async () => {
    const a = await orden('F-9.2', 5); const b = await orden('F-9.3', 5)
    for (const o of [a, b]) { await conformar(sandra, o.op); await aRuta(o.salida) }
    const id = await panel(jt, a.salida, 'TTT1-00000801')
    expect((await falla(panel(jt, a.salida, 'TTT1-00000802'))).message).toMatch(/ya tiene una guía registrada/)
    expect((await falla(panel(jt, b.salida, 'TTT1-00000801'))).message).toMatch(/ya está registrada/)
    const ev = await eventos(id)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ tipo: 'GUIA_EMITIDA', estado: 'PENDIENTE' })
    expect(ev[0].payload).toMatchObject({ guia: 'TTT1-00000801', origen: 'PANEL', salida: a.numero })
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'guia_panel_registrada' and entidad_id = $1`, [id])).n).toBe(1)
    await anular(jt, id, 1, 'Número mal copiado')
    expect((await falla(panel(jt, a.salida, 'TTT1-00000801'))).message).toMatch(/ya está registrada \(vigente o anulada\)/)
    const nueva = await panel(jt, a.salida, 'TTT1-00000803')
    expect((await uno('select origen from wms.guias_remision where id = $1', [nueva])).origen).toBe('PANEL')
  })

  it('el flujo siguiente es el mismo: la guía del panel cuenta como guía vigente para confirmar la salida', async () => {
    const o = await orden('F-9.4', 3)
    await conformar(sandra, o.op); await aRuta(o.salida)
    const l = await uno(`select l.id linea_id, r.lote_id from wms.salida_lineas l join wms.reservas r on r.linea_id = l.id where l.salida_id = $1 limit 1`, [o.salida])
    await como(aux1, (c) => c.query('select wms.embalar_salida($1, $2::jsonb)', [o.salida, JSON.stringify([{ contenido: [{ linea_id: l.linea_id, lote_id: l.lote_id, cantidad: 2 }] }, { contenido: [{ linea_id: l.linea_id, lote_id: l.lote_id, cantidad: 1 }] }])]))
    expect(await como(jt, async (c) => (await c.query('select wms.listo_para_carga($1) r', [o.salida])).rows[0].r as boolean)).toBe(false) // sin guía
    await panel(jt, o.salida, undefined, { estado: 'PENDIENTE' })
    const g = await uno(`select origen, estado_sunat from wms.guias_remision where salida_id = $1 and estado = 'VIGENTE'`, [o.salida])
    expect(g).toMatchObject({ origen: 'PANEL', estado_sunat: 'PENDIENTE' })
    await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en) values ($1, 'EG-9', '2031-01-01', 'VALIDADO', $2, $2, now())`, [o.prod, dt])
    await como(dt, (c) => c.query(`select wms.subir_documento_regulatorio('REGISTRO_SANITARIO', $1, 'rs.pdf', $2, $3, 1234, null, null, null, null)`, [o.prod, `docs/${randomUUID()}.pdf`, randomUUID().replace(/-/g, '').padEnd(64, '1')]))
    // solo falta el paquete documental (el COA del lote): con él, la salida queda lista para cargar
    await como(dt, (c) => c.query(`select wms.subir_documento_regulatorio('COA', $1, 'doc.pdf', $2, $3, 1234, null, null, null, null)`, [l.lote_id, `docs/${randomUUID()}.pdf`, randomUUID().replace(/-/g, '').padEnd(64, '0')]))
    expect(await como(jt, async (c) => (await c.query('select wms.listo_para_carga($1) r', [o.salida])).rows[0].r as boolean)).toBe(true)
  })

  it('con guia_modo = WMS la base se niega a registrar una guía del panel', async () => {
    const o = await orden('F-8.1', 2)
    await conformar(sandra, o.op); await aRuta(o.salida)
    await modo('WMS')
    try { expect((await falla(panel(jt, o.salida))).message).toMatch(/el WMS emite las guías con Nubefact/) } finally { await modo('PANEL') }
  })
})
