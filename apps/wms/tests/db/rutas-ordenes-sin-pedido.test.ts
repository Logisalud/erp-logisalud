// SA-6 (migración 0030): las órdenes manuales siguen el flujo normal hasta el despacho. A y C entran a una ruta de Logisalud como parada por orden; B se entrega al transportista
// del cliente. Una orden no puede estar en dos rutas; quitar la parada no cancela la orden; el pedido que llega después se une y la parada sigue valiendo.
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PedidoSnapshot } from '@/domain/pedidos-despacho'
import { type BaseDePrueba, SQL, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let diph: string
let jt: string
let ja: string
let aux: string
let muestras: string
let sandra: string
let dt: string
let n = 0
let nPed = 0

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const CLIENTE = { ruc: '20123456789', razon_social: 'Botica Salud SAC', direccion: 'Jr. Cusco 45, Arequipa', ubigeo: '040101' }

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}
const subir = (tipo: string, alcance: string) => como(dt, (c) => c.query('select wms.subir_documento_regulatorio($1, $2, $3, $4, $5, $6, null, null, null, null)', [tipo, alcance, 'doc.pdf', `docs/${randomUUID()}.pdf`, sha(randomUUID()), 1234]))
async function producto(): Promise<string> {
  n += 1
  const id = (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`RO-${n}-${randomUUID().slice(0, 4)}`, `Producto ruta orden ${n}`])).id as string
  await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en) values ($1, 'EG-9', '2031-01-01', 'VALIDADO', $2, $2, now())`, [id, dt])
  await subir('REGISTRO_SANITARIO', id)
  return id
}
async function sembrar(prod: string, pos: string, cantidad: number, propietario = logissa) {
  const loteId = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, `L-${randomUUID().slice(0, 6)}`, en(300), propietario])).id as string
  await como(base.personas.admin.id, async (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: await idPosicion(base.admin, pos), producto_id: prod, lote_id: loteId, propietario_id: propietario, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  await subir('COA', loteId)
  return loteId
}
const manual = (quien: string, clase: string, motivo: string | null, propietario: string | null, lineas: unknown[], extra: { pedido?: string | null; cliente?: unknown; gre?: string | null; archivo?: string | null } = {}) =>
  como(quien, async (c) => (await c.query('select wms.crear_orden_salida_manual($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, null) id',
    [clase, motivo, propietario, JSON.stringify(lineas), extra.pedido ?? null, extra.cliente === undefined ? null : JSON.stringify(extra.cliente), extra.gre ?? null, extra.archivo ?? null])).rows[0].id as string)
/** Lleva la orden hasta «lista para carga»: picking, conformidad, embalaje, GRE a mano y paquete completo. */
async function prepararOrden(id: string, lote: string, cantidad: number, greNumero: string, archivoGre?: string) {
  const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [id])).rows[0].id as string)
  const lineas = await q('select id, cantidad, linea_id from wms.ordenes_picking_lineas where orden_id = $1 order by id', [orden])
  for (const l of lineas) await como(aux, (c) => c.query('select wms.registrar_picking($1, $2, $3, $4)', [l.id, 'PICKEADA', l.cantidad, null]))
  for (const l of lineas) await como(sandra, (c) => c.query('select wms.dar_conformidad($1, $2, $3, null, $4)', [l.id, 'CONFORME', null, null]))
  await como(aux, (c) => c.query('select wms.embalar_salida($1, $2::jsonb)', [id, JSON.stringify([{ contenido: [{ linea_id: lineas[0].linea_id, lote_id: lote, cantidad }] }])]))
  await como(jt, (c) => c.query('select wms.registrar_gre($1, $2, null, $3)', [id, greNumero, archivoGre ?? null]))
}
const gre = () => `T${String(200 + nPed).padStart(3, '0')}-${String(++nPed).padStart(8, '0')}`
const salida = (id: string) => uno('select * from wms.salidas where id = $1', [id])
const stockDe = async (prod: string) => (await uno(`select coalesce(sum(cantidad), 0)::int n from wms.saldos where producto_id = $1`, [prod])).n as number
const veh = async () => (await uno(`insert into wms.vehiculos (placa, calificado) values ($1, true) returning id`, [`R${randomUUID().slice(0, 5)}`.toUpperCase()])).id as string
const cond = async () => (await uno(`insert into wms.personal_transporte (nombre, funcion, dni) values ($1, 'CONDUCTOR', '40123456') returning id`, [`Conductor ${randomUUID().slice(0, 6)}`])).id as string
const nuevaRuta = (fecha: string, v?: string, c?: string) => como(jt, async (cl) => (await cl.query('select wms.crear_ruta($1, $2, $3, null) id', [fecha, v ?? null, c ?? null])).rows[0].id as string)
const planificar = (quien: string, ruta: string, fecha: string, v: string | null, c: string | null, paradas: unknown[], motivo: string | null = null) =>
  como(quien, async (cl) => (await cl.query('select wms.planificar_ruta($1, $2, $3, $4, null, $5::jsonb, $6) r', [ruta, fecha, v, c, JSON.stringify(paradas), motivo])).rows[0].r as { version: number; paradas: number; bloqueados_por_stock: string[] })
const paradasVivas = (ruta: string) => q('select * from wms.ruta_paradas where ruta_id = $1 and activa order by secuencia', [ruta])
/** Una orden A (venta manual) con stock y lista para planificar. */
async function ordenA(cantidad = 10, pedidoNumero?: string) {
  const prod = await producto(); const lote = await sembrar(prod, 'F-1.1', 100)
  nPed += 1
  const id = await manual(jt, 'A', null, null, [{ producto_id: prod, cantidad }], { pedido: pedidoNumero ?? `PED-RO-${nPed}-${randomUUID().slice(0, 4)}`, cliente: CLIENTE })
  return { id, prod, lote, cantidad }
}
async function ordenC(cantidad = 3) {
  const prod = await producto(); const lote = await sembrar(prod, 'F-1.1', 100)
  const id = await manual(muestras, 'C', 'MUESTRA', null, [{ producto_id: prod, cantidad }], { cliente: { ...CLIENTE, razon_social: 'Clínica Destino SAC' } })
  return { id, prod, lote, cantidad }
}

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  diph = await idPropietario(base.admin, 'DIPHASAC')
  dt = base.personas.katia.id
  jt = await persona('jefe_transporte'); ja = await persona('jefe_almacen'); aux = await persona('auxiliar'); muestras = await persona('autoriza_salidas_sin_venta'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-9', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-9' where clave = 'posicion_despacho_defecto'`)
  await base.admin.query(`update wms.parametros set valor = '23:59' where clave = 'hora_corte_planificacion'`)
}, 180_000)
afterAll(async () => { await base?.cerrar() })

