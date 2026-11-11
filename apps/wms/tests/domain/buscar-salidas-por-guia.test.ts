// 1c (reunión del equipo): el buscador de la Orden de Salida encuentra por n.º de guía y por n.º de orden.
import { describe, expect, it } from 'vitest'
import { filtrarSalidas, type SalidaResumen } from '@/domain/despacho'

const base = { fecha: '2026-11-10', unidades: 10, lineas: 1, etapa: 'POR_PICKEAR' } as const
const S = [
  { ...base, id: '1', numero: 'SAL-2026-00001', pedidoNumero: 'PED-1', cliente: 'Cliente Uno', guia: 'TTT1-00000007' },
  { ...base, id: '2', numero: 'SAL-2026-00002', pedidoNumero: 'PED-2', cliente: 'Cliente Dos', ordenNumero: 'OS-9' },
] as unknown as SalidaResumen[]

describe('buscar salidas', () => {
  it('por n.º de guía completo o parcial', () => {
    expect(filtrarSalidas(S, { q: 'TTT1-00000007', etapa: '' }).map((s) => s.id)).toEqual(['1'])
    expect(filtrarSalidas(S, { q: '0000007', etapa: '' }).map((s) => s.id)).toEqual(['1'])
  })
  it('por n.º de orden', () => {
    expect(filtrarSalidas(S, { q: 'SAL-2026-00002', etapa: '' }).map((s) => s.id)).toEqual(['2'])
    expect(filtrarSalidas(S, { q: 'os-9', etapa: '' }).map((s) => s.id)).toEqual(['2'])
  })
})
