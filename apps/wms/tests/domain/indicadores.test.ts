import { describe, expect, it } from 'vitest'
import { construirPanoramaDemo } from '@/services/demo/datos'
import { CLAVES_INICIO, DESPACHO_PREVISTO, TEMAS, calcularIndicadores, periodoAnterior, periodoDe, periodoDeRango, variacion, type DatosIndicadores } from '@/domain/indicadores'
import type { SolicitudResumen } from '@/domain/entradas-vistas'
import type { FilaExactitud } from '@/domain/operacion'

const HOY = '2026-10-09'
const p = construirPanoramaDemo(HOY)
const sol = (o: Partial<SolicitudResumen>): SolicitudResumen => ({
  id: 'x', numero: 'SI-1', tipo: 'COMPRA_LOCAL', estado: 'CERRADA', paso: 'CERRADA' as never, propietario: 'LOGISSA', contraparte: 'Proveedor A', unidades: 10, productos: 1, creadoEn: '2026-09-25T15:00:00Z', alertasAbiertas: 0, conDiferencias: false, ...o,
})
const ex = (o: Partial<FilaExactitud>): FilaExactitud => ({ conteo: 'CT-1', cerradoEn: '2026-10-05T20:00:00Z', posicion: 'A-1', producto: 'P', lote: 'L', propietario: 'LOGISSA', estado: 'APROBADO', cantidadSistema: 10, cantidadContada: 10, primerConteo: 10, diferencia: 0, resultado: 'COINCIDE', ...o })
const datos = (o: Partial<DatosIndicadores> = {}): DatosIndicadores => ({
  hoy: HOY, panorama: p, saldosAntes: [], ordenes: [], exactitud: [], solicitudes: [], revisiones: [], pendientes: [], alertas: [], ajustes: [], programaciones: [], cobertura: [], plazoMovHoras: 24, diasAlertaVencimiento: 90, ...o,
})
const por = (xs: ReturnType<typeof calcularIndicadores>, clave: string) => xs.find((i) => i.clave === clave)!

describe('periodos', () => {
  it('los últimos N días y el periodo anterior del mismo largo', () => {
    expect(periodoDe(HOY, 30)).toEqual({ desde: '2026-09-10', hasta: HOY, dias: 30 })
    expect(periodoAnterior(periodoDe(HOY, 30))).toEqual({ desde: '2026-08-11', hasta: '2026-09-09', dias: 30 })
    expect(periodoDe(HOY, 7).desde).toBe('2026-10-03')
  })
  it('un rango libre; si viene mal, los últimos 30 días', () => {
    expect(periodoDeRango('2026-10-01', '2026-10-09', HOY)).toEqual({ desde: '2026-10-01', hasta: '2026-10-09', dias: 9 })
    expect(periodoDeRango('2026-10-09', '2026-10-01', HOY).dias).toBe(30)
    expect(periodoDeRango('x', undefined, HOY).dias).toBe(30)
  })
})

describe('variación: una flecha y el cambio, sin juzgar', () => {
  it('sube, baja, igual y sin dato', () => {
    expect(variacion(92.5, 90, 'pp', 'los 30 días anteriores')).toEqual({ sentido: 'sube', texto: '↑ 2.5 pp frente a los 30 días anteriores' })
    expect(variacion(80, 90, 'pp', 'x')).toMatchObject({ sentido: 'baja', texto: '↓ 10 pp frente a x' })
    expect(variacion(5, 5, 'u', 'x')).toMatchObject({ sentido: 'igual' })
    expect(variacion(null, 5, 'u', 'x')).toBeNull(); expect(variacion(5, null, 'u', 'x')).toBeNull()
  })
})

