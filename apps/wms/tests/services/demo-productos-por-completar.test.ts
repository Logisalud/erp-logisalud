// PIL-8 en la demostración (espejo de tests/db/productos-por-completar.test.ts): en modo piloto el WMS no crea productos ni edita presentación o principio activo;
// un producto con datos incompletos está pendiente de Dirección Técnica y no se aprueban lotes suyos.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { productoCompleto } from '@/domain/regulatorio'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number], nombre: string = rol): Actor => ({ id: `demo:${rol}`, nombre, roles: [rol] })
const KATIA = actor('direccion_tecnica', 'Katia'); const SANDRA = actor('asistente_dt', 'Sandra'); const ADMIN = actor('admin_wms', 'Sebastián')
const entrada = { codigo: 'PIL8-1', descripcion: 'Producto nuevo', unidadMedida: 'TABLETA' } as never

let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })
const piloto = (modo: 'si' | 'no') => repo.fijarModoPiloto(modo)

describe('PIL-8 · el WMS no escribe en el catálogo durante el piloto', () => {
  it('crear un producto se rechaza (también al Administrador); fuera del piloto sigue valiendo', async () => {
    piloto('si')
    for (const a of [SANDRA, KATIA, ADMIN]) expect(await repo.crearProducto(entrada, a)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/se crean y se corrigen en Compras/) })
    const n = (await repo.panorama()).productos.length
    piloto('no')
    expect(await repo.crearProducto(entrada, SANDRA)).toMatchObject({ ok: true })
    expect((await repo.panorama()).productos.length).toBe(n + 1)
  })
  it('presentación y principio activo no se editan en el piloto (el producto no cambia); los demás datos sí', async () => {
    const p = (await repo.panorama()).productos[0]
    piloto('si')
    expect(await repo.editarRegulatorio(p.id, { presentacion: 'Otra' }, 'x', KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/se corrigen en Compras/) })
    expect(await repo.editarRegulatorio(p.id, { principioActivo: 'Otro' }, 'x', KATIA)).toMatchObject({ ok: false })
    expect((await repo.panorama()).productos[0].presentacion).toBe(p.presentacion)
    expect(await repo.editarRegulatorio(p.id, { concentracion: '99 mg' }, 'Revisión', SANDRA)).toMatchObject({ ok: true, cambios: 1 })
    piloto('no')
    expect(await repo.editarRegulatorio(p.id, { presentacion: 'Otra' }, 'D-38', KATIA)).toMatchObject({ ok: true, cambios: 1 })
  })
})

describe('PIL-8 · productos por completar', () => {
  it('la demo trae al menos un producto por completar; completarlo lo saca de la cola', async () => {
    const pendientes = () => repo.panorama().then((p) => p.productos.filter((x) => !productoCompleto(x.reg)))
    const antes = await pendientes()
    expect(antes.length).toBeGreaterThan(0)
    const x = antes[0]
    const datos = { registroSanitario: 'EG-777', rsVence: '30/06/2031', fabricante: 'Lab', formaPresentacion: 'Tableta', concentracion: '10 mg', condicionAlmacenamiento: 'Menos de 30 C' }
    expect(await repo.editarRegulatorio(x.id, datos, 'Completado por DT', SANDRA)).toMatchObject({ ok: true })
    expect((await pendientes()).map((y) => y.id)).not.toContain(x.id)
  })
})
