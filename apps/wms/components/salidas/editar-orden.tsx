'use client'

import { useMemo, useState } from 'react'
import { Pencil, Save, X } from 'lucide-react'
import { editarOrdenAccion } from '@/app/acciones-salida-manual'
import { MAXIMO_NOTA, reglasDeEdicion, validarCambiosOrden, type CambiosOrden } from '@/domain/editar-orden'
import type { SalidaVista } from '@/domain/despacho'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/**
 * «Editar» la orden (Jefe de Almacén y quien prepara salidas). La nota siempre; el destinatario y las cantidades solo en una orden manual, sin pedido unido, antes del picking y sin guía
 * (con motivo). Lo que viene de Pedidos se cambia en Pedidos; los lotes se cambian en cada línea.
 */
export function EditarOrden({ salida, roles }: { salida: SalidaVista; roles: readonly Rol[] }) {
  const reglas = reglasDeEdicion(salida, roles)
  const { pendiente, mensaje, ejecutar, limpiar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const lineas = useMemo(() => salida.lineasDetalle.filter((l) => l.estado !== 'CANCELADA'), [salida.lineasDetalle])
  const [nota, setNota] = useState(salida.nota ?? '')
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(lineas.map((l) => [l.id, String(l.cantidad)])))
  const cm = salida.clienteManual
  const [dest, setDest] = useState({ ruc: cm?.ruc ?? '', razonSocial: cm?.razonSocial ?? '', direccion: cm?.direccion ?? '', ubigeo: cm?.ubigeo ?? '' })
  const [motivo, setMotivo] = useState('')
  if (!reglas.editable) return null

  const cambios: CambiosOrden = {}
  if (nota.trim() !== (salida.nota ?? '')) cambios.nota = nota.trim()
  if (reglas.estructura && cm) {
    const d: NonNullable<CambiosOrden['destinatario']> = {}
    for (const k of ['ruc', 'razonSocial', 'direccion', 'ubigeo'] as const) if (dest[k].trim() !== (cm[k] ?? '')) d[k] = dest[k].trim()
    if (Object.keys(d).length) cambios.destinatario = d
  }
  if (reglas.estructura) {
    const ls = lineas.filter((l) => cantidades[l.id] !== String(l.cantidad)).map((l) => ({ lineaId: l.id, cantidad: Number(cantidades[l.id]) }))
    if (ls.length) cambios.lineas = ls
  }
  const hayCambios = Object.keys(cambios).length > 0
  const errores = validarCambiosOrden(cambios, motivo)
  const primero = Object.values(errores)[0]
  const necesitaMotivo = !!cambios.destinatario || !!cambios.lineas

  return (
    <section className="space-y-3" aria-label="Editar la orden" data-testid="editar-orden">
      {!abierto ? (
        <button type="button" className="btn-secondary" onClick={() => { limpiar(); setAbierto(true) }} data-testid="editar-orden-abrir"><Pencil className="h-5 w-5" aria-hidden />Editar</button>
      ) : (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4" data-testid="editar-orden-panel">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-heading text-xl font-medium tracking-wide text-gray-900">Editar la orden {salida.numero}</h2>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setAbierto(false)} aria-label="Cerrar"><X className="h-4 w-4" aria-hidden />Cerrar</button>
          </div>
          {reglas.motivoSinEstructura && <Aviso tipo="info" testid="editar-orden-limite">{reglas.motivoSinEstructura}</Aviso>}

          <div>
            <label htmlFor="eo-nota" className="etiqueta">Nota de la orden <span className="font-normal text-gray-600">(se ve en la orden; máximo {MAXIMO_NOTA} letras)</span></label>
            <textarea id="eo-nota" rows={2} maxLength={MAXIMO_NOTA} className="campo !min-h-20 py-2" value={nota} onChange={(e) => setNota(e.target.value)} data-testid="editar-nota" />
          </div>

          {reglas.estructura && cm && (
            <fieldset className="space-y-2" data-testid="editar-destinatario">
              <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-700">Destinatario</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="eo-ruc" className="etiqueta">RUC o documento</label><input id="eo-ruc" inputMode="numeric" className="campo tabular" value={dest.ruc} onChange={(e) => setDest({ ...dest, ruc: e.target.value.replace(/\D/g, '').slice(0, 11) })} data-testid="editar-ruc" /></div>
                <div><label htmlFor="eo-rs" className="etiqueta">Razón social</label><input id="eo-rs" className="campo" value={dest.razonSocial} onChange={(e) => setDest({ ...dest, razonSocial: e.target.value })} data-testid="editar-razon-social" /></div>
                <div><label htmlFor="eo-dir" className="etiqueta">Dirección de entrega</label><input id="eo-dir" className="campo" value={dest.direccion} onChange={(e) => setDest({ ...dest, direccion: e.target.value })} data-testid="editar-direccion" /></div>
                <div><label htmlFor="eo-ub" className="etiqueta">Ubigeo</label><input id="eo-ub" inputMode="numeric" className="campo tabular" value={dest.ubigeo} onChange={(e) => setDest({ ...dest, ubigeo: e.target.value.replace(/\D/g, '').slice(0, 6) })} data-testid="editar-ubigeo" /></div>
              </div>
            </fieldset>
          )}

          {reglas.estructura && (
            <fieldset className="space-y-2" data-testid="editar-lineas">
              <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-700">Cantidades</legend>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {lineas.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 text-[15px] text-gray-900">{l.producto} <span className="tabular text-gray-600">{l.productoCodigo}</span></span>
                    <label className="sr-only" htmlFor={`eo-c-${l.id}`}>Cantidad de {l.producto}</label>
                    <input id={`eo-c-${l.id}`} inputMode="numeric" className="campo tabular w-28 text-right" value={cantidades[l.id] ?? ''} onChange={(e) => setCantidades({ ...cantidades, [l.id]: e.target.value.replace(/\D/g, '') })} data-testid="editar-cantidad" />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-600">Para quitar o agregar productos, cancela la orden y crea otra.</p>
            </fieldset>
          )}

          {necesitaMotivo && (
            <div>
              <label htmlFor="eo-mot" className="etiqueta">¿Por qué cambias la orden?</label>
              <input id="eo-mot" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="editar-motivo" />
            </div>
          )}

          {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} testid="editar-orden-mensaje">{mensaje.texto}</Aviso>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" disabled={pendiente || !hayCambios || !!primero} data-testid="editar-orden-guardar"
              onClick={() => ejecutar(() => editarOrdenAccion(salida.id, cambios, motivo.trim() || undefined), { exito: 'Orden actualizada. Todo queda en la auditoría.', alExito: () => { setMotivo(''); setAbierto(false) } })}>
              <Save className="h-5 w-5" aria-hidden />{pendiente ? 'Guardando…' : 'Guardar los cambios'}
            </button>
            {hayCambios && primero && <p className="text-sm text-gray-700" data-testid="editar-orden-falta">{primero}.</p>}
          </div>
        </div>
      )}
    </section>
  )
}
