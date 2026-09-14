'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { AvisoErrores, useScrollAlPrimerError } from '@/components/errores-formulario'
import { CampoArchivo } from '@/components/campo-archivo'
import type { EstadoFormulario } from './actions'

type CategoriaGasto = { id: string; nombre: string }

export type ValoresAporte = {
  fecha: string
  categoriaId: string
  categoriaLibre: string
  descripcion: string
  moneda: string
  monto: string
}

const ID_AVISO_ERRORES = 'errores-aporte'

/**
 * Un solo aporte — el formulario de EDICIÓN.
 *
 * El alta usa `formulario.tsx`, que carga varios de una vez. Son dos
 * componentes y no uno con un modo, porque tienen formas distintas de
 * verdad: el de alta repite bloques y sube cada comprobante por separado; el
 * de edición toca una fila que ya existe y no toca su adjunto (corregir un
 * monto no puede borrar un comprobante ya subido).
 */
export function FormularioAporte({
  categorias,
  inicial,
  accionServidor,
  textoBoton = 'Guardar cambios',
  textoEnviando = 'Guardando…',
}: {
  categorias: CategoriaGasto[]
  inicial?: ValoresAporte
  accionServidor: (previo: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>
  textoBoton?: string
  textoEnviando?: string
}) {
  const editando = !!inicial
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionServidor, null)
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ?? '')
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje
  useScrollAlPrimerError(estado, ID_AVISO_ERRORES)

  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <form action={accion} className="space-y-4">
      <AvisoErrores errores={estado?.errores} />

      <section className="card space-y-3">
        <Campo etiqueta="Fecha del gasto *" error={errorDe('fecha')}>
          <input
            type="date" name="fecha" required max={hoy}
            defaultValue={inicial?.fecha ?? hoy}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          <p className="mt-1 text-xs text-gray-500">
            Cuándo ocurrió el gasto, no cuándo lo estás cargando.
          </p>
        </Campo>

        <Campo etiqueta="Categoría *" error={errorDe('categoriaId')}>
          <select
            name="categoriaId" value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="">Ninguna de estas — la escribo abajo</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          {!categoriaId ? (
            <input
              type="text" name="categoriaLibre"
              defaultValue={inicial?.categoriaLibre}
              placeholder="Escribe la categoría…"
              className="mt-2 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          ) : null}
        </Campo>

        <Campo etiqueta="¿En qué fue el gasto? *" error={errorDe('descripcion')}>
          <textarea
            name="descripcion" rows={2} required
            defaultValue={inicial?.descripcion}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
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
          <Campo etiqueta="Monto *" error={errorDe('monto')}>
            <input
              type="number" name="monto" min="0" step="0.01" required
              defaultValue={inicial?.monto}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
        </div>

        {/* Al editar el adjunto no viaja, mismo criterio que el resto del
            módulo: corregir un monto no puede borrar un comprobante. */}
        {editando ? null : (
          <Campo etiqueta="📎 Comprobante (opcional)">
            <CampoArchivo
              nombre="comprobante" accept="application/pdf,image/jpeg,image/png,image/webp"
              className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
            />
            <p className="mt-1 text-xs text-gray-500">
              La factura o boleta, si la tienes. No es obligatoria.
            </p>
          </Campo>
        )}
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
