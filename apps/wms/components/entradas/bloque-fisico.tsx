'use client'

import { useState } from 'react'
import { Check, Clipboard, ExternalLink } from 'lucide-react'
import type { BloqueFisico } from '@/domain/entradas-vistas'
import { ChipRegistroCompras } from './chips-entradas'

async function copiar(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true } catch {
    try {
      const t = document.createElement('textarea')
      t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'
      document.body.appendChild(t); t.select()
      const ok = document.execCommand('copy'); document.body.removeChild(t); return ok
    } catch { return false }
  }
}

/**
 * "Cantidad física confirmada": lo que el WMS confirmó al firmarse el acta. La integración con Compras es MANUAL por ahora:
 * Contabilidad / Compras copia este valor a la recepción de la OC. Cuando Compras lo registra, el bloque pasa a verde.
 */
export function BloqueCantidadFisica({ bloques, ocId, ocCodigo, solicitudNumero }: { bloques: BloqueFisico[]; ocId?: string; ocCodigo?: string; solicitudNumero: string }) {
  const [copiado, setCopiado] = useState<string | null>(null)
  if (bloques.length === 0) return null
  const pendientes = bloques.filter((b) => b.estado !== 'OK')
  const todoOk = pendientes.length === 0

  async function alCopiar(clave: string, texto: string) {
    if (await copiar(texto)) { setCopiado(clave); setTimeout(() => setCopiado((c) => (c === clave ? null : c)), 2500) }
  }
  const textoTodo = bloques.map((b) => `${b.descripcion}: ${b.fisica}`).join('\n')

  return (
    <section aria-labelledby="fisica" data-testid="bloque-fisico" className={`rounded-lg border-2 p-4 sm:p-5 ${todoOk ? 'border-green-300 bg-green-50' : pendientes.some((b) => b.estado === 'NO_COINCIDE') ? 'border-red-300 bg-red-50' : 'border-logisalud-teal bg-teal-50'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="fisica" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-900">Cantidad física confirmada</h2>
          <p className="text-sm text-gray-800">{todoOk ? 'Compras ya tiene registrado lo que se confirmó en almacén.' : <>Usa estos valores al registrarlos en Compras (OC {ocCodigo}). Compras y WMS todavía no se hablan: se copia a mano.</>}</p>
        </div>
        {ocId && !todoOk && <a href={`/compras/almacen/recepciones/nueva/${encodeURIComponent(ocId)}`} className="btn-secondary btn-sm" target="_blank" rel="noopener" data-testid="abrir-compras"><ExternalLink className="h-4 w-4" aria-hidden />Abrir la recepción en Compras</a>}
      </div>
      <ul className="mt-4 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {bloques.map((b) => (
          <li key={b.ocItemId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3 sm:p-4" data-testid="fila-fisica">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900">{b.descripcion}</p>
              <p className="text-xs text-gray-600">Solicitud {solicitudNumero}{b.registrado != null ? ` · Compras muestra hoy ${b.registrado.toLocaleString('es-PE')}${b.estado !== 'OK' ? ` y debería mostrar ${b.esperado.toLocaleString('es-PE')}` : ''}` : ''}</p>
              <div className="mt-1.5"><ChipRegistroCompras estado={b.estado} /></div>
            </div>
            <div className="flex items-center gap-3">
              <p className="tabular font-heading text-4xl font-semibold leading-none text-gray-900" data-testid="valor-fisico" aria-label={`Cantidad física confirmada: ${b.fisica}`}>{b.fisica.toLocaleString('es-PE')}</p>
              <button type="button" className="btn-secondary btn-sm" onClick={() => alCopiar(b.ocItemId, String(b.fisica))} aria-label={`Copiar ${b.fisica} de ${b.descripcion}`} data-testid="copiar-fisico">
                {copiado === b.ocItemId ? <><Check className="h-4 w-4" aria-hidden />Copiado</> : <><Clipboard className="h-4 w-4" aria-hidden />Copiar</>}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {bloques.length > 1 && !todoOk && (
        <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => alCopiar('todo', textoTodo)} data-testid="copiar-todo">{copiado === 'todo' ? <><Check className="h-4 w-4" aria-hidden />Copiado</> : <><Clipboard className="h-4 w-4" aria-hidden />Copiar todo</>}</button>
      )}
      <p className="sr-only" role="status" aria-live="polite">{copiado ? 'Cantidad copiada al portapapeles' : ''}</p>
    </section>
  )
}
