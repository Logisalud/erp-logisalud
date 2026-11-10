// Piloto (0038) en la demostración: modo_piloto, avisos a Pedidos retenidos (nada sale), copia inmutable de las órdenes de compra. Espejo de tests/db/piloto-seguridad.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { construirConsulta, construirPayloadNubefact, type TrasladoGuia } from '@/domain/guia-electronica'
import { ESTADO_EVENTO_RETENIDO, normalizarModoPiloto, resolverModoPiloto } from '@/domain/modo-piloto'
import { describirCambioOc, situacionOc } from '@/domain/oc-versiones'
import { hashDeContenidoOc } from '@/lib/oc-hash'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { estadoE } from '@/services/demo/entradas-demo'
import { SimuladorNubefact, reiniciarSimuladorNubefact } from '@/services/nubefact/simulador'
import { pedidosRecibidos, reiniciarPedidosRecibidos } from '@/services/pedidos/notificar'
import { enviarEventosPedidos } from '@/services/guia-electronica'
import { modoPilotoActivo } from '@/lib/modo-piloto'
import type { Actor } from '@/services/repositorio'
import { imprimirYConformar } from './ayudas-orden'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('auxiliar', 'auxiliar'); const SANDRA = actor('asistente_dt', 'asistente_dt', 'conformidad_despacho')
const AUDITOR = actor('auditor', 'auditoria_lectura')
const traslado: TrasladoGuia = { fechaInicio: '2026-10-20', pesoKg: 12 }

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  process.env.WMS_DEMO_LOCAL = '1'
  reiniciarSimuladorNubefact(); reiniciarPedidosRecibidos()
  repo = new RepositorioDemo()
})
afterEach(() => { delete process.env.WMS_DEMO_LOCAL; delete process.env.WMS_MODO_PILOTO; delete process.env.WMS_GO_LIVE; vi.restoreAllMocks() })

async function guiaEmitida() {
  const [res] = await repo.listarSalidas()
  await imprimirYConformar(repo, res.id, { jt: JT, picker: AUX, conforme: SANDRA, bultos: 2, conformar: true })
  const datos = (await repo.datosGuia(res.id))!
  const n = await repo.reservarNumeroGuia(datos.serie, 'SIMULADOR', res.id)
  if (!n.ok) throw new Error(n.mensaje)
  const payload = construirPayloadNubefact(datos, traslado, '2026-10-19', n.numero)
  const sim = new SimuladorNubefact()
  const r = await sim.emitirGuia(payload)
  if (!r.ok) throw new Error(r.error)
  const reg = await repo.registrarGuiaElectronica(res.id, r, traslado, payload, JT)
  if (reg.ok) { const c = await sim.consultarGuia(construirConsulta(datos.serie, n.numero)); if (c.ok) await repo.actualizarEstadoGuia(reg.id, c, JT) }
  return res.id
}

describe('modo_piloto (dominio)', () => {
  it('normaliza si/no y falla cerrado: sin parámetro es piloto salvo WMS_GO_LIVE=1; WMS_MODO_PILOTO=1 manda siempre', () => {
    expect(normalizarModoPiloto(' SI ')).toBe('si'); expect(normalizarModoPiloto('No')).toBe('no'); expect(normalizarModoPiloto('quizás')).toBeUndefined(); expect(normalizarModoPiloto(null)).toBeUndefined()
    expect(resolverModoPiloto('si', {})).toBe(true)
    expect(resolverModoPiloto('no', {})).toBe(false)
    expect(resolverModoPiloto(undefined, {})).toBe(true)
    expect(resolverModoPiloto(undefined, { WMS_GO_LIVE: '1' })).toBe(false)
    expect(resolverModoPiloto('no', { WMS_MODO_PILOTO: '1' })).toBe(true)
    expect(resolverModoPiloto('no', { WMS_GO_LIVE: '1' })).toBe(false)
  })
  it('la demo no es piloto por defecto; fijarModoPiloto («si») lo enciende y modoPilotoActivo lo refleja', async () => {
    expect(await repo.modoPiloto()).toBe('no'); expect(await modoPilotoActivo()).toBe(false)
    repo.fijarModoPiloto('si')
    expect(await repo.modoPiloto()).toBe('si'); expect(await modoPilotoActivo()).toBe(true)
    repo.fijarModoPiloto('no')
    process.env.WMS_MODO_PILOTO = '1'
    expect(await modoPilotoActivo()).toBe(true)
  })
})

