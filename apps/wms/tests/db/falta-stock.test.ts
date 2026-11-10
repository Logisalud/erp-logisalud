// SA-3 (migración 0029): cuando falta stock — por qué falta (las cuatro causas, con cantidades), el texto de la alerta, los quiebres de stock y quién decide.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { explicarFaltante, type ExistenciaLote } from '@/domain/faltante'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux: string
let sinRol: string

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

async function persona(rol: string | null): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  if (rol) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}
let n = 0
async function producto(): Promise<{ id: string; codigo: string }> {
  n += 1
  const codigo = `FS-${n}-${randomUUID().slice(0, 4)}`
  return { id: (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [codigo, `Producto falta ${n}`])).id as string, codigo }
}
async function sembrar(prod: string, pos: string, lote: string, vence: string, cantidad: number, estado: 'APROBADO' | 'CUARENTENA' = 'APROBADO') {
  const posId = await idPosicion(base.admin, pos)
  const loteId = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, logissa])).id as string
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado, origen: estado === 'CUARENTENA' ? 'COMPRA_LOCAL' : 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return loteId
}
/** Una salida de venta de Logissa con una línea; queda SIN_STOCK o ASIGNADA según haya. */
async function salidaDe(prod: string, cantidad: number) {
  const salida = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
  const linea = await uno('select id, estado, nota_stock from wms.salida_lineas where salida_id = $1', [salida])
  const numero = (await uno('select numero from wms.salidas where id = $1', [salida])).numero as string
  return { salida, linea, numero }
}
const explicar = (quien: string, linea: string) => como(quien, async (c) => (await c.query('select wms.explicar_faltante($1) r', [linea])).rows[0].r as Record<string, unknown>)

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  jt = await persona('jefe_transporte'); aux = await persona('auxiliar'); sinRol = base.personas.sinRol.id
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('por qué falta: las cuatro causas, con cantidades', () => {
  let p: { id: string; codigo: string }
  let linea: string
  let numero: string
  const existencias: ExistenciaLote[] = []

  beforeAll(async () => {
    p = await producto()
    // 40 aprobados que sirven; 25 en Cuarentena; 10 Aprobados pero el lote está en Reserva; 5 Aprobados que vencen en 20 días (< 60); pedido de 100
    const a = await sembrar(p.id, 'F-1.1', 'APTO', en(400), 40)
    const c = await sembrar(p.id, 'A-6', 'CUAR', en(400), 25, 'CUARENTENA')
    const r = await sembrar(p.id, 'F-1.2', 'RESV', en(400), 10)
    const v = await sembrar(p.id, 'F-1.3', 'POCO', en(20), 5)
    await como(jt, (cl) => cl.query('select wms.aplicar_reserva_lote($1, $2)', [r, 'Pesquisa pendiente']))
    existencias.push(
      { loteId: a, codigo: 'APTO', vence: en(400), estado: 'APROBADO', cantidad: 40 }, { loteId: c, codigo: 'CUAR', vence: en(400), estado: 'CUARENTENA', cantidad: 25 },
      { loteId: r, codigo: 'RESV', vence: en(400), estado: 'APROBADO', cantidad: 10, reservado: true }, { loteId: v, codigo: 'POCO', vence: en(20), estado: 'APROBADO', cantidad: 5 })
    const s = await salidaDe(p.id, 100)
    linea = s.linea.id; numero = s.numero
    expect(s.linea.estado).toBe('SIN_STOCK')
  })

  it('el aviso dice pedido, disponibles y, de lo que falta, cuánto es Cuarentena, Reserva, vencimiento menor a 60 días y sin stock', async () => {
    const e = await explicar(jt, linea)
    expect(e).toMatchObject({
      pedido: 100, disponibles: 40, faltan: 60, hayFaltante: true,
      causas: { CUARENTENA: 25, RESERVA: 10, VENCIMIENTO_MENOR_60: 5, SIN_STOCK: 20 },
      existentes: { cuarentena: 25, reserva: 10, vencimiento: 5, enConteo: 0 },
    })
    expect(e.texto).toBe('Stock insuficiente: pide 100 y hay 40 disponibles. Faltan 60: 25 en Cuarentena, 10 en Reserva, 5 con vencimiento menor a 60 días y 20 sin stock.')
  })

  it('la base y el dominio dicen lo mismo (mismas reglas, mismo texto)', async () => {
    const d = explicarFaltante({ pedido: 100, hoy, existencias })
    const e = await explicar(jt, linea)
    expect(e.texto).toBe(d.texto)
    expect(e.causas).toEqual(d.causas)
    expect(e.existentes).toEqual(d.existentes)
    expect(e.disponibles).toBe(d.disponibles)
  })

  it('la nota de la línea y la alerta STOCK_INSUFICIENTE usan ese texto y dicen quién decide', async () => {
    const e = await explicar(jt, linea)
    expect((await uno('select nota_stock from wms.salida_lineas where id = $1', [linea])).nota_stock).toBe(e.texto)
    const a = await uno(`select mensaje, destinatario_rol from wms.alertas where tipo = 'STOCK_INSUFICIENTE' and clave = $1`, [`stock:${linea}`])
    expect(a.destinatario_rol).toBe('jefe_transporte')
    expect(a.mensaje).toContain(e.texto as string)
    expect(a.mensaje).toContain(numero)
    expect(a.mensaje).toMatch(/Decide el vendedor del pedido, en Pedidos: quitar o reducir la línea, o cancelar el pedido\. Copia el aviso para el vendedor/)
  })

  it('cada causa queda registrada como quiebre de stock (con su cantidad y el detalle), y la suma por causa es lo que faltó', async () => {
    const filas = await q('select causa, cantidad_pedida, cantidad_faltante, cantidad_causa, origen, detalle from wms.quiebres_stock where linea_id = $1 order by causa', [linea])
    expect(filas.map((f) => [f.causa, f.cantidad_causa])).toEqual([['CUARENTENA', 25], ['RESERVA', 10], ['SIN_STOCK', 20], ['VENCIMIENTO_MENOR_60', 5]])
    expect(filas.every((f) => f.cantidad_pedida === 100 && f.cantidad_faltante === 60 && f.origen === 'DETECCION')).toBe(true)
    expect(filas.reduce((t, f) => t + f.cantidad_causa, 0)).toBe(60)
    expect(filas[0].detalle).toMatchObject({ pedido: 100, disponibles: 40, causas: { CUARENTENA: 25, RESERVA: 10, VENCIMIENTO_MENOR_60: 5, SIN_STOCK: 20 } })
    // volver a evaluar la línea sin que nada cambie no repite el quiebre
    const salida = (await uno('select salida_id from wms.salida_lineas where id = $1', [linea])).salida_id
    await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
    expect((await uno('select count(*)::int n from wms.quiebres_stock where linea_id = $1', [linea])).n).toBe(4)
  })

  it('la vista de quiebres trae el producto y la fecha para el reporte futuro; la ve el personal que trabaja salidas, no quien no tiene rol', async () => {
    const filas = await como(jt, async (c) => (await c.query('select producto_codigo, causa, cantidad_causa, fecha::text f, salida_numero from wms.v_quiebres_stock where linea_id = $1 order by causa', [linea])).rows)
    expect(filas).toHaveLength(4)
    expect(filas[0]).toMatchObject({ producto_codigo: p.codigo, salida_numero: numero, f: hoy })
    expect(await como(sinRol, async (c) => (await c.query('select count(*)::int n from wms.v_quiebres_stock')).rows[0].n)).toBe(0)
    expect(await como(base.personas.auditor.id, async (c) => (await c.query('select count(*)::int n from wms.quiebres_stock where linea_id = $1', [linea])).rows[0].n)).toBe(4)
  })

  it('los quiebres son append-only: ni la aplicación ni el administrador de la base los cambian o borran', async () => {
    expect((await falla(base.admin.query(`update wms.quiebres_stock set cantidad_causa = 1 where linea_id = $1`, [linea]))).message).toMatch(/no se (puede )?(editar|modificar|borrar)|inmutable|append/i)
    expect((await falla(base.admin.query(`delete from wms.quiebres_stock where linea_id = $1`, [linea]))).message).toMatch(/no se (puede )?(editar|modificar|borrar)|inmutable|append/i)
    expect((await falla(como(jt, (c) => c.query(`delete from wms.quiebres_stock`)))).message).toMatch(/permission denied/)
    expect((await falla(como(jt, (c) => c.query(`insert into wms.quiebres_stock (producto_id, cantidad_pedida, cantidad_faltante, cantidad_causa, causa, origen) values ($1, 1, 1, 1, 'SIN_STOCK', 'DETECCION')`, [p.id])))).message).toMatch(/permission denied/)
  })

  it('el Jefe de Transporte no tiene cómo cambiar la cantidad de la línea (solo el lote, antes del picking): el pedido se cambia en Pedidos', async () => {
    const e = await falla(como(jt, (c) => c.query(`update wms.salida_lineas set cantidad = 1 where id = $1`, [linea])))
    expect(e.message).toMatch(/permission denied/)
  })

  it('solo el personal ve la explicación; una persona sin rol no', async () => {
    expect((await falla(explicar(sinRol, linea))).message).toBe('Sin acceso')
    expect((await explicar(aux, linea)).hayFaltante).toBe(true)
  })
})

