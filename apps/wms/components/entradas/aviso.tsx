import { CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

/** Mensaje de una acción: éxito, error o dato. Siempre con ícono y texto. */
export function Aviso({ tipo, children, testid }: { tipo: 'ok' | 'error' | 'info' | 'atencion'; children: ReactNode; testid?: string }) {
  const m = {
    ok: { cls: 'border-green-200 bg-green-50 text-green-900', Icono: CheckCircle2, rol: 'status' as const },
    error: { cls: 'border-red-200 bg-red-50 text-red-900', Icono: TriangleAlert, rol: 'alert' as const },
    atencion: { cls: 'border-amber-300 bg-amber-50 text-amber-950', Icono: TriangleAlert, rol: 'status' as const },
    info: { cls: 'border-teal-200 bg-teal-50 text-teal-950', Icono: Info, rol: 'status' as const },
  }[tipo]
  return (
    <div role={m.rol} data-testid={testid ?? `aviso-${tipo}`} className={`flex items-start gap-3 rounded-lg border p-3.5 text-sm ${m.cls}`}>
      <m.Icono className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
