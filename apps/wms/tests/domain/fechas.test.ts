import { describe, expect, it } from 'vitest'
import { formatoFecha, parsearVencimiento, ultimoDiaDelMes } from '@/domain/fechas'

describe('vencimiento', () => {
  it('usa la fecha completa que muestra el producto', () => {
    expect(parsearVencimiento('2027-02-15')).toEqual({ fecha: '2027-02-15', textoOriginal: '2027-02-15' })
    expect(parsearVencimiento('15/02/2027')?.fecha).toBe('2027-02-15')
  })
  it('solo con mes y año usa el día por defecto: el PRIMER día del mes (a confirmar con Katia); con el parámetro «ultimo», el último', () => {
    expect(parsearVencimiento('02/2027')?.fecha).toBe('2027-02-01')
    expect(parsearVencimiento('2027-02')?.fecha).toBe('2027-02-01')
    expect(parsearVencimiento('02/2027', 'ultimo')?.fecha).toBe('2027-02-28')
    expect(parsearVencimiento('02/2028', 'ultimo')?.fecha).toBe('2028-02-29') // bisiesto
    expect(parsearVencimiento('2027-12')?.fecha).toBe('2027-12-01')
    expect(parsearVencimiento('2027-12', 'ultimo')?.fecha).toBe('2027-12-31')
    expect(parsearVencimiento('02/2027')?.textoOriginal).toBe('02/2027')
  })
  it('rechaza fechas imposibles', () => {
    expect(parsearVencimiento('31/02/2027')).toBeNull()
    expect(parsearVencimiento('13/2027')).toBeNull()
    expect(parsearVencimiento('hola')).toBeNull()
  })
  it('último día del mes', () => {
    expect(ultimoDiaDelMes(2026, 4)).toBe('2026-04-30')
  })
  it('formatea en español', () => {
    expect(formatoFecha('2027-02-28')).toBe('28 feb 2027')
    expect(formatoFecha(undefined)).toBe('—')
  })
})
