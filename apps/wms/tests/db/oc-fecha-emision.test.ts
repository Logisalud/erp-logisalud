// 0051 · Las vistas de lectura de Compras (v_oc_lineas y v_oc_items) traen la fecha de emisión y la de entrega estimada de la OC, sin tocar lo que ya traían
// y sin generar «cambios en la OC» falsos en la copia (la fecha no entra en su huella).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba({ piloto: true, con0008: false }) }, 120_000)
afterAll(async () => { await base?.cerrar() })

const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)

async function crearOc(codigo: string, estado: string, emision: string | null, entrega: string | null) {
  const pv = (await q(`insert into compras.proveedores (ruc, razon_social) values ($1, $2) returning id`, [`20${Math.floor(Math.random() * 1e9)}`.slice(0, 11), `Proveedor ${codigo}`]))[0].id
  const oc = (await q(`insert into compras.ordenes_compra (codigo, proveedor_id, estado, fecha_emision, fecha_entrega_estimada) values ($1, $2, $3, coalesce($4::date, current_date), $5) returning id`, [codigo, pv, estado, emision, entrega]))[0].id
  await q(`insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida) values ($1, $2, 10)`, [oc, base.productos.dapa])
  return oc as string
}

describe('0051 · la fecha de la OC en las vistas de Compras', () => {
  it('las dos vistas traen fecha_emision y fecha_entrega_estimada AL FINAL, y lo de antes no cambia de lugar', async () => {
    for (const vista of ['v_oc_lineas', 'v_oc_items']) {
      const cols = (await q(`select column_name from information_schema.columns where table_schema = 'wms' and table_name = $1 order by ordinal_position`, [vista])).map((r) => r.column_name)
      expect(cols.slice(0, 14)).toEqual(['oc_id', 'oc_codigo', 'estado_oc', 'proveedor_id', 'proveedor_nombre', 'proveedor_ruc', 'oc_item_id', 'producto_id', 'producto_codigo', 'producto_descripcion', 'cantidad_pedida', 'cantidad_recibida', 'saldo', 'cantidad_facturada'])
      expect(cols.slice(14)).toEqual(['fecha_emision', 'fecha_entrega_estimada'])
    }
  })

  it('v_oc_items da la fecha de la OC y solo las OC que aún pueden recibir; v_oc_lineas las trae todas', async () => {
    const abierta = await crearOc('OC-F-1', 'enviada', '2026-11-03', '2026-11-10')
    const anulada = await crearOc('OC-F-2', 'anulada', '2026-11-04', null)
    const fila = (await q(`select fecha_emision::text f, fecha_entrega_estimada::text e from wms.v_oc_items where oc_id = $1`, [abierta]))[0]
    expect(fila).toEqual({ f: '2026-11-03', e: '2026-11-10' })
    expect(await q(`select 1 from wms.v_oc_items where oc_id = $1`, [anulada])).toHaveLength(0)
    expect((await q(`select fecha_emision::text f from wms.v_oc_lineas where oc_id = $1`, [anulada]))[0].f).toBe('2026-11-04')
  })

  it('un usuario de la aplicación puede leer la fecha (las vistas siguen concedidas a authenticated)', async () => {
    const oc = await crearOc('OC-F-3', 'confirmada', '2026-11-05', null)
    const r = await base.como(base.personas.sandra.id, (c) => c.query(`select fecha_emision::text f from wms.v_oc_items where oc_id = $1`, [oc]))
    expect(r.rows[0].f).toBe('2026-11-05')
  })

  it('cambiar la fecha de emisión en Compras NO genera una versión nueva de la copia de la OC', async () => {
    const oc = await crearOc('OC-F-4', 'enviada', '2026-11-06', null)
    const sinc = () => base.como(base.personas.admin.id, (c) => c.query('select wms.sincronizar_oc($1) r', [oc])).then((r) => r.rows[0].r as { accion: string; version: number })
    expect((await sinc()).accion).toBe('CREADA')
    await q(`update compras.ordenes_compra set fecha_emision = '2026-11-07', fecha_entrega_estimada = '2026-11-20' where id = $1`, [oc])
    expect(await sinc()).toMatchObject({ accion: 'SIN_CAMBIOS', version: 1 })
  })
})
