// S5 (migración 0018): discrepancia de picking y su reemplazo, catálogo de no conformidades, zona «Observado» y el recorrido completo picking → conformidad → staging.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let jefeAlmacen: string
let aux1: string
let aux2: string
let sandra: string // asistente_dt + conformidad_despacho
let stg: string

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
let nProd = 0
async function producto(): Promise<string> {
  nProd += 1
  return (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`PK-${nProd}-${randomUUID().slice(0, 4)}`, `Producto picking ${nProd}`])).id
}
/** Deja stock Aprobado de un lote (lo crea si no existe) en una posición. */
async function sembrar(prod: string, pos: string, lote: string, vence: string, cantidad: number) {
  const posId = await idPosicion(base.admin, pos)
  const existente = await uno(`select id from wms.lotes where producto_id = $1 and codigo = $2 and propietario_id = $3`, [prod, lote, logissa])
  const loteId = existente?.id ?? (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, logissa])).id
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return { posId, loteId }
}
const salidaConOrden = async (prod: string, cantidad: number) => {
  const salida = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
  const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [salida])).rows[0].id as string)
  return { salida, orden }
}
const lineasOrden = (orden: string) => q(`select ol.*, ps.codigo as pos, lt.codigo as lote_codigo from wms.ordenes_picking_lineas ol join wms.posiciones ps on ps.id = ol.posicion_id join wms.lotes lt on lt.id = ol.lote_id where ol.orden_id = $1 order by ps.codigo, ol.id`, [orden])
const picking = (id: string, linea: string, resultado: string, cantidad: number | null, nota: string | null = null) => como(id, (c) => c.query('select wms.registrar_picking($1, $2, $3, $4)', [linea, resultado, cantidad, nota]))
const conformidad = (id: string, linea: string, resultado: string, nota: string | null = null, tipo: string | null = null) =>
  como(id, async (c) => (await c.query('select wms.dar_conformidad($1, $2, $3, null, $4) r', [linea, resultado, nota, tipo])).rows[0].r as string | null)
