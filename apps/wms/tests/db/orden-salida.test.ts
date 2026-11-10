// OS-2 (migración 0023): Orden de Salida OS-AAAA-NNNNN, quién picó, conformidad de toda la orden (con ajustes por línea) y número de bultos.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux1: string
let aux2: string
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
  return (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`OS-${n}-${randomUUID().slice(0, 4)}`, `Producto orden ${n}`])).id as string
}
async function sembrar(prod: string, pos: string, lote: string, vence: string, cantidad: number) {
  const posId = await idPosicion(base.admin, pos)
  const existente = await uno(`select id from wms.lotes where producto_id = $1 and codigo = $2 and propietario_id = $3`, [prod, lote, logissa])
  const loteId = existente?.id ?? (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, logissa])).id
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return loteId as string
}
const saldoEn = async (prod: string, codigoPos: string) => Number((await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.posiciones p on p.id = s.posicion_id where s.producto_id = $1 and p.codigo = $2`, [prod, codigoPos])).n)
const saldoEnZona = async (prod: string, area: string) => Number((await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.posiciones p on p.id = s.posicion_id where s.producto_id = $1 and p.tipo_area = $2`, [prod, area])).n)

/** Orden de Salida con la orden de picking generada (impresa), sin picker salvo que se indique. */
async function orden(prod: string, cantidad: number, opciones: { picker?: string | null; referencia?: [string, string]; asignar?: boolean } = {}) {
  const ref = opciones.referencia ?? [null, null]
  const salida = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb, $3, $4) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }]), ref[0], ref[1]])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
  const op = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1, $2) id', [salida, opciones.picker === undefined ? null : opciones.picker])).rows[0].id as string)
  const lineas = await q('select id, lote_id, cantidad, reserva_id from wms.ordenes_picking_lineas where orden_id = $1 order by orden_recorrido nulls last, id', [op])
  const numero = (await uno('select numero from wms.salidas where id = $1', [salida])).numero as string
  return { salida, op, lineas, numero }
}
const conformar = (quien: string, op: string, lineas: unknown[] | null = null, bultos: number | null = 1, nota: string | null = null) =>
  como(quien, async (c) => (await c.query('select wms.conformar_orden($1, $2::jsonb, $3, $4) r', [op, lineas === null ? null : JSON.stringify(lineas), bultos, nota])).rows[0].r as Record<string, unknown>)
