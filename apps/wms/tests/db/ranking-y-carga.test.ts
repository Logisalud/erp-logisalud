// 0053 · «Diferencia detectada en la carga» y los hechos del ranking mensual (picking y conformidad).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba({ piloto: true, con0008: false }) }, 120_000)
afterAll(async () => { await base?.cerrar() })

const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
let n = 0
async function persona(rol: string) { const id = randomUUID(); await q('insert into auth.users (id) values ($1)', [id]); await q('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol]); return id }

/** Un pedido conformado: 2 productos, 3 bultos, a provincia; lo picó `picker` y lo conformó `conformador`. */
async function pedido(picker: string, conformador: string) {
  n += 1
  const dueno = (await uno(`select id from wms.propietarios where codigo = 'LOGISSA'`)).id
  const s = await uno(`insert into wms.salidas (numero, tipo, motivo, propietario_id, estado, creada_por, requiere_embalaje, bultos_conformidad, conformada_por, conformada_en)
                       values ($1, 'DISTRIBUCION', 'VENTA', $2, 'ABIERTA', $3, true, 3, $4, now()) returning id`, [`SAL-2026-8${String(n).padStart(4, '0')}`, dueno, picker, conformador])
  for (const prod of [base.productos.dapa, base.productos.lizi]) await q(`insert into wms.salida_lineas (salida_id, producto_id, cantidad, estado) values ($1, $2, 5, 'CONFIRMADA')`, [s.id, prod])
  const op = await uno(`insert into wms.ordenes_picking (numero, salida_id, estado, generada_por, picker_id) values ($1, $2, 'COMPLETA', $3, $3) returning id`, [`OP-2026-8${String(n).padStart(4, '0')}`, s.id, picker])
  return { salida: s.id as string, orden: op.id as string }
}
const registrar = (quien: string, salida: string, motivo: string) => base.como(quien, (c) => c.query('select wms.registrar_diferencia_carga($1, $2) id', [salida, motivo]))
const hechos = (quien: string) => base.como(quien, async (c) => (await c.query('select * from wms.pedidos_del_mes()')).rows)

describe('0053 · diferencia detectada en la carga', () => {
  it('la registra quien carga, con motivo; no quien picó ni quien dio la conformidad', async () => {
    const [picker, conf, cargador] = [await persona('auxiliar'), await persona('auxiliar'), await persona('auxiliar')]
    const { salida } = await pedido(picker, conf)
    await expect(registrar(picker, salida, 'falta un lote')).rejects.toThrow(/otra persona/)
    await expect(registrar(conf, salida, 'falta un lote')).rejects.toThrow(/otra persona/)
    await expect(registrar(cargador, salida, '   ')).rejects.toThrow(/Escribe qué diferencia/)
    await expect(registrar(base.personas.sinRol.id, salida, 'x')).rejects.toThrow()
    const r = await registrar(cargador, salida, 'En la caja había otro lote')
    expect(r.rows[0].id).toBeTruthy()
    expect(Number((await uno(`select count(*) n from wms.diferencias_carga where salida_id = $1 and estado = 'VIGENTE'`, [salida])).n)).toBe(1)
  })

  it('solo el Jefe de Transporte la descarta, con motivo, y queda anotada', async () => {
    const [picker, conf, cargador, jefe] = [await persona('auxiliar'), await persona('auxiliar'), await persona('auxiliar'), await persona('jefe_transporte')]
    const { salida } = await pedido(picker, conf)
    const id = (await registrar(cargador, salida, 'Faltaba una caja')).rows[0].id
    await expect(base.como(cargador, (c) => c.query('select wms.descartar_diferencia_carga($1, $2)', [id, 'ya no'])).catch((e) => { throw e })).rejects.toThrow(/Jefe de Transporte/)
    await expect(base.como(jefe, (c) => c.query('select wms.descartar_diferencia_carga($1, $2)', [id, ' ']))).rejects.toThrow(/por qué/)
    await base.como(jefe, (c) => c.query('select wms.descartar_diferencia_carga($1, $2)', [id, 'Se contó mal']))
    expect(await uno(`select estado, motivo_descarte from wms.diferencias_carga where id = $1`, [id])).toMatchObject({ estado: 'DESCARTADA', motivo_descarte: 'Se contó mal' })
    await expect(base.como(jefe, (c) => c.query('select wms.descartar_diferencia_carga($1, $2)', [id, 'otra vez']))).rejects.toThrow(/ya estaba descartada/)
  })
})

describe('0053 · hechos del ranking del mes', () => {
  it('trae el pedido con sus productos, bultos y provincia; el error de picking sale de los ajustes de la conformidad y el error posterior, de la carga', async () => {
    const [picker, conf, cargador, jefe] = [await persona('auxiliar'), await persona('auxiliar'), await persona('auxiliar'), await persona('jefe_transporte')]
    const { salida, orden } = await pedido(picker, conf)
    const fila = async () => (await hechos(cargador)).find((x) => x.salida_id === salida)
    expect(await fila()).toMatchObject({ picker_id: picker, conformador_id: conf, productos: 2, bultos: 3, provincia: true, error_picking: false, error_posterior: false, picker_es_jefe: false, conformador_es_jefe: false })
    const linea = (await uno('select id from wms.salida_lineas where salida_id = $1 limit 1', [salida])).id
    await q(`insert into wms.ajustes_conformidad (orden_id, linea_id, orden_linea_id, tipo, cantidad_antes, cantidad_despues, por) values ($1, $2, $3, 'MENOS', 5, 4, $4)`, [orden, linea, randomUUID(), conf])
    expect((await fila())!.error_picking).toBe(true)
    const id = (await registrar(cargador, salida, 'Otro lote al cargar')).rows[0].id
    expect((await fila())!.error_posterior).toBe(true)
    await base.como(jefe, (c) => c.query('select wms.descartar_diferencia_carga($1, $2)', [id, 'Era un error mío']))
    expect((await fila())!.error_posterior).toBe(false)   // una diferencia descartada no cuenta
  })

  it('marca a los jefes (no entran al ranking) y no muestra pedidos de otro mes ni a quien no es personal', async () => {
    const [jefe, aux] = [await persona('jefe_transporte'), await persona('auxiliar')]
    const { salida } = await pedido(jefe, aux)
    const f = (await hechos(aux)).find((x) => x.salida_id === salida)!
    expect(f).toMatchObject({ picker_es_jefe: true, conformador_es_jefe: false })
    await q(`update wms.salidas set conformada_en = now() - interval '40 days' where id = $1`, [salida])
    expect((await hechos(aux)).some((x) => x.salida_id === salida)).toBe(false)
    await expect(hechos(base.personas.sinRol.id)).rejects.toThrow(/No tienes permiso/)
  })
})
