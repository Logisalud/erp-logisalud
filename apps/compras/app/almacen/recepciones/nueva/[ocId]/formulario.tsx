'use client'

import { useState } from 'react'
// useFormState / useFormStatus: esta app está en React 18 (ver
// ordenes-compra/nueva/formulario.tsx para el porqué).
import { useFormState, useFormStatus } from 'react-dom'
import { registrarRecepcionAction, type EstadoFormulario } from './actions'

type ItemOC = {
  id: string
  cantidad_pedida: number
  cantidad_recibida: number
  producto: {
    codigo: string; descripcion: string; unidad_medida: string
    controla_lote: boolean; controla_vencimiento: boolean
  } | null
}

type LineaForm = {
  cantidadFisica: string
  cantidadGuia: string
  lote: string
  fechaVencimiento: string
  danado: boolean
  productoErroneo: boolean
}

const LINEA_VACIA: LineaForm = {
  cantidadFisica: '', cantidadGuia: '', lote: '', fechaVencimiento: '',
  danado: false, productoErroneo: false,
}

export function FormularioRecepcion({ ocId, items }: { ocId: string; items: ItemOC[] }) {
  const accionConOC = registrarRecepcionAction.bind(null, ocId)
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionConOC, null)
  const [lineas, setLineas] = useState<Record<string, LineaForm>>(
    Object.fromEntries(items.map((i) => [i.id, { ...LINEA_VACIA }]))
  )

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje
  const actualizar = (itemId: string, cambios: Partial<LineaForm>) =>
    setLineas((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...cambios } }))

  return (
    <form action={accion} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}
      {errorDe('lineas') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('lineas')}
        </p>
      ) : null}

      <section className="card grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha de recepción" error={errorDe('fechaRecepcion')}>
          <input
            type="date" name="fechaRecepcion" required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </Campo>
        <Campo etiqueta="N° de guía de remisión">
          <input
            type="text" name="guiaRemision"
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </Campo>
      </section>

      <section className="space-y-3">
        {items.map((item, i) => {
          const linea = lineas[item.id]
          const pendiente = Number(item.cantidad_pedida) - Number(item.cantidad_recibida)
          const controlaLote = item.producto?.controla_lote ?? false
          const controlaVencimiento = item.producto?.controla_vencimiento ?? false
          return (
            <div key={item.id} className="card">
              <p className="font-medium">
                <span className="font-mono text-xs text-gray-500">{item.producto?.codigo ?? '—'}</span>
                {' '}{item.producto?.descripcion ?? 'producto no legible'}
              </p>
              <p className="text-sm text-gray-500">
                Pendiente: {pendiente} {item.producto?.unidad_medida ?? ''}
              </p>

              <input type="hidden" name="linea_ocItemId" value={item.id} />
              <input type="hidden" name="linea_controlaLote" value={controlaLote ? 'true' : 'false'} />
              <input type="hidden" name="linea_controlaVencimiento" value={controlaVencimiento ? 'true' : 'false'} />

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="block text-sm">
                  <span className="text-gray-600">Cant. en guía</span>
                  <input
                    type="number" name="linea_cantidadGuia" min="0" step="any"
                    value={linea.cantidadGuia}
                    onChange={(e) => actualizar(item.id, { cantidadGuia: e.target.value })}
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Cant. física *</span>
                  <input
                    type="number" name="linea_cantidadFisica" min="0" step="any"
                    value={linea.cantidadFisica}
                    onChange={(e) => actualizar(item.id, { cantidadFisica: e.target.value })}
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                  {errorDe(`lineas.${i}.cantidadFisica`) ? (
                    <p className="mt-1 text-red-700">{errorDe(`lineas.${i}.cantidadFisica`)}</p>
                  ) : null}
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Lote</span>
                  <input
                    type="text" name="linea_lote"
                    value={linea.lote}
                    onChange={(e) => actualizar(item.id, { lote: e.target.value })}
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Vencimiento{controlaVencimiento ? ' *' : ''}</span>
                  <input
                    type="date" name="linea_fechaVencimiento"
                    value={linea.fechaVencimiento}
                    onChange={(e) => actualizar(item.id, { fechaVencimiento: e.target.value })}
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                  {errorDe(`lineas.${i}.fechaVencimiento`) ? (
                    <p className="mt-1 text-red-700">{errorDe(`lineas.${i}.fechaVencimiento`)}</p>
                  ) : null}
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={linea.danado}
                    onChange={(e) => actualizar(item.id, { danado: e.target.checked })}
                  />
                  Hay unidades dañadas
                </label>
                <input type="hidden" name="linea_danado" value={linea.danado ? 'true' : 'false'} />

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={linea.productoErroneo}
                    onChange={(e) => actualizar(item.id, { productoErroneo: e.target.checked })}
                  />
                  No es el producto pedido
                </label>
                <input type="hidden" name="linea_productoErroneo" value={linea.productoErroneo ? 'true' : 'false'} />
              </div>
            </div>
          )
        })}
      </section>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Registrar recepción'}
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
