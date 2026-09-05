'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { crearSolicitudAction, type EstadoFormulario } from './actions'
import { TIPOS_SOLICITUD, ETIQUETA_TIPO, type TipoSolicitud } from '@/domain/gasto'

type CategoriaGasto = { id: string; nombre: string }
type Usuario = { id: string; nombre: string; area: string }

const SUGERENCIA_IGV = 0.18

export function FormularioSolicitud({
  categorias,
  usuarios,
  tipoPreseleccionado,
  sugerenciaAutoriza,
}: {
  categorias: CategoriaGasto[]
  usuarios: Usuario[]
  tipoPreseleccionado?: TipoSolicitud
  /** Nombre del responsable del área de quien crea la solicitud, o null si
   * esa área no tiene responsable cargado todavía. */
  sugerenciaAutoriza: string | null
}) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearSolicitudAction, null)
  const sucio = useMarcarSucioAlEditar()
  const [tipo, setTipo] = useState<TipoSolicitud>(tipoPreseleccionado ?? 'gasto_directo')
  const [categoriaId, setCategoriaId] = useState('')
  const [base, setBase] = useState('')
  const [igv, setIgv] = useState('')
  const [igvEditadoAMano, setIgvEditadoAMano] = useState(false)
  const [tipoComprobante, setTipoComprobante] = useState('boleta')

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  const cambiarBase = (valor: string) => {
    setBase(valor)
    if (!igvEditadoAMano) {
      const n = Number(valor)
      setIgv(n > 0 ? (Math.round(n * SUGERENCIA_IGV * 100) / 100).toString() : '')
    }
  }

  const total = (Number(base) || 0) + (Number(igv) || 0)
  // Pieza H: si hay comprobante, tiene una fecha impresa; sin comprobante no
  // hay nada de dónde copiarla.
  const exigeFechaComprobante = tipoComprobante !== 'sin_comprobante'

  return (
    <form action={accion} onChange={sucio.onChange} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      {/* El aviso por correo (Pieza D) necesita el nombre, no el id. */}
      <input type="hidden" name="categoriaNombre" value={categorias.find((c) => c.id === categoriaId)?.nombre ?? ''} />

      <section className="card space-y-3">
        {tipoPreseleccionado ? (
          <>
            <input type="hidden" name="tipo" value={tipo} />
            <p className="text-sm text-gray-600">{ETIQUETA_TIPO[tipoPreseleccionado]}</p>
          </>
        ) : (
          <Campo etiqueta="Tipo *" error={errorDe('tipo')}>
            <select
              name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoSolicitud)}
              className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
            >
              {TIPOS_SOLICITUD.map((t) => (
                <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>
              ))}
            </select>
          </Campo>
        )}

        <Campo etiqueta="Categoría *" error={errorDe('categoriaId')}>
          <select
            name="categoriaId" required value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="">Elige una…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Moneda *" error={errorDe('moneda')}>
          <select name="moneda" defaultValue="PEN" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="PEN">PEN — Soles</option>
            <option value="USD">USD — Dólares</option>
          </select>
        </Campo>

        <Campo etiqueta="Descripción *" error={errorDe('descripcion')}>
          <textarea name="descripcion" rows={3} className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </Campo>

        {tipo !== 'gasto_directo' ? (
          <Campo etiqueta="Quién autoriza">
            <input
              type="text" name="quienAutoriza" defaultValue={sugerenciaAutoriza ?? ''}
              placeholder="Sugerido: responsable de tu área"
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            <p className="mt-1 text-xs text-gray-500">
              Solo informativo — no bloquea el envío ni le pide a esa persona que entre al
              sistema. El sistema no conoce a tu jefe directo, sugiere el responsable de tu
              área; corrígelo si no es quien corresponde acá.
            </p>
          </Campo>
        ) : null}

        {tipo === 'anticipo' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Monto del anticipo *" error={errorDe('montoAnticipo')}>
                <input type="number" name="montoAnticipo" min="0" step="0.01" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
              </Campo>
              {usuarios.length > 1 ? (
                <Campo etiqueta="Vendedor o persona asignada">
                  <select name="asignadoA" defaultValue="" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
                    <option value="">Para mí</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>{u.nombre}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Si estás armando el anticipo para otra persona (ej. viáticos de un vendedor),
                    elígela acá — el pago le va a llegar a su cuenta, no a la tuya.
                  </p>
                </Campo>
              ) : null}
            </div>

            <div className="space-y-3 rounded-md border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-800">🧳 Datos del viaje</p>
              <p className="text-xs text-gray-500">
                Solo si es un viaje con viáticos (ej. vendedor en ruta) — no aplica a la mayoría
                de anticipos.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo etiqueta="Destino">
                  <input type="text" name="destino" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
                </Campo>
                <Campo etiqueta="Fecha de inicio del viaje">
                  <input type="date" name="fechaInicio" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
                </Campo>
                <Campo etiqueta="Fecha de fin del viaje" error={errorDe('fechaFin')}>
                  <input type="date" name="fechaFin" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
                </Campo>
              </div>
            </div>

            <Campo etiqueta="📎 Cotización o sustento">
              <input
                type="file" name="cotizacion" accept="application/pdf,image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
              />
              <p className="mt-1 text-xs text-gray-500">
                No es una factura — es lo que sustenta el monto pedido (ej. la cotización de un
                vuelo o de un evento), si lo tienes a mano.
              </p>
            </Campo>
          </>
        ) : (
          <div className="space-y-3 rounded-md border border-gray-200 p-3">
            <p className="text-sm text-gray-600">
              Sube primero la foto o PDF de tu comprobante y después completa la base y el IGV
              tal como figuran ahí — mirando el comprobante al lado.
            </p>

            <Campo etiqueta="📎 Foto o PDF del comprobante">
              <input
                type="file" name="archivo" accept="application/pdf,image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
              />
              <p className="mt-1 text-xs text-gray-500">
                Va acá cualquier comprobante válido: <strong>factura</strong>, boleta o ticket. Si
                tienes factura, esta es su casilla — no hace falta otro lugar.
              </p>
            </Campo>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Tipo de comprobante">
                <select
                  name="tipoComprobante" value={tipoComprobante}
                  onChange={(e) => setTipoComprobante(e.target.value)}
                  className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
                >
                  <option value="factura">Factura</option>
                  <option value="boleta">Boleta</option>
                  <option value="sin_comprobante">Sin comprobante</option>
                </select>
              </Campo>
              <Campo
                etiqueta={exigeFechaComprobante ? 'Fecha de factura/boleta *' : 'Fecha de factura/boleta'}
                error={errorDe('fechaFactura')}
              >
                <input
                  type="date" name="fechaFactura" required={exigeFechaComprobante}
                  className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                />
                <p className="mt-1 text-xs text-gray-500">
                  La fecha que figura impresa en el comprobante, no la de hoy.
                </p>
              </Campo>
              <Campo etiqueta="N°">
                <input type="text" name="numero" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
              </Campo>
              <Campo etiqueta="RUC emisor">
                <input type="text" name="rucEmisor" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
              </Campo>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Base imponible *" error={errorDe('baseImponible')}>
                <input
                  type="number" name="baseImponible" min="0" step="0.01" value={base}
                  onChange={(e) => cambiarBase(e.target.value)}
                  className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                />
              </Campo>
              <Campo etiqueta="IGV *" error={errorDe('igv')}>
                <input
                  type="number" name="igv" min="0" step="0.01" value={igv}
                  onChange={(e) => { setIgv(e.target.value); setIgvEditadoAMano(true) }}
                  className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Sugerido en 18% de la base — cámbialo si tu comprobante trae otro valor (por
                  ejemplo, 0 en boletas de un régimen que no discrimina IGV).
                </p>
              </Campo>
            </div>

            <p className="text-sm text-gray-700">Total: {total.toFixed(2)}</p>
          </div>
        )}
      </section>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Enviando…' : 'Enviar solicitud'}
    </button>
  )
}

function Campo({
  etiqueta, error, children,
}: { etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-800">{etiqueta}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-red-700">{error}</p> : null}
    </label>
  )
}