describe('tipo C pide su destinatario', () => {
  it('la muestra y la devolución al proveedor exigen a quién van, con RUC, dirección y ubigeo; se guarda en la orden', async () => {
    const prod = await producto(); await sembrar(prod, 'F-1.1', 50)
    const l = [{ producto_id: prod, cantidad: 1 }]
    expect((await falla(manual(muestras, 'C', 'MUESTRA', null, l))).message).toBe('Escribe a quién va la muestra')
    expect((await falla(manual(muestras, 'C', 'MUESTRA', null, l, { cliente: { ...CLIENTE, ruc: '123' } }))).message).toBe('El RUC tiene 11 números')
    expect((await falla(manual(muestras, 'C', 'MUESTRA', null, l, { cliente: { ...CLIENTE, direccion: '' } }))).message).toBe('Escribe la dirección de entrega')
    expect((await falla(manual(muestras, 'C', 'MUESTRA', null, l, { cliente: { ...CLIENTE, ubigeo: '12' } }))).message).toMatch(/El ubigeo tiene 6 números/)
    const c = await ordenC(2)
    expect((await salida(c.id)).cliente_manual).toMatchObject({ ruc: '20123456789', razon_social: 'Clínica Destino SAC', ubigeo: '040101' })
    expect((await salida(c.id)).requiere_embalaje).toBe(true)
  })
})