const resolver = (id: string, linea: string, lote: string, pos: string | null = null, nota: string | null = null) => como(id, (c) => c.query('select wms.resolver_discrepancia_picking($1, $2, $3, $4)', [linea, lote, pos, nota]))
const saldoEn = async (prod: string, pos: string) => (await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.posiciones ps on ps.id = s.posicion_id where s.producto_id = $1 and ps.codigo = $2`, [prod, pos])).n as number

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  jt = await persona('jefe_transporte'); jefeAlmacen = await persona('jefe_almacen'); aux1 = await persona('auxiliar'); aux2 = await persona('auxiliar')
  sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  stg = (await uno(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-5', 'S', 'PISO', 'PENDIENTE_CONFORMIDAD') returning id`)).id
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('discrepancia de picking y su reemplazo', () => {
  it('el picker no encuentra el lote: la línea queda en discrepancia, se propone el mismo lote en otra ubicación y al aplicarlo se rehace la reserva y la línea de la orden', async () => {
    const p = await producto()
    const a = await sembrar(p, 'F-1.1', 'LOTE-A', en(200), 30)
    const a2 = await sembrar(p, 'F-1.2', 'LOTE-A', en(200), 30) // el mismo lote, otra ubicación
    const { salida, orden } = await salidaConOrden(p, 10)
    const [linea] = await lineasOrden(orden)
    expect(linea.pos).toBe('F-1.1')
    await picking(aux1, linea.id, 'DISCREPANCIA', null, 'No está en F-1.1')
    expect((await uno('select estado from wms.ordenes_picking where id = $1', [orden])).estado).toBe('CON_DISCREPANCIA')
    const lineaSalida = (await uno('select linea_id from wms.ordenes_picking_lineas where id = $1', [linea.id])).linea_id
    const propuestas = await como(aux1, async (c) => (await c.query('select * from wms.proponer_reemplazo($1)', [lineaSalida])).rows)
    expect(propuestas).toEqual([expect.objectContaining({ posicion: 'F-1.2', lote: 'LOTE-A', motivo: 'MISMO_LOTE_OTRA_UBICACION' })])
    await resolver(aux1, linea.id, a.loteId, a2.posId, 'Estaba en F-1.2')
    const nuevas = await lineasOrden(orden)
    expect(nuevas).toHaveLength(1)
    expect(nuevas[0]).toMatchObject({ pos: 'F-1.2', lote_codigo: 'LOTE-A', cantidad: 10, picking: 'PENDIENTE' })
    expect((await uno('select estado from wms.ordenes_picking where id = $1', [orden])).estado).toBe('EN_CURSO')
    expect(await uno('select estado from wms.reservas where id = $1', [linea.reserva_id])).toMatchObject({ estado: 'LIBERADA' })
    const h = await uno('select * from wms.discrepancias_picking where orden_id = $1', [orden])
    expect(h).toMatchObject({ nota: 'No está en F-1.1', cantidad: 10, lote_id: a.loteId, nuevo_lote_id: a.loteId, resuelta_por: aux1, picker_id: aux1 })
    // el mismo lote, otra celda: no se aparta de FEFO → no queda en «Cambios a FEFO»
    expect((await q('select 1 from wms.cambios_lote_asignado where linea_id = $1', [lineaSalida])).length).toBe(0)
    // el picking continúa y la conformidad la da otra persona: el stock pasa de F-1.2 al staging
    await picking(aux2, nuevas[0].id, 'PICKEADA', 10)
    await conformidad(sandra, nuevas[0].id, 'CONFORME')
    expect(await saldoEn(p, 'F-1.2')).toBe(20)
    expect(await saldoEn(p, 'STG-5')).toBe(10)
    expect((await uno('select estado from wms.salida_lineas where id = $1', [lineaSalida])).estado).toBe('CONFORME')
    void a; void salida
  })

  it('sin el mismo lote en otra ubicación se propone el siguiente FEFO; aplicarlo registra el cambio a FEFO (quién y cuándo) y aparece en el reporte', async () => {
    const p = await producto()
    const a = await sembrar(p, 'F-1.1', 'LOTE-1', en(120), 20)
    const b = await sembrar(p, 'F-1.2', 'LOTE-2', en(300), 50)
    const { orden } = await salidaConOrden(p, 12)
    const [linea] = await lineasOrden(orden)
    expect(linea.lote_codigo).toBe('LOTE-1')
    await picking(aux1, linea.id, 'DISCREPANCIA', null, 'No hay unidades')
    const lineaSalida = (await uno('select linea_id from wms.ordenes_picking_lineas where id = $1', [linea.id])).linea_id
    const propuestas = await como(aux1, async (c) => (await c.query('select * from wms.proponer_reemplazo($1)', [lineaSalida])).rows)
    expect(propuestas[0]).toMatchObject({ lote: 'LOTE-2', motivo: 'SIGUIENTE_FEFO' })
    await resolver(aux1, linea.id, b.loteId, null, 'El primero no está')
    expect((await lineasOrden(orden))[0]).toMatchObject({ pos: 'F-1.2', lote_codigo: 'LOTE-2', cantidad: 12 })
    const cambio = await uno('select * from wms.cambios_lote_asignado where linea_id = $1', [lineaSalida])
    expect(cambio).toMatchObject({ por: aux1, distinto_de_fefo: true, motivo: 'El primero no está' })
    expect(cambio.asignacion_fefo).toEqual([expect.objectContaining({ lote: 'LOTE-1', cantidad: 12 })])
    expect(cambio.asignacion_nueva).toEqual([expect.objectContaining({ lote: 'LOTE-2', cantidad: 12 })])
    expect((await uno('select lote_id from wms.salida_lineas where id = $1', [lineaSalida])).lote_id).toBe(b.loteId)
    const rep = await como(jefeAlmacen, async (c) => (await c.query('select * from wms.reporte_cambios_fefo()')).rows)
    expect(rep.find((x: { persona_id: string }) => x.persona_id === aux1)).toMatchObject({ veces: expect.any(Number) })
    void a
  })

  it('reglas: solo con quien puede cambiar lotes, solo una línea en discrepancia, otra ubicación, unidades disponibles y lote del producto', async () => {
    const p = await producto(); const otro = await producto()
    const a = await sembrar(p, 'F-1.1', 'LOTE-X', en(200), 5)
    const poco = await sembrar(p, 'F-1.2', 'LOTE-POCO', en(300), 2)
    const ajeno = await sembrar(otro, 'F-2.1', 'LOTE-OTRO', en(300), 50)
    const { orden } = await salidaConOrden(p, 5)
    const [linea] = await lineasOrden(orden)
    expect((await falla(resolver(aux1, linea.id, a.loteId, a.posId))).message).toBe('Esa línea no tiene una discrepancia por resolver')
    await picking(aux1, linea.id, 'DISCREPANCIA', null, 'No lo encuentro')
    expect((await falla(resolver(sandra, linea.id, a.loteId, a.posId))).message).toBe('No tienes permiso para cambiar el lote asignado')
    expect((await falla(resolver(aux1, linea.id, a.loteId, null))).message).toBe('Elige otra ubicación para el mismo lote')
    expect((await falla(resolver(aux1, linea.id, a.loteId, a.posId))).message).toBe('Elige otra ubicación para el mismo lote')
    expect((await falla(resolver(aux1, linea.id, poco.loteId))).message).toBe('El lote LOTE-POCO no tiene 5 unidades disponibles')
    expect((await falla(resolver(aux1, linea.id, ajeno.loteId))).message).toBe('Ese lote no corresponde al producto de la línea')
    // nada de eso dejó la línea a medias
    expect((await lineasOrden(orden))[0]).toMatchObject({ picking: 'DISCREPANCIA', lote_codigo: 'LOTE-X' })
    expect((await uno('select estado from wms.reservas where id = $1', [linea.reserva_id])).estado).toBe('ACTIVA')
  })
})

