import Link from 'next/link'
import { Encabezado } from '@/components/nav'

export const dynamic = 'force-dynamic'

const OPCIONES = [
  {
    emoji: '💸',
    texto: 'Ya pagué yo mismo, quiero que me devuelvan el dinero',
    href: '/gastos/nueva?tipo=reembolso',
  },
  {
    emoji: '🧳',
    texto: 'Necesito el dinero antes de pagar algo (viaje, evento, proveedor)',
    href: '/gastos/nueva?tipo=anticipo',
  },
  {
    emoji: '🧾',
    texto: 'Tengo la factura de un proveedor para pagar directo (luz, agua, notaría, peajes… sin orden de compra)',
    href: '/pago-directo/nueva',
  },
] as const

export default function PedirPago() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="¿Cómo es tu situación?" atras={{ href: '/', texto: 'Compras y Pagos' }} />

      <ul className="space-y-3">
        {OPCIONES.map((o) => (
          <li key={o.href}>
            <Link
              href={o.href}
              className="card flex items-center gap-4 transition hover:shadow-md hover:-translate-y-0.5"
            >
              <span className="text-3xl" aria-hidden>{o.emoji}</span>
              <span className="text-base font-medium text-gray-900">{o.texto}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