describe('casos sueltos de la explicación', () => {
  it('sin nada de nada, todo es «sin stock»', async () => {
    const p = await producto()
    const s = await salidaDe(p.id, 7)
    expect(s.linea.estado).toBe('SIN_STOCK')
    expect((await explicar(jt, s.linea.id)).texto).toBe('Stock insuficiente: pide 7 y hay 0 disponibles. Faltan 7: 7 sin stock.')
    expect((await uno(`select count(*)::int n from wms.quiebres_stock where linea_id = $1 and causa = 'SIN_STOCK' and cantidad_causa = 7`, [s.linea.id])).n).toBe(1)
  })

  it('una línea que sí tiene su stock no tiene faltante', async () => {
    const p = await producto(); await sembrar(p.id, 'F-2.1', 'OK-1', en(300), 50)
    const s = await salidaDe(p.id, 10)
    expect(s.linea.estado).toBe('ASIGNADA')
    expect(await explicar(jt, s.linea.id)).toMatchObject({ hayFaltante: false, faltan: 0, texto: 'Hay stock suficiente: pide 10 y hay 10 disponibles.' })
    expect((await uno('select count(*)::int n from wms.quiebres_stock where linea_id = $1', [s.linea.id])).n).toBe(0)
  })

  it('lo que existe y no se puede usar nunca pasa de lo que falta: con 100 en Cuarentena y faltando 5, son 5 en Cuarentena', async () => {
    const p = await producto(); await sembrar(p.id, 'F-2.2', 'AP-1', en(300), 15); await sembrar(p.id, 'A-7', 'CU-1', en(300), 100, 'CUARENTENA')
    const s = await salidaDe(p.id, 20)
    expect(await explicar(jt, s.linea.id)).toMatchObject({ faltan: 5, causas: { CUARENTENA: 5, SIN_STOCK: 0 }, existentes: { cuarentena: 100 } })
  })

  it('al llegar stock, asignar de nuevo deja la línea lista y cierra la alerta', async () => {
    const p = await producto(); await sembrar(p.id, 'F-2.3', 'AP-2', en(300), 5)
    const s = await salidaDe(p.id, 12)
    expect(s.linea.estado).toBe('SIN_STOCK')
    await sembrar(p.id, 'F-2.4', 'AP-3', en(300), 20)
    await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [s.salida]))
    expect((await uno('select estado from wms.salida_lineas where id = $1', [s.linea.id])).estado).toBe('ASIGNADA')
    expect((await uno(`select estado from wms.alertas where clave = $1`, [`stock:${s.linea.id}`])).estado).toBe('ATENDIDA')
  })
})
