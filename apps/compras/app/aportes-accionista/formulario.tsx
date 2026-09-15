'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Money } from '@/components/money'
import {
  excedeTamanoMaximo, mensajeArchivoDemasiadoGrande,
} from '@/domain/archivo'
import { totalEnVivo } from '@/domain/aporte-accionista'
import { crearAportesAction, type EstadoLote } from './actions'
import { subirComprobanteAporteAction } from './subir'
import { hoyLima } from '@/domain/fecha'

type CategoriaGasto = { id: string; nombre: string }

type LineaUI = {
  fecha: string
  categoriaId: string
  categoriaLibre: string
  descripcion: string
  moneda: string
  monto: string
  /** Ruta que devolvió la subida, o null si todavía no subió ninguno. */
  comprobantePath: string | null
  comprobanteNombre: string | null
  subiendo: boolean
  errorArchivo: string | null
}


const lineaVacia = (): LineaUI => ({
  fecha: hoyLima(),
  categoriaId: '',
  categoriaLibre: '',
  descripcion: '',
  moneda: 'PEN',
  monto: '',
  comprobantePath: null,
  comprobanteNombre: null,
  subiendo: false,
  errorArchivo: null,
})

/**
 * Registrar VARIOS aportes de una vez.
 *
 * Cada bloque es completamente independiente: no hay encabezado compartido
 * (a diferencia de Impuestos, donde las líneas comparten el periodo) ni
 * ninguna regla de unicidad entre filas — dos aportes idénticos el mismo día
 * son perfectamente posibles.
 *
 * CADA COMPROBANTE SE SUBE AL ELEGIRLO, en su propio request, y lo que queda
 * en el formulario es la RUTA. Si los archivos viajaran juntos en el submit,
 * cuatro fotos de celular pasarían del límite de body y el envío se
 * rechazaría sin dejar ni un error que mostrar — el mismo fallo silencioso
 * que ya arreglamos una vez.
 */
