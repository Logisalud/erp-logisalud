// El motor demo de la operación diaria aplica las mismas reglas que la migración 0009.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number]): Actor => ({ id: `demo:${rol}`, nombre: `${rol} (demo)`, roles: [rol] })
const AUX = actor('auxiliar'); const JEFE = actor('jefe_almacen'); const KATIA = actor('direccion_tecnica')
let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })
const bien = <T extends { ok: boolean }>(r: T) => { expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); return r as Extract<T, { ok: true }> }
const FOCOS = ['ORDEN', 'LIMPIEZA', 'UBICACIONES', 'ANORMAL'] as const

describe('revisión diaria', () => {
  it('solo el Jefe la hace; una por día; no se cierra con focos sin revisar; el pendiente exige responsable', async () => {
    expect(await repo.iniciarRevision(AUX)).toMatchObject({ ok: false })
    const { id } = bien(await repo.iniciarRevision(JEFE))
    expect(bien(await repo.iniciarRevision(JEFE)).id).toBe(id)
    expect(await repo.cerrarRevision(id, undefined, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Falta revisar/) })
    expect(await repo.registrarPendiente(id, { foco: 'ORDEN', descripcion: 'Cajas', responsableId: '', critico: false, afectaProducto: false }, JEFE)).toMatchObject({ ok: false })
    bien(await repo.registrarPendiente(id, { foco: 'ORDEN', descripcion: 'Cajas en el pasillo', responsableId: 'demo:auxiliar', critico: true, afectaProducto: false, ubicacion: 'D-4' }, JEFE))
    // un foco con pendientes abiertos no queda «sin problemas»
    expect(await repo.marcarFoco(id, 'ORDEN', 'SIN_PROBLEMAS', JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/pendientes abiertos/) })
    for (const f of FOCOS.filter((x) => x !== 'ORDEN')) bien(await repo.marcarFoco(id, f, 'SIN_PROBLEMAS', JEFE))
    bien(await repo.cerrarRevision(id, 'Todo anotado', JEFE))
    expect((await repo.revisionDeHoy())?.estado).toBe('CERRADA')
    expect(await repo.registrarPendiente(id, { foco: 'LIMPIEZA', descripcion: 'x', responsableId: 'demo:auxiliar', critico: false, afectaProducto: false }, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya está cerrada/) })
  })

  it('un pendiente que puede afectar producto avisa a Dirección Técnica', async () => {
    const { id } = bien(await repo.iniciarRevision(JEFE))
    bien(await repo.registrarPendiente(id, { foco: 'ANORMAL', descripcion: 'Goteras sobre el rack G-3', responsableId: 'demo:reemplazo_jefe', critico: true, afectaProducto: true }, JEFE))
    const a = (await repo.listarAlertas()).find((x) => x.tipo === 'PENDIENTE_AFECTA_PRODUCTO')
    expect(a).toMatchObject({ destinatario: 'direccion_tecnica' })
    expect(a?.mensaje).toContain('Goteras')
  })

  it('el responsable resuelve; el Jefe verifica o reabre; el pendiente sigue vivo hasta verificarse', async () => {
    const vivos = await repo.pendientesVivos()
    const abierto = vivos.find((p) => p.estado === 'ABIERTO')!
    expect(abierto.responsableId).toBe('demo:auxiliar')
    expect(await repo.resolverPendiente(abierto.id, 'x', actor('asistente_dt'))).toMatchObject({ ok: false })
    bien(await repo.resolverPendiente(abierto.id, 'Retiradas', AUX))
    expect(await repo.verificarPendiente(abierto.id, true, undefined, AUX)).toMatchObject({ ok: false })
    expect(await repo.verificarPendiente(abierto.id, false, '', JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/qué falta/) })
    bien(await repo.verificarPendiente(abierto.id, false, 'Quedaron dos cajas', JEFE))
    expect((await repo.pendientesVivos()).find((p) => p.id === abierto.id)).toMatchObject({ estado: 'ABIERTO' })
    bien(await repo.resolverPendiente(abierto.id, 'Listo', AUX)); bien(await repo.verificarPendiente(abierto.id, true, undefined, JEFE))
    expect((await repo.pendientesVivos()).some((p) => p.id === abierto.id)).toBe(false)
  })
})

