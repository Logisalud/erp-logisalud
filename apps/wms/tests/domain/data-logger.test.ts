import { describe, expect, it } from 'vitest'
import {
  LIMITE_TEMPERATURA_RUTA_C, cruzarConCierre, estadisticas, normalizarMomento, parsearCsv, parsearInformeTexto, textoAlertaTemperatura, tipoDeInforme, type LecturaLogger,
} from '@/domain/data-logger'

const lect = (temps: number[], dia = '2026-10-19'): LecturaLogger[] => temps.map((temperatura, i) => {
  const min = 9 * 60 + 24 + i * 5
  return { momento: `${dia}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:34`, temperatura }
})

describe('estadísticas de las lecturas', () => {
  it('el límite es 24.9 y se compara en décimas: 24.9 no lo supera, 25.0 sí', () => {
    expect(LIMITE_TEMPERATURA_RUTA_C).toBe(24.9)
    expect(estadisticas(lect([22, 24.9]), 24.9, 5).excede).toBe(false)
    expect(estadisticas(lect([22, 24.9, 25]), 24.9, 5)).toMatchObject({ excede: true, sobreLimite: 1, minutosSobreLimite: 5, max: 25 })
  })

  it('mínima, máxima, promedio (1 decimal, redondeo hacia arriba en la mitad, como la base), primera excedencia y minutos', () => {
    const e = estadisticas(lect([22.0, 23.1, 24.9, 25.3, 25.0, 24.0]), 24.9, 5)
    expect(e).toMatchObject({ puntos: 6, min: 22, max: 25.3, promedio: 24.1, sobreLimite: 2, minutosSobreLimite: 10, primeraExcedencia: '2026-10-19T09:39:34', momentoMaxima: '2026-10-19T09:39:34', primera: '2026-10-19T09:24:34', ultima: '2026-10-19T09:49:34' })
  })

  it('sin lecturas es un error de programación, no un resultado', () => {
    expect(() => estadisticas([], 24.9, 5)).toThrow()
  })

  it('el intervalo se usa para los minutos sobre el límite', () => {
    expect(estadisticas(lect([26, 26, 20]), 24.9, 10).minutosSobreLimite).toBe(20)
  })
})

describe('fechas del data logger', () => {
  it('acepta AAAA-MM-DD, DD/MM/AAAA y con T, y rechaza fechas imposibles', () => {
    expect(normalizarMomento('2026-10-19 09:24:34')).toBe('2026-10-19T09:24:34')
    expect(normalizarMomento('19/10/2026 9:24')).toBe('2026-10-19T09:24:00')
    expect(normalizarMomento('2026-10-19T09:24:34')).toBe('2026-10-19T09:24:34')
    expect(normalizarMomento('31/02/2026 09:24')).toBeNull()
    expect(normalizarMomento('2026-13-01 09:24:34')).toBeNull()
    expect(normalizarMomento('hola')).toBeNull()
  })
})