export function FormularioAportes({ categorias }: { categorias: CategoriaGasto[] }) {
  const [estado, accion] = useFormState<EstadoLote, FormData>(crearAportesAction, null)
  const [lineas, setLineas] = useState<LineaUI[]>([lineaVacia()])

  const errorDe = (linea: number, campo: string) =>
    estado?.errores.find((e) => e.linea === linea && e.campo === campo)?.mensaje
  const errorGeneral = estado?.errores.find((e) => e.campo === 'general')?.mensaje

  const cambiar = (i: number, cambios: Partial<LineaUI>) =>
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...cambios } : l)))

  const agregar = () => setLineas((prev) => [...prev, lineaVacia()])
  const quitar = (i: number) => setLineas((prev) => prev.filter((_, idx) => idx !== i))

  const elegirArchivo = async (i: number, archivo: File | undefined) => {
    if (!archivo) {
      cambiar(i, { comprobantePath: null, comprobanteNombre: null, errorArchivo: null })
      return
    }
    // El límite por archivo sigue protegiendo cada subida individual — no
    // cambió nada acá, y ahora es el ÚNICO límite que importa porque cada
    // archivo viaja solo.
    if (excedeTamanoMaximo(archivo.size)) {
      cambiar(i, {
        errorArchivo: mensajeArchivoDemasiadoGrande(archivo.name, archivo.size),
        comprobantePath: null,
        comprobanteNombre: null,
      })
      return
    }

    cambiar(i, { subiendo: true, errorArchivo: null })
    const form = new FormData()
    form.append('archivo', archivo)
    const resultado = await subirComprobanteAporteAction(form)
    cambiar(i, {
      subiendo: false,
      comprobantePath: 'path' in resultado ? resultado.path : null,
      comprobanteNombre: 'path' in resultado ? archivo.name : null,
      // El motivo real, no un "no se pudo" que deja sin saber si reintentar.
      errorArchivo:
        'path' in resultado
          ? null
          : `${resultado.error} El aporte se puede registrar igual y subir el comprobante después desde su ficha.`,
    })
  }

  const resumen = totalEnVivo(lineas)
  const subiendoAlguno = lineas.some((l) => l.subiendo)

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="cantidadLineas" value={lineas.length} />

      {errorGeneral ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorGeneral}
        </p>
      ) : null}

      {lineas.map((linea, i) => (
        <section key={i} className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-base">Aporte {i + 1}</h2>
            <button
              type="button" onClick={() => quitar(i)} disabled={lineas.length === 1}
              className="text-sm text-gray-500 underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
            >
              Quitar
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Fecha del gasto *" error={errorDe(i, 'fecha')}>
              <input
                type="date" name={`fecha-${i}`} required max={hoyLima()}
                value={linea.fecha}
                onChange={(e) => cambiar(i, { fecha: e.target.value })}
                className="min-h-12 w-full rounded-md border border-gray-300 px-3"
              />
            </Campo>

            <Campo etiqueta="Categoría *" error={errorDe(i, 'categoriaId')}>
              <select
                name={`categoriaId-${i}`} value={linea.categoriaId}
                onChange={(e) => cambiar(i, { categoriaId: e.target.value })}
                className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
              >
                <option value="">Ninguna de estas — la escribo abajo</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              {!linea.categoriaId ? (
                <input
                  type="text" name={`categoriaLibre-${i}`}
                  value={linea.categoriaLibre}
                  onChange={(e) => cambiar(i, { categoriaLibre: e.target.value })}
                  placeholder="Escribe la categoría…"
                  className="mt-2 min-h-12 w-full rounded-md border border-gray-300 px-3"
                />
              ) : null}
            </Campo>
          </div>

          <Campo etiqueta="¿En qué fue el gasto? *" error={errorDe(i, 'descripcion')}>
            <textarea
              name={`descripcion-${i}`} rows={2} required
              value={linea.descripcion}
              onChange={(e) => cambiar(i, { descripcion: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Moneda *" error={errorDe(i, 'moneda')}>
              <select
                name={`moneda-${i}`} value={linea.moneda}
                onChange={(e) => cambiar(i, { moneda: e.target.value })}
                className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
              >
                <option value="PEN">PEN — Soles</option>
                <option value="USD">USD — Dólares</option>
              </select>
            </Campo>
            <Campo etiqueta="Monto *" error={errorDe(i, 'monto')}>
              <input
                type="number" name={`monto-${i}`} min="0" step="0.01" required
                value={linea.monto}
                onChange={(e) => cambiar(i, { monto: e.target.value })}
                className="min-h-12 w-full rounded-md border border-gray-300 px-3"
              />
            </Campo>
          </div>

          <Campo etiqueta="📎 Comprobante (opcional)">
            {/* El archivo se sube ACÁ, no al enviar: lo que viaja en el
                submit es la ruta. */}
            <input
              type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => elegirArchivo(i, e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
            />
            <input type="hidden" name={`comprobantePath-${i}`} value={linea.comprobantePath ?? ''} />
            {linea.subiendo ? (
              <p className="mt-1 text-xs text-gray-500">Subiendo…</p>
            ) : linea.comprobanteNombre ? (
              <p className="mt-1 text-xs text-green-700">Subido: {linea.comprobanteNombre}</p>
            ) : null}
            {linea.errorArchivo ? (
              <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {linea.errorArchivo}
              </p>
            ) : null}
          </Campo>
        </section>
      ))}

      <button
        type="button" onClick={agregar}
        className="btn-secondary w-full sm:w-auto"
      >
        + Agregar otro aporte
      </button>

      {/* Cargar seis de corrido sin ver el acumulado es fácil de hacer mal. */}
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-gray-600">
          {resumen.cantidad} {resumen.cantidad === 1 ? 'aporte' : 'aportes'}
        </span>
        <span className="flex flex-wrap gap-x-4 font-semibold tabular-nums">
          {resumen.totales.length === 0
            ? '—'
            : resumen.totales.map((t) => (
                <Money key={t.moneda} valor={t.monto} moneda={t.moneda} />
              ))}
        </span>
      </div>

      <BotonGuardar cantidad={lineas.length} bloqueado={subiendoAlguno} />
    </form>
  )
}

function BotonGuardar({ cantidad, bloqueado }: { cantidad: number; bloqueado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <>
      <button
        type="submit" disabled={pending || bloqueado}
        className="btn-primary w-full sm:w-auto"
      >
        {pending
          ? 'Registrando…'
          : cantidad === 1
            ? 'Registrar aporte'
            : `Registrar ${cantidad} aportes`}
      </button>
      {bloqueado ? (
        <p className="mt-1 text-xs text-gray-500">
          Espera a que termine de subir el comprobante.
        </p>
      ) : null}
    </>
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
