// Bajas con sustento por motivo y la Orden de Baja LS-FR.56.01 en el modo demostración: mismas reglas que la migración 0026.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'
import type { EntradaLineaBaja, StockParaBaja } from '@/domain/bajas'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const KATIA = actor('katia', 'direccion_tecnica'); const SANDRA = actor('sandra', 'asistente_dt'); const CHARLIE = actor('charlie', 'jefe_almacen'); const AUX = actor('aux', 'auxiliar')

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

async function propietarioConStock(): Promise<{ id: string; filas: StockParaBaja[] }> {
  const p = await repo.panorama()
  for (const pr of p.propietarios) {
    const filas = await repo.stockParaBaja(pr.id, '', 200)
    if (filas.length >= 2) return { id: pr.id, filas }
  }
  throw new Error('la demo no trae stock para una baja')
}
const aLinea = (f: StockParaBaja, cantidad: number, motivo: EntradaLineaBaja['motivo']): EntradaLineaBaja => ({ loteId: f.loteId, posicionId: f.posicionId, estado: f.estado, cantidad, motivo })
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error((r as unknown as { mensaje: string }).mensaje); return r as Extract<T, { ok: true }> }

describe('bajas (demo)', () => {
  it('quién solicita: el auxiliar no; no se pide más de lo que hay; «vencido» solo de un lote vencido', async () => {
    const { id, filas } = await propietarioConStock()
    const f = filas[0]
    expect(await repo.solicitarBaja({ propietarioId: id, lineas: [aLinea(f, 1, 'DETERIORO_DANO')] }, AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('No tienes permiso') })
    expect(await repo.solicitarBaja({ propietarioId: id, lineas: [aLinea(f, f.disponible + 1, 'DETERIORO_DANO')] }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no se puede dar de baja más de lo que hay') })
    const noVencido = filas.find((x) => !x.vencido)
    if (noVencido) expect(await repo.solicitarBaja({ propietarioId: id, lineas: [aLinea(noVencido, 1, 'VENCIDO')] }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no está vencido') })
    expect(await repo.solicitarBaja({ propietarioId: id, lineas: [] }, CHARLIE)).toMatchObject({ ok: false })
  })

  it('vencido: solicita → sin confirmar no se autoriza → DT confirma y autoriza → la Orden queda emitida, el stock pasa a Bajas y sale la alerta de traslado', async () => {
    const { id, filas } = await propietarioConStock()
    const f = filas.find((x) => x.vencido) ?? filas[0]
    if (!f.vencido) return
    const antes = (await repo.panorama()).saldos.filter((s) => s.loteId === f.loteId && s.estado === 'BAJAS_RECHAZADOS').reduce((t, s) => t + s.cantidad, 0)
    const sol = ok(await repo.solicitarBaja({ propietarioId: id, lineas: [aLinea(f, 2, 'VENCIDO')], nota: 'Vencido en el almacén' }, CHARLIE))
    expect(sol.numero).toMatch(/^BJ-\d{4}-\d{5}$/)
    let o = (await repo.obtenerBaja(sol.id))!
    expect(o).toMatchObject({ estado: 'SOLICITADA', unidades: 2 })
    expect(o.lineas[0].faltante).toMatch(/Dirección Técnica debe confirmar/)
    expect(await repo.autorizarBaja(sol.id, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Sin sustento no se da de baja') })
    expect(await repo.confirmarVencimientoBaja(o.lineas[0].id, SANDRA)).toMatchObject({ ok: false })
    ok(await repo.confirmarVencimientoBaja(o.lineas[0].id, KATIA))
    expect(await repo.autorizarBaja(sol.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Solo Dirección Técnica') })
    ok(await repo.autorizarBaja(sol.id, KATIA))
    o = (await repo.obtenerBaja(sol.id))!
    expect(o).toMatchObject({ estado: 'EMITIDA', emitidaPor: KATIA.nombre })
    expect(o.hash).toBeTruthy()
    const despues = (await repo.panorama()).saldos.filter((s) => s.loteId === f.loteId && s.estado === 'BAJAS_RECHAZADOS').reduce((t, s) => t + s.cantidad, 0)
    expect(despues - antes).toBe(2)
    expect((await repo.listarBajas())[0]).toMatchObject({ numero: sol.numero, porTrasladar: true })
    // el contenido emitido no cambia y lleva los campos del formato
    const doc = (await repo.contenidoBaja(sol.id))!
    expect(doc.borrador).toBe(false)
    expect(doc.contenido.lineas[0]).toMatchObject({ producto: o.lineas[0].producto, lote: f.lote, cantidad: 2, motivo: 'VENCIDO' })
    // lo vencido en Bajas queda a la vista para la destrucción
    expect((await repo.stockEnBajas(id)).some((x) => x.loteId === f.loteId && x.vencido)).toBe(true)
    // traslado por el flujo normal de Movimientos
    const ubic = await repo.ubicacionesDeBajas(id)
    if (ubic.length) {
      const t = ok(await repo.trasladarBaja(sol.id, undefined, AUX))
      expect(t.movimiento).toMatch(/MOV|Movimiento|\d/)
      expect(await repo.trasladarBaja(sol.id, undefined, AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya está registrado') })
    }
  })

  it('daño y adjuntos: pide la evaluación o el archivo de su tipo; rechazar y retirar piden motivo; una Orden emitida se anula con motivo y se reemite una sola vez', async () => {
    const { id, filas } = await propietarioConStock()
    const [a, b] = filas
    const sol = ok(await repo.solicitarBaja({ propietarioId: id, lineas: [aLinea(a, 1, 'DETERIORO_DANO'), aLinea(b, 1, 'ALERTA_DIGEMID')] }, SANDRA))
    const o = (await repo.obtenerBaja(sol.id))!
    expect(o.lineas.map((l) => l.faltante).every(Boolean)).toBe(true)
    // la evaluación
    const mala = { checklist: { emb_cerrado: 'C' as const }, certAnalisis: null, observacion: 'humedad', conclusion: 'NO_CONFORME' as const }
    expect(await repo.registrarEvaluacionBaja(o.lineas[0].id, mala, CHARLIE)).toMatchObject({ ok: false })
    ok(await repo.registrarEvaluacionBaja(o.lineas[0].id, mala, SANDRA))                                   // se guarda, pero sin un punto no conforme no sustenta
    expect((await repo.obtenerBaja(sol.id))!.lineas[0].faltante).toMatch(/ningún punto no conforme/)
    const completa = { checklist: { emb_cerrado: 'C' as const, emb_limpio: 'NC' as const }, certAnalisis: true, observacion: 'Envase húmedo', conclusion: 'NO_CONFORME' as const }
    expect(await repo.registrarEvaluacionBaja(o.lineas[1].id, completa, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no es una baja por deterioro') })
    ok(await repo.registrarEvaluacionBaja(o.lineas[0].id, completa, SANDRA))
    // el archivo del tipo equivocado no sirve
    expect(await repo.adjuntarSustentoBaja(o.lineas[1].id, { tipo: 'COMUNICACION_PROVEEDOR', nombre: 'carta.pdf', ref: 'r1' }, SANDRA)).toMatchObject({ ok: false })
    ok(await repo.adjuntarSustentoBaja(o.lineas[1].id, { tipo: 'ALERTA_DIGEMID', nombre: 'alerta.pdf', ref: 'r2', referencia: 'Alerta 045-2026', bytes: 2048 }, SANDRA))
    expect((await repo.obtenerBaja(sol.id))!.lineas.every((l) => l.faltante === null)).toBe(true)
    // rechazar pide motivo y solo DT
    expect(await repo.cerrarSolicitudBaja(sol.id, 'RECHAZADA', '', KATIA)).toMatchObject({ ok: false })
    expect(await repo.cerrarSolicitudBaja(sol.id, 'RECHAZADA', 'No procede', CHARLIE)).toMatchObject({ ok: false })
    ok(await repo.autorizarBaja(sol.id, KATIA))
    expect(await repo.cerrarSolicitudBaja(sol.id, 'RECHAZADA', 'tarde', KATIA)).toMatchObject({ ok: false })
    // anular y reemitir
    expect(await repo.anularOrdenBaja(sol.id, '', KATIA)).toMatchObject({ ok: false })
    ok(await repo.anularOrdenBaja(sol.id, 'Error en el número de lote', KATIA))
    expect((await repo.obtenerBaja(sol.id))!.estado).toBe('ANULADA')
    const nueva = ok(await repo.reemitirOrdenBaja(sol.id, KATIA))
    expect(nueva.numero).not.toBe(sol.numero)
    expect((await repo.obtenerBaja(nueva.id))!.reemiteDe?.numero).toBe(sol.numero)
    expect(await repo.reemitirOrdenBaja(sol.id, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya fue reemitida') })
  })

  it('quien pidió retira su solicitud con motivo; lo ya pedido en una solicitud abierta no se vuelve a pedir', async () => {
    const { id, filas } = await propietarioConStock()
    const f = filas[0]
    const sol = ok(await repo.solicitarBaja({ propietarioId: id, lineas: [aLinea(f, f.disponible, 'DETERIORO_DANO')] }, CHARLIE))
    expect(await repo.solicitarBaja({ propietarioId: id, lineas: [aLinea(f, 1, 'DETERIORO_DANO')] }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no se puede dar de baja más de lo que hay') })
    expect(await repo.cerrarSolicitudBaja(sol.id, 'CANCELADA', 'Me equivoqué', SANDRA)).toMatchObject({ ok: false })
    ok(await repo.cerrarSolicitudBaja(sol.id, 'CANCELADA', 'Me equivoqué', CHARLIE))
    ok(await repo.solicitarBaja({ propietarioId: id, lineas: [aLinea(f, 1, 'DETERIORO_DANO')] }, CHARLIE)) // las unidades quedaron libres
  })
})
