'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { cancelarOrdenAccion } from '@/app/acciones-salida-manual'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** Cancelar una orden que todavía no tiene picking (por ejemplo, un número de pedido mal escrito). Nada se borra: queda con su motivo y lo reservado se libera. */
export function CancelarOrden({ salidaId, numero }: { salidaId: string; numero: string }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  if (!abierto) return <button type="button" className="btn-secondary" onClick={() => setAbierto(true)} data-testid="abrir-cancelar-orden"><Ban className="h-5 w-5" aria-hidden />Cancelar la orden</button>
  return (
    <div className="w-full max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-4" data-testid="cancelar-orden">
      <p className="text-sm text-gray-800">Vas a cancelar la orden <strong className="tabular">{numero}</strong>. Lo reservado se libera y el pedido queda libre para tener otra orden. La orden no se borra: queda con tu motivo.</p>
      <div>
        <label htmlFor="motivo-cancelar" className="etiqueta">¿Por qué la cancelas?</label>
        <input id="motivo-cancelar" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" data-testid="motivo-cancelar-orden" />
      </div>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => cancelarOrdenAccion(salidaId, motivo), { refrescar: false, alExito: () => router.push('/salidas') })} data-testid="confirmar-cancelar-orden">{pendiente ? 'Cancelando…' : 'Sí, cancelar la orden'}</button>
        <button type="button" className="btn-secondary" onClick={() => setAbierto(false)}>No, volver</button>
      </div>
    </div>
  )
}
