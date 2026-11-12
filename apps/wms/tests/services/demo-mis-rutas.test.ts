// Fase 4 · P4: «Mis rutas» en la demo, de punta a punta: ruta del día → llegué → entregado con foto → no entregado/rechazado (aviso al Jefe) → ruta pendiente de cierre → LS-FR.43.03.
import { beforeEach, describe, expect, it } from 'vitest'
import { sumarDiasISO } from '@/domain/operacion'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { desp } from '@/services/demo/despacho-demo'
import { estadoE } from '@/services/demo/entradas-demo'
import type { Actor } from '@/services/repositorio'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const COND = actor('conductor', 'conductor'); const AUXT = actor('auxiliar_transporte', 'auxiliar_transporte'); const JT = actor('jt', 'jefe_transporte', 'jefe_almacen'); const OTRO = actor('otro', 'conductor')
const foto = { ref: 'entregas/h-foto.jpg', nombre: 'foto.jpg', hash: 'h'.repeat(64), bytes: 2048, tipo: 'image/jpeg' }
const exito = <T extends { ok: boolean }>(r: T) => { expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); return r as Extract<T, { ok: true }> }
let repo: RepositorioDemo

/** Una ruta de hoy con una parada, de la que son per-1 (conductor) y per-3 (auxiliar); se deja «en ruta» (el recorrido hasta ahí ya lo prueban demo-carga y demo-cierre-ruta). */
async function rutaEnRuta(estado: 'EN_RUTA' | 'LIBERADA' = 'EN_RUTA') {
  const pan = await repo.panoramaRutas()
  const a = pan.pedidos.find((p) => !p.enRuta && !p.cambioPorRevisar && p.sinCatalogo.length === 0)!
  const creada = exito(await repo.crearRuta({ fecha: pan.hoy, vehiculoId: 'veh-2', conductorId: 'per-1', auxiliarId: 'per-3' }, JT))
  exito(await repo.planificarRuta(creada.id, { fecha: pan.hoy, vehiculoId: 'veh-2', conductorId: 'per-1', auxiliarId: 'per-3', paradas: [{ pedidoId: a.pedidoId }] }, JT))
  desp(estadoE()).rutas.find((r) => r.id === creada.id)!.estado = estado
  return creada.id
}
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  process.env.WMS_DEMO_LOCAL = '1'
  repo = new RepositorioDemo()
})

