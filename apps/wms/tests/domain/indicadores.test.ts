import { describe, expect, it } from 'vitest'
import { construirPanoramaDemo } from '@/services/demo/datos'
import { CLAVES_INICIO, DESPACHO_PREVISTO, MAS_ES_MEJOR, TEMAS, calcularIndicadores, conSeries, diasDeSerie, juzgar, periodoAnterior, periodoDe, periodoDeRango, tiemposDeDisponibilidad, variacion, type DatosIndicadores } from '@/domain/indicadores'
import type { OrdenMovimiento } from '@/domain/inventario'
import type { SolicitudResumen } from '@/domain/entradas-vistas'
import type { FilaExactitud } from '@/domain/operacion'

const HOY = '2026-10-09'
const p = construirPanoramaDemo(HOY)
const sol = (o: Partial<SolicitudResumen>): SolicitudResumen => ({
  id: 'x', numero: 'SI-1', tipo: 'COMPRA_LOCAL', estado: 'CERRADA', paso: 'CERRADA' as never, propietario: 'LOGISSA', contraparte: 'Proveedor A', unidades: 10, productos: 1, creadoEn: '2026-09-25T15:00:00Z', alertasAbiertas: 0, conDiferencias: false, tiposDiferencia: [], ...o,
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

describe('variación: hacia dónde va, con una palabra según el sentido del indicador', () => {
  it('sube, baja, igual y sin dato (todavía sin juzgar)', () => {
    expect(variacion(92.5, 90, 'puntos', 'los 30 días anteriores')).toEqual({ sentido: 'sube', efecto: 'sin-juicio', cantidad: '2.5 puntos', palabra: '', texto: '↑ 2.5 puntos', comparacion: 'frente a los 30 días anteriores' })
    expect(variacion(80, 90, 'puntos', 'x')).toMatchObject({ sentido: 'baja', texto: '↓ 10 puntos', comparacion: 'frente a x' })
    expect(variacion(5, 5, 'u', 'x')).toMatchObject({ sentido: 'igual', efecto: 'igual', texto: '= sin cambio' })
    expect(variacion(null, 5, 'u', 'x')).toBeNull(); expect(variacion(5, null, 'u', 'x')).toBeNull()
  })
  it('un solo punto o lote se dice en singular', () => {
    expect(variacion(11, 10, 'puntos', 'x', 0)?.cantidad).toBe('1 punto')
    expect(variacion(3, 2, 'lotes', 'x', 0)?.cantidad).toBe('1 lote')
    expect(variacion(5, 2, 'lotes', 'x', 0)?.cantidad).toBe('3 lotes')
  })
  it('«más es mejor»: si sube, mejoró; si baja, empeoró', () => {
    expect(juzgar(variacion(84.4, 68.8, 'puntos', 'x'), true)).toMatchObject({ efecto: 'mejoro', palabra: 'mejoró', texto: '↑ 15.6 puntos · mejoró' })
    expect(juzgar(variacion(68.8, 84.4, 'puntos', 'x'), true)).toMatchObject({ efecto: 'empeoro', palabra: 'empeoró', texto: '↓ 15.6 puntos · empeoró' })
  })
  it('«más es peor»: si sube, empeoró; si baja, mejoró', () => {
    expect(juzgar(variacion(30.4, 14, 'puntos', 'x'), false)).toMatchObject({ efecto: 'empeoro', texto: '↑ 16.4 puntos · empeoró' })
    expect(juzgar(variacion(10, 14, 'puntos', 'x'), false)).toMatchObject({ efecto: 'mejoro', texto: '↓ 4 puntos · mejoró' })
  })
  it('sin cambio no juzga, y un indicador sin sentido declarado muestra solo la flecha y el cambio', () => {
    expect(juzgar(variacion(5, 5, 'u', 'x'), true)).toMatchObject({ efecto: 'igual', palabra: 'sin cambio' })
    expect(juzgar(variacion(7, 5, 'u', 'x', 0), null)).toMatchObject({ efecto: 'sin-juicio', palabra: '', texto: '↑ 2 u' })
    expect(juzgar(null, true)).toBeNull()
  })
})

describe('indicadores', () => {
  const todos = calcularIndicadores(datos(), periodoDe(HOY, 30))
  it('están todos los de kpis.md, agrupados por tema, con fórmula y reporte; 3 en Inicio', () => {
    expect(todos).toHaveLength(18)
    expect(new Set(todos.map((i) => i.clave)).size).toBe(18)
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
    expect(k.variacion?.texto).toBe('↓ 33.3 puntos · empeoró') // antes: 1 de 1 = 100 %; para la exactitud, más es mejor
    expect(k.variacion?.comparacion).toBe('frente a los 30 días anteriores')
    expect(k.href).toBe('/reportes/exactitud?desde=2026-09-10&hasta=2026-10-09')
  })
  it('sin conteos cerrados no hay valor: lo dice, no inventa', () => {
    const k = por(calcularIndicadores(datos(), periodoDe(HOY, 30)), 'exactitud')
    expect(k.valor).toBeNull(); expect(k.sinDatos).toMatch(/Sin conteos cerrados/)
  })
  it('recepciones con diferencia: por la fecha en que se confirmó la recepción física, con el tipo de diferencia por proveedor', () => {
    const conf = (dia: string, o: Partial<SolicitudResumen> = {}) => sol({ confirmadaEn: `${dia}T15:00:00Z`, creadoEn: '2026-07-01T15:00:00Z', ...o })
    const r = calcularIndicadores(datos({ solicitudes: [
      conf('2026-10-01'), conf('2026-10-02', { conDiferencias: true, tiposDiferencia: ['CANTIDAD'] }),
      conf('2026-10-03', { conDiferencias: true, tiposDiferencia: ['LOTE', 'VENCIMIENTO'], contraparte: 'Proveedor B' }),
      sol({ confirmadaEn: undefined }), // todavía sin confirmar: no cuenta aunque se haya creado en el periodo
      conf('2026-08-20'), // antes del periodo
      sol({ creadoEn: '2026-09-25T15:00:00Z', confirmadaEn: '2026-08-15T15:00:00Z', conDiferencias: true, tiposDiferencia: ['CANTIDAD'] }), // creada en el periodo pero confirmada en el anterior
    ] }), periodoDe(HOY, 30))
    const k = por(r, 'recepciones-dif')
    expect(k.texto).toBe('66.7 %')
    expect(k.detalle).toEqual([{ etiqueta: 'Proveedor A', valor: '1 de 2', sub: 'cantidad distinta' }, { etiqueta: 'Proveedor B', valor: '1 de 1', sub: 'lote distinto · vencimiento distinto' }])
    expect(k.datos).toContain('Tipos:')
    expect(k.variacion?.texto).toContain('↑') // el periodo anterior: 1 de 2 = 50 %
    expect(k.href).toContain('/reportes/recepciones?diferencias=S%C3%AD&desde=2026-09-10&hasta=2026-10-09')
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

describe('cada indicador declara si «más» es mejor o peor', () => {
  const todos = calcularIndicadores(datos(), periodoDe(HOY, 30))
  it('todos están declarados; los porcentajes de acierto suben para mejorar y los de problemas, para empeorar', () => {
    for (const i of todos) expect(Object.keys(MAS_ES_MEJOR), i.clave).toContain(i.clave)
    for (const c of ['exactitud', 'conteos-semana', 'cobertura', 'movs-a-tiempo', 'revision-diaria']) expect(MAS_ES_MEJOR[c], c).toBe(true)
    for (const c of ['diferencias-conteo', 'lineas-con-dif', 'vencimientos', 'recepciones-dif', 'disponibilidad', 'ciclo-recepcion', 'tiempo-cuarentena', 'alertas']) expect(MAS_ES_MEJOR[c], c).toBe(false)
    expect(MAS_ES_MEJOR.ocupacion).toBeNull() // sin juicio hasta que Dirección Técnica decida
    expect(por(todos, 'exactitud').masEsMejor).toBe(true); expect(por(todos, 'vencimientos').masEsMejor).toBe(false)
  })
  it('los indicadores de Inicio y los de Indicadores usan la misma estructura (variación con palabra)', () => {
    const r = calcularIndicadores(datos({ solicitudes: [sol({ confirmadaEn: '2026-10-01T15:00:00Z', conDiferencias: true }), sol({ confirmadaEn: '2026-08-25T15:00:00Z' })] }), periodoDe(HOY, 30))
    expect(por(r, 'recepciones-dif').variacion).toMatchObject({ sentido: 'sube', efecto: 'empeoro', palabra: 'empeoró' }) // 100 % frente a 0 %; más es peor
  })
})

describe('Tiempo de disponibilidad (dock-to-stock)', () => {
  const aprobados = p.posiciones.find((x) => x.tipoArea === 'APROBADOS')!
  const cuarentena = p.posiciones.find((x) => x.tipoArea === 'CUARENTENA')!
  const orden = (id: string, productoId: string, lote: string, verificadoEn: string, o: { hacia?: string; verificacion?: 'CONFIRMADA' | 'PENDIENTE'; estado?: 'APROBADO' | 'CUARENTENA'; anulada?: boolean } = {}): OrdenMovimiento => ({
    id, numero: id, estado: o.anulada ? 'ANULADO' : 'CONFIRMADO', motivo: 'x', ejecutorId: 'a', ejecutor: 'A', ejecutadoEn: '2026-10-01T00:00:00Z', verificadoEn,
    lineas: [{ id: `${id}-l`, productoId, producto: 'P', loteId: 'l', lote, propietario: 'LOGISSA', estado: o.estado ?? 'APROBADO', procedenciaId: 'x', desdePosicionId: cuarentena.id, desde: 'C', haciaPosicionId: o.hacia ?? aprobados.id, hacia: 'A', cantidad: 5, verificacion: o.verificacion ?? 'CONFIRMADA' }],
  })
  const rec = (id: string, lotes: { productoId: string; lote: string }[], conf: string, aprob: string | undefined, propietario = 'LOGISSA'): SolicitudResumen => sol({ id, numero: id, propietario, confirmadaEn: conf, aprobadaEn: aprob, lotes })
  const pos = new Map(p.posiciones.map((x) => [x.id, x]))

  it('horas desde la recepción física confirmada hasta que queda Aprobada y verificada en Aprobados', () => {
    const r = tiemposDeDisponibilidad([rec('R1', [{ productoId: 'p1', lote: 'L1' }], '2026-10-01T15:00:00Z', '2026-10-02T17:00:00Z')], [orden('O1', 'p1', 'L1', '2026-10-03T09:30:00Z')], pos)
    expect(r).toHaveLength(1)
    expect(r[0].horas).toBe(42.5) // 1 oct 15:00 → 3 oct 09:30
    expect(r[0].disponibleEn).toBe('2026-10-03T09:30:00.000Z')
  })
  it('con varios lotes cuenta hasta el último; si falta alguno, la recepción no entra', () => {
    const lotes = [{ productoId: 'p1', lote: 'L1' }, { productoId: 'p2', lote: 'L2' }]
    const r1 = rec('R1', lotes, '2026-10-01T15:00:00Z', '2026-10-02T17:00:00Z')
    expect(tiemposDeDisponibilidad([r1], [orden('O1', 'p1', 'L1', '2026-10-03T09:00:00Z'), orden('O2', 'p2', 'L2', '2026-10-04T15:00:00Z')], pos)[0].horas).toBe(72) // lo último: 4 oct 15:00
    expect(tiemposDeDisponibilidad([r1], [orden('O1', 'p1', 'L1', '2026-10-03T09:00:00Z')], pos)).toEqual([])
  })
  it('no cuenta lo que no es «verificado en Aprobados»: sin verificar, otra área, en Cuarentena, anulado o anterior a la aprobación', () => {
    const r = [rec('R1', [{ productoId: 'p1', lote: 'L1' }], '2026-10-01T15:00:00Z', '2026-10-02T17:00:00Z')]
    expect(tiemposDeDisponibilidad(r, [orden('O', 'p1', 'L1', '2026-10-03T09:00:00Z', { verificacion: 'PENDIENTE' })], pos)).toEqual([])
    expect(tiemposDeDisponibilidad(r, [orden('O', 'p1', 'L1', '2026-10-03T09:00:00Z', { hacia: cuarentena.id })], pos)).toEqual([])
    expect(tiemposDeDisponibilidad(r, [orden('O', 'p1', 'L1', '2026-10-03T09:00:00Z', { estado: 'CUARENTENA' })], pos)).toEqual([])
    expect(tiemposDeDisponibilidad(r, [orden('O', 'p1', 'L1', '2026-10-03T09:00:00Z', { anulada: true })], pos)).toEqual([])
    expect(tiemposDeDisponibilidad(r, [orden('O', 'p1', 'L1', '2026-10-02T10:00:00Z')], pos)).toEqual([]) // movido antes de que Dirección Técnica aprobara
    expect(tiemposDeDisponibilidad([rec('R2', [{ productoId: 'p1', lote: 'L1' }], '2026-10-01T15:00:00Z', undefined)], [orden('O', 'p1', 'L1', '2026-10-03T09:00:00Z')], pos)).toEqual([]) // sin aprobar
  })
  it('el indicador es la MEDIANA de las recepciones que quedaron disponibles en el periodo, con detalle por propietario y su tendencia contra el periodo anterior', () => {
    // Periodo actual (10 sep – 9 oct): 24 h, 48 h y 96 h → mediana 48 h. Periodo anterior (11 ago – 9 sep): 100 h y 140 h → mediana 120 h.
    const s = [
      rec('A1', [{ productoId: 'p1', lote: 'L1' }], '2026-10-01T00:00:00Z', '2026-10-01T10:00:00Z', 'LOGISSA'),
      rec('A2', [{ productoId: 'p2', lote: 'L2' }], '2026-10-02T00:00:00Z', '2026-10-02T10:00:00Z', 'LOGISSA'),
      rec('A3', [{ productoId: 'p3', lote: 'L3' }], '2026-10-03T00:00:00Z', '2026-10-03T10:00:00Z', 'OTRO'),
      rec('B1', [{ productoId: 'p4', lote: 'L4' }], '2026-08-20T00:00:00Z', '2026-08-20T10:00:00Z', 'LOGISSA'),
      rec('B2', [{ productoId: 'p5', lote: 'L5' }], '2026-08-22T00:00:00Z', '2026-08-22T10:00:00Z', 'LOGISSA'),
    ]
    const o = [
      orden('O1', 'p1', 'L1', '2026-10-02T00:00:00Z'), orden('O2', 'p2', 'L2', '2026-10-04T00:00:00Z'), orden('O3', 'p3', 'L3', '2026-10-07T00:00:00Z'),
      orden('O4', 'p4', 'L4', '2026-08-24T04:00:00Z'), orden('O5', 'p5', 'L5', '2026-08-27T20:00:00Z'),
    ]
    const k = por(calcularIndicadores(datos({ solicitudes: s, ordenes: o }), periodoDe(HOY, 30)), 'disponibilidad')
    expect(k.valor).toBe(48); expect(k.texto).toBe('48 h')
    expect(k.variacion).toMatchObject({ sentido: 'baja', efecto: 'mejoro', texto: '↓ 72 horas · mejoró' }) // 120 h → 48 h: más horas es peor
    expect(k.enInicio).toBe(true); expect(k.masEsMejor).toBe(false)
    expect(k.detalle).toEqual([{ etiqueta: 'LOGISSA', valor: '36 h', sub: '2 recepciones' }, { etiqueta: 'OTRO', valor: '96 h', sub: '1 recepción' }])
    expect(por(calcularIndicadores(datos({ solicitudes: s, ordenes: o }), periodoDe(HOY, 30), { propietarioId: p.propietarios.find((x) => x.codigo === 'LOGISSA')?.id }), 'disponibilidad').valor).toBe(36)
  })
  it('sin recepciones disponibles lo dice, no inventa', () => {
    const k = por(calcularIndicadores(datos(), periodoDe(HOY, 30)), 'disponibilidad')
    expect(k.valor).toBeNull(); expect(k.sinDatos).toMatch(/Ninguna recepción/)
  })
})

describe('tendencia de 30 días', () => {
  it('11 puntos: de hace 30 días a hoy, cada 3 días', () => {
    const dias = diasDeSerie(HOY)
    expect(dias).toHaveLength(11); expect(dias[0]).toBe('2026-09-09'); expect(dias[10]).toBe(HOY)
  })
  it('cada indicador lleva su serie (menos los que no se pueden reconstruir) y el último punto es el valor de hoy', () => {
    const d = datos({ exactitud: [ex({ cerradoEn: '2026-09-15T20:00:00Z' }), ex({ cerradoEn: '2026-10-05T20:00:00Z', primerConteo: 8, cantidadContada: 10 })] })
    const per = periodoDe(HOY, 30)
    const k = por(conSeries(calcularIndicadores(d, per), d, per, {}, new Map()), 'exactitud')
    expect(k.serie).toHaveLength(11)
    expect(k.serie!.at(-1)).toEqual({ dia: HOY, valor: k.valor })
    expect(k.serie![0].valor).toBeNull() // al 9 sep ningún conteo había cerrado en su ventana
    const todos = conSeries(calcularIndicadores(d, per), d, per, {}, new Map())
    expect(por(todos, 'cobertura').serie).toBeUndefined(); expect(por(todos, 'pendientes').serie).toBeUndefined()
    expect(por(todos, 'alertas').serie).toHaveLength(11)
  })
})
