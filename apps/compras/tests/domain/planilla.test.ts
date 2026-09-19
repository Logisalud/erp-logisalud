import { describe, expect, it } from 'vitest'
import {
  descripcionDeObligacion, etiquetaPeriodo, etiquetaSecuencia, puedeCargarPlanilla,
  puedeCorregirse, puedeDarConformidadPlanilla, puedeVerPlanilla, validarPagoPlanilla,
  type BorradorPagoPlanilla,
} from '@/domain/planilla'

const base: BorradorPagoPlanilla = {
  periodo: '2026-09',
  secuencia: 2,
  monto: 184250.4,
  moneda: 'PEN',
  fechaPago: '2026-09-30',
}

describe('validarPagoPlanilla', () => {
  it('acepta una carga bien hecha', () => {
    expect(validarPagoPlanilla(base)).toEqual([])
  })

  it('exige un periodo con forma YYYY-MM', () => {
    for (const periodo of ['2026-13', '2026-00', '26-09', 'setiembre', '']) {
      expect(validarPagoPlanilla({ ...base, periodo }).map((e) => e.campo)).toContain('periodo')
    }
  })

  it('acepta secuencias más allá de 2 — hay meses con un tercer pago', () => {
    expect(validarPagoPlanilla({ ...base, secuencia: 3 })).toEqual([])
    expect(validarPagoPlanilla({ ...base, secuencia: 4 })).toEqual([])
  })

  it('rechaza secuencia 0 o negativa', () => {
    expect(validarPagoPlanilla({ ...base, secuencia: 0 }).map((e) => e.campo)).toContain('secuencia')
  })

  it('rechaza monto no positivo y falta de fecha', () => {
    expect(validarPagoPlanilla({ ...base, monto: 0 }).map((e) => e.campo)).toContain('monto')
    expect(validarPagoPlanilla({ ...base, fechaPago: '' }).map((e) => e.campo)).toContain('fechaPago')
  })
})

describe('etiquetas', () => {
  it('nombra los dos pagos normales y numera los extra', () => {
    expect(etiquetaSecuencia(1)).toBe('1ra quincena')
    expect(etiquetaSecuencia(2)).toBe('Fin de mes')
    expect(etiquetaSecuencia(3)).toBe('Pago 3 del mes')
  })

  it('el periodo se lee en español de Perú', () => {
    expect(etiquetaPeriodo('2026-09')).toBe('setiembre 2026')
    expect(etiquetaPeriodo('2026-01')).toBe('enero 2026')
  })

  it('la descripción de la obligación lleva el beneficiario genérico', () => {
    const d = descripcionDeObligacion('2026-09', 2)
    expect(d).toContain('transferencia masiva a trabajadores')
    expect(d).toContain('setiembre 2026')
    expect(d).toContain('Fin de mes')
  })
})

describe('permisos', () => {
  it('carga: Arlette (gestion_humana), Contabilidad y admin', () => {
    expect(puedeCargarPlanilla({ area: 'gestion_humana', rol: 'control_pedidos' })).toBe(true)
    expect(puedeCargarPlanilla({ area: 'contabilidad', rol: 'operativo' })).toBe(true)
    expect(puedeCargarPlanilla({ area: 'admin', rol: 'admin' })).toBe(true)
    expect(puedeCargarPlanilla({ area: 'tesoreria', rol: 'operativo' })).toBe(false)
  })

  it('conformidad: Tesorería, Contabilidad entera y admin', () => {
    expect(puedeDarConformidadPlanilla({ area: 'tesoreria', rol: 'operativo' })).toBe(true)
    expect(puedeDarConformidadPlanilla({ area: 'contabilidad', rol: 'admin' })).toBe(true)
    expect(puedeDarConformidadPlanilla({ area: 'admin', rol: 'admin' })).toBe(true)
    // Beatriz (contabilidad/operativo) entró el 2026-09-19, junto con el
    // resto de las conformidades. La única que siguió pidiendo rol admin es
    // aprobar un lote de pago — ver esContabilidadQueApruebaLotes.
    expect(puedeDarConformidadPlanilla({ area: 'contabilidad', rol: 'operativo' })).toBe(true)
    // Arlette carga pero no conforma.
    expect(puedeDarConformidadPlanilla({ area: 'gestion_humana', rol: 'control_pedidos' })).toBe(false)
  })

  it('ver: los del circuito y nadie más — gerencia afuera', () => {
    expect(puedeVerPlanilla({ area: 'tesoreria', rol: 'operativo' })).toBe(true)
    expect(puedeVerPlanilla({ area: 'gestion_humana', rol: 'x' })).toBe(true)
    expect(puedeVerPlanilla({ area: 'gerencia', rol: 'operativo' })).toBe(false)
    expect(puedeVerPlanilla({ area: 'compras', rol: 'operativo' })).toBe(false)
    expect(puedeVerPlanilla(null)).toBe(false)
  })
})

describe('ventana de corrección', () => {
  it('se corrige solo antes de generar la obligación', () => {
    expect(puedeCorregirse('pendiente_contabilidad')).toBe(true)
    expect(puedeCorregirse('conforme')).toBe(false)
    expect(puedeCorregirse('anulada')).toBe(false)
  })
})
