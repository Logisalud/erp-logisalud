import { describe, expect, it } from 'vitest'
import {
  advertenciaDeCambioDeMes, cruzaDeMes, etiquetaCorreccion, nombreDelMes,
  puedeCorregirFechaDePago, validarCorreccionFecha,
} from '@/domain/correccion-fecha-pago'

describe('quién puede corregir la fecha de un pago', () => {
  it('solo admin/admin', () => {
    expect(puedeCorregirFechaDePago({ area: 'admin', rol: 'admin' })).toBe(true)
  })

  it('Tesorería NO, aunque sea quien ejecuta el pago', () => {
    // Mismo criterio que reemplazar la constancia: quien paga no mueve la
    // fecha de su propio pago.
    expect(puedeCorregirFechaDePago({ area: 'tesoreria', rol: 'operativo' })).toBe(false)
  })

  it('Contabilidad tampoco, ni siendo admin de su área', () => {
    expect(puedeCorregirFechaDePago({ area: 'contabilidad', rol: 'admin' })).toBe(false)
  })

  it('sin perfil, no', () => {
    expect(puedeCorregirFechaDePago(null)).toBe(false)
    expect(puedeCorregirFechaDePago({ area: null, rol: null })).toBe(false)
  })
})

describe('validarCorreccionFecha', () => {
  const base = { fechaActual: '2026-09-12', motivo: 'se registró con la fecha del día siguiente' }

  it('el caso real: corregir del 12/09 al 11/09 es válido', () => {
    expect(validarCorreccionFecha({ ...base, fechaNueva: '2026-09-11', hoy: '2026-09-15' }))
      .toEqual([])
  })

  it('una fecha futura se rechaza: el pago ya ocurrió', () => {
    const errores = validarCorreccionFecha({ ...base, fechaNueva: '2026-09-20', hoy: '2026-09-15' })
    expect(errores.map((e) => e.campo)).toContain('fechaNueva')
    expect(errores[0].mensaje).toContain('no puede ser futura')
  })

  it('HOY sí se acepta — y este es el borde que el bug de zona horaria rompía', () => {
    // Con el `hoy` sacado de UTC, corregir un pago a la fecha de hoy desde
    // Lima a las 20:00 se habría rechazado por "futura": el servidor ya
    // estaba en el día siguiente. Por eso hoyLima().
    expect(validarCorreccionFecha({ ...base, fechaNueva: '2026-09-15', hoy: '2026-09-15' }))
      .toEqual([])
  })

  it('poner la misma fecha que ya tiene no es una corrección', () => {
    const errores = validarCorreccionFecha({ ...base, fechaNueva: '2026-09-12', hoy: '2026-09-15' })
    expect(errores[0].mensaje).toContain('Esa es la fecha que ya tiene')
  })

  it('el motivo es obligatorio: sin él el rastro no le sirve a nadie', () => {
    const errores = validarCorreccionFecha({
      ...base, fechaNueva: '2026-09-11', motivo: '   ', hoy: '2026-09-15',
    })
    expect(errores.map((e) => e.campo)).toContain('motivo')
  })

  it('una fecha con formato inválido se rechaza antes de comparar', () => {
    const errores = validarCorreccionFecha({ ...base, fechaNueva: '11/09/2026', hoy: '2026-09-15' })
    expect(errores.map((e) => e.campo)).toContain('fechaNueva')
  })
})

describe('la advertencia de cambio de mes', () => {
  it('detecta el cruce de mes', () => {
    expect(cruzaDeMes('2026-10-01', '2026-09-30')).toBe(true)
    expect(cruzaDeMes('2026-09-12', '2026-09-11')).toBe(false)
  })

  it('cruzar de año también es cruzar de mes', () => {
    expect(cruzaDeMes('2027-01-01', '2026-12-31')).toBe(true)
  })

  it('avisa con el MONTO adentro: sin monto es una nota al pie, con monto es una decisión', () => {
    const aviso = advertenciaDeCambioDeMes({
      fechaActual: '2026-10-01', fechaNueva: '2026-09-30',
      monto: 11186.6, moneda: 'PEN',
    })
    expect(aviso).toContain('S/ 11,186.60')
    expect(aviso).toContain('octubre de 2026')
    expect(aviso).toContain('setiembre de 2026')
    expect(aviso).toContain('Dos cierres mensuales')
  })

  it('en dólares usa US$', () => {
    const aviso = advertenciaDeCambioDeMes({
      fechaActual: '2026-10-01', fechaNueva: '2026-09-30', monto: 3200, moneda: 'USD',
    })
    expect(aviso).toContain('US$ 3,200.00')
  })

  it('dentro del mismo mes no avisa nada', () => {
    expect(advertenciaDeCambioDeMes({
      fechaActual: '2026-09-12', fechaNueva: '2026-09-11', monto: 500, moneda: 'PEN',
    })).toBeNull()
  })

  it('"setiembre", como se escribe en Perú', () => {
    expect(nombreDelMes('2026-09-01')).toBe('setiembre de 2026')
  })
})

describe('el rastro visible', () => {
  it('dice qué decía antes, quién lo cambió y por qué', () => {
    const etiqueta = etiquetaCorreccion(
      '2026-09-12', 'Sebastian Gonzales', '2026-09-15T19:30:00Z', 'se registró con la fecha del día siguiente'
    )
    expect(etiqueta).toContain('era 12/09/2026')
    expect(etiqueta).toContain('Sebastian Gonzales')
    expect(etiqueta).toContain('se registró con la fecha del día siguiente')
  })

  it('sin corrección no hay etiqueta', () => {
    expect(etiquetaCorreccion(null, 'X', null, null)).toBeNull()
    expect(etiquetaCorreccion('2026-09-12', 'X', null, null)).toBeNull()
  })
})
