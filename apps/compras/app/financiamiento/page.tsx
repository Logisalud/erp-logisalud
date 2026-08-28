import Link from 'next/link'
import { Encabezado } from '@/components/nav'

export const dynamic = 'force-dynamic'

export default function Financiamiento() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Financiamiento e Impuestos" atras={{ href: '/', texto: 'Módulos' }} />

      <Link href="/financiamiento/vencimientos" className="btn-primary mb-5 w-full sm:w-auto">
        Vencimientos próximos
      </Link>

      <ul className="space-y-2">
        <li>
          <Link href="/financiamiento/prestamos" className="card block transition hover:shadow-sm">
            <span className="font-medium">Préstamos</span>
            <p className="mt-0.5 text-sm text-gray-600">Cronograma de cuotas de un préstamo bancario.</p>
          </Link>
        </li>
        <li>
          <Link href="/financiamiento/fraccionamientos" className="card block transition hover:shadow-sm">
            <span className="font-medium">Fraccionamiento SUNAT</span>
            <p className="mt-0.5 text-sm text-gray-600">Deuda tributaria fraccionada, incluye IGV Justo.</p>
          </Link>
        </li>
        <li>
          <Link href="/impuestos" className="card block transition hover:shadow-sm">
            <span className="font-medium">Impuestos</span>
            <p className="mt-0.5 text-sm text-gray-600">Planilla vía BUK: Essalud, ONP, AFP, Renta, Seguro Vida Ley.</p>
          </Link>
        </li>
      </ul>

      <p className="mt-4 text-sm text-gray-500">
        Las letras por pagar nacen del canje de una obligación de compra ya existente — entrá a esa
        obligación en Cuentas por Pagar y usá &quot;Canjear por letras&quot;.
      </p>
    </main>
  )
}
