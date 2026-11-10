// OS-5 · LS-TB.02.02: tabla de tamaño de muestra (reemplaza techo(√n)+1).
import { describe, expect, it } from 'vitest'
import {
  ETIQUETA_REGIMEN, TABLA_LS_TB_02_02, evaluaTodo, planDeMuestreo, regimenDeMuestreo, tablaRige, tablaVigente, tamanoDeMuestra, textoMuestra,
  type EntradaMuestreo, type TablaMuestreo,
} from '@/domain/muestreo'

const base: EntradaMuestreo = { unidades: 500, esDevolucion: false, antecedentesCalidad: false, productoNuevo: false, proveedorNuevo: false }
const m = (unidades: number, regimen: Parameters<typeof tamanoDeMuestra>[1]) => tamanoDeMuestra(unidades, regimen)

describe('tabla LS-TB.02.02', () => {
  it('lleva su código y su vigencia (01-09-2026 al 01-09-2028): es un parámetro, no una regla escondida', () => {
    expect(TABLA_LS_TB_02_02).toMatchObject({ codigo: 'LS-TB.02.02', vigenteDesde: '2026-09-01', vigenteHasta: '2028-09-01', umbralTotal: 100 })
    expect(tablaRige(TABLA_LS_TB_02_02, '2026-10-17')).toBe(true)
    expect(tablaRige(TABLA_LS_TB_02_02, '2026-08-31')).toBe(false)
    expect(tablaRige(TABLA_LS_TB_02_02, '2028-09-02')).toBe(false)
  })

  it('evaluación simplificada: 100–1.000 → 20; 1.001–10.000 → 30; 10.001–100.000 → 80; más de 100.000 → 150', () => {
    const fila = [100, 1000, 1001, 10000, 10001, 100000, 100001, 2_000_000].map((n) => m(n, 'SIMPLIFICADA'))
    expect(fila).toEqual([20, 20, 30, 30, 80, 80, 150, 150])
  })

  it('evaluación normal (producto o proveedor nuevo): 50; 150; 300; 500', () => {
    const fila = [100, 1000, 1001, 10000, 10001, 100000, 100001].map((n) => m(n, 'NORMAL'))
    expect(fila).toEqual([50, 50, 150, 150, 300, 300, 500])
  })

  it('menos de 100 unidades, devolución y evaluación estricta: el 100 %', () => {
    expect(m(99, 'SIMPLIFICADA')).toBe(99)
    expect(m(1, 'NORMAL')).toBe(1)
    expect(m(0, 'SIMPLIFICADA')).toBe(0)
    expect(m(5000, 'DEVOLUCION')).toBe(5000)
    expect(m(120_000, 'ESTRICTA')).toBe(120_000)
    expect(m(40, 'LOTE_MENOR')).toBe(40)
    expect([...['SIMPLIFICADA', 'NORMAL'] as const].map((r) => evaluaTodo(r))).toEqual([false, false])
  })

  it('la muestra nunca supera las unidades del lote (aunque alguien cambie la tabla)', () => {
    const chica: TablaMuestreo = { ...TABLA_LS_TB_02_02, umbralTotal: 10, simplificada: [{ desde: 10, hasta: null, muestra: 20 }] }
    expect(tamanoDeMuestra(15, 'SIMPLIFICADA', chica)).toBe(15)
  })

  it('una tabla con un hueco falla en voz alta en vez de inventar un número', () => {
    const rota: TablaMuestreo = { ...TABLA_LS_TB_02_02, simplificada: [{ desde: 500, hasta: null, muestra: 20 }] }
    expect(() => tamanoDeMuestra(200, 'SIMPLIFICADA', rota)).toThrow(/no tiene un tramo/)
  })

  it('con varias versiones de la tabla rige la vigente en la fecha', () => {
    const v2 = { ...TABLA_LS_TB_02_02, codigo: 'LS-TB.02.02', vigenteDesde: '2028-09-02', vigenteHasta: undefined }
    expect(tablaVigente([TABLA_LS_TB_02_02, v2], '2027-01-01')).toBe(TABLA_LS_TB_02_02)
    expect(tablaVigente([TABLA_LS_TB_02_02, v2], '2029-01-01')).toBe(v2)
    expect(tablaVigente([TABLA_LS_TB_02_02], '2020-01-01')).toBeUndefined()
  })
})

