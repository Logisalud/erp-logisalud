// D-37 en el modo demostración: mismas reglas que wms.editar_regulatorio.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number], nombre: string = rol): Actor => ({ id: `demo:${rol}`, nombre, roles: [rol] })
const KATIA = actor('direccion_tecnica', 'Katia')
const SANDRA = actor('asistente_dt', 'Sandra')
const CHARLIE = actor('jefe_almacen', 'Charlie')

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

describe('datos regulatorios', () => {
  it('Katia y Sandra editan con la misma autoridad; rige de inmediato y deja historial con motivo', async () => {
    const r1 = await repo.editarRegulatorio('prod:1', { registroSanitario: 'EG-NUEVO', rsVence: '31/12/2031' }, 'Renovación del registro', SANDRA)
    expect(r1).toMatchObject({ ok: true, cambios: 2 })
    const r2 = await repo.editarRegulatorio('prod:1', { fabricante: 'Otro laboratorio' }, 'Cambio de fabricante', KATIA)
    expect(r2).toMatchObject({ ok: true, cambios: 1 })
    const reg = (await repo.panorama()).productos.find((p) => p.id === 'prod:1')!.reg!
    expect(reg).toMatchObject({ registroSanitario: 'EG-NUEVO', rsVence: '2031-12-31', fabricante: 'Otro laboratorio' })
    const h = await repo.historialRegulatorio('prod:1')
    expect(h).toHaveLength(3)
    expect(h[0]).toMatchObject({ campo: 'fabricante', despues: 'Otro laboratorio', usuario: 'Katia', motivo: 'Cambio de fabricante' })
    expect(h.find((c) => c.campo === 'registro_sanitario')).toMatchObject({ despues: 'EG-NUEVO', usuario: 'Sandra' })
    expect(h.find((c) => c.campo === 'registro_sanitario')!.antes).toBeTruthy()
  })

  it('D-38: presentación y principio activo se editan con historial y solo Katia y Sandra', async () => {
    const antes = (await repo.panorama()).productos.find((p) => p.id === 'prod:1')!
    const r = await repo.editarRegulatorio('prod:1', { presentacion: 'Caja x 60', principioActivo: 'Otro principio' }, 'Corrección de la ficha', KATIA)
    expect(r).toMatchObject({ ok: true, cambios: 2 })
    const despues = (await repo.panorama()).productos.find((p) => p.id === 'prod:1')!
    expect(despues).toMatchObject({ presentacion: 'Caja x 60', principioActivo: 'Otro principio' })
    const h = await repo.historialRegulatorio('prod:1')
    expect(h.find((c) => c.campo === 'presentacion')).toMatchObject({ antes: antes.presentacion, despues: 'Caja x 60', usuario: 'Katia', motivo: 'Corrección de la ficha' })
    expect(h.find((c) => c.campo === 'principio_activo')).toMatchObject({ despues: 'Otro principio' })
    expect(await repo.editarRegulatorio('prod:1', { presentacion: 'Caja x 60' }, 'igual', SANDRA)).toMatchObject({ ok: true, cambios: 0 })
    expect((await repo.editarRegulatorio('prod:1', { presentacion: 'X' }, 'no puedo', CHARLIE)).ok).toBe(false)
    expect((await repo.panorama()).productos.find((p) => p.id === 'prod:1')!.presentacion).toBe('Caja x 60')
  })

  it('nadie más edita', async () => {
    const r = await repo.editarRegulatorio('prod:1', { fabricante: 'X' }, 'prueba', CHARLIE)
    expect(r.ok).toBe(false)
    expect(await repo.historialRegulatorio('prod:1')).toHaveLength(0)
  })

  it('el motivo es obligatorio', async () => {
    const r = await repo.editarRegulatorio('prod:1', { fabricante: 'X' }, '  ', SANDRA)
    expect(r).toMatchObject({ ok: false, errores: { motivo: expect.any(String) } })
  })

  it('no deja un registro sanitario sin su vencimiento y lo que no cambia no se registra', async () => {
    const sin = await repo.editarRegulatorio('prod:23', { registroSanitario: 'EG-1' }, 'Carga', SANDRA)
    expect(sin).toMatchObject({ ok: false, errores: { rsVence: expect.any(String) } })
    const igual = await repo.editarRegulatorio('prod:1', { fabricante: 'Laboratorio de demostración' }, 'Sin cambios', SANDRA)
    expect(igual).toMatchObject({ ok: true, cambios: 0 })
  })

  it('el alta de un producto deja su historial y no pasa por validación', async () => {
    const r = await repo.crearProducto({ codigo: 'NUEVO-1', descripcion: 'Producto nuevo', registroSanitario: 'EG-9', rsVence: '30/06/2030', concentracion: '10 mg' }, SANDRA)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const h = await repo.historialRegulatorio(r.id)
      expect(h.every((c) => c.motivo === 'Alta del producto')).toBe(true)
      expect(h.map((c) => c.campo)).toEqual(expect.arrayContaining(['registro_sanitario', 'rs_vence', 'concentracion']))
    }
  })
})
