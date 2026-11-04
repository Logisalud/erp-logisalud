import { describe, expect, it } from 'vitest'
import { puedeCorregirPapeles, validarCorreccionPapel } from '@/domain/correccion-papeles-recepcion'
import { resumenNumerosFactura } from '@/domain/recepcion-tres-columnas'

/**
 * El caso con el que Sebas lo pidió (2026-11-04): la OC-2026-0050 de DIMEXA
 * trajo dos facturas y Charlie subió la F991-317017 como si fuera una guía.
 */
const oc0050 = {
  guias: [
    { id: 'g1', numero: 'T990-452417' },
    { id: 'g2', numero: 'T990-452416' },
    { id: 'g3', numero: 'F991-317017' },
  ],
  facturas: [{ id: 'f1', numero: 'F991-317018' }],
}

describe('quién corrige', () => {
  it('Almacén, que registra, y Contabilidad, que revisa', () => {
    expect(puedeCorregirPapeles('almacen')).toBe(true)
    expect(puedeCorregirPapeles('contabilidad')).toBe(true)
    expect(puedeCorregirPapeles('admin')).toBe(true)
    expect(puedeCorregirPapeles('ventas')).toBe(false)
    expect(puedeCorregirPapeles(null)).toBe(false)
  })
})

describe('reclasificar', () => {
  it('la factura subida como guía pasa a factura, con motivo', () => {
    expect(validarCorreccionPapel(oc0050, { accion: 'reclasificar', tipo: 'guia', id: 'g3', motivo: 'Es la segunda factura' }))
      .toBeNull()
  })

  it('sin motivo no', () => {
    expect(validarCorreccionPapel(oc0050, { accion: 'reclasificar', tipo: 'guia', id: 'g3', motivo: ' ' }))
      .toBe('Cuenta por qué se cambia.')
  })

  it('no puede dejar la recepción sin factura', () => {
    expect(validarCorreccionPapel(oc0050, { accion: 'reclasificar', tipo: 'factura', id: 'f1', motivo: 'x' }))
      .toContain('única factura')
  })

  it('no duplica un número que ya está del otro lado', () => {
    const conLaMisma = { ...oc0050, facturas: [...oc0050.facturas, { id: 'f2', numero: 'f991-317017' }] }
    expect(validarCorreccionPapel(conLaMisma, { accion: 'reclasificar', tipo: 'guia', id: 'g3', motivo: 'x' }))
      .toContain('Ya hay una factura')
  })
})

describe('agregar y quitar', () => {
  it('agregar una factura que faltó pide número y archivo', () => {
    expect(validarCorreccionPapel(oc0050, { accion: 'agregar', tipo: 'factura', numero: 'F991-317019', storagePath: 'r.pdf' }))
      .toBeNull()
    expect(validarCorreccionPapel(oc0050, { accion: 'agregar', tipo: 'factura', numero: 'F991-317019', storagePath: null }))
      .toContain('archivo')
    expect(validarCorreccionPapel(oc0050, { accion: 'agregar', tipo: 'guia', numero: ' ', storagePath: 'r.pdf' }))
      .toContain('número')
  })

  it('no agrega una que ya está', () => {
    expect(validarCorreccionPapel(oc0050, { accion: 'agregar', tipo: 'factura', numero: 'f991-317018', storagePath: 'r.pdf' }))
      .toContain('ya tiene')
  })

  it('quitar pide motivo y nunca deja la recepción sin guía', () => {
    expect(validarCorreccionPapel(oc0050, { accion: 'quitar', tipo: 'guia', id: 'g1', motivo: 'No era de esta entrega' })).toBeNull()
    const unaGuia = { ...oc0050, guias: [oc0050.guias[0]] }
    expect(validarCorreccionPapel(unaGuia, { accion: 'quitar', tipo: 'guia', id: 'g1', motivo: 'x' })).toContain('única guía')
  })

  it('un papel que ya no está se reclama, no se ignora', () => {
    expect(validarCorreccionPapel(oc0050, { accion: 'quitar', tipo: 'factura', id: 'nada', motivo: 'x' }))
      .toContain('Recarga')
  })
})

it('la obligación lleva todas las facturas en su número', () => {
  expect(resumenNumerosFactura([' f991-317017', 'F991-317018 '])).toBe('F991-317017 / F991-317018')
  expect(resumenNumerosFactura(['F001-1'])).toBe('F001-1')
})
