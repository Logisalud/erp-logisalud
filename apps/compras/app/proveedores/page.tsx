import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { listarProveedores } from '@/services/proveedores'

export const dynamic = 'force-dynamic'

export default async function Proveedores({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const proveedores = await listarProveedores(searchParams.q)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Proveedores" />

      <form className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="RUC o nombre"
          className="min-h-12 flex-1 rounded-md border border-gray-300 px-3"
        />
        <button type="submit" className="btn-secondary">Buscar</button>
      </form>

      {proveedores.length === 0 ? (
        <p className="card text-sm text-gray-600">
          {searchParams.q
            ? `Ningún proveedor coincide con "${searchParams.q}".`
            : 'Todavía no hay proveedores cargados.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {proveedores.map((p) => (
            <li key={p.id}>
              <Link
                href={`/proveedores/${p.id}`}
                className="card block transition hover:shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{p.razon_social}</span>
                  {!p.activo ? (
                    <span className="text-xs text-gray-500">inactivo</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  RUC {p.ruc} · {p.condicion_pago_dias} días · {p.moneda_principal}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
