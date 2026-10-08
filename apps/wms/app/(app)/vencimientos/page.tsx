import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { filasDeStock } from '@/domain/panorama'
import { reporteVencimientos, type LoteConStock } from '@/domain/inventario'
import { formatoFecha } from '@/domain/fechas'

export const metadata = { title: 'Vencimientos — WMS LOGISALUD' }

export default async function Vencimientos() {
  await exigirContexto()
  const repo = repositorio()
  const [p, par] = await Promise.all([repo.panorama(), repo.parametrosInventario()])
  const porLote = new Map<string, LoteConStock>()
  for (const f of filasDeStock(p)) {
    const x = porLote.get(f.lote.id) ?? { loteId: f.lote.id, productoId: f.producto.id, producto: `${f.producto.codigo} · ${f.producto.descripcion}`, lote: f.lote.codigo, vence: f.lote.vence, propietario: f.propietario.codigo, cantidad: 0, estados: [] }
    x.cantidad += f.saldo.cantidad
    if (!x.estados.includes(f.saldo.estado)) x.estados.push(f.saldo.estado)
    porLote.set(f.lote.id, x)
  }
  const tramos = reporteVencimientos([...porLote.values()], p.hoy, par.tramosVencimiento)
  const total = tramos.reduce((n, t) => n + t.lotes.length, 0)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Vencimientos</h1>
        <p className="mt-1 text-gray-600">Lotes que siguen en el inventario, agrupados por cuánto falta para que venzan. No incluye lo que ya está en Bajas/Rechazados. Los tramos ({par.tramosVencimiento.join(', ')} días) se configuran.</p>
      </header>
      {total === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="vencimientos-vacio">
          <CalendarClock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">No hay lotes con stock</p>
        </div>
      ) : (
        <div className="space-y-5">
          {tramos.map((t) => (
            <section key={t.clave} aria-labelledby={`t-${t.clave}`} data-testid={`tramo-${t.clave}`}>
              <h2 id={`t-${t.clave}`} className={`font-heading text-lg font-medium uppercase tracking-wide ${t.clave === 'vencido' ? 'text-red-800' : 'text-gray-800'}`}>
                {t.etiqueta} <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{t.lotes.length} {t.lotes.length === 1 ? 'lote' : 'lotes'} · {t.unidades.toLocaleString('es-PE')} u</span>
              </h2>
              {t.lotes.length === 0 ? <p className="mt-1 text-sm text-gray-500">Ninguno.</p> : (
                <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
                  {t.lotes.map((l) => (
                    <li key={l.loteId}>
                      <Link href={`/kardex?producto=${l.productoId}&lote=${l.loteId}`} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-gray-50">
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-gray-900">{l.producto}</span><span className="tabular text-sm text-gray-600">Lote {l.lote} · {l.propietario}</span></span>
                        <span className="tabular text-sm text-gray-800">{l.vence ? `${formatoFecha(l.vence)}${l.dias != null ? (l.dias < 0 ? ` · hace ${Math.abs(l.dias)} días` : ` · en ${l.dias} días`) : ''}` : 'Sin fecha'}</span>
                        <span className="tabular font-medium">{l.cantidad.toLocaleString('es-PE')} u</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