describe('mis rutas (demo)', () => {
  it('cada quien ve solo sus rutas de hoy: conductor y auxiliar de la ruta sí; otro conductor y quien no es de campo, no', async () => {
    const id = await rutaEnRuta()
    for (const quien of [COND, AUXT]) {
      const r = await repo.misRutas(quien)
      expect(r).toHaveLength(1)
      expect(r[0]).toMatchObject({ id, estado: 'EN_RUTA', puedeMarcar: true })
      expect(r[0].paradas).toHaveLength(1)
      expect(r[0].paradas.every((p) => p.estado === 'PENDIENTE' && p.cliente)).toBe(true)
      // lo que necesita para iniciar la ruta (las columnas de la hoja interna): condición y las que trae el pedido
      expect(r[0].paradas[0]).toMatchObject({ condicion: 'DESPACHO' })
      expect(Object.keys(r[0].paradas[0])).toEqual(expect.arrayContaining(['condicion', 'guia', 'representante', 'formaPago']))
    }
    expect(await repo.misRutas(OTRO)).toEqual([])
    expect(await repo.misRutas(JT)).toEqual([])
    expect(await repo.misRutas(COND, sumarDiasISO((await repo.panoramaRutas()).hoy, 5))).toEqual([])
  })
  it('llegué → entregado con quién recibió (nombre y DNI) y la foto; las reglas de orden y de datos se aplican', async () => {
    await rutaEnRuta()
    const [p1] = (await repo.misRutas(COND))[0].paradas
    expect(await repo.registrarEventoParada(p1.id, 'ENTREGADO', { recibioNombre: 'María Pérez', recibioDocumento: '12345678', foto }, COND)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Primero marca «Llegué»') })
    exito(await repo.registrarEventoParada(p1.id, 'LLEGUE', {}, COND))
    expect(await repo.registrarEventoParada(p1.id, 'LLEGUE', {}, AUXT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Ya marcaste') })
    expect(await repo.registrarEventoParada(p1.id, 'ENTREGADO', { recibioNombre: 'María Pérez', recibioDocumento: '123', foto }, COND)).toMatchObject({ ok: false, mensaje: expect.stringContaining('8 números') })
    expect(await repo.registrarEventoParada(p1.id, 'ENTREGADO', { recibioNombre: 'María Pérez', recibioDocumento: '12345678' }, COND)).toMatchObject({ ok: false, mensaje: expect.stringContaining('foto') })
    exito(await repo.registrarEventoParada(p1.id, 'ENTREGADO', { recibioNombre: 'María Pérez', recibioDocumento: '12345678', foto }, AUXT))
    const [despues] = (await repo.misRutas(COND))[0].paradas
    expect(despues.estado).toBe('ENTREGADO')
    expect(despues.eventos.map((e) => e.evento)).toEqual(['LLEGUE', 'ENTREGADO'])
    expect(despues.eventos[1]).toMatchObject({ recibioNombre: 'María Pérez', recibioDocumento: '12345678', fotoNombre: 'foto.jpg' })
    expect(await repo.registrarEventoParada(p1.id, 'NO_ENTREGADO', { motivo: 'cliente ausente' }, COND)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya tiene su resultado') })
    exito(await repo.registrarEventoParada(p1.id, 'INCIDENCIA', { motivo: 'Tráfico en la avenida' }, COND))
  })
  it('una ruta ajena o que todavía no salió no admite nada; sin permiso tampoco', async () => {
    await rutaEnRuta('LIBERADA')
    const [p] = (await repo.misRutas(COND))[0].paradas
    expect(await repo.registrarEventoParada(p.id, 'LLEGUE', {}, COND)).toMatchObject({ ok: false, mensaje: expect.stringContaining('todavía no salió') })
    expect(await repo.registrarEventoParada(p.id, 'LLEGUE', {}, OTRO)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no es de una ruta tuya') })
    expect(await repo.registrarEventoParada(p.id, 'LLEGUE', {}, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('No tienes permiso') })
  })
  it('rechazado y no entregado piden motivo y avisan al Jefe de Transporte; con la parada resuelta la ruta queda pendiente de cierre y el LS-FR.43.03 recibe los datos', async () => {
    const id = await rutaEnRuta()
    const [p1] = (await repo.misRutas(COND))[0].paradas
    expect(await repo.registrarEventoParada(p1.id, 'NO_ENTREGADO', { motivo: 'no' }, COND)).toMatchObject({ ok: false, mensaje: expect.stringContaining('motivo') })
    exito(await repo.registrarEventoParada(p1.id, 'LLEGUE', {}, COND))
    const r1 = exito(await repo.registrarEventoParada(p1.id, 'RECHAZADO', { motivo: 'El cliente no aceptó el pedido' }, AUXT))
    expect(r1).toMatchObject({ retornoPorOriginar: true, rutaPendienteDeCierre: true })
    expect((await repo.misRutas(COND))[0]).toMatchObject({ estado: 'PENDIENTE_CIERRE' })
    const alertas = estadoE().alertas.filter((a) => a.tipo === ('RETORNO_POR_ORIGINAR' as never))
    expect(alertas).toHaveLength(1)
    expect(alertas.every((a) => a.destinatario === 'jefe_transporte' && /Origina el retorno/.test(a.mensaje))).toBe(true)
    // el Jefe de Transporte cierra como siempre: el registro del formato ya trae lo que se marcó
    expect((await repo.registroLsFr(id))!.filas.map((f) => f.observaciones).join(' | ')).toContain('Rechazado: El cliente no aceptó el pedido')
  })
  it('no entregado sin haber llegado también vale (cliente ausente) y avisa igual', async () => {
    await rutaEnRuta()
    const [p1] = (await repo.misRutas(COND))[0].paradas
    expect(exito(await repo.registrarEventoParada(p1.id, 'NO_ENTREGADO', { motivo: 'Local cerrado' }, COND))).toMatchObject({ retornoPorOriginar: true })
    expect((await repo.misRutas(COND))[0].paradas[0].estado).toBe('NO_ENTREGADO')
  })
  it('una entrega deja hora de entrega y quién recibió en el LS-FR.43.03', async () => {
    const id = await rutaEnRuta()
    const [p1] = (await repo.misRutas(COND))[0].paradas
    exito(await repo.registrarEventoParada(p1.id, 'LLEGUE', {}, COND))
    exito(await repo.registrarEventoParada(p1.id, 'ENTREGADO', { recibioNombre: 'María Pérez', recibioDocumento: '12345678', foto }, COND))
    const fila = (await repo.registroLsFr(id))!.filas.find((f) => f.observaciones?.includes('María Pérez'))!
    expect(fila.horaEntrega).toBeTruthy()
    expect(fila.observaciones).toBe('Recibió María Pérez (DNI 12345678)')
  })

  it('el Jefe de Transporte ve la ruta como la ve el transportista, aunque todavía no salga, sin poder marcar nada', async () => {
    const id = await rutaEnRuta()
    const v = (await repo.rutaComoLaVeElTransportista(id))!
    expect(v).toMatchObject({ id, puedeMarcar: false })
    expect(v.paradas[0]).toMatchObject({ condicion: 'DESPACHO' })
    expect(await repo.rutaComoLaVeElTransportista('no-existe')).toBeNull()
  })
})