const pedidoConUbigeo = async (ubigeo: string | null) => {
  const id = `ped-${randomUUID().slice(0, 8)}`
  await base.admin.query(
    `insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, snapshot, importado_por) values ($1, 1, $2, current_date, 'c1', 'Cliente', $3::jsonb, $4)`,
    [id, `PED-${id}`, JSON.stringify({ cliente: { id: 'c1', nombre: 'Cliente', ...(ubigeo ? { ubigeo } : {}) } }), jt])
  return id
}

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  dt = base.personas.katia.id
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); aux2 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-10', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-10' where clave = 'posicion_despacho_defecto'`)
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('la Orden de Salida y quién pica', () => {
  it('el correlativo es OS-AAAA-NNNNN', async () => {
    const p = await producto(); await sembrar(p, 'F-1.1', 'OS-A', en(300), 10)
    const o = await orden(p, 2)
    expect(o.numero).toMatch(/^OS-\d{4}-\d{5}$/)
  })

  it('se elige quién pica al imprimir o después; tiene que ser auxiliar, Jefe de Almacén o de Transporte', async () => {
    const p = await producto(); await sembrar(p, 'F-1.2', 'OS-B', en(300), 10)
    const sinPicker = await orden(p, 2)
    expect((await uno('select picker_id from wms.ordenes_picking where id = $1', [sinPicker.op])).picker_id).toBeNull()
    expect((await falla(como(sandra, (c) => c.query('select wms.designar_picker($1, $2)', [sinPicker.op, aux1])))).message).toMatch(/No tienes permiso para indicar quién hace el picking/)
    expect((await falla(como(jt, (c) => c.query('select wms.designar_picker($1, $2)', [sinPicker.op, sandra])))).message).toMatch(/auxiliar, Jefe de Almacén o Jefe de Transporte/)
    await como(jt, (c) => c.query('select wms.designar_picker($1, $2)', [sinPicker.op, aux1]))
    expect(await uno('select picker_id, picker_designado_por from wms.ordenes_picking where id = $1', [sinPicker.op])).toMatchObject({ picker_id: aux1, picker_designado_por: jt })
    // al imprimir (generar) también se puede elegir, y imprimir otra vez no duplica la orden
    const p2 = await producto(); await sembrar(p2, 'F-1.3', 'OS-B2', en(300), 10)
    const conPicker = await orden(p2, 2, { picker: aux2 })
    expect((await uno('select picker_id from wms.ordenes_picking where id = $1', [conPicker.op])).picker_id).toBe(aux2)
    expect(await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1, $2) id', [conPicker.salida, aux1])).rows[0].id)).toBe(conPicker.op)
    expect((await uno('select picker_id from wms.ordenes_picking where id = $1', [conPicker.op])).picker_id).toBe(aux1)
    expect((await falla(como(jt, (c) => c.query('select wms.generar_orden_picking($1, $2)', [conPicker.salida, sandra])))).message).toMatch(/auxiliar, Jefe de Almacén o Jefe de Transporte/)
  })

  it('con el celular, quien pickea queda como el picker de la orden', async () => {
    const p = await producto(); await sembrar(p, 'F-1.4', 'OS-C', en(300), 10)
    const o = await orden(p, 3)
    await como(aux2, (c) => c.query(`select wms.registrar_picking($1, 'PICKEADA', $2)`, [o.lineas[0].id, o.lineas[0].cantidad]))
    expect((await uno('select picker_id from wms.ordenes_picking where id = $1', [o.op])).picker_id).toBe(aux2)
    // quien pickeó por el celular tampoco da la conformidad
    await como(jt, (c) => c.query('select wms.designar_picker($1, $2)', [o.op, aux1]))
    expect((await falla(conformar(aux2, o.op))).message).toMatch(/No tienes permiso para dar la conformidad/)
  })
})

describe('conformidad de toda la orden', () => {
  it('«Conforme» con un click: el stock pasa a Despacho, quedan los bultos y la orden queda conforme; quien picó no puede dar la conformidad', async () => {
    const p = await producto(); await sembrar(p, 'F-2.1', 'CF-A', en(300), 30)
    const o = await orden(p, 12, { picker: aux1 })
    expect((await falla(conformar(sandra, o.op, null, null))).message).toMatch(/número de bultos/)
    expect((await falla(conformar(sandra, o.op, null, 0))).message).toMatch(/número de bultos/)
    expect((await falla(conformar(aux1, o.op))).message).toMatch(/No tienes permiso para dar la conformidad/)
    // la misma persona con permiso de conformidad que además fue la picker
    const doble = await persona(['auxiliar', 'conformidad_despacho'])
    await como(jt, (c) => c.query('select wms.designar_picker($1, $2)', [o.op, doble]))
    expect((await falla(conformar(doble, o.op))).message).toMatch(/otra persona, no quien hizo el picking/)
    await como(jt, (c) => c.query('select wms.designar_picker($1, $2)', [o.op, aux1]))
    const r = await conformar(sandra, o.op, null, 2, 'Todo coincide')
    expect(r).toMatchObject({ unidades: 12, bultos: 2, ajustes: 0 })
    expect(await saldoEn(p, 'F-2.1')).toBe(18)
    expect(await saldoEn(p, 'STG-10')).toBe(12)
    expect(await saldoEnZona(p, 'DESPACHO')).toBe(12)
    expect(await uno('select estado, bultos_conformidad, conformada_por from wms.salidas where id = $1', [o.salida])).toMatchObject({ bultos_conformidad: 2, conformada_por: sandra })
    expect((await uno('select estado from wms.salida_lineas where salida_id = $1', [o.salida])).estado).toBe('CONFORME')
    expect(await uno('select estado, picker_id from wms.ordenes_picking where id = $1', [o.op])).toMatchObject({ estado: 'COMPLETA', picker_id: aux1 })
    expect(await q(`select conformidad, verificador_id, picking, picker_id from wms.ordenes_picking_lineas where orden_id = $1`, [o.op])).toEqual([{ conformidad: 'CONFORME', verificador_id: sandra, picking: 'PICKEADA', picker_id: aux1 }])
    expect((await falla(conformar(sandra, o.op))).message).toMatch(/ya tiene su conformidad/)
    expect((await uno('select count(*)::int n from wms.verificar_saldos()')).n).toBe(0)
  })

  it('sin quién pica no hay conformidad', async () => {
    const p = await producto(); await sembrar(p, 'F-2.2', 'CF-B', en(300), 30)
    const o = await orden(p, 5)
    expect((await falla(conformar(sandra, o.op))).message).toMatch(/se indica quién hizo el picking/)
  })

  it('el stock sale solo al confirmar la salida y desde Despacho (el Kardex descuenta una vez)', async () => {
    const p = await producto(); await sembrar(p, 'F-2.3', 'CF-C', en(300), 30)
    const o = await orden(p, 10, { picker: aux1 })
    await conformar(sandra, o.op, null, 1)
    expect(await saldoEnZona(p, 'DESPACHO')).toBe(10)
    await como(jt, (c) => c.query('select wms.confirmar_salida($1)', [o.salida]))
    expect(await saldoEnZona(p, 'DESPACHO')).toBe(0)
    expect(await saldoEn(p, 'F-2.3')).toBe(20)
  })

  it('menos cantidad: se registra el ajuste, solo pasa a Despacho lo encontrado y lo demás queda libre', async () => {
    const p = await producto(); await sembrar(p, 'F-2.4', 'CF-D', en(300), 30)
    const o = await orden(p, 10, { picker: aux1 })
    const e = async (l: unknown) => (await falla(conformar(sandra, o.op, [l], 1))).message
    expect(await e({ orden_linea_id: o.lineas[0].id, resultado: 'MENOS', cantidad: 10 })).toMatch(/más de cero y menos de las 10/)
    expect(await e({ orden_linea_id: o.lineas[0].id, resultado: 'MENOS' })).toMatch(/más de cero y menos de las 10/)
    expect(await e({ orden_linea_id: o.lineas[0].id, resultado: 'INVENTADO' })).toMatch(/Conforme, Otro lote, Menos cantidad o No lo encontré/)
    expect(await e({ orden_linea_id: randomUUID(), resultado: 'CONFORME' })).toMatch(/no es de esta Orden de Salida/)
    expect(await saldoEn(p, 'F-2.4')).toBe(30)       // nada se movió: todo o nada
    const r = await conformar(sandra, o.op, [{ orden_linea_id: o.lineas[0].id, resultado: 'MENOS', cantidad: 7, nota: 'Faltaban 3' }], 1)
    expect(r).toMatchObject({ unidades: 7, ajustes: 1 })
    expect(await saldoEn(p, 'STG-10')).toBe(7)
    expect(await saldoEn(p, 'F-2.4')).toBe(23)
    expect(await uno(`select tipo, cantidad_antes, cantidad_despues, nota, por from wms.ajustes_conformidad where orden_id = $1`, [o.op])).toMatchObject({ tipo: 'MENOS', cantidad_antes: 10, cantidad_despues: 7, nota: 'Faltaban 3', por: sandra })
    expect((await uno(`select sum(cantidad)::int n from wms.reservas r where r.linea_id = (select linea_id from wms.ordenes_picking_lineas where id = $1) and estado = 'EN_STAGING'`, [o.lineas[0].id])).n).toBe(7)
    // la guía y el embalaje parten de lo confirmado: 7
    expect((await q('select cantidad from wms._confirmado_por_lote($1)', [o.salida])).map((x) => x.cantidad)).toEqual([7])
  })

  it('no lo encontré: la línea queda en cero (historia), sus unidades no pasan a Despacho y no cuentan en lo confirmado; si no queda nada conforme, no se registra la conformidad', async () => {
    const p = await producto(); await sembrar(p, 'F-5.1', 'CF-E', en(300), 20)
    const o = await orden(p, 8, { picker: aux1 })
    const e = await falla(conformar(sandra, o.op, [{ orden_linea_id: o.lineas[0].id, resultado: 'NO_ENCONTRADO', nota: 'No estaba' }], 1))
    expect(e.message).toMatch(/Ninguna línea quedó conforme/)
    expect(await saldoEn(p, 'F-5.1')).toBe(20)
    expect((await uno('select conformidad, cantidad from wms.ordenes_picking_lineas where id = $1', [o.lineas[0].id])).conformidad).toBe('PENDIENTE')   // todo se deshizo
    // con dos líneas de lotes distintos: una no se encuentra y la otra sí
    const p2 = await producto()
    await sembrar(p2, 'F-5.2', 'CF-F1', en(100), 5); await sembrar(p2, 'F-5.3', 'CF-F2', en(200), 20)
    const o2 = await orden(p2, 12, { picker: aux1 })
    expect(o2.lineas).toHaveLength(2)
    const faltante = o2.lineas.find((l) => l.cantidad === 5)!
    const r = await conformar(sandra, o2.op, [{ orden_linea_id: faltante.id, resultado: 'NO_ENCONTRADO', nota: 'No estaba' }], 1)
    expect(r).toMatchObject({ unidades: 7, ajustes: 1 })
    expect(await uno('select cantidad, conformidad from wms.ordenes_picking_lineas where id = $1', [faltante.id])).toMatchObject({ cantidad: 0, conformidad: 'CONFORME' })
    expect((await q('select cantidad from wms._confirmado_por_lote($1)', [o2.salida])).map((x) => x.cantidad)).toEqual([7])
    expect((await q(`select estado from wms.reservas where linea_id = (select linea_id from wms.ordenes_picking_lineas where id = $1) order by estado`, [faltante.id])).map((x) => x.estado)).toEqual(['EN_STAGING', 'LIBERADA'])
    expect(await saldoEn(p2, 'F-5.2')).toBe(5)
  })

  it('otro lote: el vencimiento sale del lote nuevo, queda el ajuste y el cambio a FEFO; las reglas del lote (Aprobado, sin Reserva, mismo producto, 60 días) se respetan', async () => {
    const p = await producto()
    const primero = await sembrar(p, 'F-3.1', 'OL-1', en(100), 10)
    const segundo = await sembrar(p, 'F-3.2', 'OL-2', en(400), 10)
    const corto = await sembrar(p, 'F-3.3', 'OL-CORTO', en(20), 10)         // 20 días: una venta no lo toma
    const otroProd = await sembrar(await producto(), 'F-3.4', 'OL-OTRO', en(400), 10)
    const o = await orden(p, 6, { picker: aux1 })
    expect(o.lineas[0].lote_id).toBe(primero)
    const e = async (l: unknown) => (await falla(conformar(sandra, o.op, [l], 1))).message
    expect(await e({ orden_linea_id: o.lineas[0].id, resultado: 'OTRO_LOTE' })).toMatch(/Elige el lote que encontraste/)
    expect(await e({ orden_linea_id: o.lineas[0].id, resultado: 'OTRO_LOTE', lote_id: primero })).toMatch(/Es el mismo lote/)
    expect(await e({ orden_linea_id: o.lineas[0].id, resultado: 'OTRO_LOTE', lote_id: otroProd })).toMatch(/no corresponde al producto/)
    expect(await e({ orden_linea_id: o.lineas[0].id, resultado: 'OTRO_LOTE', lote_id: corto })).toMatch(/vence en 20 días: un pedido de venta pide al menos 60/)
    await como(dt, (c) => c.query('select wms.aplicar_reserva_lote($1, $2)', [segundo, 'calidad']))
    expect(await e({ orden_linea_id: o.lineas[0].id, resultado: 'OTRO_LOTE', lote_id: segundo })).toMatch(/está en Reserva: no se puede usar/)
    await como(dt, (c) => c.query('select wms.quitar_reserva_lote($1, $2)', [segundo, 'ok']))
    const r = await conformar(sandra, o.op, [{ orden_linea_id: o.lineas[0].id, resultado: 'OTRO_LOTE', lote_id: segundo, nota: 'Encontré el de vencimiento más largo' }], 1)
    expect(r).toMatchObject({ unidades: 6, ajustes: 1 })
    expect(await saldoEn(p, 'F-3.1')).toBe(10)       // el lote original no se tocó
    expect(await saldoEn(p, 'F-3.2')).toBe(4)
    expect(await saldoEn(p, 'STG-10')).toBe(6)
    expect(await q(`select lt.codigo, lt.vence::text as vence, ol.cantidad, ol.conformidad from wms.ordenes_picking_lineas ol join wms.lotes lt on lt.id = ol.lote_id where ol.orden_id = $1 order by ol.cantidad`, [o.op]))
      .toEqual([{ codigo: 'OL-1', vence: en(100), cantidad: 0, conformidad: 'CONFORME' }, { codigo: 'OL-2', vence: en(400), cantidad: 6, conformidad: 'CONFORME' }])
    expect(await uno(`select tipo, cantidad_antes, cantidad_despues from wms.ajustes_conformidad where orden_id = $1`, [o.op])).toMatchObject({ tipo: 'OTRO_LOTE', cantidad_antes: 6, cantidad_despues: 6 })
    expect(await uno(`select distinto_de_fefo, motivo from wms.cambios_lote_asignado where linea_id = $1`, [(await uno('select linea_id from wms.ordenes_picking_lineas where id = $1', [o.lineas[0].id])).linea_id]))
      .toMatchObject({ distinto_de_fefo: true, motivo: 'Encontré el de vencimiento más largo' })
    expect((await q('select l.codigo, c.cantidad from wms._confirmado_por_lote($1) c join wms.lotes l on l.id = c.lote_id', [o.salida]))).toEqual([{ codigo: 'OL-2', cantidad: 6 }])
    expect((await uno('select count(*)::int n from wms.verificar_saldos()')).n).toBe(0)
  })

  it('los ajustes no se editan ni se borran', async () => {
    const p = await producto(); await sembrar(p, 'F-5.4', 'AJ-1', en(300), 20)
    const o = await orden(p, 8, { picker: aux1 })
    await conformar(sandra, o.op, [{ orden_linea_id: o.lineas[0].id, resultado: 'MENOS', cantidad: 5 }], 1)
    expect((await falla(base.admin.query(`update wms.ajustes_conformidad set nota = 'x' where orden_id = $1`, [o.op]))).message).toBeTruthy()
    expect((await falla(base.admin.query(`delete from wms.ajustes_conformidad where orden_id = $1`, [o.op]))).message).toBeTruthy()
  })
})

describe('bultos y embalaje solo a provincia', () => {
  it('un pedido a Lima queda con sus bultos desde la conformidad y no se embala; uno a provincia sí se embala, con los bultos de la conformidad', async () => {
    const p = await producto(); await sembrar(p, 'F-4.1', 'BL-A', en(300), 40)
    // Lima Metropolitana (ubigeo 1501xx)
    const lima = await orden(p, 6, { picker: aux1, referencia: ['pedido', await pedidoConUbigeo('150132')] })
    expect((await uno('select requiere_embalaje from wms.salidas where id = $1', [lima.salida])).requiere_embalaje).toBe(false)
    await conformar(sandra, lima.op, null, 3)
    expect(await q('select secuencia, total, codigo, estado from wms.bultos where salida_id = $1 order by secuencia', [lima.salida]))
      .toEqual([1, 2, 3].map((i) => ({ secuencia: i, total: 3, codigo: `${lima.numero}-B${i}`, estado: 'EMBALADO' })))
    expect((await q('select 1 from wms.bulto_contenido where bulto_id in (select id from wms.bultos where salida_id = $1)', [lima.salida]))).toHaveLength(0)
    expect((await falla(como(aux1, (c) => c.query('select wms.embalar_salida($1, $2::jsonb)', [lima.salida, JSON.stringify([{ contenido: [] }])])))).message).toMatch(/Este pedido va a Lima|ya está embalado/)
    expect((await falla(como(aux1, (c) => c.query('select wms.reabrir_embalaje($1, $2)', [lima.salida, 'prueba'])))).message).toMatch(/va a Lima/)
    // provincia (Arequipa 0401xx): sin bultos hasta embalar
    const prov = await orden(p, 8, { picker: aux1, referencia: ['pedido', await pedidoConUbigeo('040101')] })
    expect((await uno('select requiere_embalaje from wms.salidas where id = $1', [prov.salida])).requiere_embalaje).toBe(true)
    await conformar(sandra, prov.op, null, 2)
    expect(await q('select 1 from wms.bultos where salida_id = $1', [prov.salida])).toHaveLength(0)
    const [{ linea_id, lote_id, cantidad }] = await q('select * from wms._confirmado_por_lote($1)', [prov.salida])
    const reparto = (partes: number[]) => JSON.stringify(partes.map((c) => ({ contenido: [{ linea_id, lote_id, cantidad: c }] })))
    expect((await falla(como(aux1, (c) => c.query('select wms.embalar_salida($1, $2::jsonb)', [prov.salida, reparto([cantidad])])))).message).toMatch(/La conformidad registró 2 bultos/)
    expect(await como(aux1, async (c) => (await c.query('select wms.embalar_salida($1, $2::jsonb) n', [prov.salida, reparto([5, 3])])).rows[0].n)).toBe(2)
  })

  it('sin ubigeo (o sin pedido) se embala; con otro prefijo configurado también', async () => {
    const p = await producto(); await sembrar(p, 'F-4.2', 'BL-B', en(300), 40)
    const sin = await orden(p, 2, { referencia: ['pedido', await pedidoConUbigeo(null)] })
    expect((await uno('select requiere_embalaje from wms.salidas where id = $1', [sin.salida])).requiere_embalaje).toBe(true)
    const sinPedido = await orden(p, 2)
    expect((await uno('select requiere_embalaje from wms.salidas where id = $1', [sinPedido.salida])).requiere_embalaje).toBe(true)
    // el Callao (0701) también es Lima Metropolitana
    const callao = await orden(p, 2, { referencia: ['pedido', await pedidoConUbigeo('070101')] })
    expect((await uno('select requiere_embalaje from wms.salidas where id = $1', [callao.salida])).requiere_embalaje).toBe(false)
  })
})

describe('la migración 0023', () => {
  it('es re-ejecutable', async () => {
    const { SQL } = await import('./helpers')
    await base.admin.query(SQL.m0023())
    await base.admin.query(SQL.m0023())
    expect((await uno(`select to_regprocedure('wms.generar_orden_picking(uuid)') f`)).f).toBeNull()
  })
})