describe('programación de los 3 conteos semanales', () => {
  const lunes = '2026-10-05'
  async function ubicaciones(n: number) {
    const p = await repo.panorama()
    const usadas = new Set((await repo.listarMovimientos()).flatMap((o) => o.lineas.flatMap((l) => [l.desdePosicionId, l.haciaPosicionId])))
    return p.saldos.filter((s) => s.cantidad > 0 && !usadas.has(s.posicionId)).map((s) => s.posicionId).filter((v, i, a) => a.indexOf(v) === i).slice(0, n)
  }

  it('son tres por semana; no se repite el número ni una ubicación; solo el Jefe programa', async () => {
    const [a, b, c, d] = await ubicaciones(4)
    expect(await repo.programarConteoSemanal(lunes, 1, [a], undefined, AUX)).toMatchObject({ ok: false })
    bien(await repo.programarConteoSemanal(lunes, 1, [a], 'Rotación', JEFE))
    expect(await repo.programarConteoSemanal(lunes, 1, [b], undefined, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya está programado/) })
    expect(await repo.programarConteoSemanal(lunes, 2, [a], undefined, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/otro conteo de esa semana/) })
    expect(await repo.programarConteoSemanal(lunes, 4, [b], undefined, JEFE)).toMatchObject({ ok: false })
    bien(await repo.programarConteoSemanal(lunes, 2, [b], undefined, JEFE)); bien(await repo.programarConteoSemanal(lunes, 3, [c, d], undefined, JEFE))
    expect((await repo.programacionDeSemana('2026-10-08')).map((p) => p.orden)).toEqual([1, 2, 3]) // cualquier día de la semana vale
  })

  it('al generar se crea el conteo real (ubicaciones en pausa); se cancela con motivo mientras no se genere', async () => {
    const [a, b] = await ubicaciones(2)
    const { id } = bien(await repo.programarConteoSemanal(lunes, 1, [a], undefined, JEFE))
    expect(await repo.cancelarProgramacion(id, '', JEFE)).toMatchObject({ ok: false })
    const g = bien(await repo.generarConteoProgramado(id, JEFE))
    expect(g.numero).toMatch(/^CT-\d{4}-\d{5}$/)
    expect((await repo.programacionDeSemana(lunes))[0]).toMatchObject({ estado: 'GENERADO', conteoNumero: g.numero })
    expect(await repo.generarConteoProgramado(id, JEFE)).toMatchObject({ ok: false })
    expect(await repo.cancelarProgramacion(id, 'x', JEFE)).toMatchObject({ ok: false })
    expect(Object.keys(await repo.posicionesBloqueadas())).toContain(a)
    const otro = bien(await repo.programarConteoSemanal(lunes, 2, [b], undefined, JEFE))
    bien(await repo.cancelarProgramacion(otro.id, 'Cambia el plan', JEFE))
    expect((await repo.programacionDeSemana(lunes)).find((p) => p.id === otro.id)?.estado).toBe('CANCELADO')
    bien(await repo.programarConteoSemanal(lunes, 2, [b], undefined, JEFE)) // el lugar quedó libre
  })

  it('un conteo extra exige la incidencia y no cuenta entre los tres; la cobertura recuerda lo último contado', async () => {
    const [a] = await ubicaciones(1)
    expect(await repo.programarConteoExtra([a], '  ', JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/incidencia/) })
    bien(await repo.programarConteoExtra([a], 'Faltante del lunes', JEFE))
    const semana = await repo.programacionDeSemana(new Date().toISOString().slice(0, 10))
    expect(semana.filter((p) => p.tipo === 'EXTRA')).toHaveLength(1)
    expect((await repo.ultimaCobertura()).some((c) => c.posicionId === a)).toBe(true)
  })

  it('no se puede contar una ubicación con movimientos por verificar', async () => {
    const o = (await repo.listarMovimientos()).find((x) => x.estado === 'EJECUTADO')!
    const { id } = bien(await repo.programarConteoSemanal(lunes, 1, [o.lineas[0].desdePosicionId], undefined, JEFE))
    expect(await repo.generarConteoProgramado(id, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/movimientos abiertos/) })
  })
})

describe('exactitud', () => {
  it('solo quien gestiona la ve; sale de los conteos cerrados', async () => {
    expect(await repo.exactitudConteos(undefined, undefined, AUX)).toEqual([])
    const filas = await repo.exactitudConteos(undefined, undefined, KATIA)
    expect(filas.length).toBeGreaterThan(30) // la demo trae conteos cerrados de los últimos dos meses
    expect(filas.some((f) => f.primerConteo !== f.cantidadSistema)).toBe(true) // y algunos con diferencia
    expect(filas.some((f) => f.primerConteo !== f.cantidadSistema && f.diferencia === 0)).toBe(true) // coincidieron recién en el reconteo
    expect(await repo.exactitudConteos('2999-01-01', undefined, KATIA)).toEqual([])
  })
})