describe('planificar una ruta con paradas por orden', () => {
  it('A (sin pedido en la bandeja) y C entran como parada por orden; la ruta se confirma y nace su LS-FR; la versión guarda las órdenes', async () => {
    const a = await ordenA(); const c = await ordenC()
    const r = await nuevaRuta(en(5), await veh(), await cond())
    const res = await planificar(jt, r, en(5), (await uno('select vehiculo_id v from wms.rutas where id = $1', [r])).v, (await uno('select conductor_id c from wms.rutas where id = $1', [r])).c, [{ salida_id: a.id }, { salida_id: c.id }])
    expect(res).toMatchObject({ paradas: 2, bloqueados_por_stock: [] })
    const ps = await paradasVivas(r)
    expect(ps.map((p) => [p.secuencia, p.salida_id, p.pedido_id, p.pedido_despacho_id])).toEqual([[1, a.id, null, null], [2, c.id, null, null]])
    const ver = await uno('select paradas from wms.ruta_versiones where ruta_id = $1 order by version desc limit 1', [r])
    expect(ver.paradas).toHaveLength(2)
    expect(ver.paradas[0]).toMatchObject({ salida_id: a.id, pedido_id: null, cliente: 'Botica Salud SAC' })
    await como(jt, (cl) => cl.query('select wms.confirmar_ruta($1)', [r]))
    expect((await uno('select estado from wms.rutas where id = $1', [r])).estado).toBe('PLANIFICADA')
    expect(await uno('select estado from wms.registros_ls_fr_43_03 where ruta_id = $1', [r])).toMatchObject({ estado: 'BASE' })
  })

  it('quitar una parada de una orden manual NO cancela la orden (solo libera la parada); cancelar la ruta tampoco; la orden se puede planificar de nuevo', async () => {
    const a = await ordenA(); const c = await ordenC()
    const v = await veh(); const cd = await cond()
    const r = await nuevaRuta(en(6), v, cd)
    await planificar(jt, r, en(6), v, cd, [{ salida_id: a.id }, { salida_id: c.id }])
    await planificar(jt, r, en(6), v, cd, [{ salida_id: c.id }])
    expect((await salida(a.id)).estado).toBe('ABIERTA')
    expect((await q(`select estado from wms.salida_lineas where salida_id = $1`, [a.id]))[0].estado).toBe('ASIGNADA')
    expect((await paradasVivas(r)).map((p) => p.salida_id)).toEqual([c.id])
    await como(jt, (cl) => cl.query('select wms.cancelar_ruta($1, $2)', [r, 'Se cae el viaje']))
    expect((await salida(c.id)).estado).toBe('ABIERTA')
    expect(await paradasVivas(r)).toHaveLength(0)
    const r2 = await nuevaRuta(en(6), v, cd)
    await planificar(jt, r2, en(6), v, cd, [{ salida_id: a.id }, { salida_id: c.id }])
    expect(await paradasVivas(r2)).toHaveLength(2)
  })

  it('una orden no puede estar en dos rutas vivas; B, una orden de la bandeja, una cancelada y una repetida no entran', async () => {
    const a = await ordenA()
    const v1 = await veh(); const c1 = await cond(); const v2 = await veh(); const c2 = await cond()
    const r1 = await nuevaRuta(en(7), v1, c1); const r2 = await nuevaRuta(en(7), v2, c2)
    await planificar(jt, r1, en(7), v1, c1, [{ salida_id: a.id }])
    const e = await falla(planificar(jt, r2, en(7), v2, c2, [{ salida_id: a.id }]))
    expect(e.message).toMatch(/La orden OS-\d{4}-\d{5} ya está en la ruta RUT-/)
    const libre = await ordenA()
    expect((await falla(planificar(jt, r2, en(7), v2, c2, [{ salida_id: libre.id }, { salida_id: libre.id }]))).message).toBe('Hay un pedido repetido o sin identificador en la ruta')
    // el índice único lo garantiza aunque la función se salte
    await expect(base.admin.query(`insert into wms.ruta_paradas (ruta_id, secuencia, salida_id) values ($1, 9, $2)`, [r2, a.id])).rejects.toThrow(/ruta_paradas_salida_uk/)
    // B no va en ruta
    const prod = await producto(); const lote = await sembrar(prod, 'A-14.2', 40, diph)
    const b = await manual(jt, 'B', 'VENTA', diph, [{ producto_id: prod, cantidad: 2, lote_id: lote }], { gre: 'T001-00000501', archivo: 'gre/x.pdf' })
    expect((await falla(planificar(jt, r2, en(7), v2, c2, [{ salida_id: b }]))).message).toMatch(/no va en una ruta de Logisalud, se entrega al transportista del cliente/)
    // una orden que nació de un pedido de la bandeja se agrega desde la bandeja
    const prod2 = await producto(); await sembrar(prod2, 'F-1.1', 20)
    const idBandeja = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod2, cantidad: 1 }])])).rows[0].id as string)
    await base.admin.query(`update wms.salidas set origen = 'PEDIDO' where id = $1`, [idBandeja])
    expect((await falla(planificar(jt, r2, en(7), v2, c2, [{ salida_id: idBandeja }]))).message).toMatch(/nace de un pedido de la bandeja/)
    // cancelada
    const x = await ordenA()
    await como(jt, (cl) => cl.query('select wms.cancelar_orden_salida($1, $2)', [x.id, 'Número mal escrito']))
    expect((await falla(planificar(jt, r2, en(7), v2, c2, [{ salida_id: x.id }]))).message).toMatch(/ya no está abierta/)
    // solo el Jefe de Transporte planifica
    expect((await falla(planificar(ja, r2, en(7), v2, c2, [{ salida_id: a.id }]))).message).toMatch(/No tienes permiso para planificar rutas/)
  })

  it('el corte vale también para una orden: una orden creada después del corte necesita excepción con motivo', async () => {
    const a = await ordenA()
    await base.admin.query(`update wms.parametros set valor = '00:00' where clave = 'hora_corte_planificacion'`)
    try {
      const v = await veh(); const cd = await cond(); const r = await nuevaRuta(en(1), v, cd)
      await base.admin.query(`update wms.salidas set creada_en = now() where id = $1`, [a.id])
      // creada hoy después de las 00:00 de la víspera de mañana (hoy): fuera de corte
      expect((await falla(planificar(jt, r, en(1), v, cd, [{ salida_id: a.id }]))).message).toMatch(/se creó después del corte de las 00:00/)
      expect((await falla(planificar(jt, r, en(1), v, cd, [{ salida_id: a.id, excepcion_corte: true }]))).message).toMatch(/necesita un motivo/)
      await planificar(jt, r, en(1), v, cd, [{ salida_id: a.id, excepcion_corte: true, motivo_excepcion: 'El cliente la necesita hoy' }])
      expect((await paradasVivas(r))[0]).toMatchObject({ excepcion_corte: true, motivo_excepcion: 'El cliente la necesita hoy' })
    } finally {
      await base.admin.query(`update wms.parametros set valor = '23:59' where clave = 'hora_corte_planificacion'`)
    }
  })

  it('una orden sin stock suficiente bloquea la confirmación de la ruta y se avisa al planificar', async () => {
    const prod = await producto(); await sembrar(prod, 'F-1.1', 5)
    const id = await manual(jt, 'A', null, null, [{ producto_id: prod, cantidad: 50 }], { pedido: `PED-SS-${++nPed}`, cliente: CLIENTE })
    const v = await veh(); const cd = await cond(); const r = await nuevaRuta(en(8), v, cd)
    const res = await planificar(jt, r, en(8), v, cd, [{ salida_id: id }])
    expect(res.bloqueados_por_stock).toHaveLength(1)
    expect((await falla(como(jt, (c) => c.query('select wms.confirmar_ruta($1)', [r])))).message).toMatch(/Estos pedidos no tienen stock suficiente: PED-SS-/)
  })
})