describe('indicadores', () => {
  const todos = calcularIndicadores(datos(), periodoDe(HOY, 30))
  it('están todos los de kpis.md, agrupados por tema, con fórmula y reporte; 4 en Inicio', () => {
    expect(todos).toHaveLength(17)
    expect(new Set(todos.map((i) => i.clave)).size).toBe(17)
    for (const i of todos) { expect(i.formula.length).toBeGreaterThan(20); expect(i.href).toMatch(/^\//); expect(TEMAS).toContain(i.tema); expect(i.tema).not.toBe('Despacho') }
    expect(todos.filter((i) => i.enInicio).map((i) => i.clave).sort()).toEqual([...CLAVES_INICIO].sort())
    expect(todos.filter((i) => i.tema === 'Calidad').map((i) => i.clave)).toContain('tiempo-cuarentena') // en Reportes, no en Inicio
    expect(por(todos, 'tiempo-cuarentena').enInicio).toBe(false)
  })
  it('Despacho está previsto con sus 4 indicadores', () => {
    expect(DESPACHO_PREVISTO.map((d) => d.nombre)).toEqual(['OTIF', 'Nivel de servicio', 'Exactitud de despacho', 'Tiempo de preparación'])
  })
  it('exactitud: líneas cuyo PRIMER conteo coincidió; compara con el periodo anterior', () => {
    const r = calcularIndicadores(datos({ exactitud: [ex({}), ex({}), ex({ primerConteo: 8, cantidadContada: 10, diferencia: 0 }), ex({ cerradoEn: '2026-09-01T20:00:00Z' })] }), periodoDe(HOY, 30))
    const k = por(r, 'exactitud')
    expect(k.valor).toBeCloseTo(66.7, 1); expect(k.texto).toBe('66.7 %')
    expect(k.datos).toContain('2 de 3 líneas')
    expect(k.variacion?.texto).toBe('↓ 33.3 pp frente a los 30 días anteriores') // antes: 1 de 1 = 100 %
    expect(k.href).toBe('/reportes/exactitud?desde=2026-09-10&hasta=2026-10-09')
  })
  it('sin conteos cerrados no hay valor: lo dice, no inventa', () => {
    const k = por(calcularIndicadores(datos(), periodoDe(HOY, 30)), 'exactitud')
    expect(k.valor).toBeNull(); expect(k.sinDatos).toMatch(/Sin conteos cerrados/)
  })
  it('recepciones con diferencia: % de cerradas del periodo, con detalle por proveedor', () => {
    const r = calcularIndicadores(datos({ solicitudes: [sol({}), sol({ conDiferencias: true }), sol({ conDiferencias: true, contraparte: 'Proveedor B' }), sol({ estado: 'EN_RECEPCION' }), sol({ creadoEn: '2026-08-20T15:00:00Z' })] }), periodoDe(HOY, 30))
    const k = por(r, 'recepciones-dif')
    expect(k.texto).toBe('66.7 %')
    expect(k.detalle).toEqual([{ etiqueta: 'Proveedor A', valor: '1 de 2' }, { etiqueta: 'Proveedor B', valor: '1 de 1' }])
    expect(k.href).toContain('/reportes/recepciones?diferencias=S%C3%AD&desde=2026-09-10&hasta=2026-10-09')
    expect(k.variacion?.texto).toContain('↑') // el anterior tuvo 0 de 1
  })
  it('por vencer y vencidos: lotes y unidades en 90 días o menos, más los vencidos; compara con el stock de hace un periodo', () => {
    const k = por(calcularIndicadores(datos({ saldosAntes: p.saldos.slice(0, 5) }), periodoDe(HOY, 30)), 'vencimientos')
    expect(k.texto).toMatch(/^\d+ lotes? · [\d.,]+ u$/)
    expect(k.detalle.map((x) => x.etiqueta)[0]).toBe('Ya vencidos')
    expect(k.href).toBe('/reportes/vencimientos?diasHasta=90')
    expect(k.variacion).not.toBeNull()
  })
  it('ocupación: % de ubicaciones con stock y detalle por propietario; con propietario, solo sus ubicaciones', () => {
    const k = por(calcularIndicadores(datos({ saldosAntes: p.saldos }), periodoDe(HOY, 30)), 'ocupacion')
    expect(k.valor).toBeGreaterThan(0); expect(k.valor).toBeLessThanOrEqual(100)
    expect(k.detalle.length).toBeGreaterThan(1)
    expect(k.variacion?.sentido).toBe('igual') // el stock de antes es el de ahora
    const dueno = p.propietarios.find((o) => p.asignaciones.some((a) => a.propietarioId === o.id))!
    const kp = por(calcularIndicadores(datos({ saldosAntes: p.saldos }), periodoDe(HOY, 30), { propietarioId: dueno.id }), 'ocupacion')
    expect(kp.formula).toContain('asignadas a este propietario')
    expect(kp.href).toBe(`/reportes/ocupacion?propietario=${dueno.codigo}`)
    expect(por(calcularIndicadores(datos(), periodoDe(HOY, 30), { propietarioId: dueno.id }), 'revision-diaria').filtraPropietario).toBe(false)
  })
  it('movimientos verificados a tiempo y sin verificar usan el plazo configurado', () => {
    const ahora = Date.now()
    const ord = (id: string, h: number, verificadoH?: number) => ({
      id, numero: id, estado: 'EJECUTADO' as const, motivo: 'x', ejecutorId: 'u', ejecutor: 'U', ejecutadoEn: new Date(ahora - h * 3_600_000).toISOString(),
      verificadoEn: verificadoH === undefined ? undefined : new Date(ahora - (h - verificadoH) * 3_600_000).toISOString(),
      lineas: [{ id: id + 'l', productoId: 'p', producto: 'P', loteId: 'l', lote: 'L', propietario: 'LOGISSA', estado: 'APROBADO' as const, procedenciaId: 'x', desdePosicionId: 'a', desde: 'A', haciaPosicionId: 'b', hacia: 'B', cantidad: 1, verificacion: verificadoH === undefined ? 'PENDIENTE' as const : 'CONFIRMADA' as const }],
    })
    // verificado en 2 h (a tiempo), verificado en 30 h (tarde), sin verificar a las 30 h (tarde), sin verificar a las 3 h (todavía en plazo: no cuenta)
    const r = calcularIndicadores(datos({ ordenes: [ord('a', 40, 2), ord('b', 60, 30), ord('c', 30), ord('d', 3)] }), periodoDe(HOY, 30))
    expect(por(r, 'movs-a-tiempo').datos).toContain('1 de 3')
    expect(por(r, 'movs-sin-verificar').valor).toBe(2) // c y d siguen sin verificar
    expect(por(r, 'movs-sin-verificar').detalle[0].valor).toBe('1') // solo c pasó de 24 h
  })
  it('revisión diaria: días de trabajo con revisión cerrada; ajustes y alertas', () => {
    const rev = (fecha: string, estado: 'ABIERTA' | 'CERRADA') => ({ id: fecha, numero: fecha, fecha, responsableId: 'u', responsable: 'U', estado, focos: [], pendientes: [] })
    const r = calcularIndicadores(datos({ revisiones: [rev('2026-10-08', 'CERRADA'), rev('2026-10-07', 'CERRADA'), rev('2026-10-06', 'ABIERTA')] }), periodoDe(HOY, 7))
    expect(por(r, 'revision-diaria').datos).toBe('2 revisiones cerradas en 5 días de trabajo.')
    const aj = calcularIndicadores(datos({ ajustes: [{ id: 'a', numero: 'AJ-1', conteoLineaId: 'l', conteoNumero: 'CT', producto: 'P', lote: 'L', posicion: 'A', delta: -3, causa: 'x', motivo: 'x', estado: 'AUTORIZADO', propuestoPor: 'J', propuestoEn: '2026-10-01T10:00:00Z', decididoEn: '2026-10-02T10:00:00Z' }] }), periodoDe(HOY, 30))
    expect(por(aj, 'ajustes').detalle).toEqual([{ etiqueta: 'Aumentos', valor: '+0 u' }, { etiqueta: 'Disminuciones', valor: '-3 u' }])
  })
})
