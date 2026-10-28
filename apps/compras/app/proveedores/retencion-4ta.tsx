import { listarConstancias, puedeGestionarConstancias } from '@/services/retencion-4ta'
import { constanciaVigentePara, esRucDePersonaNatural } from '@/domain/retencion-4ta'
import { hoyLima } from '@/domain/fecha'
import type { FuenteProveedor } from '@/domain/proveedor'
import { FormularioConstancia, BotonAnularConstancia, BotonVerConstancia } from './formulario-constancia'

/**
 * "Retención de 4ta categoría" en la ficha de un profesional (RUC 10) — 0084.
 *
 * Se le retiene el 8% a cada Recibo por Honorarios salvo que tenga una
 * Constancia de Suspensión de Retenciones vigente para ese año. La registra
 * Contabilidad, con el documento adjunto: es el respaldo ante SUNAT.
 */
export async function RetencionCuartaProveedor({
  fuente, proveedorId, ruc,
}: { fuente: FuenteProveedor; proveedorId: string; ruc: string }) {
  if (!esRucDePersonaNatural(ruc)) return null
  const [constancias, puedeGestionar] = await Promise.all([
    listarConstancias(fuente, proveedorId),
    puedeGestionarConstancias(),
  ])
  const hoy = hoyLima()
  const vigente = constanciaVigentePara(constancias, hoy)

  return (
    <section className="card mt-4 space-y-3">
      <h2 className="font-heading text-lg">Retención de 4ta categoría</h2>
      <p className={`rounded-md px-3 py-2.5 text-sm ${vigente ? 'border border-logisalud-green/40 bg-logisalud-green/10 text-gray-800' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}>
        {vigente
          ? `No se le retiene en ${vigente.ejercicio}: constancia de suspensión N° ${vigente.numero}. Vence el 31/12/${vigente.ejercicio}.`
          : `Se le retiene el 8% a cada Recibo por Honorarios (no tiene constancia de suspensión vigente para ${hoy.slice(0, 4)}).`}
      </p>

      {constancias.length > 0 ? (
        <ul className="space-y-2">
          {constancias.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
              <span className={c.anulada ? 'text-gray-400 line-through' : ''}>
                {c.ejercicio} · N° {c.numero} · emitida el {c.fechaEmision.split('-').reverse().join('/')}
              </span>
              <span className="flex items-center gap-3">
                <BotonVerConstancia storagePath={c.storagePath} />
                {c.anulada ? (
                  <span className="text-xs text-gray-500">Anulada: {c.anuladaMotivo}</span>
                ) : puedeGestionar ? (
                  <BotonAnularConstancia fuente={fuente} proveedorId={proveedorId} constanciaId={c.id} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {puedeGestionar ? (
        <FormularioConstancia fuente={fuente} proveedorId={proveedorId} />
      ) : (
        <p className="text-xs text-gray-500">Solo Contabilidad registra constancias de suspensión.</p>
      )}
    </section>
  )
}
