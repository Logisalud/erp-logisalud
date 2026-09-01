import { Encabezado } from '@/components/nav'
import { listarExcepcionesConciliacion, listarFacturasEsperandoMercaderia } from '@/services/facturas-pendientes'
import { MenuItem } from '@/components/menu-item'

export const dynamic = 'force-dynamic'

/**
 * Índice de las DOS vistas separadas (Carta de Simplicidad regla 2: cada
 * una en lenguaje de negocio, nunca mezcladas con un filtro): una es
 * informativa (nada que decidir todavía), la otra tiene una acción real
 * para Contabilidad.
 */
export default async function FacturasPendientesIndice() {
  const [esperando, excepciones] = await Promise.all([
    listarFacturasEsperandoMercaderia().catch(() => []),
    listarExcepcionesConciliacion().catch(() => []),
  ])

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Facturas por conciliar" atras={{ href: '/', texto: 'Compras y Pagos' }} />
      <div className="space-y-3">
        <MenuItem
          href="/facturas-pendientes/esperando-mercaderia" emoji="📦"
          titulo="Esperando mercadería"
          descripcion={`Facturas que llegaron antes que la mercadería (${esperando.length}).`}
        />
        <MenuItem
          href="/facturas-pendientes/excepciones" emoji="⚠️"
          titulo="Excepciones de conciliación"
          descripcion={`Facturaron más de lo verificado — revisión de Contabilidad (${excepciones.length}).`}
        />
      </div>
    </main>
  )
}
