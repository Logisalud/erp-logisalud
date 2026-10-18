'use client'

import { RefreshCw } from 'lucide-react'
import { consultarEstadoGuiaAccion } from '@/app/acciones-picking'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** Paso 2 de Nubefact: pregunta si SUNAT ya aceptó la guía. Aceptada → PDF, XML y aviso a Pedidos; rechazada → la guía se anula con el motivo. */
export function ConsultarGuia({ guiaId, numero, salidaId, alConsultar }: { guiaId: string; numero: string; salidaId: string; alConsultar: (texto: string) => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  return (
    <div className="space-y-2" data-testid="consultar-guia">
      <p className="text-sm text-gray-800">SUNAT todavía no confirma esta guía. Hasta que la acepte no hay PDF, Pedidos no recibe el número y la orden no se puede cargar.</p>
      {mensaje?.tipo === 'error' && <Aviso tipo="error" testid="error-consultar-guia">{mensaje.texto}</Aviso>}
      <button type="button" className="btn-secondary btn-sm" disabled={pendiente} data-testid="consultar-guia-boton"
        onClick={() => ejecutar(() => consultarEstadoGuiaAccion(guiaId, numero, salidaId), {
          alExito: (r) => alConsultar(r.estadoSunat === 'ACEPTADA'
            ? `SUNAT aceptó la guía ${numero}. ${r.pedidos === 'ENVIADO' ? 'Pedidos ya tiene el número y los lotes.' : 'El aviso a Pedidos quedó en la bandeja y se reintenta.'} Siguiente: completa el paquete documental, el embalaje si va a provincia y la carga.`
            : `SUNAT todavía no responde la guía ${numero}. Vuelve a consultar en unos minutos.`),
        })}>
        <RefreshCw className="h-4 w-4" aria-hidden />{pendiente ? 'Consultando…' : 'Consultar estado en SUNAT'}
      </button>
    </div>
  )
}