describe('CSV del data logger', () => {
  it('con encabezado, coma y metadatos arriba', () => {
    const r = parsearCsv('Modelo,RC-61\nS/N,EFG204104487\nIntervalo,5 min\nIndex,Time,Temperature(°C),Humidity(%RH)\n1,2026-10-19 09:24:34,22.3,NC\n2,2026-10-19 09:29:34,22.4,55.5\n')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.informe).toMatchObject({ formato: 'CSV', modelo: 'RC-61', serie: 'EFG204104487', intervaloMin: 5 })
    expect(r.informe.lecturas).toEqual([{ momento: '2026-10-19T09:24:34', temperatura: 22.3 }, { momento: '2026-10-19T09:29:34', temperatura: 22.4, humedad: 55.5 }])
  })

  it('con punto y coma, coma decimal y fecha día/mes/año (Excel en español)', () => {
    const r = parsearCsv('Fecha;Temperatura (°C);Humedad (%RH)\n19/10/2026 09:24:34;22,3;\n19/10/2026 09:29:34;24,95;\n')
    expect(r.ok && r.informe.lecturas.map((l) => [l.momento, l.temperatura])).toEqual([['2026-10-19T09:24:34', 22.3], ['2026-10-19T09:29:34', 24.95]])
  })

  it('sin encabezado: la temperatura es el primer número después de la fecha; calcula el intervalo', () => {
    const r = parsearCsv('2026-10-19 09:24:34,22.3\n2026-10-19 09:29:34,22.4\n2026-10-19 09:34:34,22.5')
    expect(r.ok && r.informe.intervaloMin).toBe(5)
  })

  it('con tabulaciones y BOM', () => {
    const r = parsearCsv('﻿Tiempo\t°C\t%RH\n2026-10-19 09:24:34\t22.3\tNC')
    expect(r.ok && r.informe.lecturas).toHaveLength(1)
  })

  it('archivos que no son del data logger se rechazan con un mensaje claro', () => {
    for (const t of ['', 'hola mundo', 'a,b,c\n1,2,3']) {
      const r = parsearCsv(t)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.mensaje).toMatch(/No pudimos leer las lecturas/)
    }
  })

  it('temperaturas imposibles y horas repetidas se rechazan; filas sin temperatura se avisan', () => {
    const imposible = parsearCsv('Tiempo,°C\n2026-10-19 09:24:34,22.3\n2026-10-19 09:29:34,95')
    expect(!imposible.ok && imposible.mensaje).toMatch(/temperatura imposible/)
    const repetida = parsearCsv('Tiempo,°C\n2026-10-19 09:24:34,22.3\n2026-10-19 09:24:34,22.4')
    expect(!repetida.ok && repetida.mensaje).toMatch(/repite horas/)
    const sin = parsearCsv('Tiempo,°C\n2026-10-19 09:24:34,22.3\n2026-10-19 09:29:34,--')
    expect(sin.ok && sin.informe.avisos.join(' ')).toMatch(/1 filas sin temperatura/)
  })

  it('más de 20.000 lecturas: no es el informe de un viaje', () => {
    const filas = Array.from({ length: 20001 }, (_, i) => `${new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString().slice(0, 19).replace('T', ' ')},22`)
    const r = parsearCsv('Tiempo,°C\n' + filas.join('\n'))
    expect(!r.ok && r.mensaje).toMatch(/más de 20\.000 lecturas/)
  })
})

describe('texto del informe PDF', () => {
  it('sin la tabla «Tiempo °C %RH» no es el informe', () => {
    expect(parsearInformeTexto('Informe de datos\nModelo: RC-61').ok).toBe(false)
  })
})

describe('tipo de archivo', () => {
  it('PDF y CSV; lo demás no se lee', () => {
    expect(tipoDeInforme('x.PDF')).toBe('PDF'); expect(tipoDeInforme('x', 'application/pdf')).toBe('PDF')
    expect(tipoDeInforme('x.csv')).toBe('CSV'); expect(tipoDeInforme('x.txt')).toBe('CSV')
    expect(tipoDeInforme('x.xlsx')).toBeNull(); expect(tipoDeInforme('x.gsp')).toBeNull()
  })
})

describe('cruce con el cierre de la ruta', () => {
  const e = { min: 22, max: 24.1, primera: '2026-10-19T09:24:34', ultima: '2026-10-19T17:59:34' }
  it('sin cierre no hay con qué cruzar', () => {
    expect(cruzarConCierre(e, '2026-10-19', null)).toEqual({ coincide: null, dentroDeFecha: true, mensajes: [] })
  })
  it('coincide con 0,1 °C de tolerancia; más allá, no, y lo explica', () => {
    expect(cruzarConCierre(e, '2026-10-19', { tempMin: 22, tempMax: 24.1 }).coincide).toBe(true)
    expect(cruzarConCierre(e, '2026-10-19', { tempMin: 22.1, tempMax: 24.0 }).coincide).toBe(true)
    const c = cruzarConCierre(e, '2026-10-19', { tempMin: 20, tempMax: 24.1 })
    expect(c.coincide).toBe(false)
    expect(c.mensajes[0]).toMatch(/El cierre anota 20,0 – 24,1 °C y el archivo marca 22,0 – 24,1 °C/)
  })
  it('lecturas de otro día que el de la ruta se marcan', () => {
    const c = cruzarConCierre(e, '2026-10-25', null)
    expect(c.dentroDeFecha).toBe(false)
    expect(c.mensajes[0]).toMatch(/del 19\/10\/2026 al 19\/10\/2026 y la ruta es del 25\/10\/2026/)
  })
})

describe('texto de la alerta', () => {
  it('el mismo que arma la base', () => {
    expect(textoAlertaTemperatura('RUT-2026-00007', 25.3, 24.9, 'el data logger', 10)).toBe('Ruta RUT-2026-00007: el data logger marca una temperatura máxima de 25,3 °C, sobre el límite de 24,9 °C (estuvo 10 min por encima). Dirección Técnica decide qué se hace con la mercadería.')
    expect(textoAlertaTemperatura('RUT-1', 25, 24.9, 'el cierre')).toMatch(/máxima de 25 °C, sobre el límite de 24,9 °C\. Dirección/)
  })
})