describe('guía, carga y salida confirmada de A y C usan la parada por orden', () => {
  it('la guía toma placa, conductor y fecha de la ruta; la carga concilia los bultos con el número de pedido; confirmar la salida baja el stock', async () => {
    const a = await ordenA(10); const c = await ordenC(3)
    await prepararOrden(a.id, a.lote, 10, gre()); await prepararOrden(c.id, c.lote, 3, gre())
    const v = await veh(); const cd = await cond()
    const r = await nuevaRuta(hoy, v, cd)
    await planificar(jt, r, hoy, v, cd, [{ salida_id: a.id }, { salida_id: c.id }], null).catch(async () => {
      // si el corte de hoy ya pasó, la parada entra con excepción
      await planificar(jt, r, hoy, v, cd, [{ salida_id: a.id, excepcion_corte: true, motivo_excepcion: 'Prueba' }, { salida_id: c.id, excepcion_corte: true, motivo_excepcion: 'Prueba' }])
    })
    const ctx = await como(jt, async (cl) => (await cl.query('select wms.contexto_guia($1) c', [a.id])).rows[0].c as { ruta: { placa: string; conductor: string; fecha: string } | null; pedido: unknown })
    expect(ctx.ruta).toMatchObject({ placa: (await uno('select placa from wms.vehiculos where id = $1', [v])).placa, fecha: hoy })
    expect(ctx.ruta?.conductor).toMatch(/^Conductor /)
    expect(ctx.pedido).toBeNull()                                    // la venta manual aún no tiene pedido en la bandeja
    await como(jt, (cl) => cl.query('select wms.confirmar_ruta($1)', [r]))
    const conc = await como(jt, async (cl) => (await cl.query('select * from wms.conciliacion_carga($1)', [r])).rows as { salida_id: string; pedido_numero: string | null; codigo: string | null; listo: boolean }[])
    expect(conc).toHaveLength(2)
    expect(conc.find((x) => x.salida_id === a.id)?.pedido_numero).toBe((await salida(a.id)).pedido_numero)
    expect(conc.find((x) => x.salida_id === c.id)?.pedido_numero).toBeNull()
    expect(conc.every((x) => x.listo)).toBe(true)
    for (const x of conc) await como(aux, (cl) => cl.query('select wms.cargar_bulto($1, $2)', [r, x.codigo]))
    await como(aux, (cl) => cl.query('select wms.guardar_checklist_vehicular($1, $2::jsonb)', [r, JSON.stringify([{ item: 'Vehículo limpio', ok: true, nota: '' }])]))
    await como(jt, (cl) => cl.query('select wms.liberar_unidad($1)', [r]))
    expect([await stockDe(a.prod), await stockDe(c.prod)]).toEqual([100, 100])
    await como(jt, (cl) => cl.query('select wms.confirmar_salida_ruta($1)', [r]))
    expect([await stockDe(a.prod), await stockDe(c.prod)]).toEqual([90, 97])
    expect([(await salida(a.id)).estado, (await salida(c.id)).estado]).toEqual(['CONFIRMADA', 'CONFIRMADA'])
    expect(await uno('select wms._entrega_de_salida($1) f', [a.id])).toMatchObject({ f: expect.anything() })
  })

  it('si el pedido de la venta manual llega después por la bandeja, se une y la parada de la ruta sigue valiendo (ahora también del pedido)', async () => {
    const a = await ordenA(10)
    const v = await veh(); const cd = await cond(); const r = await nuevaRuta(en(9), v, cd)
    await planificar(jt, r, en(9), v, cd, [{ salida_id: a.id }])
    const numero = (await salida(a.id)).pedido_numero as string
    const prodCod = (await uno('select codigo from catalogo.productos where id = $1', [a.prod])).codigo as string
    const ped: PedidoSnapshot = {
      pedidoId: `ro-${randomUUID().slice(0, 6)}`, numero, version: 1, estado: 'READY_FOR_OPERATIONS', fecha: hoy, modificadoEn: `${hoy}T10:00:00Z`,
      cliente: { id: 'c-1', nombre: 'Botica Salud SAC', ruc: '20123456789', ubigeo: '040101', direccion: 'Jr. Cusco 45', distrito: 'Arequipa' },
      lineas: [{ lineaId: 'l-1', productoCodigo: prodCod, descripcion: 'Producto', cantidad: 10 }],
    }
    await como(jt, (c) => c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, null)', ['sa6.test', JSON.stringify([ped])]))
    expect((await q('select id from wms.salidas where wms._numero_pedido_norm(pedido_numero) = wms._numero_pedido_norm($1) and estado <> $2', [numero, 'CANCELADA']))).toHaveLength(1)
    const ps = await paradasVivas(r)
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ salida_id: a.id, pedido_id: ped.pedidoId })
    expect(ps[0].pedido_despacho_id).not.toBeNull()
    const ctx = await como(jt, async (cl) => (await cl.query('select wms.contexto_guia($1) c', [a.id])).rows[0].c as { pedido: { numero: string; ruc: string } | null; ruta: { numero: string } | null })
    expect(ctx.pedido).toMatchObject({ numero, ruc: '20123456789' })
    expect(ctx.ruta).not.toBeNull()
    // se puede volver a guardar la ruta con el pedido o con la orden: es la misma parada
    await planificar(jt, r, en(9), v, cd, [{ pedido_id: ped.pedidoId }], 'La parada ahora es del pedido')
    expect((await paradasVivas(r)).map((p) => p.salida_id)).toEqual([a.id])
    await planificar(jt, r, en(9), v, cd, [{ salida_id: a.id }], 'Con la orden otra vez')
    expect((await paradasVivas(r)).map((p) => p.pedido_id)).toEqual([ped.pedidoId])
    expect((await salida(a.id)).estado).toBe('ABIERTA')
  })
})

