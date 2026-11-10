'use client'

import { useState } from 'react'
import { CheckCircle2, CircleDashed, FileSearch, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { sincronizarOcsAccion } from '@/app/acciones-entradas'
import { ETIQUETA_SITUACION_OC, type OcPilotoVista } from '@/domain/oc-versiones'
import { formatoFechaHora } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'

const CHIP = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium'
function Situacion({ o }: { o: OcPilotoVista }) {
  const m = {
    SIN_COPIA: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: CircleDashed },
    AL_DIA: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: CheckCircle2 },
    CAMBIO: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: TriangleAlert },
    ELIMINADA: { cls: 'border-red-200 bg-red-50 text-red-800', Icono: Trash2 },
  }[o.situacion]
  return <span className={`${CHIP} ${m.cls}`} data-testid="oc-situacion" data-situacion={o.situacion}><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_SITUACION_OC[o.situacion]}</span>
}

/** «Órdenes de compra del piloto»: las abiertas en Compras, la versión vigente de su copia y el aviso de cambio. Vacío, cargando, error y éxito. */
export function OcsPiloto({ lista, puedeRevisar }: { lista: OcPilotoVista[]; puedeRevisar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [resumen, setResumen] = useState<string | null>(null)
  const revisar = () => { setResumen(null); ejecutar(() => sincronizarOcsAccion(), { alExito: (r) => setResumen((r as { mensaje?: string }).mensaje ?? 'Listo.') }) }
  return (
    <section className="space-y-4" data-testid="ocs-piloto" aria-busy={pendiente}>
      <div className="flex flex-wrap items-center gap-3">
        {puedeRevisar
          ? <button type="button" className="btn-primary" onClick={revisar} disabled={pendiente} data-testid="ocs-revisar"><RefreshCw className={`h-5 w-5 ${pendiente ? 'animate-spin' : ''}`} aria-hidden />{pendiente ? 'Revisando Compras…' : 'Revisar Compras ahora'}</button>
          : <p className="text-sm text-gray-700">Solo puedes mirar: revisar Compras lo hace Dirección Técnica, su asistente, el Jefe de Almacén o el Administrador.</p>}
        <p className="text-sm text-gray-600">{lista.length} {lista.length === 1 ? 'orden' : 'órdenes'}</p>
      </div>
      {mensaje && <Aviso tipo="error" testid="ocs-error-accion">{mensaje.texto}</Aviso>}
      {resumen && !mensaje && <Aviso tipo="ok" testid="ocs-exito"><p>{resumen}</p><p className="mt-1">Siguiente: revisa las órdenes que cambiaron y avisa a Compras si algo no es lo esperado.</p></Aviso>}
      {lista.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center" data-testid="ocs-vacio">
          <FileSearch className="h-10 w-10 text-gray-400" aria-hidden />
          <p className="font-heading text-xl uppercase tracking-wide text-gray-800">No hay órdenes de compra abiertas</p>
          <p className="max-w-md text-sm text-gray-600">Cuando Compras envíe o confirme una orden, aparece aquí. Pulsa «Revisar Compras ahora» para guardar su primera copia.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden" data-testid="ocs-tarjetas">
            {lista.map((o) => (
              <li key={o.ocId} className="card" data-testid="oc-fila">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="tabular truncate font-medium text-gray-900">{o.codigo}</p><p className="truncate text-sm text-gray-600">{o.proveedorNombre}</p></div>
                  <p className="tabular shrink-0 text-right"><span className="block font-heading text-xl font-semibold">{o.versionVigente || '—'}</span><span className="block text-[11px] text-gray-600">versión</span></p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2"><Situacion o={o} /><span className="text-xs text-gray-600">{o.copiadaEn ? `Copiada ${formatoFechaHora(o.copiadaEn)}` : 'Sin copia'}</span></div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block" data-testid="ocs-tabla">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr><th className="px-4 py-3 font-medium">Orden</th><th className="px-4 py-3 font-medium">Proveedor</th><th className="px-4 py-3 text-right font-medium">Líneas</th><th className="px-4 py-3 text-right font-medium">Versión vigente</th><th className="px-4 py-3 font-medium">Última copia</th><th className="px-4 py-3 font-medium">Situación</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lista.map((o) => (
                  <tr key={o.ocId} data-testid="oc-fila">
                    <td className="tabular px-4 py-3 font-medium text-gray-900">{o.codigo}</td>
                    <td className="px-4 py-3 text-gray-800">{o.proveedorNombre}</td>
                    <td className="tabular px-4 py-3 text-right text-gray-900">{o.lineasEnCompras || o.lineasCopia}</td>
                    <td className="tabular px-4 py-3 text-right text-gray-900">{o.versionVigente || '—'}{o.cambios > 0 && <span className="block text-xs text-gray-600">{o.cambios} {o.cambios === 1 ? 'cambio' : 'cambios'}</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{o.copiadaEn ? formatoFechaHora(o.copiadaEn) : '—'}</td>
                    <td className="px-4 py-3"><Situacion o={o} />{o.situacion === 'CAMBIO' && <span className="mt-1 block text-xs text-amber-900">Hay una alerta abierta: revisa las solicitudes que usan esta orden.</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
