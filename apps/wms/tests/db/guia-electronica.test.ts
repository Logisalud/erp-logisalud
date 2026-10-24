// OS-3 (migración 0024): guía electrónica registrada con el resultado de Nubefact, anulación por casos (1, 2 y 3), reapertura de la conformidad
// con el stock de vuelta al rack, y bandeja de eventos hacia Pedidos.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux1: string
let sandra: string
let dt: string
let n = 0
let nPed = 0
let nGuia = 0

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
const emitir = (quien: string, salida: string, numero?: string, estadoSunat = 'ACEPTADA') => como(quien, async (c) =>
  (await c.query('select wms.registrar_guia_electronica($1, $2, $3, current_date, 12.5, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10) id',
    [salida, numero ?? `TTT1-${String(++nGuia).padStart(8, '0')}`, 'SIMULADOR', JSON.stringify({ operacion: 'generar_guia' }), JSON.stringify({ aceptada: true }), estadoSunat,
      estadoSunat === 'ACEPTADA' ? 'https://simulador.nubefact.test/guia.pdf' : null, estadoSunat === 'ACEPTADA' ? 'https://simulador.nubefact.test/guia.xml' : null, null, 'abc123'])).rows[0].id as string)
const anular = (quien: string, guia: string, caso: number, motivo = 'Error de digitación') =>
  como(quien, async (c) => (await c.query('select wms.anular_guia($1, $2, $3) r', [guia, caso, motivo])).rows[0].r as Record<string, unknown>)
