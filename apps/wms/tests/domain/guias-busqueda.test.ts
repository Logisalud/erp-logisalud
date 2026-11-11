// Buscador de guías: estado, filtros y orden.
import { describe, expect, it } from 'vitest'
import { estadoDeGuia, filtrarGuias, FILTRO_GUIAS_VACIO, ordenarGuias, type GuiaFila } from '@/domain/guias-busqueda'

const g = (o: Partial<GuiaFila>): GuiaFila => ({ id: o.numero ?? 'x', numero: 'TTT1-00000001', salidaId: 's', salidaNumero: 'SAL-1', rolDestinatario: 'CLIENTE', fecha: '2026-11-10', origen: 'NUBEFACT', anulada: false, ...o })
const G = [
  g({ numero: 'TTT1-00000001', destinatario: 'Droguería Ñandú SAC', estadoSunat: 'ACEPTADA', fecha: '2026-11-08', placa: 'ABC-123', pedidoNumero: 'PED-10' }),
  g({ numero: 'TTT1-00000002', destinatario: 'Proveedor Beta', rolDestinatario: 'PROVEEDOR', estadoSunat: 'PENDIENTE', fecha: '2026-11-09' }),
  g({ numero: 'TTT1-00000003', destinatario: 'Cliente Gama', estadoSunat: 'RECHAZADA', fecha: '2026-11-10' }),
  g({ numero: 'TTT1-00000004', destinatario: 'Cliente Delta', anulada: true, estadoSunat: 'ACEPTADA', fecha: '2026-11-10' }),
  g({ numero: 'TTT1-00000005', destinatario: 'Cliente Épsilon', origen: 'PANEL', fecha: '2026-11-07' }),
]

describe('estado de la guía', () => {
  it('anulada manda sobre lo que dijo SUNAT; sin respuesta de SUNAT es «registrada»', () => {
    expect(G.map(estadoDeGuia)).toEqual(['ACEPTADA', 'ENVIADA', 'RECHAZADA', 'ANULADA', 'REGISTRADA'])
  })
})

describe('filtrar guías', () => {
  it('por texto: número, destinatario (sin tildes), pedido o placa', () => {
    expect(filtrarGuias(G, { ...FILTRO_GUIAS_VACIO, q: '00000002' }).map((x) => x.numero)).toEqual(['TTT1-00000002'])
    expect(filtrarGuias(G, { ...FILTRO_GUIAS_VACIO, q: 'nandu' })).toHaveLength(1)
    expect(filtrarGuias(G, { ...FILTRO_GUIAS_VACIO, q: 'ped-10 abc-123' })).toHaveLength(1)
  })
  it('por estado, por cliente o proveedor y por rango de fechas (extremos incluidos)', () => {
    expect(filtrarGuias(G, { ...FILTRO_GUIAS_VACIO, estado: 'ANULADA' }).map((x) => x.numero)).toEqual(['TTT1-00000004'])
    expect(filtrarGuias(G, { ...FILTRO_GUIAS_VACIO, rol: 'PROVEEDOR' }).map((x) => x.numero)).toEqual(['TTT1-00000002'])
    expect(filtrarGuias(G, { ...FILTRO_GUIAS_VACIO, desde: '2026-11-09', hasta: '2026-11-10' })).toHaveLength(3)
  })
})

describe('ordenar guías', () => {
  it('por fecha descendente por defecto de la pantalla; el empate lo resuelve el número', () => {
    expect(ordenarGuias(G, { columna: 'fecha', sentido: 'desc' }).map((x) => x.numero)).toEqual(['TTT1-00000004', 'TTT1-00000003', 'TTT1-00000002', 'TTT1-00000001', 'TTT1-00000005'])
  })
  it('por destinatario ascendente sin tildes y sin alterar la lista original', () => {
    const copia = [...G]
    expect(ordenarGuias(G, { columna: 'destinatario', sentido: 'asc' }).map((x) => x.destinatario)[0]).toBe('Cliente Delta')
    expect(G).toEqual(copia)
  })
})
