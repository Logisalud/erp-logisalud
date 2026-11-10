// Fase 4 · P6: sincronización automática de las OC en la demo (espejo de tests/db/piloto-seguridad.test.ts, migración 0045).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { textoUltimaSincronizacion, tocaSincronizar, TEXTO_ERROR_SINCRONIZACION } from '@/domain/oc-versiones'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { estadoE } from '@/services/demo/entradas-demo'
import type { Actor } from '@/services/repositorio'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const SANDRA = actor('asistente_dt', 'asistente_dt'); const AUDITOR = actor('auditor', 'auditoria_lectura')
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; process.env.WMS_DEMO_LOCAL = '1'; repo = new RepositorioDemo() })
afterEach(() => { delete process.env.WMS_DEMO_LOCAL })

describe('reglas puras', () => {
  it('toca si nunca se sincronizó o si la última tiene más de 30 minutos', () => {
    const ahora = new Date('2026-11-07T15:00:00Z')
    expect(tocaSincronizar(undefined, ahora)).toBe(true)
    expect(tocaSincronizar('2026-11-07T14:45:00Z', ahora)).toBe(false)
    expect(tocaSincronizar('2026-11-07T14:29:00Z', ahora)).toBe(true)
  })
  it('el texto dice «Última sincronización con Compras: hace X min»', () => {
    const ahora = new Date('2026-11-07T15:00:00Z')
    expect(textoUltimaSincronizacion(undefined, ahora)).toBe('Todavía no se sincronizó con Compras.')
    expect(textoUltimaSincronizacion('2026-11-07T14:48:00Z', ahora)).toBe('Última sincronización con Compras: hace 12 min')
    expect(textoUltimaSincronizacion('2026-11-07T14:59:50Z', ahora)).toBe('Última sincronización con Compras: hace un momento')
    expect(textoUltimaSincronizacion('2026-11-07T12:00:00Z', ahora)).toBe('Última sincronización con Compras: hace 3 h')
  })
})

describe('sincronización automática (demo)', () => {
  it('la primera vez corre y deja la hora; dentro de 30 minutos no repite; pasados 30, corre y audita las versiones nuevas', async () => {
    const r1 = await repo.sincronizarOcsSiToca(SANDRA)
    expect(r1.estado).toBe('SINCRONIZADA'); expect(r1.resumen!.nuevas).toBeGreaterThan(0)
    expect(r1.actual.ultimaEn).toBeTruthy()
    const versiones = estadoE().auditoria.filter((a) => a.evento === 'oc_version_creada').length
    expect(versiones).toBe(r1.resumen!.nuevas)
    expect(estadoE().auditoria.some((a) => a.evento === 'oc_sincronizacion')).toBe(true)
    expect((await repo.sincronizarOcsSiToca(SANDRA)).estado).toBe('AL_DIA')
    const oc = estadoE().compras.find((c) => ['enviada', 'confirmada', 'parcialmente_recibida'].includes(c.estado ?? 'confirmada'))!
    oc.items[0].pedida += 10
    expect((await repo.sincronizarOcsSiToca(SANDRA)).estado).toBe('AL_DIA')
    repo.fijarUltimaSincronizacionOcs(hace(31))
    const r2 = await repo.sincronizarOcsSiToca(SANDRA)
    expect(r2.estado).toBe('SINCRONIZADA'); expect(r2.resumen!.cambiadas).toBe(1)
    expect(estadoE().auditoria.filter((a) => a.evento === 'oc_version_creada').length).toBe(versiones + 1)
  })
  it('«Revisar ahora» fuerza la revisión y deja la hora', async () => {
    await repo.sincronizarOcsSiToca(SANDRA)
    expect(await repo.sincronizarOcs(SANDRA)).toMatchObject({ ok: true })
    expect((await repo.estadoSincronizacionOcs()).ultimaEn).toBeTruthy()
  })
  it('candado: si otra revisión está en curso, no se repite', async () => {
    repo.fijarSincronizacionEnCurso(true)
    expect((await repo.sincronizarOcsSiToca(SANDRA)).estado).toBe('EN_CURSO')
    expect(await repo.sincronizarOcs(SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Otra persona') })
    repo.fijarSincronizacionEnCurso(false)
    const [a, b] = await Promise.all([repo.sincronizarOcsSiToca(SANDRA), repo.sincronizarOcsSiToca(SANDRA)])
    expect([a.estado, b.estado].filter((x) => x === 'SINCRONIZADA')).toHaveLength(1)
  })
  it('si Compras no responde: mensaje llano, sin detalle técnico, no insiste en 5 minutos y se recupera', async () => {
    repo.fijarFallaSincronizacionOcs(true)
    const r = await repo.sincronizarOcsSiToca(SANDRA)
    expect(r).toMatchObject({ estado: 'ERROR', mensaje: TEXTO_ERROR_SINCRONIZACION })
    expect(r.mensaje).toMatch(/No pudimos revisar Compras ahora/)
    expect((await repo.estadoSincronizacionOcs()).ultimoError).toBe(TEXTO_ERROR_SINCRONIZACION)
    expect(await repo.sincronizarOcs(SANDRA)).toMatchObject({ ok: false, mensaje: TEXTO_ERROR_SINCRONIZACION })
    repo.fijarFallaSincronizacionOcs(false)
    expect((await repo.sincronizarOcsSiToca(SANDRA)).estado).toBe('ERROR')   // dentro de los 5 minutos no insiste
    expect((await repo.sincronizarOcs(SANDRA))).toMatchObject({ ok: true })
    expect((await repo.estadoSincronizacionOcs()).ultimoError).toBeUndefined()
  })
  it('quien solo mira no dispara la sincronización', async () => {
    expect((await repo.sincronizarOcsSiToca(AUDITOR)).estado).toBe('SIN_PERMISO')
    expect((await repo.estadoSincronizacionOcs()).ultimaEn).toBeUndefined()
  })
})
