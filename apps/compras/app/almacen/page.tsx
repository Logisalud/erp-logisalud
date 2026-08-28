import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { listarRecepciones } from '@/services/recepciones'

export const dynamic = 'force-dynamic'

const ETIQUETA_ESTADO_RECEPCION: Record<string, string> = {
  pendiente: 'Pendiente de resolver',
  conforme: 'Conforme',
  con_discrepancia: 'Con discrepancia',
}

const COLOR_ESTADO: Record<string, string> = {
  pendiente: 'text-amber-700',
  conforme: 'text-green-700',
  con_discrepancia: 'text-amber-700',
}

export default async function Almacen() {
  const recepciones = await listarRecepciones()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Almacén" atras={{ href: '/', texto: 'Módulos' }} />

      <Link href="/almacen/recepciones/nueva" className="btn-primary mb-5 w-full sm:w-auto">
        Registrar recepción
      </Link>

      {recepciones.length === 0 ? (
        <p className="card text-sm text-gray-600">Todavía no se registró ninguna recepción.</p>
      ) : (
        <ul className="space-y-2">
          {recepciones.map((r) => (
            <li key={r.id}>
              <Link href={`/almacen/recepciones/${r.id}`} className="card block transition hover:shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{r.oc?.codigo ?? 'orden no legible'}</span>
                  <span className={`text-sm font-medium ${COLOR_ESTADO[r.estado]}`}>
                    {ETIQUETA_ESTADO_RECEPCION[r.estado]}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  {r.oc?.proveedor?.razon_social ?? 'proveedor no legible'} · {r.fecha_recepcion.slice(0, 10)}
                  {r.guia_remision ? ` · Guía ${r.guia_remision}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
