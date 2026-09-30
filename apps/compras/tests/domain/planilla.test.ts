import { describe, expect, it } from 'vitest'
import {
  descripcionDeObligacion, ETIQUETA_ESTADO_PLANILLA, etiquetaPagoPlanilla, etiquetaPeriodo,
  etiquetaSecuencia, puedeCargarPlanilla, puedeCorregirse, puedeDarConformidadPlanilla,
  puedeVerPlanilla, validarPagoPlanilla,
  type BorradorPagoPlanilla,
} from '@/domain/planilla'

const base: BorradorPagoPlanilla = {
  concepto: 'planilla',
  periodo: '2026-09',
  secuencia: 2,
  trabajador: null,
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
    const d = descripcionDeObligacion({ concepto: 'planilla', periodo: '2026-09', secuencia: 2, trabajador: null })
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
    expect(puedeCorregirse('rechazada')).toBe(false)
  })

  it('una carga rechazada tiene cómo mostrarse — antes salía en blanco', () => {
    // `rechazada` existía en la base desde la 0069 pero no en este mapa, así
    // que la columna Estado de la tabla quedaba vacía para esas filas.
    expect(ETIQUETA_ESTADO_PLANILLA.rechazada).toBeTruthy()
  })
})

describe('LBS — liquidación de beneficios sociales (migración 0076)', () => {
  /**
   * Pedido de Arlette. Una LBS no es la transferencia masiva: se le paga a
   * UNA persona, la que se va, y en un mismo mes puede haber varias. Por eso
   * se identifica por `trabajador` y no por `secuencia`.
   */
  const lbs: BorradorPagoPlanilla = {
    concepto: 'lbs',
    periodo: '2026-09',
    secuencia: null,
    trabajador: 'Juan Pérez Quispe',
    monto: 3200,
    moneda: 'PEN',
    fechaPago: '2026-09-30',
  }

  it('acepta una LBS con el nombre de la persona y SIN secuencia', () => {
    expect(validarPagoPlanilla(lbs)).toEqual([])
  })

  it('una LBS sin trabajador no pasa — Tesorería no sabría a quién pagarle', () => {
    expect(validarPagoPlanilla({ ...lbs, trabajador: null }).map((e) => e.campo)).toContain('trabajador')
    expect(validarPagoPlanilla({ ...lbs, trabajador: '   ' }).map((e) => e.campo)).toContain('trabajador')
  })

  it('a una LBS no se le pide secuencia — no significa nada ahí', () => {
    expect(validarPagoPlanilla(lbs).map((e) => e.campo)).not.toContain('secuencia')
  })

  it('y a la planilla no se le pide trabajador', () => {
    expect(validarPagoPlanilla(base).map((e) => e.campo)).not.toContain('trabajador')
  })

  it('la planilla sigue exigiendo secuencia', () => {
    expect(validarPagoPlanilla({ ...base, secuencia: null }).map((e) => e.campo)).toContain('secuencia')
  })

  it('un concepto inventado se rechaza en vez de caer en planilla', () => {
    expect(validarPagoPlanilla({ ...base, concepto: 'cts' as any }).map((e) => e.campo)).toContain('concepto')
  })

  it('se nombra por la persona, que es lo que distingue dos LBS del mismo mes', () => {
    expect(etiquetaPagoPlanilla(lbs)).toBe('LBS — Juan Pérez Quispe')
    expect(etiquetaPagoPlanilla({ ...lbs, trabajador: 'Ana Ruiz' })).toBe('LBS — Ana Ruiz')
    // La planilla sigue nombrándose por su pago del mes.
    expect(etiquetaPagoPlanilla(base)).toBe('Fin de mes')
  })

  it('la obligación de una LBS NO dice "transferencia masiva" — no está en el archivo de BUK', () => {
    const d = descripcionDeObligacion(lbs)
    expect(d).not.toContain('transferencia masiva')
    expect(d).toContain('Liquidación de beneficios sociales')
    expect(d).toContain('Juan Pérez Quispe')
    expect(d).toContain('setiembre 2026')
  })
})
