// Con los datos de la demo, las 3 tarjetas de Inicio y la pantalla de Indicadores muestran valores reales (no «sin datos»).
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { CLAVES_INICIO, calcularIndicadores, conSeries, diasDeSerie, periodoAnterior, periodoDe, type DatosIndicadores } from '@/domain/indicadores'
import { lunesDe, sumarDiasISO } from '@/domain/operacion'
import type { Actor } from '@/services/repositorio'

const JEFE: Actor = { id: 'demo:jefe_almacen', nombre: 'Jefe de Almacén (demo)', roles: ['jefe_almacen'] }
let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })

async function indicadores(dias: number, conTendencia = false) {
  const panorama = await repo.panorama()
  const periodo = periodoDe(panorama.hoy, dias); const ant = periodoAnterior(periodo)
  const lunes: string[] = []
  for (let x = lunesDe(ant.desde); x <= periodo.hasta; x = sumarDiasISO(x, 7)) lunes.push(x)
  const par = await repo.parametrosInventario()
  const datos: DatosIndicadores = {
    hoy: panorama.hoy, panorama, saldosAntes: await repo.saldosAl(sumarDiasISO(periodo.desde, -1), JEFE), ordenes: await repo.listarMovimientos(),
    exactitud: await repo.exactitudConteos(ant.desde, periodo.hasta, JEFE), solicitudes: await repo.listarSolicitudes(), revisiones: await repo.listarRevisiones(200), pendientes: await repo.pendientesVivos(),
    alertas: await repo.listarAlertas(), ajustes: await repo.listarAjustes(), cobertura: await repo.ultimaCobertura(), programaciones: (await Promise.all(lunes.map((l) => repo.programacionDeSemana(l)))).flat(),
    plazoMovHoras: par.movimientoSinVerificarHoras, diasAlertaVencimiento: par.diasAlertaVencimiento,
  }
  const base = calcularIndicadores(datos, periodo)
  if (!conTendencia) return base
  const saldos = new Map(await Promise.all(diasDeSerie(panorama.hoy).filter((x) => x !== panorama.hoy).map(async (d) => [d, await repo.saldosAl(d, JEFE)] as const)))
  return conSeries(base, datos, periodo, {}, saldos)
}

describe('indicadores con los datos de la demo', () => {
  it('las 3 tarjetas de Inicio tienen valor y variación frente al periodo anterior', async () => {
    const r = await indicadores(30)
    for (const c of CLAVES_INICIO) {
      const k = r.find((x) => x.clave === c)!
      expect(k.sinDatos, `${c} sin datos`).toBeUndefined()
      expect(k.valor, c).not.toBeNull()
      expect(k.variacion, `${c} sin variación`).not.toBeNull()
    }
    const ex = r.find((x) => x.clave === 'exactitud')!
    expect(ex.valor).toBeGreaterThan(50); expect(ex.valor).toBeLessThan(100) // la mayoría coincide a la primera, no todos
    expect(ex.datos).toMatch(/\d+ de \d+ líneas coincidieron en el primer conteo/)
  })

  it('Tiempo de disponibilidad: la demo lo muestra con valor (mediana de horas), detalle por propietario y mejora frente al periodo anterior', async () => {
    const k = (await indicadores(30)).find((x) => x.clave === 'disponibilidad')!
    expect(k.sinDatos).toBeUndefined()
    expect(k.valor).toBeGreaterThan(24); expect(k.valor).toBeLessThan(120)
    expect(k.detalle.length).toBeGreaterThan(0)
    expect(k.variacion).toMatchObject({ sentido: 'baja', efecto: 'mejoro' }) // la cuarentena de la demo se acortó: menos horas es mejor
    expect(k.variacion!.texto).toMatch(/^↓ [\d.]+ horas · mejoró$/)
  })

  it('cada tarjeta de Inicio trae su tendencia de 30 días, con 11 puntos y el último igual al valor de hoy', async () => {
    const r = await indicadores(30, true)
    for (const c of CLAVES_INICIO) {
      const k = r.find((x) => x.clave === c)!
      expect(k.serie, c).toHaveLength(11)
      expect(k.serie!.filter((p) => p.valor !== null).length, `${c}: puntos con dato`).toBeGreaterThanOrEqual(3)
      expect(k.serie!.at(-1)!.valor, c).toBe(k.valor)
    }
  })

  it('los indicadores de la demo muestran las dos tendencias: algunos mejoraron y otros empeoraron', async () => {
    const efectos = new Set((await indicadores(30)).map((k) => k.variacion?.efecto))
    expect(efectos.has('mejoro')).toBe(true); expect(efectos.has('empeoro')).toBe(true)
  })

  it('recepciones con diferencia: se cuentan por la fecha de confirmación y el detalle por proveedor trae el tipo de diferencia', async () => {
    const k = (await indicadores(30)).find((x) => x.clave === 'recepciones-dif')!
    expect(k.valor).toBeGreaterThan(0)
    const tipos = k.detalle.map((d) => d.sub).filter(Boolean).join(' ')
    expect(tipos).toMatch(/lote distinto/); expect(tipos).toMatch(/cantidad distinta/); expect(tipos).toMatch(/vencimiento distinto/); expect(tipos).toMatch(/línea no esperada/)
    // con 90 días entran también las del periodo anterior de 30: el denominador crece
    const k90 = (await indicadores(90)).find((x) => x.clave === 'recepciones-dif')!
    expect(Number(/de (\d+) recepciones/.exec(k90.datos)![1])).toBeGreaterThan(Number(/de (\d+) recepciones/.exec(k.datos)![1]))
  })

  it('el resto de los indicadores también tienen valores: ajustes, ciclo de recepción y tiempo en Cuarentena', async () => {
    const r = await indicadores(90)
    expect(r.find((x) => x.clave === 'ajustes')!.valor).toBeGreaterThanOrEqual(1)
    expect(r.find((x) => x.clave === 'ciclo-recepcion')!.valor).not.toBeNull()
    expect(r.find((x) => x.clave === 'tiempo-cuarentena')!.valor).toBeGreaterThan(0)
    expect(r.find((x) => x.clave === 'diferencias-conteo')!.valor).toBeGreaterThan(0)
  })

  it('el stock de hace un periodo sale del libro mayor y difiere del de hoy cuando hubo ingresos o ajustes', async () => {
    const panorama = await repo.panorama()
    const hoyU = panorama.saldos.reduce((n, s) => n + s.cantidad, 0)
    const hace = await repo.saldosAl(sumarDiasISO(panorama.hoy, -30), JEFE)
    expect(hace.reduce((n, s) => n + s.cantidad, 0)).toBeLessThan(hoyU)
    expect(await repo.saldosAl(panorama.hoy, { ...JEFE, roles: ['auxiliar'] })).toEqual([]) // el contador no lee saldos
    expect((await repo.saldosAl(panorama.hoy, JEFE)).reduce((n, s) => n + s.cantidad, 0)).toBe(hoyU)
  })
})