describe('B.4: nada hacia Pedidos en el piloto (demo)', () => {
  it('con modo_piloto = si el aviso nace RETENIDO_PILOTO, no se puede marcar enviado y enviarEventosPedidos no manda nada', async () => {
    repo.fijarModoPiloto('si')
    const id = await guiaEmitida()
    const ev = await repo.eventosPedidos({ salidaId: id })
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ tipo: 'GUIA_EMITIDA', estado: ESTADO_EVENTO_RETENIDO })
    expect(await repo.eventosPedidos({ soloPendientes: true })).toHaveLength(0)
    expect(await repo.marcarEventoPedidos(ev[0].id, true, undefined, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no se envía nada a Pedidos') })
    const fetchEspia = vi.spyOn(globalThis, 'fetch')
    expect(await enviarEventosPedidos(JT, id)).toMatchObject({ enviados: 0, pendientes: 0, retenidos: true })
    expect(await enviarEventosPedidos(JT)).toMatchObject({ enviados: 0, retenidos: true })
    expect(fetchEspia).not.toHaveBeenCalled()
    expect(pedidosRecibidos()).toEqual([])
    expect((await repo.eventosPedidos({ salidaId: id }))[0].estado).toBe(ESTADO_EVENTO_RETENIDO)
  })
  it('con modo_piloto = no sigue como siempre: el aviso nace PENDIENTE y sale', async () => {
    const id = await guiaEmitida()
    expect((await repo.eventosPedidos({ salidaId: id }))[0].estado).toBe('PENDIENTE')
    expect(await enviarEventosPedidos(JT, id)).toMatchObject({ enviados: 1, pendientes: 0 })
    expect(pedidosRecibidos()).toHaveLength(1)
  })
})

