// Piloto · errores de la demo (E-1 y E-2): la demo aplica las mismas reglas que la base (0037) al ejecutar un movimiento interno.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { estado } from '@/services/demo/estado'
import { propietarioVigente } from '@/domain/zonas'
import type { LineaEjecutar } from '@/domain/inventario'
import type { Actor } from '@/services/repositorio'

const AUX: Actor = { id: 'demo:auxiliar', nombre: 'Auxiliar (demo)', roles: ['auxiliar'] }
let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })

/** Una línea Aprobada de un rack, y otro rack del MISMO propietario libre de movimientos. */
async function enRack() {
  const p = await repo.panorama()
  const usadas = new Set((await repo.listarMovimientos()).flatMap((o) => o.lineas.flatMap((l) => [l.desdePosicionId, l.haciaPosicionId])))
  const pos = new Map(p.posiciones.map((x) => [x.id, x]))
  const s = p.saldos.find((x) => x.estado === 'APROBADO' && x.cantidad >= 3 && pos.get(x.posicionId)!.tipoArea === 'APROBADOS' && !usadas.has(x.posicionId))!
  const propio = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && x.id !== s.posicionId && !usadas.has(x.id) && propietarioVigente(x.id, p.asignaciones, p.hoy) === s.propietarioId)!
  const ajeno = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && propietarioVigente(x.id, p.asignaciones, p.hoy) && propietarioVigente(x.id, p.asignaciones, p.hoy) !== s.propietarioId)!
  const linea = (hasta: string): LineaEjecutar => ({ desdePosicionId: s.posicionId, haciaPosicionId: hasta, loteId: s.loteId, estado: 'APROBADO', procedenciaId: s.procedenciaId, cantidad: 1 })
  return { p, s, propio, ajeno, linea }
}

describe('E-1 · un movimiento interno solo va al mismo propietario del lote', () => {
  it('un rack de otro propietario se rechaza; el del propietario del lote se acepta', async () => {
    const { propio, ajeno, linea } = await enRack()
    expect(await repo.ejecutarMovimiento([linea(ajeno.id)], 'Reorganización', AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no acepta stock de ese propietario/) })
    expect(await repo.ejecutarMovimiento([linea(propio.id)], 'Reorganización', AUX)).toMatchObject({ ok: true })
  })
})

describe('E-2 · «Salida de Cuarentena» en la demo', () => {
  /** Stock Aprobado que quedó en una ubicación de Cuarentena (lo normal tras aprobar un lote). */
  async function aprobadoEnCuarentena() {
    const r = await enRack()
    const q = r.p.posiciones.find((x) => x.tipoArea === 'CUARENTENA')!
    estado().panorama.saldos.push({ ...r.s, posicionId: q.id, cantidad: 8, procedenciaId: 'proc:sq' })
    return { ...r, q }
  }
  const desde = (q: string, hasta: string, s: { loteId: string }): LineaEjecutar => ({ desdePosicionId: q, haciaPosicionId: hasta, loteId: s.loteId, estado: 'APROBADO', procedenciaId: 'proc:sq', cantidad: 2 })

  it('reproducción del error: antes un rack Aprobados «salía de Cuarentena» y la demo lo aceptaba; ahora se rechaza', async () => {
    const { propio, linea } = await enRack()
    const r = await repo.ejecutarMovimiento([linea(propio.id)], 'Salida de Cuarentena', AUX)
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/solo se mueve lo que está en una ubicación de Cuarentena/) })
    expect(await repo.ejecutarMovimiento([linea(propio.id)], 'Reorganización', AUX)).toMatchObject({ ok: true })
  })

  it('de Cuarentena a un rack Aprobados del mismo propietario: se puede', async () => {
    const x = await aprobadoEnCuarentena()
    expect(await repo.ejecutarMovimiento([desde(x.q.id, x.propio.id, x.s)], 'Salida de Cuarentena', AUX)).toMatchObject({ ok: true })
  })

  it('el destino de otro propietario, o que no es Aprobados, se rechaza', async () => {
    const x = await aprobadoEnCuarentena()
    expect(await repo.ejecutarMovimiento([desde(x.q.id, x.ajeno.id, x.s)], 'Salida de Cuarentena', AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no acepta stock de ese propietario/) })
    const otraQ = x.p.posiciones.find((y) => y.tipoArea === 'CUARENTENA' && y.id !== x.q.id)!
    expect(await repo.ejecutarMovimiento([desde(x.q.id, otraQ.id, x.s)], 'Salida de Cuarentena', AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/el destino es una ubicación de Aprobados/) })
  })
})
