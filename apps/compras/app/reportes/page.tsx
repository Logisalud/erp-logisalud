import Link from 'next/link'
import { Encabezado } from '@/components/nav'

export const dynamic = 'force-dynamic'

/**
 * Landing de reportes — agrupado por audiencia (Carta de Simplicidad UX:
 * cada rol ve lo que le toca). Sin tabs: cada reporte es su propia pantalla,
 * con sus propios filtros por `searchParams`, igual que el resto del módulo.
 *
 * El dashboard de "loops abiertos" (Fase 1.5, /cuentas-por-pagar/reportes)
 * queda como una tarjeta más acá — es un propósito distinto (qué necesita
 * atención AHORA) del de estos reportes tabulares/exportables, así que no se
 * fusionan.
 */
export default function Reportes() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Ver reportes" atras={{ href: '/', texto: 'Compras y Pagos' }} />

      <GrupoReportes titulo="Qué necesita atención ahora">
        <ItemReporte
          href="/cuentas-por-pagar/reportes"
          titulo="Loops abiertos de Cuentas por Pagar"
          descripcion="Vencidas, por vencer, observadas y lo pagado este mes."
        />
      </GrupoReportes>

      <GrupoReportes titulo="Operativo — Compras y Almacén">
        <ItemReporte
          href="/reportes/ordenes-compra"
          titulo="Órdenes de compra"
          descripcion="Seguimiento del pedido: estado, % recibido, discrepancias abiertas."
        />
      </GrupoReportes>

      <GrupoReportes titulo="Financiero — Contabilidad y Tesorería">
        <ItemReporte
          href="/reportes/cuentas-por-pagar/antiguedad"
          titulo="Antigüedad de saldos"
          descripcion="Por vencer, 1-30, 31-60, 61-90 y +90 días, por proveedor."
        />
        <ItemReporte
          href="/reportes/cuentas-por-pagar/abiertas"
          titulo="Obligaciones abiertas"
          descripcion="Una fila por obligación sin pagar."
        />
        <ItemReporte
          href="/reportes/cuentas-por-pagar/proyeccion-pagos"
          titulo="Proyección de pagos"
          descripcion="Qué hay que pagar esta semana, este mes y el próximo."
        />
        <ItemReporte
          href="/reportes/cuentas-por-pagar/historial-pagos"
          titulo="Historial de pagos"
          descripcion="Lo ya pagado, por proveedor o periodo."
        />
        <ItemReporte
          href="/reportes/cuentas-por-pagar/detracciones"
          titulo="Detracciones"
          descripcion="Reporte SUNAT-facing, separado del aging general."
        />
      </GrupoReportes>

      <GrupoReportes titulo="Exportar">
        <ItemReporte
          href="/reportes/sabana-maestra"
          titulo="Sábana maestra"
          descripcion="Una fila por obligación, todos los campos — para Excel o Power BI."
        />
      </GrupoReportes>
    </main>
  )
}

function GrupoReportes({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-2 mb-6">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function ItemReporte({ href, titulo, descripcion }: { href: string; titulo: string; descripcion: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
    >
      <span className="font-heading block text-base">{titulo}</span>
      <span className="mt-1 block text-sm text-gray-600">{descripcion}</span>
    </Link>
  )
}
