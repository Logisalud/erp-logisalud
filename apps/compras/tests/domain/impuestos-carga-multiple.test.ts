import { describe, expect, it } from 'vitest'
import {
  agruparPorPeriodo, filasDeCarga, totalDeCarga, validarCargaMultiple,
  vencimientoDeLinea,
  type EncabezadoCarga, type LineaCarga,
} from '@/domain/impuestos'

const header: EncabezadoCarga = { periodo: '2026-09', fuente: 'BUK', fechaVencimiento: '2026-10-03' }
const essalud = 'tipo-essalud'
const onp = 'tipo-onp'
const afp = 'tipo-afp'

const linea = (tipoImpuestoId: string, monto = 100, fechaVencimiento?: string): LineaCarga => ({
  tipoImpuestoId, monto, fechaVencimiento: fechaVencimiento ?? null,
})

describe('encabezado', () => {
  it('acepta un envío bien formado', () => {
    expect(validarCargaMultiple(header, [linea(essalud)])).toEqual([])
  })

  it('exige el formato AAAA-MM del periodo', () => {
    const errores = validarCargaMultiple({ ...header, periodo: '09-2026' }, [linea(essalud)])
    expect(errores.some((e) => e.campo === 'periodo')).toBe(true)
  })

  it('exige el vencimiento por defecto', () => {
    const errores = validarCargaMultiple({ ...header, fechaVencimiento: '' }, [linea(essalud)])
    expect(errores.some((e) => e.campo === 'fechaVencimiento')).toBe(true)
  })

  it('rechaza una fuente inventada — BUK/SUNAT/manual y nada más', () => {
    const errores = validarCargaMultiple({ ...header, fuente: 'Essalud' as any }, [linea(essalud)])
    expect(errores.some((e) => e.campo === 'fuente')).toBe(true)
  })
})

describe('líneas duplicadas DENTRO del mismo envío', () => {
  it('marca la SEGUNDA aparición, no la primera', () => {
    const errores = validarCargaMultiple(header, [linea(essalud), linea(onp), linea(essalud)])
    const campos = errores.map((e) => e.campo)
    expect(campos).toContain('lineas.2.tipoImpuestoId')
    expect(campos).not.toContain('lineas.0.tipoImpuestoId')
  })

  it('el mensaje dice en qué línea está la otra, en numeración humana', () => {
    const errores = validarCargaMultiple(header, [linea(essalud), linea(essalud)])
    const error = errores.find((e) => e.campo === 'lineas.1.tipoImpuestoId')
    expect(error?.mensaje).toContain('línea 1')
  })

  it('tipos distintos no chocan entre sí', () => {
    expect(validarCargaMultiple(header, [linea(essalud), linea(onp), linea(afp)])).toEqual([])
  })
})

describe('choque contra una carga ya existente en la base', () => {
  it('marca la línea conflictiva y NO las demás', () => {
    const errores = validarCargaMultiple(header, [linea(essalud), linea(onp), linea(afp)], [onp])
    const campos = errores.map((e) => e.campo)
    expect(campos).toEqual(['lineas.1.tipoImpuestoId'])
  })

  it('el mensaje nombra el periodo, para que se entienda contra qué choca', () => {
    const errores = validarCargaMultiple(header, [linea(essalud)], [essalud])
    expect(errores[0].mensaje).toContain('2026-09')
  })

  it('sin choques, la lista de ya cargados no molesta', () => {
    expect(validarCargaMultiple(header, [linea(essalud)], [onp, afp])).toEqual([])
  })
})

describe('líneas inválidas', () => {
  it('exige tipo y monto en cada línea, indexados', () => {
    const errores = validarCargaMultiple(header, [linea(essalud), { tipoImpuestoId: '', monto: 0 }])
    const campos = errores.map((e) => e.campo)
    expect(campos).toContain('lineas.1.tipoImpuestoId')
    expect(campos).toContain('lineas.1.monto')
  })

  it('un monto de 0 o negativo no pasa', () => {
    expect(validarCargaMultiple(header, [linea(essalud, 0)]).some((e) => e.campo === 'lineas.0.monto')).toBe(true)
    expect(validarCargaMultiple(header, [linea(essalud, -5)]).some((e) => e.campo === 'lineas.0.monto')).toBe(true)
  })

  it('un envío sin líneas no se guarda', () => {
    expect(validarCargaMultiple(header, []).some((e) => e.campo === 'lineas')).toBe(true)
  })
})

describe('vencimiento override por línea', () => {
  it('sin vencimiento propio usa el del encabezado', () => {
    expect(vencimientoDeLinea(header, linea(essalud))).toBe('2026-10-03')
  })

  it('con vencimiento propio lo pisa — el caso AFP por AFPnet', () => {
    expect(vencimientoDeLinea(header, linea(afp, 100, '2026-10-07'))).toBe('2026-10-07')
  })

  it('un override en blanco no cuenta como override', () => {
    expect(vencimientoDeLinea(header, { tipoImpuestoId: afp, monto: 1, fechaVencimiento: '   ' })).toBe('2026-10-03')
  })

  it('las filas a insertar llevan el vencimiento ya resuelto, uno por línea', () => {
    const filas = filasDeCarga(header, [linea(essalud), linea(afp, 200, '2026-10-07')])
    expect(filas).toEqual([
      { tipoImpuestoId: essalud, periodo: '2026-09', monto: 100, fechaVencimiento: '2026-10-03', fuente: 'BUK' },
      { tipoImpuestoId: afp, periodo: '2026-09', monto: 200, fechaVencimiento: '2026-10-07', fuente: 'BUK' },
    ])
  })

  it('la fuente del encabezado se copia a todas las filas, nunca por línea', () => {
    const filas = filasDeCarga({ ...header, fuente: 'SUNAT' }, [linea(essalud), linea(onp)])
    expect(filas.every((f) => f.fuente === 'SUNAT')).toBe(true)
  })
})

describe('total del envío', () => {
  it('suma las líneas y redondea a centavo', () => {
    expect(totalDeCarga([linea(essalud, 1234.56), linea(onp, 0.444)])).toBe(1235)
  })

  it('una línea vacía cuenta como 0 y no rompe el total', () => {
    expect(totalDeCarga([linea(essalud, 100), { tipoImpuestoId: '', monto: Number('') }])).toBe(100)
  })
})

describe('agrupación por periodo en el listado', () => {
  it('agrupa, suma y ordena de más reciente a más viejo', () => {
    const grupos = agruparPorPeriodo([
      { periodo: '2026-08', monto: 10 },
      { periodo: '2026-09', monto: 20 },
      { periodo: '2026-08', monto: 5 },
    ])
    expect(grupos.map((g) => g.periodo)).toEqual(['2026-09', '2026-08'])
    expect(grupos[1].total).toBe(15)
    expect(grupos[1].filas).toHaveLength(2)
  })
})
