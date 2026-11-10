'use client'

import { useState } from 'react'
import { BadgeCheck, ShieldAlert } from 'lucide-react'
import { marcarAntecedentesAccion, quitarAntecedentesAccion } from '@/app/acciones-liberacion'
import { antecedenteVigente, type AntecedenteCalidadVista } from '@/domain/muestreo'
import { formatoFechaHora } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { SelectorProducto, type ProductoElegido } from '../entradas/selector-producto'

/** Productos con antecedentes de calidad: se evalúan al 100 %. Los marca y los quita Dirección Técnica, siempre con motivo; la historia no se borra. */
export function PanelAntecedentes({ antecedentes, puedeMarcar }: { antecedentes: AntecedenteCalidadVista[]; puedeMarcar: boolean }) {
  const { pendiente, mensaje, ejecutar, limpiar } = useAccion()
  const [producto, setProducto] = useState<ProductoElegido | null>(null)
  const [motivo, setMotivo] = useState('')
  const [quitando, setQuitando] = useState<string | null>(null)
  const [motivoQuita, setMotivoQuita] = useState('')
  const vigentes = antecedentes.filter(antecedenteVigente)
  const historia = antecedentes.filter((a) => !antecedenteVigente(a))

  return (
    <div className="space-y-4" data-testid="panel-antecedentes">
      {vigentes.length === 0
        ? <div className="card flex items-center gap-3 text-sm text-gray-700" data-testid="sin-antecedentes"><BadgeCheck className="h-5 w-5 text-green-700" aria-hidden />Ningún producto está marcado: todos se evalúan con la tabla.</div>
        : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-antecedentes">
            {vigentes.map((a) => (
              <li key={a.id} className="space-y-2 px-4 py-3" data-testid="fila-antecedente">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-gray-900"><ShieldAlert className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />{a.producto}</p>
                    <p className="text-sm text-gray-600">{a.productoCodigo} · marcado por {a.marcadoPor} el {formatoFechaHora(a.marcadoEn)}</p>
                    <p className="text-sm text-gray-800">«{a.motivo}»</p>
                  </div>
                  {puedeMarcar && quitando !== a.id && <button type="button" className="btn-secondary btn-sm" onClick={() => { limpiar(); setQuitando(a.id); setMotivoQuita('') }} data-testid="quitar-antecedente">Quitar la marca</button>}
                </div>
                {quitando === a.id && (
                  <div className="space-y-2" data-testid="form-quitar-antecedente">
                    <label htmlFor={`q-${a.id}`} className="etiqueta">¿Por qué se quita la marca?</label>
                    <input id={`q-${a.id}`} className="campo" value={motivoQuita} onChange={(e) => setMotivoQuita(e.target.value)} autoComplete="off" data-testid="motivo-quitar-antecedente" />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-primary btn-sm" disabled={pendiente || !motivoQuita.trim()} data-testid="confirmar-quitar-antecedente"
                        onClick={() => ejecutar(() => quitarAntecedentesAccion(a.productoId, motivoQuita), { exito: `Se quitó la marca de ${a.producto}. Siguiente: sus próximas recepciones se evalúan con la tabla.`, alExito: () => setQuitando(null) })}>Quitar la marca</button>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setQuitando(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

      {puedeMarcar ? (
        <div className="card space-y-3" data-testid="form-antecedente">
          <h3 className="font-medium text-gray-900">Marcar un producto</h3>
          <div><label htmlFor="ant-producto" className="etiqueta">Producto</label><SelectorProducto id="ant-producto" valor={producto} onElegir={setProducto} /></div>
          <div><label htmlFor="ant-motivo" className="etiqueta">¿Qué antecedentes de calidad tiene?</label><input id="ant-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" data-testid="motivo-antecedente" /></div>
          <button type="button" className="btn-primary" disabled={pendiente || !producto || !motivo.trim()} data-testid="marcar-antecedente"
            onClick={() => producto && ejecutar(() => marcarAntecedentesAccion(producto.id, motivo), { exito: `${producto.descripcion} quedó marcado. Siguiente: sus próximas recepciones se evalúan al 100 %.`, alExito: () => { setProducto(null); setMotivo('') } })}>
            {pendiente ? 'Guardando…' : 'Marcar con antecedentes de calidad'}
          </button>
        </div>
      ) : <p className="text-sm text-gray-600">Solo Dirección Técnica marca o quita esta marca.</p>}

      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}

      {historia.length > 0 && (
        <details className="text-sm text-gray-700">
          <summary className="cursor-pointer font-medium">Marcas anteriores ({historia.length})</summary>
          <ul className="mt-1 space-y-1" data-testid="historia-antecedentes">{historia.map((a) => <li key={a.id}>{a.producto}: «{a.motivo}» — se quitó el {formatoFechaHora(a.quitadoEn!)} por {a.quitadoPor}: «{a.motivoQuita}»</li>)}</ul>
        </details>
      )}
    </div>
  )
}
