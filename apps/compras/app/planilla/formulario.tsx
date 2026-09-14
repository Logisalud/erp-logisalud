'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { AvisoErrores, useScrollAlPrimerError } from '@/components/errores-formulario'
import { crearPagoPlanillaAction, type EstadoFormulario } from './actions'

export type ValoresPlanilla = {
  periodo: string
  secuencia: string
  monto: string
  moneda: string
  fechaPago: string
}

const ID_AVISO_ERRORES = 'errores-planilla'

/**
 * Carga del pago de planilla. Cuatro datos y nada más: BUK le da el total a
 * Arlette y ella lo transcribe — el sistema nunca lo calcula, y por eso no
 * hay líneas ni desglose por trabajador que llenar.
 */
export function FormularioPlanilla({
  inicial,
  accionServidor = crearPagoPlanillaAction,
  textoBoton = 'Cargar pago de planilla',
  textoEnviando = 'Cargando…',
}: {
  inicial?: ValoresPlanilla
  accionServidor?: (previo: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>
  textoBoton?: string
  textoEnviando?: string
}) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionServidor, null)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje
  useScrollAlPrimerError(estado, ID_AVISO_ERRORES)

  const mesActual = new Date().toISOString().slice(0, 7)

  return (
    <form action={accion} className="space-y-4">
      <AvisoErrores errores={estado?.errores} />

      <section className="card space-y-3">
        <Campo etiqueta="Periodo *" error={errorDe('periodo')}>
          <input
            type="month" name="periodo" required
            defaultValue={inicial?.periodo ?? mesActual}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          <p className="mt-1 text-xs text-gray-500">El mes que cubre esta planilla.</p>
        </Campo>

        <Campo etiqueta="¿Cuál pago del mes? *" error={errorDe('secuencia')}>
          <select
            name="secuencia" required defaultValue={inicial?.secuencia ?? '1'}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="1">1ra quincena</option>
            <option value="2">Fin de mes</option>
            {/* Los extra existen (gratificación, CTS, un reintegro) y no
                tienen nombre fijo — por eso se numeran en vez de inventarles
                una etiqueta que después no coincida con lo que pasó. */}
            <option value="3">Pago 3 del mes</option>
            <option value="4">Pago 4 del mes</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            No se puede cargar dos veces el mismo pago del mismo mes — si el anterior está mal,
            anúlalo primero.
          </p>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Moneda *" error={errorDe('moneda')}>
            <select
              name="moneda" defaultValue={inicial?.moneda ?? 'PEN'}
              className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
            >
              <option value="PEN">PEN — Soles</option>
              <option value="USD">USD — Dólares</option>
            </select>
          </Campo>
          <Campo etiqueta="Monto total *" error={errorDe('monto')}>
            <input
              type="number" name="monto" min="0" step="0.01" required
              defaultValue={inicial?.monto}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            <p className="mt-1 text-xs text-gray-500">
              El total que arroja BUK, tal cual. No lo calcules aquí.
            </p>
          </Campo>
        </div>

        <Campo etiqueta="Fecha de pago *" error={errorDe('fechaPago')}>
          <input
            type="date" name="fechaPago" required
            defaultValue={inicial?.fechaPago}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          <p className="mt-1 text-xs text-gray-500">
            La fecha en que se transfiere. Es un compromiso: si llega sin estar en una propuesta
            aprobada, aparece como vencida.
          </p>
        </Campo>
      </section>

      <AvisoErrores errores={estado?.errores} id={ID_AVISO_ERRORES} />
      <BotonGuardar texto={textoBoton} textoEnviando={textoEnviando} />
    </form>
  )
}

function BotonGuardar({ texto, textoEnviando }: { texto: string; textoEnviando: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? textoEnviando : texto}
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
