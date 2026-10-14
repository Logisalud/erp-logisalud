import { describe, expect, it } from 'vitest'
import { armarRegistroLsFr, paginarFilas, parametrosDesdeClaves, puedeImprimirLsFr, type FilaLsFr } from '@/domain/ls-fr-43-03'
import type { ParadaVista, RutaVista } from '@/domain/rutas'

const parada = (n: number): ParadaVista => ({ id: `p${n}`, secuencia: n, pedidoId: `ped-${n}`, pedidoNumero: `PED-${n}`, cliente: `Cliente ${n}`, lineas: 1, unidades: 10, stock: 'ASIGNADA', excepcionCorte: false })
const ruta = (n: number, extra: Partial<RutaVista> = {}): RutaVista => ({
  id: 'r1', numero: 'RUT-2026-00001', fecha: '2026-10-15', estado: 'PLANIFICADA', version: 2, paradas: Array.from({ length: n }, (_, i) => parada(i + 1)), versiones: [], registroLsFr: 'BASE',
  creadaPor: 'x', creadaEn: '2026-10-14T10:00:00Z', unidades: n * 10, vehiculo: { id: 'v', placa: 'BKW-757', tipo: 'PROPIO', calificado: true, aptoCadenaFrio: false, activo: true },
  conductor: { id: 'c', nombre: 'Luis Quispe', funcion: 'CONDUCTOR', activo: true }, ...extra,
})

describe('registro LS-FR.43.03', () => {
  it('arma las filas desde las paradas, con la guía y los bultos que registraron las etapas siguientes; lo que falta queda en blanco', () => {
    const r = armarRegistroLsFr(ruta(2), undefined, { guias: { 'ped-1': 'T001-123' }, cajas: { 'ped-1': 3 }, horaSalida: '2026-10-15T13:30:00Z' })
    expect(r).toMatchObject({ codigo: 'LS-FR.43.03', poe: 'LS-POE.07.05', version: '01', placa: 'BKW-757', conductor: 'Luis Quispe', paginas: 1, horaSalida: '2026-10-15T13:30:00Z' })
    expect(r.filas[0]).toMatchObject({ n: 1, cliente: 'Cliente 1', guia: 'T001-123', cajas: 3, detalle: 'ENTREGA' })
    expect(r.filas[1]).toMatchObject({ n: 2, cliente: 'Cliente 2', guia: undefined, cajas: undefined })
  })
  it('10 filas por página: 10 → 1 página, 11 → 2, 0 → 1; la última se completa con filas numeradas vacías', () => {
    expect(armarRegistroLsFr(ruta(10)).paginas).toBe(1)
    expect(armarRegistroLsFr(ruta(11)).paginas).toBe(2)
    expect(armarRegistroLsFr(ruta(0)).paginas).toBe(1)
    const pags = paginarFilas(armarRegistroLsFr(ruta(11)).filas)
    expect(pags.map((p) => p.length)).toEqual([10, 10])
    expect(pags[1].map((f) => f.n)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(pags[1].filter((f) => 'vacia' in f)).toHaveLength(9)
    expect((pags[0][0] as FilaLsFr).cliente).toBe('Cliente 1')
  })
  it('los parámetros pendientes de Dirección Técnica se listan; al definirlos salen de la lista; el formato lo trae de parámetros', () => {
    expect(parametrosDesdeClaves({}).pendientes).toHaveLength(4)
    const p = parametrosDesdeClaves({ ls_fr_43_03_codigo: 'LS-FR.43.03', ls_fr_43_03_version: '02', ls_fr_43_03_usuario_significado: 'Quien arma la ruta', cajas_equivale_a_bultos: 'SI', ls_fr_43_03_temperatura_metodo: 'PENDIENTE', ls_fr_43_03_copia_fisica: 'PENDIENTE', ls_fr_43_03_filas_por_pagina: '8' })
    expect(p).toMatchObject({ version: '02', filasPorPagina: 8, pendientes: ['ls_fr_43_03_temperatura_metodo', 'ls_fr_43_03_copia_fisica'] })
    expect(armarRegistroLsFr(ruta(9), p).paginas).toBe(2)
  })
  it('solo se imprime con la ruta confirmada', () => {
    expect(puedeImprimirLsFr({ estado: 'BORRADOR' })).toBe(false)
    expect(puedeImprimirLsFr({ estado: 'CANCELADA' })).toBe(false)
    expect(puedeImprimirLsFr({ estado: 'PLANIFICADA' })).toBe(true)
  })
})
