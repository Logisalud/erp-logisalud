// Fase 4 · P8 (migración 0046): el ruteo de Pedidos (zona de reparto, orden del distrito, día planificado) en la copia del pedido y en el aviso de cambio.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba } from './helpers'

let base: BaseDePrueba
let jt: string
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const pedido = (n: number, version: number, extra: Record<string, unknown> = {}) => ({
  pedidoId: `rz-${n}`, numero: `PED-RZ${n}`, version, estado: 'READY_FOR_OPERATIONS', fecha: '2026-11-03', modificadoEn: '2026-11-03T08:00:00Z',
  cliente: { id: 'c1', nombre: `Botica ${n}` }, lineas: [{ lineaId: 'l-1', productoCodigo: 'T-DAPA', descripcion: 'Dapagliflozina', cantidad: 10 }], ...extra,
})
const importar = (peds: unknown[]) => como(jt, (c) => c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, null)', ['ruteo.test', JSON.stringify(peds)]))
const fila = (id: string) => uno('select * from wms.pedidos_despacho where pedido_id = $1 and vigente', [id])

beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true })
  jt = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [jt])
  await base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'jefe_transporte')`, [jt])
})
afterAll(async () => { await base?.cerrar() })

describe('ruteo de Pedidos en la copia', () => {
  it('guarda zona, orden del distrito, día y fecha planificada (nombres de Pedidos y del WMS) en columnas y en el snapshot', async () => {
    await importar([
      pedido(1, 1, { zona_reparto: { codigo: 'LIMA-SUR', nombre: 'Lima Sur', orden_ruta: 3 }, orden_distrito: 4, dia_planificado: 5, fecha_planificada: '2026-11-13' }),
      pedido(2, 1, { zonaReparto: { codigo: 'LIMA-CENTRO', nombre: 'Lima Centro', ordenRuta: 1 }, ordenDistrito: 2, diaPlanificado: 2, fechaPlanificada: '2026-11-10' }),
    ])
    expect(await fila('rz-1')).toMatchObject({ zona_codigo: 'LIMA-SUR', zona_nombre: 'Lima Sur', zona_orden_ruta: 3, orden_distrito: 4, dia_planificado: 5 })
    expect(String((await fila('rz-1')).fecha_planificada.toISOString?.().slice(0, 10) ?? (await fila('rz-1')).fecha_planificada)).toContain('2026-11-13')
    expect(await fila('rz-2')).toMatchObject({ zona_codigo: 'LIMA-CENTRO', zona_orden_ruta: 1, orden_distrito: 2, dia_planificado: 2 })
    expect((await fila('rz-1')).snapshot.zona_reparto.codigo).toBe('LIMA-SUR')   // el snapshot guarda lo que llegó
  })
  it('sin zona todo queda vacío; lo que viene mal se ignora y nunca rechaza el pedido', async () => {
    await importar([pedido(3, 1, { zona_reparto: null, orden_distrito: null, dia_planificado: null, fecha_planificada: null }), pedido(4, 1, { zona_reparto: { codigo: 'Z', nombre: 'Z', orden_ruta: 'x' }, dia_planificado: 9, fecha_planificada: 'mañana' })])
    expect(await fila('rz-3')).toMatchObject({ zona_codigo: null, zona_orden_ruta: null, orden_distrito: null, dia_planificado: null, fecha_planificada: null })
    expect(await fila('rz-4')).toMatchObject({ zona_codigo: 'Z', zona_orden_ruta: 9999, dia_planificado: null, fecha_planificada: null })
  })
  it('una versión nueva con otra zona o día queda versionada y lo avisa en los cambios; la versión anterior no se toca', async () => {
    await importar([pedido(1, 2, { zona_reparto: { codigo: 'LIMA-NORTE', nombre: 'Lima Norte', orden_ruta: 2 }, orden_distrito: 1, dia_planificado: 2, fecha_planificada: '2026-11-10' })])
    const v2 = await fila('rz-1')
    expect(v2).toMatchObject({ version: 2, zona_codigo: 'LIMA-NORTE', cambio_pendiente: true })
    expect(v2.cambios).toEqual(['Cambió la zona de reparto', 'Cambió el día planificado de reparto'])
    const v1 = await uno('select zona_codigo, vigente from wms.pedidos_despacho where pedido_id = $1 and version = 1', ['rz-1'])
    expect(v1).toMatchObject({ zona_codigo: 'LIMA-SUR', vigente: false })
  })
  it('el snapshot sigue sin poder editarse (el ruteo se llena solo al insertar)', async () => {
    await expect(base.admin.query(`update wms.pedidos_despacho set snapshot = '{}'::jsonb where pedido_id = 'rz-2'`)).rejects.toThrow(/no se edita/)
  })
})
