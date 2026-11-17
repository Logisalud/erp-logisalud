import { describe, expect, it } from 'vitest'
import { ESTADOS_ORDEN, ETIQUETA_ESTADO_ORDEN, SIGNIFICADO_ESTADO_ORDEN, estadoDeOrden, etiquetaEstadoOrden } from '@/domain/estado-orden'
import type { EtapaSalida } from '@/domain/pasos'

describe('Estados de la Orden de Salida', () => {
  it('cada etapa cae en un estado y el camino normal tiene los 7 pasos en orden', () => {
    expect(ESTADOS_ORDEN.map((e) => ETIQUETA_ESTADO_ORDEN[e]).slice(0, 7)).toEqual(['Creada', 'En picking', 'En conformidad', 'Lista', 'Guía electrónica enviada', 'En ruta', 'Entregada'])
    for (const e of ESTADOS_ORDEN) expect(SIGNIFICADO_ESTADO_ORDEN[e].length).toBeGreaterThan(10)
  })
  it.each<[EtapaSalida, string]>([
    ['SIN_STOCK', 'CREADA'], ['ASIGNADA', 'CREADA'], ['EN_PICKING', 'EN_PICKING'], ['CON_DISCREPANCIA', 'EN_PICKING'],
    ['PENDIENTE_CONFORMIDAD', 'EN_CONFORMIDAD'], ['OBSERVADA', 'EN_CONFORMIDAD'], ['CONFORME', 'LISTA'], ['EMBALADA', 'LISTA'],
    ['DOCUMENTACION_COMPLETA', 'GUIA_ENVIADA'], ['LISTA_PARA_CARGA', 'GUIA_ENVIADA'], ['CARGADA', 'GUIA_ENVIADA'],
    ['CONFIRMADA', 'EN_RUTA'], ['CANCELADA', 'CANCELADA'],
  ])('%s → %s', (etapa, estado) => { expect(estadoDeOrden({ etapa })).toBe(estado) })
  it('lo que marca el conductor lleva la orden a Entregada o No entregada', () => {
    expect(estadoDeOrden({ etapa: 'CONFIRMADA', resultadoEntrega: 'ENTREGADA' })).toBe('ENTREGADA')
    expect(estadoDeOrden({ etapa: 'CONFIRMADA', resultadoEntrega: 'NO_ENTREGADA' })).toBe('NO_ENTREGADA')
  })
  it('en una orden de un cliente de almacenamiento (tipo B) no se habla de guía electrónica', () => {
    expect(etiquetaEstadoOrden({ etapa: 'ENTREGADA_AL_TRANSPORTISTA', tipo: 'CLIENTE' })).toBe('Entregada al transportista')
  })
})
