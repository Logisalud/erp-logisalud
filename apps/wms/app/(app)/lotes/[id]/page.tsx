import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { ETIQUETA_TIPO_MOVIMIENTO } from '@/domain/inventario'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { ChipEstado } from '@/components/chips'

export const metadata = { title: 'Historia del lote — WMS LOGISALUD' }

export default async function HistoriaLote({ params }: { params: { id: string } }) {
  await exigirContexto()
  const repo = repositorio()
  const p = await repo.panorama()
  const lote = p.lotes.find((l) => l.id === decodeURIComponent(params.id))
  if (!lote) notFound()
  const prod = p.productos.find((x) => x.id === lote.productoId)
  const dueno = p.propietarios.find((x) => x.id === lote.propietarioId)
  const filas = await repo.historiaLote(lote.id)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={`/kardex?producto=${lote.productoId}&lote=${lote.id}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Kardex del lote</Link>
      <header>
        <p className="text-sm text-gray-600">{prod?.codigo}</p>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Lote <span className="tabular">{lote.codigo}</span></h1>
        <p className="mt-1 text-gray-700">{prod?.descripcion} · propietario <strong>{dueno?.codigo}</strong> · vence {formatoFecha(lote.vence)}</p>
        <p className="mt-1 text-sm text-gray-600">Todo lo que tocó este lote, de lo más antiguo a lo más reciente: ingresos, movimientos internos, cambios de estado, ajustes y reversas, con quién y cuándo. Nada se oculta ni se borra.</p>
      </header>

      {filas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-600" data-testid="historia-vacia">Este lote todavía no tiene movimientos.</div>
      ) : (
        <ol className="space-y-2" data-testid="historia-lote">
          {filas.map((f) => (
            <li key={f.partidaId} className={`rounded-lg border bg-white p-3.5 ${f.tipo === 'REVERSA' ? 'border-red-200' : 'border-gray-200'}`} data-testid="fila-historia">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-gray-900">{ETIQUETA_TIPO_MOVIMIENTO[f.tipo]}</span>
                <span className="tabular text-sm text-gray-600">{formatoFechaHora(f.fecha)}</span>
                <ChipEstado estado={f.estado} />
                <span className="tabular ml-auto text-sm"><strong className={f.delta > 0 ? 'text-green-800' : 'text-red-800'}>{f.delta > 0 ? `+${f.delta}` : `−${Math.abs(f.delta)}`}</strong> en <strong>{f.posicion}</strong> · saldo del lote {f.saldoLote}</span>
              </div>
              <p className="mt-1 text-sm text-gray-700">
                {f.motivo ? `${f.motivo} · ` : ''}{f.referencia ? `ref. ${f.referencia} · ` : ''}{f.sustento ? `sustento ${f.sustento} · ` : ''}
                {f.preparador ? `preparó ${f.preparador} · ` : ''}{f.ejecutor ? `${f.preparador ? 'movió' : 'registró'} ${f.ejecutor}` : ''}{f.verificador ? ` · verificó ${f.verificador}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
