'use client'

import { useState } from 'react'
import { SelectorProducto, type ProductoElegido } from '../entradas/selector-producto'

/**
 * El producto del Kardex se busca y se elige (por nombre o código), no se baja de una lista: el catálogo va a pasar de 1.000 productos.
 * Manda su id en el formulario (`name="producto"`); `id` es el del cuadro de búsqueda.
 */
export function FiltroProducto({ inicial }: { inicial: ProductoElegido | null }) {
  const [producto, setProducto] = useState<ProductoElegido | null>(inicial)
  return (
    <>
      <SelectorProducto id="k-producto" valor={producto} onElegir={setProducto} />
      <input type="hidden" name="producto" value={producto?.id ?? ''} required data-testid="k-producto-valor" />
    </>
  )
}