const eventos = (guia: string) => q(`select tipo, estado, intentos, payload from wms.eventos_pedidos where guia_id = $1 order by creado_en, id`, [guia])

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  dt = base.personas.katia.id
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-9', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-9' where clave = 'posicion_despacho_defecto'`)
}, 180_000)
afterAll(async () => { await base?.cerrar() })

describe('emitir la guía electrónica (se registra lo que devolvió Nubefact)', () => {
  it('pide la conformidad, la ruta con vehículo y conductor, y guarda origen, entorno, enlace y el evento hacia Pedidos', async () => {
    const o = await orden('F-9.1', 10)
    expect((await falla(emitir(jt, o.salida))).message).toMatch(/conformidad/)
    await conformar(sandra, o.op)
    expect((await falla(emitir(jt, o.salida))).message).toMatch(/Asigna primero el pedido a una ruta/)
    const sinConductor = await aRuta(o.salida, false)
    expect((await falla(emitir(jt, o.salida))).message).toMatch(/vehículo y conductor/)
    await base.admin.query(`update wms.ruta_paradas set activa = false where ruta_id = $1`, [sinConductor.ruta])
    await aRuta(o.salida)
    expect((await falla(emitir(aux1, o.salida))).message).toMatch(/No tienes permiso/)
    const id = await emitir(jt, o.salida, 'TTT1-00000501')
    const g = await uno('select * from wms.guias_remision where id = $1', [id])
    expect(g).toMatchObject({ origen: 'NUBEFACT', entorno: 'SIMULADOR', numero: 'TTT1-00000501', estado: 'VIGENTE', bultos: 2 })
    expect(g).toMatchObject({ estado_sunat: 'ACEPTADA', enlace_xml: 'https://simulador.nubefact.test/guia.xml' })
    expect(g.placa).toBeTruthy()
    expect((g.lineas as { cantidad: number }[])[0].cantidad).toBe(10)
    const ev = await eventos(id)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ tipo: 'GUIA_EMITIDA', estado: 'PENDIENTE' })
    expect(ev[0].payload).toMatchObject({ guia: 'TTT1-00000501', bultos: 2, salida: o.numero })
    expect((ev[0].payload as { lineas: { lote: string; vence: string }[] }).lineas[0]).toMatchObject({ vence: '2030-06-30' })
    expect((await falla(emitir(jt, o.salida))).message).toMatch(/ya tiene una guía/)
  })

  it('el contexto de la guía trae ruta, conductor, bultos, líneas y el punto de partida', async () => {
    const o = await orden('F-9.2', 6)
    await conformar(sandra, o.op, 3)
    await aRuta(o.salida)
    const ctx = await como(jt, async (c) => (await c.query('select wms.contexto_guia($1) r', [o.salida])).rows[0].r as Record<string, any>)
    expect(ctx.bultos).toBe(3)
    expect(ctx.ruta.placa).toBeTruthy()
    expect(ctx.ruta.conductor_dni).toBe('12345678')
    expect(ctx.pedido.cliente).toBe('Botica Salud')
    expect(ctx.parametros.guia_partida_ubigeo).toBe('150119')
    expect(ctx.parametros.sunat_baja_plazo_horas).toBe('PENDIENTE')
    expect((await falla(como(aux1, (c) => c.query('select wms.contexto_guia($1)', [o.salida])))).message).toMatch(/No tienes permiso/)
  })

  it('una guía no se edita ni se borra', async () => {
    const o = await orden('F-9.3', 4)
    await conformar(sandra, o.op); await aRuta(o.salida)
    const id = await emitir(jt, o.salida)
    await expect(base.admin.query(`update wms.guias_remision set enlace = 'x' where id = $1`, [id])).rejects.toThrow(/no se edita/)
    await expect(base.admin.query(`delete from wms.guias_remision where id = $1`, [id])).rejects.toThrow(/no se borra/)
  })
})

describe('anular la guía por casos', () => {
  it('caso 1: datos del traslado — la guía queda anulada, la Orden no cambia, se avisa a Pedidos y la baja ante SUNAT queda pendiente', async () => {
    const o = await orden('F-9.4', 8)
    await conformar(sandra, o.op); await aRuta(o.salida)
    const id = await emitir(jt, o.salida)
    expect((await falla(anular(sandra, id, 1))).message).toMatch(/Solo el Jefe de Transporte/)
    expect((await falla(anular(jt, id, 1, '  '))).message).toMatch(/por qué se anula/)
    expect((await falla(anular(jt, id, 9))).message).toMatch(/Elige qué se equivocó/)
    const r = await anular(jt, id, 1, 'Placa mal digitada')
    expect(r).toMatchObject({ caso: 1, conformidad_reabierta: false, baja_sunat: 'PENDIENTE' })
    expect(await uno('select estado, caso_anulacion, motivo_anulacion from wms.guias_remision where id = $1', [id])).toMatchObject({ estado: 'ANULADA', caso_anulacion: 1, motivo_anulacion: 'Placa mal digitada' })
    expect(await saldoEnZona(o.prod, 'DESPACHO')).toBe(8)                         // el stock sigue en Despacho
    expect((await uno(`select count(*)::int n from wms.ordenes_picking_lineas where orden_id = $1 and conformidad = 'CONFORME'`, [o.op])).n).toBeGreaterThan(0)
    expect(await como(jt, async (c) => (await c.query('select wms.listo_para_carga($1) r', [o.salida])).rows[0].r)).toBe(false)   // sin guía vigente no se carga ni sale
    const ev = await eventos(id)
    expect(ev.map((e) => e.tipo)).toEqual(['GUIA_EMITIDA', 'GUIA_ANULADA'])
    expect(ev[1].payload).toMatchObject({ caso: 1, motivo: 'Placa mal digitada', baja_sunat: 'PENDIENTE' })
    expect(String((ev[1].payload as { aviso: string }).aviso)).toMatch(/no modifica la factura/)
    // se corrige y se emite otra
    const nueva = await emitir(jt, o.salida)
    expect((await uno('select estado from wms.guias_remision where id = $1', [nueva])).estado).toBe('VIGENTE')
  })

  it('caso 2: contenido — la Orden vuelve a conformidad, el stock regresa de Despacho al rack con movimientos vinculados, otra persona confirma y se emite otra guía', async () => {
    const o = await orden('F-7.1', 12)
    await conformar(sandra, o.op, 2); await aRuta(o.salida)
    expect(await saldoEn(o.prod, 'F-7.1')).toBe(88)
    const id = await emitir(jt, o.salida)
    const r = await anular(jt, id, 2, 'El lote no era el que se cargó')
    expect(r).toMatchObject({ caso: 2, conformidad_reabierta: true })
    expect(await saldoEnZona(o.prod, 'DESPACHO')).toBe(0)
    expect(await saldoEn(o.prod, 'F-7.1')).toBe(100)                              // de vuelta en su ubicación
    const movs = await q(`select tipo, cantidad from wms.salida_movimientos where salida_id = $1 order by creado_en`, [o.salida])
    expect(movs.map((m) => m.tipo)).toEqual(['STAGING', 'REVERSA_STAGING'])
    expect((await uno(`select count(*)::int n from wms.ordenes_picking_lineas where orden_id = $1 and conformidad = 'PENDIENTE'`, [o.op])).n).toBeGreaterThan(0)
    expect(await uno('select bultos_conformidad, conformada_por from wms.salidas where id = $1', [o.salida])).toMatchObject({ bultos_conformidad: null, conformada_por: null })
    expect((await uno(`select count(*)::int n from wms.bultos where salida_id = $1 and estado = 'EMBALADO'`, [o.salida])).n).toBe(0)
    expect((await falla(emitir(jt, o.salida))).message).toMatch(/conformidad/)      // sin conformidad no hay guía
    // quien picó no puede volver a conformar; otra persona sí
    expect((await falla(conformar(aux1, o.op))).message).toBeTruthy()
    const otra = await persona(['asistente_dt', 'conformidad_despacho'])
    await conformar(otra, o.op, 2)
    expect(await saldoEnZona(o.prod, 'DESPACHO')).toBe(12)
    const nueva = await emitir(jt, o.salida)
    expect((await uno('select origen, estado from wms.guias_remision where id = $1', [nueva]))).toMatchObject({ origen: 'NUBEFACT', estado: 'VIGENTE' })
    expect((await eventos(id)).map((e) => e.tipo)).toEqual(['GUIA_EMITIDA', 'GUIA_ANULADA'])
  })

  it('caso 2 con bultos ya cargados en el vehículo no se permite', async () => {
    const o = await orden('F-7.2', 5)
    await conformar(sandra, o.op, 1); const { ruta } = await aRuta(o.salida)
    const id = await emitir(jt, o.salida)
    await base.admin.query(`update wms.rutas set estado = 'LISTA_PARA_CARGA' where id = $1`, [ruta])
    const b = await uno(`insert into wms.bultos (salida_id, secuencia, total, codigo, embalado_por) values ($1, 1, 1, $2, $3) returning id`, [o.salida, `${o.numero}-B1`, jt])
    await base.admin.query(`insert into wms.carga_bultos (ruta_id, bulto_id, cargado_por) values ($1, $2, $3)`, [ruta, b.id, jt])
    expect((await falla(anular(jt, id, 2))).message).toMatch(/cargados en el vehículo/)
    expect((await uno('select estado from wms.guias_remision where id = $1', [id])).estado).toBe('VIGENTE')
  })

  it('caso 3 (SB-D): antes de la salida se pide el 1 o el 2; después de la salida se marca la guía anulada SIN tocar el stock y se emite una nueva', async () => {
    const o = await orden('F-7.3', 5)
    await conformar(sandra, o.op, 1); await aRuta(o.salida)
    const id = await emitir(jt, o.salida)
    expect((await falla(anular(jt, id, 3))).message).toMatch(/todavía no salió/)
    await base.admin.query(`update wms.salidas set estado = 'CONFIRMADA' where id = $1`, [o.salida])
    expect((await falla(anular(jt, id, 1))).message).toMatch(/ya salió: elige «la guía ya salió»/)
    expect((await uno('select estado from wms.guias_remision where id = $1', [id])).estado).toBe('VIGENTE')
    const partidas = async () => Number((await uno('select coalesce(sum(delta),0)::int n from wms.partidas')).n)
    const antes = await partidas()
    expect((await falla(anular(jt, id, 3, ''))).message).toMatch(/por qué se anula/)
    const r = await como(jt, async (c) => (await c.query('select wms.anular_guia($1, 3, $2) r', [id, 'La contadora pidió otra serie'])).rows[0].r)
    expect(r).toMatchObject({ caso: 3, conformidad_reabierta: false })
    expect(await partidas()).toBe(antes)
    expect(await uno('select estado, caso_anulacion from wms.guias_remision where id = $1', [id])).toMatchObject({ estado: 'ANULADA', caso_anulacion: 3 })
    expect((await uno('select estado from wms.salidas where id = $1', [o.salida])).estado).toBe('CONFIRMADA')
    const ev = (await eventos(id)).filter((e) => e.tipo === 'GUIA_ANULADA')
    expect(ev).toHaveLength(1)
    expect(ev[0].payload).toMatchObject({ salida_confirmada: true, falta_guia_vigente: true, factura_anulacion_directa_dias: 7 })
    // la orden queda sin guía vigente: se registra una nueva aunque la salida ya salió
    const nueva = await como(jt, async (c) => (await c.query('select wms.registrar_gre($1, $2, null) id', [o.salida, `T002-${String(++nGuia).padStart(8, '0')}`])).rows[0].id as string)
    expect((await uno('select estado from wms.guias_remision where id = $1', [nueva])).estado).toBe('VIGENTE')
    // con una guía vigente no se puede registrar otra
    expect((await falla(como(jt, (c) => c.query('select wms.registrar_gre($1, $2, null)', [o.salida, `T002-${String(++nGuia).padStart(8, '0')}`])))).message).toMatch(/ya no está abierta/)
  })

  it('una salida confirmada que nunca tuvo guía no acepta una guía nueva', async () => {
    const o = await orden('F-10.1', 2)
    await conformar(sandra, o.op, 1)
    await base.admin.query(`update wms.salidas set estado = 'CONFIRMADA' where id = $1`, [o.salida])
    expect((await falla(como(jt, (c) => c.query('select wms.registrar_gre($1, $2, null)', [o.salida, `T002-${String(++nGuia).padStart(8, '0')}`])))).message).toMatch(/ya no está abierta/)
  })

  it('anular_gre de la S6b sigue funcionando como el caso 1', async () => {
    const o = await orden('F-7.4', 3)
    await conformar(sandra, o.op, 1)
    const id = await como(jt, async (c) => (await c.query('select wms.registrar_gre($1, $2, null) id', [o.salida, `T002-${String(++nGuia).padStart(8, '0')}`])).rows[0].id as string)
    expect((await uno('select origen, entorno from wms.guias_remision where id = $1', [id]))).toMatchObject({ origen: 'MANUAL', entorno: null })
    await como(jt, (c) => c.query('select wms.anular_gre($1, $2)', [id, 'Número mal digitado']))
    expect(await uno('select estado, caso_anulacion, baja_sunat from wms.guias_remision where id = $1', [id])).toMatchObject({ estado: 'ANULADA', caso_anulacion: 1, baja_sunat: 'NO_APLICA' })
    expect((await eventos(id)).map((e) => e.tipo)).toEqual(['GUIA_EMITIDA', 'GUIA_ANULADA'])
  })
})

describe('bandeja de eventos hacia Pedidos', () => {
  it('se marca enviado o con error y un evento enviado no vuelve atrás ni se edita', async () => {
    const o = await orden('F-6.1', 2)
    await conformar(sandra, o.op, 1); await aRuta(o.salida)
    const id = await emitir(jt, o.salida)
    const ev = await uno(`select id from wms.eventos_pedidos where guia_id = $1`, [id])
    await como(jt, (c) => c.query('select wms.marcar_evento_pedidos($1, false, $2)', [ev.id, 'Pedidos no respondió']))
    expect(await uno('select estado, intentos, ultimo_error from wms.eventos_pedidos where id = $1', [ev.id])).toMatchObject({ estado: 'PENDIENTE', intentos: 1, ultimo_error: 'Pedidos no respondió' })
    await como(jt, (c) => c.query('select wms.marcar_evento_pedidos($1, true, null)', [ev.id]))
    expect(await uno('select estado, intentos, ultimo_error from wms.eventos_pedidos where id = $1', [ev.id])).toMatchObject({ estado: 'ENVIADO', intentos: 2, ultimo_error: null })
    await expect(base.admin.query(`update wms.eventos_pedidos set payload = '{}'::jsonb where id = $1`, [ev.id])).rejects.toThrow(/no se edita/)
    await expect(base.admin.query(`delete from wms.eventos_pedidos where id = $1`, [ev.id])).rejects.toThrow(/no se borra/)
    await expect(como(dt, (c) => c.query('select wms.marcar_evento_pedidos($1, true, null)', [ev.id]))).resolves.toBeTruthy()
    expect(hoy).toBeTruthy()
  })
})

describe('la migración 0024', () => {
  it('es re-ejecutable', async () => {
    const { SQL } = await import('./helpers')
    await base.admin.query(SQL.m0024())
    await base.admin.query(SQL.m0024())
    expect((await uno(`select to_regprocedure('wms.registrar_gre(uuid,text,text)') f`)).f).toBeNull()
  })
})

describe('flujo en dos pasos con Nubefact (generar y luego consultar)', () => {
  it('el número sale del correlativo de la serie y solo lo pide quien puede emitir', async () => {
    const a = await como(jt, async (c) => Number((await c.query(`select wms.siguiente_numero_guia('ttt1') n`)).rows[0].n))
    const b = await como(jt, async (c) => Number((await c.query(`select wms.siguiente_numero_guia('TTT1') n`)).rows[0].n))
    expect(b).toBe(a + 1)
    expect((await falla(como(aux1, (c) => c.query(`select wms.siguiente_numero_guia('TTT1')`)))).message).toMatch(/No tienes permiso/)
    expect((await falla(como(jt, (c) => c.query(`select wms.siguiente_numero_guia('XXX9')`)))).message).toMatch(/no está configurada/)
  })

  it('una guía pendiente pasa a aceptada con su enlace y recién entonces se avisa a Pedidos', async () => {
    const o = await orden('F-8.1', 5)
    await conformar(sandra, o.op); await aRuta(o.salida)
    const id = await emitir(jt, o.salida, undefined, 'PENDIENTE')
    expect(await eventos(id)).toHaveLength(0)
    const r = await como(jt, async (c) => (await c.query(`select wms.actualizar_estado_guia($1, 'ACEPTADA', 'https://x.test/g.pdf', 'https://x.test/g.xml', null, 'h1') r`, [id])).rows[0].r)
    expect(r).toBe('ACEPTADA')
    expect(await uno('select estado_sunat, enlace from wms.guias_remision where id = $1', [id])).toMatchObject({ estado_sunat: 'ACEPTADA', enlace: 'https://x.test/g.pdf' })
    expect(await eventos(id)).toHaveLength(1)
    const otra = await como(jt, async (c) => (await c.query(`select wms.actualizar_estado_guia($1, 'RECHAZADA', null, null, null, null, null, 'x') r`, [id])).rows[0].r)
    expect(otra).toBe('ACEPTADA')
  })

  it('si SUNAT la rechaza, la guía queda anulada con el motivo y el pedido puede emitir otra', async () => {
    const o = await orden('F-8.2', 5)
    await conformar(sandra, o.op); await aRuta(o.salida)
    const id = await emitir(jt, o.salida, undefined, 'PENDIENTE')
    expect((await falla(como(jt, (c) => c.query(`select wms.actualizar_estado_guia($1, 'RECHAZADA')`, [id])))).message).toMatch(/por qué SUNAT rechazó/)
    await como(jt, (c) => c.query(`select wms.actualizar_estado_guia($1, 'RECHAZADA', null, null, null, null, null, 'RUC del destinatario inválido')`, [id]))
    expect(await uno('select estado, estado_sunat, motivo_anulacion from wms.guias_remision where id = $1', [id])).toMatchObject({ estado: 'ANULADA', estado_sunat: 'RECHAZADA' })
    await emitir(jt, o.salida)
  })
})
