// Fase 4 · P3: carga de ENSAYO del piloto de punta a punta en la demo: archivo → informe obligatorio → carga marcada «piloto» → confirmación de Dirección Técnica → stock en el
// libro y asignable a un pedido. Espejo de tests/db/carga-ensayo.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { posicionAcepta } from '@/domain/zonas'
import { huellaDeCarga, TEXTO_INFORME_OBLIGATORIO } from '@/domain/carga-inicial'
import { parsearCargaInicial } from '@/domain/inventario'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number]): Actor => ({ id: `demo:${rol}`, nombre: `${rol} (demo)`, roles: [rol] })
const ADMIN = actor('admin_wms'); const KATIA = actor('direccion_tecnica'); const JEFE = actor('jefe_almacen')
let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  process.env.WMS_DEMO_LOCAL = '1'
  repo = new RepositorioDemo()
  repo.fijarModoPiloto('si')
})

/** Un archivo sintético con el formato de carga-inicial-odoo.md, armado con códigos que existen en la demo. */
async function archivo(lote = 'ENS-1') {
  const p = await repo.panorama()
  const prod = p.productos.find((x) => x.reg?.registroSanitario && x.reg.rsVence && x.reg.rsVence > p.hoy)!
  const prop = p.propietarios.find((x) => x.codigo === 'LOGISSA')!
  const pos = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && x.activa && posicionAcepta(x, prop.id, p.asignaciones, p.hoy))!
  return { texto: ['producto;lote;vence;propietario;posicion;estado;cantidad', `${prod.codigo};${lote};31/12/2029;${prop.codigo};${pos.codigo};APROBADO;50`].join('\n'), prod, pos }
}

describe('carga de ensayo en la demo', () => {
  it('sin informe no se carga, y el informe tiene que ser de ESE archivo, de ESA persona y «Lista»', async () => {
    const { texto } = await archivo()
    const filas = parsearCargaInicial(texto).filas
    expect(await repo.crearCargaInicial(filas, undefined, ADMIN)).toMatchObject({ ok: false, mensaje: TEXTO_INFORME_OBLIGATORIO })
    await repo.registrarInformeCarga(parsearCargaInicial((await archivo('OTRO')).texto).filas, 'LISTA', ADMIN)
    expect(await repo.crearCargaInicial(filas, undefined, ADMIN)).toMatchObject({ ok: false })
    await repo.registrarInformeCarga(filas, 'LISTA', KATIA)
    expect(await repo.crearCargaInicial(filas, undefined, ADMIN)).toMatchObject({ ok: false })
    await repo.registrarInformeCarga(filas, 'NO_LISTA', ADMIN)
    expect(await repo.crearCargaInicial(filas, undefined, ADMIN)).toMatchObject({ ok: false })
    expect(huellaDeCarga(filas)).toBe(huellaDeCarga(parsearCargaInicial(texto).filas))
  })
  it('un informe «Lista» de un archivo con errores queda como NO_LISTA: no se puede cargar', async () => {
    const mala = parsearCargaInicial('producto;lote;vence;propietario;posicion;estado;cantidad\nNO-EXISTE;L1;31/12/2029;LOGISSA;A-6;APROBADO;5').filas
    await repo.registrarInformeCarga(mala, 'LISTA', ADMIN)
    expect(await repo.crearCargaInicial(mala, undefined, ADMIN)).toMatchObject({ ok: false, mensaje: TEXTO_INFORME_OBLIGATORIO })
  })
  it('de punta a punta: informe (servicio) → carga marcada «piloto» → confirma Dirección Técnica → stock en el libro; los demás roles no cargan', async () => {
    const { texto, prod } = await archivo('ENS-PUNTA')
    vi.doMock('@/services/repositorio-actual', () => ({ repositorio: () => repo }))
    const { informeDeCarga: informe } = await import('@/services/informe-carga')
    const r = await informe(texto, ADMIN)
    expect(r).toMatchObject({ ok: true })
    if (!r.ok) return
    expect(r.informe.veredicto).toBe('LISTA')
    const c = await repo.crearCargaInicial(parsearCargaInicial(texto).filas, 'Ensayo del piloto', ADMIN)
    expect(c).toMatchObject({ ok: true })
    if (!c.ok) return
    const [lista] = await repo.listarCargasIniciales()
    expect(lista).toMatchObject({ id: c.id, estado: 'BORRADOR', piloto: true, unidades: 50 })
    expect(await repo.confirmarCargaInicial(c.id, KATIA)).toMatchObject({ ok: true })
    const p = await repo.panorama()
    const lote = p.lotes.find((l) => l.codigo === 'ENS-PUNTA' && l.productoId === prod.id)!
    expect(p.saldos.filter((s) => s.loteId === lote.id).reduce((n, s) => n + s.cantidad, 0)).toBe(50)
    expect(await repo.crearCargaInicial(parsearCargaInicial(texto).filas, undefined, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringContaining('No tienes permiso') })
  })
  it('fuera del piloto la misma carga nace sin la marca', async () => {
    repo.fijarModoPiloto('no')
    const { texto } = await archivo('DEF-1')
    const filas = parsearCargaInicial(texto).filas
    await repo.registrarInformeCarga(filas, 'LISTA', ADMIN)
    const c = await repo.crearCargaInicial(filas, undefined, ADMIN)
    expect(c).toMatchObject({ ok: true })
    expect((await repo.listarCargasIniciales())[0].piloto).toBe(false)
  })
})