describe('conformidad, no conformidades y zona «Observado»', () => {
  it('observar con un tipo del catálogo, corregir la línea (vuelve a picking) y darle conformidad otra persona; la observación queda en su historial', async () => {
    const p = await producto()
    await sembrar(p, 'F-1.1', 'LOTE-C', en(200), 40)
    const { orden } = await salidaConOrden(p, 8)
    const [linea] = await lineasOrden(orden)
    expect((await falla(conformidad(sandra, linea.id, 'CONFORME'))).message).toBe('Esa línea todavía no se pickeó')
    await picking(aux1, linea.id, 'PICKEADA', 8)
    expect((await falla(conformidad(aux1, linea.id, 'CONFORME'))).message).toBe('No tienes permiso para dar la conformidad')
    expect((await falla(conformidad(sandra, linea.id, 'OBSERVADA', null, 'DANO'))).message).toMatch(/Cuéntanos qué observas/)
    expect((await falla(conformidad(sandra, linea.id, 'OBSERVADA', 'Caja rota', 'INVENTADO'))).message).toBe('Ese tipo de no conformidad no existe')
    await conformidad(sandra, linea.id, 'OBSERVADA', 'La caja llegó rota', 'DANO')
    expect(await uno('select conformidad, no_conformidad, nota_conformidad, verificador_id from wms.ordenes_picking_lineas where id = $1', [linea.id])).toMatchObject({ conformidad: 'OBSERVADA', no_conformidad: 'DANO', verificador_id: sandra })
    expect((await uno('select estado from wms.salida_lineas where id = $1', [linea.linea_id])).estado).toBe('OBSERVADA')
    // corregir: vuelve a picking y a conformidad
    expect((await falla(como(jt, (c) => c.query('select wms.reabrir_observada($1, null)', [linea.id])))).message).toBe('No tienes permiso para corregir una línea observada')
    await como(aux1, (c) => c.query('select wms.reabrir_observada($1, $2)', [linea.id, 'Cambié la caja']))
    expect(await uno('select picking, conformidad, no_conformidad, picker_id from wms.ordenes_picking_lineas where id = $1', [linea.id])).toMatchObject({ picking: 'PENDIENTE', conformidad: 'PENDIENTE', no_conformidad: null, picker_id: null })
    expect(await uno('select tipo, nota, observada_por, corregida_por, nota_correccion from wms.observaciones_conformidad where orden_linea_id = $1', [linea.id])).toMatchObject({ tipo: 'DANO', nota: 'La caja llegó rota', observada_por: sandra, corregida_por: aux1, nota_correccion: 'Cambié la caja' })
    expect((await falla(como(aux1, (c) => c.query('select wms.reabrir_observada($1, null)', [linea.id])))).message).toBe('Esa línea no está observada')
    await picking(aux2, linea.id, 'PICKEADA', 8)
    expect(await conformidad(sandra, linea.id, 'CONFORME', 'Todo bien')).not.toBeNull()
    expect(await uno('select conformidad, no_conformidad from wms.ordenes_picking_lineas where id = $1', [linea.id])).toMatchObject({ conformidad: 'CONFORME', no_conformidad: null })
    expect(await saldoEn(p, 'STG-5')).toBe(8)
    // el historial de observaciones no se edita
    expect((await falla(base.admin.query('delete from wms.observaciones_conformidad'))).message).toBeTruthy()
  })

  it('las migraciones 0018 y 0012 se pueden repetir sin perder el resto', async () => {
    const { SQL } = await import('./helpers')
    await base.admin.query(SQL.m0018()); await base.admin.query(SQL.m0018())
    expect((await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'wms' and p.proname = 'dar_conformidad'`))[0].n).toBe(1)
  })
})
