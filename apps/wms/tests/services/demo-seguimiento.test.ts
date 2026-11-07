// Fase 4 · P9: seguimiento para el cliente en la demo (espejo de tests/db/seguimiento.test.ts): apagado en el piloto, solo hitos, límite de intentos y enlaces con token.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jt', 'jefe_transporte', 'jefe_almacen'); const AUDITOR = actor('auditor', 'auditoria_lectura')
let repo: RepositorioDemo
let RUC = ''
beforeEach(async () => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; process.env.WMS_DEMO_LOCAL = '1'
  repo = new RepositorioDemo()
  RUC = (await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-101')!.ruc!
})
const encender = () => { repo.fijarModoPiloto('no'); repo.fijarSeguimientoHabilitado(true) }

describe('apagado en el piloto', () => {
  it('con modo piloto responde «no disponible» y no genera enlaces, aunque el interruptor esté encendido', async () => {
    repo.fijarModoPiloto('si'); repo.fijarSeguimientoHabilitado(true)
    expect(await repo.consultarSeguimiento('PED-DEMO-101', RUC, '1.1.1.1')).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(await repo.consultarSeguimientoPorToken('x'.repeat(64), '1.1.1.1')).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(await repo.crearEnlaceSeguimiento('PED-DEMO-101', 30, JT)).toMatchObject({ ok: false, mensaje: 'Seguimiento aún no disponible' })
    expect(repo.tokensGuardadosSeguimiento()).toEqual([])
  })
  it('fuera del piloto pero con el interruptor apagado (de fábrica) tampoco está disponible', async () => {
    repo.fijarModoPiloto('no')
    expect(await repo.consultarSeguimiento('', '', '1.1.1.1')).toEqual({ estado: 'NO_DISPONIBLE' })
  })
})

describe('encendido', () => {
  beforeEach(encender)
  it('al abrir la página sin datos solo dice que está disponible (no cuenta como intento)', async () => {
    for (let i = 0; i < 20; i++) expect(await repo.consultarSeguimiento('', '', '2.2.2.2')).toEqual({ estado: 'LISTO' })
    expect((await repo.consultarSeguimiento('PED-DEMO-101', RUC, '2.2.2.2')).estado).toBe('OK')
  })
  it('pedido + RUC: hitos con fecha y hora, sin datos sensibles; no revela si el pedido existe', async () => {
    const r = await repo.consultarSeguimiento(' ped-demo-101 ', RUC, '3.3.3.3')
    expect(r.estado).toBe('OK')
    if (r.estado !== 'OK') return
    expect(r.pedido).toBe('PED-DEMO-101'); expect(r.hitos[0].estado).toBe('RECIBIDO')
    expect(r.hitos.every((x) => Object.keys(x).sort().join() === 'en,estado' && !Number.isNaN(Date.parse(x.en)))).toBe(true)
    const texto = JSON.stringify(r).toLowerCase()
    for (const s of ['giraldez', 'rosa paredes', 'contado', 'lote', 'precio']) expect(texto).not.toContain(s)
    const a = await repo.consultarSeguimiento('PED-NOEXISTE', RUC, '3.3.3.4'); const b = await repo.consultarSeguimiento('PED-DEMO-101', '20999999999', '3.3.3.5')
    expect(a).toEqual({ estado: 'NO_ENCONTRADO' }); expect(b).toEqual(a)
  })
  it('límite por pedido (5), por IP (8) y vuelve a poder a los 15 minutos; igual si el pedido existe o no', async () => {
    for (let i = 0; i < 5; i++) await repo.consultarSeguimiento('PED-DEMO-101', '20999999999', `4.4.4.${i}`)
    const e = await repo.consultarSeguimiento('PED-DEMO-101', RUC, '4.4.4.99')
    expect(e).toMatchObject({ estado: 'ESPERA' }); expect(e.estado === 'ESPERA' && e.esperaSegundos).toBeGreaterThan(0)
    for (let i = 0; i < 5; i++) await repo.consultarSeguimiento('PED-FANTASMA', RUC, `4.5.5.${i}`)
    expect((await repo.consultarSeguimiento('PED-FANTASMA', RUC, '4.5.5.99')).estado).toBe('ESPERA')
    for (let i = 0; i < 8; i++) await repo.consultarSeguimiento(`PED-X${i}`, RUC, '6.6.6.6')
    expect((await repo.consultarSeguimiento('PED-DEMO-102', RUC, '6.6.6.6')).estado).toBe('ESPERA')
    repo.envejecerIntentosSeguimiento(16 * 60_000)
    expect((await repo.consultarSeguimiento('PED-DEMO-101', RUC, '6.6.6.6')).estado).toBe('OK')
  })
  it('enlace con token: solo el personal con permiso lo genera, se guarda solo su hash, sirve, se revoca y vence', async () => {
    expect(await repo.crearEnlaceSeguimiento('PED-DEMO-101', 30, AUDITOR)).toMatchObject({ ok: false })
    const e = await repo.crearEnlaceSeguimiento('PED-DEMO-101', 7, JT)
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.token).toMatch(/^[0-9a-f]{128}$/)
    expect(JSON.stringify(repo.tokensGuardadosSeguimiento())).not.toContain(e.token)
    expect(await repo.consultarSeguimientoPorToken(e.token, '7.7.7.7')).toMatchObject({ estado: 'OK', pedido: 'PED-DEMO-101' })
    expect(await repo.consultarSeguimientoPorToken(`${e.token}0`, '7.7.7.7')).toEqual({ estado: 'NO_ENCONTRADO' })
    expect(await repo.revocarEnlacesSeguimiento('PED-DEMO-101', JT)).toMatchObject({ ok: true, revocados: 1 })
    expect(await repo.consultarSeguimientoPorToken(e.token, '7.7.7.7')).toEqual({ estado: 'NO_ENCONTRADO' })
    const v = await repo.crearEnlaceSeguimiento('PED-DEMO-101', 1, JT)
    if (!v.ok) throw new Error(v.mensaje)
    repo.vencerEnlacesSeguimiento()
    expect(await repo.consultarSeguimientoPorToken(v.token, '7.7.7.8')).toEqual({ estado: 'NO_ENCONTRADO' })
    expect(await repo.crearEnlaceSeguimiento('PED-DEMO-101', 400, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('1 y 90') })
  })
  it('tokens inventados: a los 5 fallos espera', async () => {
    for (let i = 0; i < 5; i++) await repo.consultarSeguimientoPorToken(`falso-${i}`, `8.8.8.${i}`)
    expect((await repo.consultarSeguimientoPorToken('otro', '8.8.8.99')).estado).toBe('ESPERA')
  })
})