describe('A.1: copia inmutable de las órdenes de compra (demo)', () => {
  const abiertas = () => estadoE().compras.filter((c) => ['enviada', 'confirmada', 'parcialmente_recibida'].includes(c.estado ?? 'confirmada'))

  it('la primera revisión copia las abiertas (versión 1); sin cambios no duplica; lo recibido no cuenta como cambio', async () => {
    await repo.ocsPendientes()
    const n = abiertas().length
    expect(n).toBeGreaterThan(0)
    expect((await repo.ocsDelPiloto()).every((o) => o.situacion === 'SIN_COPIA' && o.versionVigente === 0)).toBe(true)
    const r1 = await repo.sincronizarOcs(SANDRA)
    expect(r1).toMatchObject({ ok: true, resumen: { revisadas: n, nuevas: n, cambiadas: 0, eliminadas: 0, sinCambios: 0 } })
    const lista = await repo.ocsDelPiloto()
    expect(lista.every((o) => o.situacion === 'AL_DIA' && o.versionVigente === 1 && o.copiadaPor === SANDRA.nombre)).toBe(true)
    const oc = abiertas()[0]; oc.items[0].recibida += 1; oc.items[0].facturada += 1
    expect(await repo.sincronizarOcs(SANDRA)).toMatchObject({ ok: true, resumen: { nuevas: 0, cambiadas: 0, sinCambios: n } })
  })

  it('un cambio de cantidad, una línea agregada o la anulación crean versión nueva con alerta OC_CAMBIADA; la copia anterior queda intacta', async () => {
    await repo.sincronizarOcs(SANDRA)
    const oc = abiertas()[0]
    const e = estadoE()
    const v1 = structuredClone((await import('@/services/demo/piloto-estado')).piloto(e).versiones.find((v) => v.encabezado.ocId === oc.ocId)!)
    oc.items[0].pedida += 50
    expect(await repo.sincronizarOcs(SANDRA)).toMatchObject({ ok: true, resumen: { cambiadas: 1 } })
    oc.estado = 'anulada'
    await repo.sincronizarOcs(SANDRA)
    const versiones = (await import('@/services/demo/piloto-estado')).piloto(e).versiones.filter((v) => v.encabezado.ocId === oc.ocId)
    expect(versiones.map((v) => v.version)).toEqual([1, 2, 3])
    expect(versiones[0]).toEqual(v1)
    const alertas = e.alertas.filter((a) => a.tipo === 'OC_CAMBIADA')
    expect(alertas).toHaveLength(2)
    expect(alertas.every((a) => a.destinatario === 'asistente_dt')).toBe(true)
    const textos = alertas.map((a) => a.mensaje).join('|')
    expect(textos).toContain('1 línea con otra cantidad'); expect(textos).toContain('la anularon')
    const vista = (await repo.ocsDelPiloto()).find((o) => o.ocId === oc.ocId)!
    expect(vista).toMatchObject({ versionVigente: 3, cambios: 2, avisoAbierto: true, situacion: 'CAMBIO' })
  })

  it('si Compras borra la OC, la copia se conserva y una versión nueva lo asienta con alerta', async () => {
    await repo.sincronizarOcs(SANDRA)
    const e = estadoE()
    const oc = abiertas()[0]
    e.compras = e.compras.filter((c) => c.ocId !== oc.ocId)
    expect(await repo.sincronizarOcs(SANDRA)).toMatchObject({ ok: true, resumen: { eliminadas: 1 } })
    expect(await repo.sincronizarOcs(SANDRA)).toMatchObject({ ok: true, resumen: { eliminadas: 0 } })
    const vista = (await repo.ocsDelPiloto()).find((o) => o.ocId === oc.ocId)!
    expect(vista).toMatchObject({ situacion: 'ELIMINADA', eliminadaEnCompras: true, versionVigente: 2 })
    expect(e.alertas.some((a) => a.tipo === 'OC_CAMBIADA' && /ya no existe en Compras/.test(a.mensaje))).toBe(true)
  })

  it('sin permiso de ejecutar no se copia nada', async () => {
    expect(await repo.sincronizarOcs(AUDITOR)).toMatchObject({ ok: false, mensaje: expect.stringContaining('No tienes permiso') })
    expect((await repo.ocsDelPiloto()).every((o) => o.versionVigente === 0)).toBe(true)
  })

  it('el hash no depende del orden de las líneas y describirCambioOc lo cuenta en palabras; situacionOc', () => {
    const l = (id: string, c: number) => ({ ocItemId: id, productoId: 'p' + id, productoCodigo: id, productoDescripcion: id, cantidadPedida: c })
    const enc = { ocId: 'o', codigo: 'OC-1', proveedorId: 'x', proveedorNombre: 'P', proveedorRuc: '1', anulada: false }
    const a = { encabezado: enc, lineas: [l('1', 5), l('2', 6)] }
    expect(hashDeContenidoOc(a)).toBe(hashDeContenidoOc({ encabezado: enc, lineas: [l('2', 6), l('1', 5)] }))
    expect(hashDeContenidoOc(a)).not.toBe(hashDeContenidoOc({ encabezado: enc, lineas: [l('1', 5), l('2', 7)] }))
    const antes = { ...a, id: 'v', version: 1, hash: 'h', eliminadaEnCompras: false, creadaEn: '' }
    expect(describirCambioOc('OC-1', 2, antes, { encabezado: enc, lineas: [l('1', 9), l('3', 1)] })).toMatch(/versión 2\): 1 línea con otra cantidad; 1 línea agregada; 1 línea quitada\./)
    expect(situacionOc({ versionVigente: 0, cambios: 0, avisoAbierto: false, eliminadaEnCompras: false })).toBe('SIN_COPIA')
    expect(situacionOc({ versionVigente: 2, cambios: 1, avisoAbierto: false, eliminadaEnCompras: false })).toBe('AL_DIA')
  })
})
