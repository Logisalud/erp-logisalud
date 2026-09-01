import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerReporteOrdenesCompra } from '@/services/reportes-ordenes-compra'
import { listarProveedores } from '@/services/proveedores'
import { ESTADOS_OC, ETIQUETA_ESTADO, TIPOS_OC, type EstadoOC, type TipoOC } from '@/domain/orden-compra'

export const dynamic = 'force-dynamic'

const ETIQUETA_TIPO: Record<TipoOC, string> = { mercaderia: 'Mercadería', bien: 'Bien' }

export default async function ReporteOrdenesCompra({
  searchParams,
}: {
  searchParams: { proveedorId?: string; estado?: string; tipo?: string; desde?: string; hasta?: string }
}) {
  const estado = (ESTADOS_OC as readonly string[]).includes(searchParams.estado ?? '')
    ? (searchParams.estado as EstadoOC)
    : undefined
  const tipo = (TIPOS_OC as readonly string[]).includes(searchParams.tipo ?? '') ? (searchParams.tipo as TipoOC) : undefined

  const [filas, proveedores] = await Promise.all([
    obtenerReporteOrdenesCompra({
      proveedorId: searchParams.proveedorId || undefined,
      estado,
      tipo,
      fechaDesde: searchParams.desde || undefined,
      fechaHasta: searchParams.hasta || undefined,
    }),
    listarProveedores(),
  ])

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Órdenes de compra" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

      <form className="card mb-4 grid gap-3 sm:grid-cols-5" method="get">
        <CampoSelect nombre="proveedorId" etiqueta="Proveedor" valor={searchParams.proveedorId ?? ''}>
          <option value="">Todos</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>{p.razon_social}</option>
          ))}
        </CampoSelect>
        <CampoSelect nombre="estado" etiqueta="Estado" valor={searchParams.estado ?? ''}>
          <option value="">Todos</option>
          {ESTADOS_OC.map((e) => (
            <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>
          ))}
        </CampoSelect>
        <CampoSelect nombre="tipo" etiqueta="Tipo" valor={searchParams.tipo ?? ''}>
          <option value="">Todos</option>
          {TIPOS_OC.map((t) => (
            <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>
          ))}
        </CampoSelect>
        <label className="block text-sm">
          <span className="text-gray-600">Emitida desde</span>
          <input type="date" name="desde" defaultValue={searchParams.desde ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">hasta</span>
          <input type="date" name="hasta" defaultValue={searchParams.hasta ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <button type="submit" className="btn-secondary sm:col-span-5 sm:w-auto">Filtrar</button>
      </form>

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay órdenes de compra para este filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <Th>N° OC</Th>
                <Th>Proveedor</Th>
                <Th>Tipo</Th>
                <Th>Emisión</Th>
                <Th>Entrega est.</Th>
                <Th>Estado</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">% recibido</Th>
                <Th className="text-right">Discrepancias</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0">
                  <Td>{f.codigo}</Td>
                  <Td>{f.proveedor}</Td>
                  <Td>{ETIQUETA_TIPO[f.tipo]}</Td>
                  <Td>{f.fechaEmision}</Td>
                  <Td>{f.fechaEntregaEstimada ?? '—'}</Td>
                  <Td>
                    {f.cierreTipo === 'saldo_no_entregado' ? (
                      <span title={f.cierreMotivo ?? undefined} className="font-medium text-amber-700">
                        Cerrada — saldo no entregado
                      </span>
                    ) : (
                      ETIQUETA_ESTADO[f.estado]
                    )}
                  </Td>
                  <Td className="text-right tabular-nums"><Money valor={f.total} moneda={f.moneda} /></Td>
                  <Td className="text-right tabular-nums">{f.porcentajeRecibido}%</Td>
                  <Td className={`text-right tabular-nums ${f.discrepanciasAbiertas > 0 ? 'font-semibold text-amber-700' : ''}`}>
                    {f.discrepanciasAbiertas}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function CampoSelect({
  nombre, etiqueta, valor, children,
}: { nombre: string; etiqueta: string; valor: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{etiqueta}</span>
      <select name={nombre} defaultValue={valor} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
        {children}
      </select>
    </label>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>
}
