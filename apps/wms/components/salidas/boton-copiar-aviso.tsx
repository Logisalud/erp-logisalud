'use client'

import { useState } from 'react'
import { Check, ClipboardCopy } from 'lucide-react'

/** Copia al portapapeles (con alternativa para navegadores sin permiso). */
async function copiar(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texto); return true }
  } catch { /* se prueba la alternativa */ }
  try {
    const t = document.createElement('textarea')
    t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'
    document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(t)
    return ok
  } catch { return false }
}

/**
 * «Copiar aviso para el vendedor» (D-126): el mensaje ya armado, listo para pegarlo en WhatsApp, con confirmación visual «Copiado».
 * Mientras no exista la conexión con Pedidos (D-80) es la forma de avisarle.
 */
export function BotonCopiarAviso({ texto, testid = 'copiar-aviso', pequeno = false }: { texto: string; testid?: string; pequeno?: boolean }) {
  const [estado, setEstado] = useState<'reposo' | 'copiado' | 'error'>('reposo')
  async function alClick() {
    const ok = await copiar(texto)
    setEstado(ok ? 'copiado' : 'error')
    setTimeout(() => setEstado('reposo'), 3000)
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={alClick} className={`btn-secondary ${pequeno ? 'btn-sm' : ''}`} data-testid={testid} data-copiado={estado === 'copiado'}>
        {estado === 'copiado' ? <Check className="h-5 w-5 text-green-800" aria-hidden /> : <ClipboardCopy className="h-5 w-5" aria-hidden />}
        {estado === 'copiado' ? 'Copiado' : 'Copiar aviso para el vendedor'}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-gray-700" data-testid={`${testid}-estado`}>
        {estado === 'copiado' ? 'Listo: pégalo en WhatsApp.' : estado === 'error' ? 'No se pudo copiar. Selecciona el mensaje y cópialo a mano.' : ''}
      </span>
    </span>
  )
}
