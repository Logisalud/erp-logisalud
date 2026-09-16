'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { excedeTamanoMaximo, mensajeArchivoDemasiadoGrande } from '@/domain/archivo'
import {
  hojasCandidatas, parsearRendicionExcel, type FilaRendicion,
} from '@/lib/excel-caja-chica'
import { cargarRendicionAction, subirExcelRendicionAction, type EstadoAccion } from './actions'

/**
 * Cargar la rendición de Caja Chica desde el Excel que Roberto ya mantiene,
 * en vez de registrar 13 gastos a mano.
 *
 * Cuatro pasos, y el tercero es el que importa: subir → PREVISUALIZAR sin
 * guardar nada → confirmar → sigue el embudo normal. Nadie carga a ciegas un
 * archivo de 13 filas: se ve exactamente qué se va a crear y cuánto suma
 * antes de tocar la base.
 *
 * El parseo ocurre ACÁ, en el cliente. Así los errores del archivo (una
 * categoría desconocida, un total que no cuadra) se ven al instante y sin
 * gastar un viaje al servidor. Lo que después se manda son las filas ya
 * interpretadas — y el servidor igual revalida las categorías contra la
 * base, porque lo que llega del navegador es una propuesta, no un hecho.
 */
export function CargarRendicionExcel({ fondoId }: { fondoId: string }) {
  const conId = cargarRendicionAction.bind(null, fondoId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)

  const [abierto, setAbierto] = useState(false)
  const [filas, setFilas] = useState<FilaRendicion[] | null>(null)
  const [total, setTotal] = useState(0)
  const [hoja, setHoja] = useState<string | null>(null)
  const [opcionesHoja, setOpcionesHoja] = useState<string[]>([])
  const [errores, setErrores] = useState<string[]>([])
  const [excelPath, setExcelPath] = useState<string | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)

  const limpiar = () => {
    setFilas(null); setTotal(0); setHoja(null); setOpcionesHoja([])
    setErrores([]); setExcelPath(null); setNombreArchivo(null); setArchivo(null)
  }

  const procesar = async (f: File, hojaElegida?: string) => {
    const buffer = await f.arrayBuffer()
    const resultado = parsearRendicionExcel(buffer, hojaElegida)

    if (!resultado.ok) {
      setFilas(null)
      setErrores(resultado.errores.map((e) => e.mensaje))
      // Si el problema es que hay varias hojas candidatas, se ofrecen para
      // elegir en vez de dejar a la persona adivinando cuál era.
      const XLSXHojas = await import('xlsx').then((m) => {
        try { return m.read(buffer, { type: 'array', bookSheets: true }).SheetNames } catch { return [] }
      })
      setOpcionesHoja(hojasCandidatas(XLSXHojas))
      return
    }

    setErrores([])
    setOpcionesHoja([])
    setFilas(resultado.filas)
    setTotal(resultado.total)
    setHoja(resultado.hoja)

    // El archivo se sube recién cuando el parseo salió bien: no tiene sentido
    // dejar un .xlsx huérfano en Storage por un archivo que no sirve.
    setSubiendo(true)
    const datos = new FormData()
    datos.append('archivo', f)
    const subida = await subirExcelRendicionAction(fondoId, datos)
    setSubiendo(false)
    if ('path' in subida) {
      setExcelPath(subida.path)
      setNombreArchivo(f.name)
    } else {
      // No bloquea: la rendición se puede cargar igual, solo queda sin el
      // respaldo adjunto. Se avisa para que sea una decisión y no una
      // sorpresa.
      setErrores([`${subida.error} Podés continuar: la rendición se carga igual, pero sin el Excel adjunto.`])
    }
  }

  const elegir = async (f: File | undefined) => {
    limpiar()
    if (!f) return
    if (excedeTamanoMaximo(f.size)) {
      setErrores([mensajeArchivoDemasiadoGrande(f.name, f.size)])
      return
    }
    setArchivo(f)
    await procesar(f)
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary mt-3 w-full sm:w-auto">
        Cargar rendición desde Excel…
      </button>
    )
  }

  const fmt = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <form action={dispatch} className="card mt-3 w-full space-y-3">
      <div>
        <h3 className="font-heading text-base">Cargar rendición desde Excel</h3>
        <p className="mt-1 text-sm text-gray-600">
          Subí el archivo de liquidación tal como lo llevás. Vas a ver qué se va a registrar
          antes de confirmar.
        </p>
      </div>

      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}

      <label className="block text-sm">
        <span className="font-medium text-gray-800">📎 Archivo de la rendición (.xlsx)</span>
        <input
          type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => elegir(e.target.files?.[0])}
          className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
        />
        {subiendo ? <span className="mt-1 block text-xs text-gray-500">Guardando el archivo…</span> : null}
        {nombreArchivo ? (
          <span className="mt-1 block text-xs text-green-700">Adjunto: {nombreArchivo}</span>
        ) : null}
      </label>

      {errores.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          {errores.map((e) => <p key={e}>{e}</p>)}
        </div>
      ) : null}

      {opcionesHoja.length > 1 && archivo ? (
        <label className="block text-sm">
          <span className="font-medium text-gray-800">¿Cuál hoja?</span>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && procesar(archivo, e.target.value)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="" disabled>Elegí la hoja de la rendición…</option>
            {opcionesHoja.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
      ) : null}

      {filas ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Unidad</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 font-medium">Detalle</th>
                  <th className="px-3 py-2 font-medium">N° doc</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={`${f.numero}-${i}`} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5">{f.fecha}</td>
                    <td className="px-3 py-1.5">{f.placaVehiculo}</td>
                    <td className="px-3 py-1.5">{f.categoriaNombre}</td>
                    <td className="px-3 py-1.5 text-gray-600">{f.descripcion}</td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-600">{f.numero}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(f.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td className="px-3 py-2" colSpan={5}>
                    {filas.length} {filas.length === 1 ? 'gasto' : 'gastos'}
                    {hoja ? <span className="ml-2 text-xs font-normal text-gray-500">hoja "{hoja}"</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">S/ {fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Estos gastos se registran <strong>sin desglose de IGV</strong>, porque el archivo trae
            solo el monto total. Los comprobantes siguen en OneDrive; acá queda el número de cada uno.
          </p>

          <input type="hidden" name="filas" value={JSON.stringify(filas)} />
          <input type="hidden" name="excelPath" value={excelPath ?? ''} />

          <div className="flex flex-wrap gap-2">
            <BotonConfirmar cantidad={filas.length} bloqueado={subiendo} />
            <button
              type="button"
              onClick={() => { limpiar(); setAbierto(false) }}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </>
      ) : null}
    </form>
  )
}

function BotonConfirmar({ cantidad, bloqueado }: { cantidad: number; bloqueado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || bloqueado} className="btn-primary">
      {pending ? 'Cargando…' : `Registrar ${cantidad} ${cantidad === 1 ? 'gasto' : 'gastos'} y pedir reposición`}
    </button>
  )
}