describe('régimen de muestreo', () => {
  it('por defecto es simplificada', () => expect(regimenDeMuestreo(base)).toBe('SIMPLIFICADA'))
  it('producto nuevo o proveedor nuevo (primera recepción): normal', () => {
    expect(regimenDeMuestreo({ ...base, productoNuevo: true })).toBe('NORMAL')
    expect(regimenDeMuestreo({ ...base, proveedorNuevo: true })).toBe('NORMAL')
  })
  it('lote de menos de 100 unidades: 100 %, aunque sea nuevo', () => expect(regimenDeMuestreo({ ...base, unidades: 99, productoNuevo: true })).toBe('LOTE_MENOR'))
  it('exactamente 100 unidades ya usa la tabla', () => expect(regimenDeMuestreo({ ...base, unidades: 100 })).toBe('SIMPLIFICADA'))
  it('antecedentes de calidad marcados por DT: estricta (100 %) aunque el producto no sea nuevo', () => {
    expect(regimenDeMuestreo({ ...base, antecedentesCalidad: true })).toBe('ESTRICTA')
    expect(planDeMuestreo({ ...base, unidades: 3000, antecedentesCalidad: true })).toMatchObject({ regimen: 'ESTRICTA', muestra: 3000, todo: true })
  })
  it('una devolución siempre es al 100 %, incluso de un producto nuevo o con antecedentes', () => {
    expect(regimenDeMuestreo({ ...base, esDevolucion: true, productoNuevo: true, antecedentesCalidad: true })).toBe('DEVOLUCION')
    expect(planDeMuestreo({ ...base, unidades: 24, esDevolucion: true })).toMatchObject({ muestra: 24, todo: true })
  })

  it('el plan trae el código de la tabla, la muestra y la razón en palabras', () => {
    const p = planDeMuestreo({ ...base, unidades: 2500, productoNuevo: true })
    expect(p).toMatchObject({ regimen: 'NORMAL', muestra: 150, todo: false, tablaCodigo: 'LS-TB.02.02' })
    expect(p.motivo).toMatch(/Producto nuevo/)
    expect(planDeMuestreo({ ...base, unidades: 2500, productoNuevo: true, proveedorNuevo: true }).motivo).toMatch(/Producto y proveedor nuevos/)
    expect(planDeMuestreo({ ...base, unidades: 2500 })).toMatchObject({ regimen: 'SIMPLIFICADA', muestra: 30 })
  })

  it('ya no es techo(√n)+1: 480 unidades pedían 23 y ahora piden 20', () => {
    expect(planDeMuestreo({ ...base, unidades: 480 }).muestra).toBe(20)
    expect(planDeMuestreo({ ...base, unidades: 480, productoNuevo: true }).muestra).toBe(50)
  })
})

describe('texto de la muestra', () => {
  it('dice cuántas unidades se toman y con qué evaluación', () => {
    expect(textoMuestra(20, 'SIMPLIFICADA', 'LS-TB.02.02', 480)).toBe('Toma 20 unidades de muestra (evaluación simplificada, LS-TB.02.02).')
    expect(textoMuestra(24, 'DEVOLUCION', 'LS-TB.02.02', 24)).toContain('Evalúa las 24 unidades del lote (el 100 %')
    expect(textoMuestra(7, undefined, undefined, 50)).toBe('Toma 7 unidades de muestra.')
    expect(ETIQUETA_REGIMEN.NORMAL).toBe('Evaluación normal')
  })
})
