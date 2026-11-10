import Link from 'next/link'
import { ArrowRight, Lock, Undo2 } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { AYUDA_RETORNO, AYUDA_REPROGRAMAR, ETIQUETA_MOTIVO_RETORNO, puedeOriginarRetorno } from '@/domain/retornos'
import { formatoFecha } from '@/domain/fechas'
import { ChipEstadoSolicitud } from '@/components/entradas/chips-entradas'

export const metadata = { title: 'Retornos — WMS LOGISALUD' }

export default async function Retornos() {
  const ctx = await exigirContexto()
  if (!puedeOriginarRetorno(ctx.roles)) {
    return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="retornos-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">Los retornos los registran Sandra, Dirección Técnica y los jefes de Almacén y de Transporte.</p></div>
  }
  const salidas = await repositorio().salidasConRetorno()
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Retornos</h1>
        <p className="mt-1 max-w-3xl text-gray-700" data-testid="ayuda-retorno">{AYUDA_RETORNO}</p>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">{AYUDA_REPROGRAMAR}</p>
      </header>

      {salidas.length === 0 ? (
        <div className="card flex items-center gap-3 text-sm text-gray-700" data-testid="retornos-vacio"><Undo2 className="h-5 w-5 text-gray-500" aria-hidden />Todavía no salió ninguna Orden de Salida, así que no hay nada que pueda volver. Cuando una unidad salga de ruta, aparecerá aquí.</div>
      ) : (
        <section aria-labelledby="salidas-retorno">
          <h2 id="salidas-retorno" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Órdenes de Salida que ya salieron</h2>
          <p className="mb-3 text-sm text-gray-600">Elige la orden de la que vuelve algo.</p>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-salidas-retorno">
            {salidas.map((s) => (
              <li key={s.salidaId} className="px-4 py-3" data-testid="fila-salida-retorno">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tabular font-medium text-gray-900">{s.numero}</p>
                    <p className="text-sm text-gray-600">{s.cliente ?? 'Sin cliente'}{s.pedidoNumero ? ` · pedido ${s.pedidoNumero}` : ''} · salió el {formatoFecha(s.fecha)} · {s.unidades.toLocaleString('es-PE')} unidades</p>
                  </div>
                  <Link href={`/retornos/${s.salidaId}`} className="btn-primary btn-sm" data-testid="registrar-retorno">Registrar un retorno<ArrowRight className="h-4 w-4" aria-hidden /></Link>
                </div>
                {s.retornos.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm" data-testid="retornos-de-salida">
                    {s.retornos.map((r) => (
                      <li key={r.solicitudId} className="flex flex-wrap items-center gap-2 text-gray-700">
                        <Link href={`/entradas/${r.solicitudId}`} className="tabular underline underline-offset-2">{r.solicitudNumero}</Link>
                        <span>{ETIQUETA_MOTIVO_RETORNO[r.motivo]} · {r.unidades.toLocaleString('es-PE')} unidades</span>
                        <ChipEstadoSolicitud estado={r.estado} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