describe('tipo B: entrega al transportista del cliente', () => {
  async function ordenBLista(cantidad = 8) {
    const prod = await producto(); const lote = await sembrar(prod, 'A-14.2', 60, diph)
    const id = await manual(jt, 'B', 'VENTA', diph, [{ producto_id: prod, cantidad, lote_id: lote }], { gre: gre(), archivo: 'gre-cliente/x.pdf' })
    return { id, prod, lote, cantidad }
  }
  const entregar = (quien: string, id: string, o: Partial<{ trans: string | null; placa: string | null; dni: string | null; hora: string; entrega: string | null; cargo: string | null }> = {}) =>
    como(quien, async (c) => (await c.query('select wms.registrar_entrega_transportista_cliente($1, $2, $3, $4, $5, $6, $7, $8, null) id',
      [id, o.trans === undefined ? 'Transportes Andes SAC' : o.trans, o.placa === undefined ? 'ABC-123' : o.placa, o.dni === undefined ? null : o.dni, o.hora ?? new Date(Date.now() - 60_000).toISOString(),
        o.entrega === undefined ? 'Charlie Almacén' : o.entrega, o.cargo === undefined ? 'cargo-entrega/foto.jpg' : o.cargo, o.cargo === null ? null : 'foto.jpg'])).rows[0].id as string)

  it('registra transportista, placa, hora y quién entrega; confirma la salida: el stock baja y la orden queda entregada', async () => {
    const b = await ordenBLista(8)
    await prepararOrden(b.id, b.lote, 8, (await salida(b.id)).gre_numero as string, 'gre-cliente/x.pdf').catch(() => undefined)
    expect(await stockDe(b.prod)).toBe(60)
    const e = await entregar(ja, b.id)
    expect(await uno('select * from wms.entregas_transportista_cliente where id = $1', [e])).toMatchObject({ salida_id: b.id, transportista: 'Transportes Andes SAC', placa: 'ABC-123', entrega_almacen: 'Charlie Almacén', cargo_archivo: 'cargo-entrega/foto.jpg', registrada_por: ja })
    expect((await salida(b.id)).estado).toBe('CONFIRMADA')
    expect(await stockDe(b.prod)).toBe(52)
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'entrega_transportista_cliente' and entidad_id = $1`, [b.id])).n).toBe(1)
    // repetir devuelve la misma entrega y no descuenta dos veces
    expect(await entregar(ja, b.id)).toBe(e)
    expect(await stockDe(b.prod)).toBe(52)
    // no se edita ni se borra
    await expect(base.admin.query('delete from wms.entregas_transportista_cliente where id = $1', [e])).rejects.toThrow(/inmutable/i)
  })

  it('valida lo que se escribe y quién puede: el auxiliar no; placa o DNI; DNI de 8 números; hora no futura; solo tipo B; lista para entregar', async () => {
    const b = await ordenBLista(4)
    expect((await falla(entregar(ja, b.id))).message).toMatch(/todavía no está lista para entregarse/)
    await prepararOrden(b.id, b.lote, 4, 'T001-00000999', 'gre-cliente/y.pdf').catch(() => undefined)
    // si la GRE ya estaba registrada por la preparación, sigue lista
    for (const quien of [aux, sandra, muestras, base.personas.sinRol.id]) expect((await falla(entregar(quien, b.id))).message, quien).toMatch(/Solo el Jefe de Transporte o el Jefe de Almacén|Sesión|permiso/i)
    expect((await falla(entregar(ja, b.id, { trans: ' ' }))).message).toBe('Escribe el nombre del transportista (o de quien recoge)')
    expect((await falla(entregar(ja, b.id, { placa: null, dni: null }))).message).toBe('Escribe la placa del vehículo o el DNI de quien recoge')
    expect((await falla(entregar(ja, b.id, { placa: null, dni: '123' }))).message).toBe('El DNI tiene 8 números')
    expect((await falla(entregar(ja, b.id, { hora: new Date(Date.now() + 3_600_000).toISOString() }))).message).toBe('La hora de la entrega no puede ser futura')
    expect((await falla(entregar(ja, b.id, { entrega: '' }))).message).toBe('Escribe quién entrega por parte del almacén')
    expect(await stockDe(b.prod)).toBe(60)
    const ok = await entregar(jt, b.id, { placa: null, dni: '40123456', cargo: null })
    expect((await uno('select cargo_archivo, documento_recoge from wms.entregas_transportista_cliente where id = $1', [ok]))).toMatchObject({ cargo_archivo: null, documento_recoge: '40123456' })
    // una venta de distribución no usa este camino
    const a = await ordenA()
    expect((await falla(entregar(jt, a.id))).message).toMatch(/solo para una orden por cuenta de un cliente/)
  })
})

describe('re-ejecución y permisos', () => {
  it('la migración 0030 se puede volver a aplicar sola y en cadena (0028, 0029, 0030) sin romper nada ni dejar avisos de objetos inexistentes', async () => {
    const avisos: string[] = []
    base.admin.on('notice', (m) => avisos.push(String(m.message)))
    await base.admin.query(SQL.m0030())
    await base.admin.query(SQL.m0028()); await base.admin.query(SQL.m0029()); await base.admin.query(SQL.m0030())
    base.admin.removeAllListeners('notice')
    expect(avisos.filter((m) => /does not exist/.test(m))).toEqual([])
    // sigue funcionando: una parada por orden y la entrega
    const a = await ordenA(); const v = await veh(); const cd = await cond(); const r = await nuevaRuta(en(10), v, cd)
    expect((await planificar(jt, r, en(10), v, cd, [{ salida_id: a.id }])).paradas).toBe(1)
    expect(await uno(`select pg_get_functiondef('wms.confirmar_salida(uuid,text)'::regprocedure) d`)).toMatchObject({ d: expect.stringContaining('_confirmar_salida_nucleo') })
  })

  it('las funciones nuevas: el núcleo no se llama desde la aplicación; la entrega solo la ejecuta quien inició sesión', async () => {
    expect((await falla(como(jt, (c) => c.query(`select wms._confirmar_salida_nucleo($1, null)`, [randomUUID()])))).code).toBe('42501')
    const p = await uno(`select has_function_privilege('authenticated', 'wms.registrar_entrega_transportista_cliente(uuid,text,text,text,timestamptz,text,text,text,text)', 'execute') a,
                                has_function_privilege('public', 'wms.registrar_entrega_transportista_cliente(uuid,text,text,text,timestamptz,text,text,text,text)', 'execute') p`)
    expect(p).toEqual({ a: true, p: false })
  })
})
