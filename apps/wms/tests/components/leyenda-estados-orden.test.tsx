// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LeyendaEstadosOrden } from '@/components/salidas/leyenda-estados-orden'
import { ChipEstadoOrden } from '@/components/salidas/chip-estado-orden'

describe('Leyenda y chip de estado de la Orden de Salida', () => {
  it('la leyenda explica los 9 estados con texto (no solo color) y dice dónde se descarga la Orden', () => {
    const h = renderToStaticMarkup(<LeyendaEstadosOrden />)
    for (const k of ['CREADA', 'EN_PICKING', 'EN_CONFORMIDAD', 'LISTA', 'GUIA_ENVIADA', 'EN_RUTA', 'ENTREGADA', 'NO_ENTREGADA', 'CANCELADA']) expect(h).toContain(`leyenda-${k}`)
    expect(h).toContain('Guía electrónica enviada')
    expect(h).toContain('se descarga la Orden de Salida')
  })
  it('el chip muestra el nombre del estado', () => {
    const h = renderToStaticMarkup(<ChipEstadoOrden s={{ etapa: 'CONFORME' }} />)
    expect(h).toContain('Lista'); expect(h).toContain('data-estado="LISTA"')
  })
})
