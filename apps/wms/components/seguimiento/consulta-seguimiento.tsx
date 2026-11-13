'use client'

import { useState, useTransition } from 'react'
import { Search } from 'lucide-react'
import { consultarSeguimientoAccion, type EstadoConsulta } from '@/app/seguimiento/acciones'
import { TEXTO_ERROR, TEXTO_NO_DISPONIBLE, TEXTO_NO_ENCONTRADO, textoEspera } from '@/domain/seguimiento'
import { PantallaSeguimiento } from './pantalla-seguimiento'

/** El formulario público: número de pedido y RUC. Vacío, consultando, error y éxito. No muestra nada hasta que se consulta. */
export function ConsultaSeguimiento() {
  const [estado, setEstado] = useState<EstadoConsulta>({})
  const [pendiente, empezar] = useTransition()
  const enviar = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const datos = new FormData(ev.currentTarget)
    empezar(async () => { try { setEstado(await consultarSeguimientoAccion(estado, datos)) } catch { setEstado({ respuesta: { estado: 'ERROR' } }) } })
  }
  const r = estado.respuesta
  return (
    <div className="space-y-5">
      <form onSubmit={enviar} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5" noValidate data-testid="seguimiento-form">
        <div>
          <label htmlFor="sg-pedido" className="etiqueta">Número de pedido</label>
          <input id="sg-pedido" name="pedido" className="campo tabular" autoComplete="off" placeholder="Por ejemplo: PED-0123" defaultValue={estado.pedido ?? ''} aria-invalid={!!estado.errores?.pedido} data-testid="seguimiento-pedido" />
          {estado.errores?.pedido && <p role="alert" className="mt-1 text-sm text-red-800">{estado.errores.pedido}</p>}
        </div>
        <div>
          <label htmlFor="sg-ruc" className="etiqueta">RUC de tu empresa</label>
          <input id="sg-ruc" name="ruc" inputMode="numeric" maxLength={11} className="campo tabular" autoComplete="off" aria-invalid={!!estado.errores?.ruc} data-testid="seguimiento-ruc" />
          {estado.errores?.ruc && <p role="alert" className="mt-1 text-sm text-red-800">{estado.errores.ruc}</p>}
        </div>
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pendiente} data-testid="seguimiento-consultar"><Search className="h-5 w-5" aria-hidden />{pendiente ? 'Consultando…' : 'Ver mi pedido'}</button>
      </form>
      <div aria-live="polite">
        {r?.estado === 'OK' && <PantallaSeguimiento key={r.pedido} inicial={r} origen={{ tipo: 'consulta', pedido: estado.pedido ?? '', ruc: estado.ruc ?? '' }} />}
        {r?.estado === 'NO_ENCONTRADO' && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="seguimiento-no-encontrado">{TEXTO_NO_ENCONTRADO}</p>}
        {r?.estado === 'ESPERA' && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="seguimiento-espera">{textoEspera(r.esperaSegundos)}</p>}
        {r?.estado === 'NO_DISPONIBLE' && <p role="status" className="rounded-lg border border-gray-200 bg-white p-4 text-gray-800" data-testid="seguimiento-no-disponible">{TEXTO_NO_DISPONIBLE}</p>}
        {r?.estado === 'ERROR' && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900" data-testid="seguimiento-error">{TEXTO_ERROR}</p>}
      </div>
    </div>
  )
}
