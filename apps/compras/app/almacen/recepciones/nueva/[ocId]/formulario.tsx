'use client'

import { useState } from 'react'
// useFormState / useFormStatus: esta app está en React 18.
import { useFormState, useFormStatus } from 'react-dom'
import { excedeTamanoMaximo, mensajeArchivoDemasiadoGrande } from '@/domain/archivo'
import {
  mensajeDeLinea, mensajePendienteDeCierre, pendienteDeCierre, totalizarRecepcion,
  type LineaTresColumnas,
} from '@/domain/recepcion-tres-columnas'
import { hoyLima } from '@/domain/fecha'
import {
  registrarRecepcionAction, subirDocumentoAction, type EstadoFormulario,
} from './actions'

type ItemOC = {
  id: string
  cantidad_pedida: number
  cantidad_recibida: number
  precio_unitario: number
  producto: { codigo: string; descripcion: string; unidad_medida: string } | null
}

/**
 * Recepción de mercadería — modelo de TRES COLUMNAS.
 *
 * Los encabezados dicen contra qué compara cada columna ("Factura (vs OC
 * pedida)", "Física (vs Factura)") porque los dos ejes tienen consecuencias
 * distintas y confundirlos es el error más caro de esta pantalla:
 *
 *   · factura ≠ OC  → entrega parcial. Informativo, azul, no bloquea nada.
 *   · física ≠ factura → plata. Ámbar, y decide si la obligación se puede
 *     pagar o tiene que esperar una nota de crédito.
 *
 * Una columna titulada solo "Física" al lado de otra "Factura" obligaría a
 * recordar contra cuál se compara; el encabezado explícito lo dice.
 *
 * Todo empieza en CONFORME: el caso normal es que la factura cubra lo pedido
 * y que llegue lo facturado. Charlie solo toca lo que está mal.
 *
 * Base/IGV/Total se calculan acá en vivo y se recalculan en el servidor con
 * los precios de la OC — nunca se transcriben ni viajan desde el navegador.
 */
export function FormularioRecepcion({
  ocId, ocCodigo, moneda, items,
}: { ocId: string; ocCodigo: string; moneda: string; items: ItemOC[] }) {
  const accionConOC = registrarRecepcionAction.bind(null, ocId)
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionConOC, null)

  // Conforme por default: cantidadFactura = lo pedido, física = lo facturado.
  const [valores, setValores] = useState<Record<string, { factura: string; fisica: string; obs: string }>>(
    Object.fromEntries(items.map((i) => {
      const pendiente = String(Number(i.cantidad_pedida) - Number(i.cantidad_recibida))
      return [i.id, { factura: pendiente, fisica: pendiente, obs: '' }]
    }))
  )
  const [pathGuia, setPathGuia] = useState<string | null>(null)
  const [pathFactura, setPathFactura] = useState<string | null>(null)
  const [nombreGuia, setNombreGuia] = useState<string | null>(null)
  const [nombreFactura, setNombreFactura] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState<'guia' | 'factura' | null>(null)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)

  const set = (id: string, cambios: Partial<{ factura: string; fisica: string; obs: string }>) =>
    setValores((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }))

  const subir = async (cual: 'guia' | 'factura', archivo: File | undefined) => {
    if (!archivo) return
    if (excedeTamanoMaximo(archivo.size)) {
      setErrorArchivo(mensajeArchivoDemasiadoGrande(archivo.name, archivo.size))
      return
    }
    setErrorArchivo(null)
    setSubiendo(cual)
    const datos = new FormData()
    datos.append('archivo', archivo)
    const r = await subirDocumentoAction(ocCodigo, cual, datos)
    setSubiendo(null)
    if ('path' in r) {
      if (cual === 'guia') { setPathGuia(r.path); setNombreGuia(archivo.name) }
      else { setPathFactura(r.path); setNombreFactura(archivo.name) }
    } else {
      setErrorArchivo(r.error)
    }
  }

  // Las líneas en la forma del dominio, para calcular en vivo con la MISMA
  // función que usa el servidor.
  const lineas: LineaTresColumnas[] = items.map((i) => ({
    ocItemId: i.id,
    cantidadPedida: Number(i.cantidad_pedida) - Number(i.cantidad_recibida),
    precioUnitario: Number(i.precio_unitario),
    cantidadFactura: Number(valores[i.id]?.factura) || 0,
    cantidadFisica: Number(valores[i.id]?.fisica) || 0,
    observaciones: valores[i.id]?.obs || null,
  }))

  const totales = totalizarRecepcion(lineas)
  const cierre = pendienteDeCierre(lineas)
  const fmt = (n: number) =>
    `${moneda === 'USD' ? 'US$' : 'S/'} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="pathGuia" value={pathGuia ?? ''} />
      <input type="hidden" name="pathFactura" value={pathFactura ?? ''} />
      <input type="hidden" name="lineas" value={JSON.stringify(lineas.map((l) => ({
        ocItemId: l.ocItemId,
        cantidadFactura: l.cantidadFactura,
        cantidadFisica: l.cantidadFisica,
        observaciones: l.observaciones,
      })))} />

      {estado?.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          {estado.error}
        </p>
      ) : null}

      {/* Los papeles que vinieron con la mercadería, agrupados: factura y
          guía llegan juntas, así que se piden juntas. */}
      <section className="card space-y-3">
        <h2 className="font-heading text-base">Los papeles que vinieron</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-gray-600">Fecha de llegada</span>
            <input
              type="date" name="fechaRecepcion" required defaultValue={hoyLima()} max={hoyLima()}
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">N° de guía</span>
            <input
              type="text" name="numerosGuia" required placeholder="G-001 o G-001, G-002"
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            <span className="mt-1 block text-xs text-gray-500">
              Si vinieron varias guías con la misma factura, separalas con coma.
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">N° de factura</span>
            <input
              type="text" name="numeroFactura" required placeholder="F001-00012345"
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoDocumento
            etiqueta="📎 Guía de remisión" cual="guia"
            nombre={nombreGuia} subiendo={subiendo === 'guia'} onElegir={subir}
          />
          <CampoDocumento
            etiqueta="📎 Factura" cual="factura"
            nombre={nombreFactura} subiendo={subiendo === 'factura'} onElegir={subir}
          />
        </div>
        {errorArchivo ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {errorArchivo}
          </p>
        ) : null}
      </section>

      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 text-right font-medium">OC pide</th>
              {/* Los encabezados dicen el eje. No es verborragia: es lo que
                  evita comparar contra la columna equivocada. */}
              <th className="px-3 py-2 text-right font-medium">
                Factura <span className="block text-xs font-normal">(vs OC pedida)</span>
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Física <span className="block text-xs font-normal">(vs Factura)</span>
              </th>
              <th className="px-3 py-2 text-right font-medium">Base</th>
              <th className="px-3 py-2 font-medium">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => {
              const l = lineas[idx]
              const msg = mensajeDeLinea(l)
              const v = valores[i.id]
              const base = l.cantidadFactura * l.precioUnitario
              return (
                <>
                  <tr key={i.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      <span className="font-medium">{i.producto?.descripcion ?? '—'}</span>
                      <span className="block text-xs text-gray-500">
                        {i.producto?.codigo} · {fmt(Number(i.precio_unitario))} / {i.producto?.unidad_medida ?? 'un'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l.cantidadPedida}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" min={0} step="any" inputMode="decimal"
                        value={v?.factura ?? ''}
                        onChange={(e) => set(i.id, { factura: e.target.value })}
                        className={`min-h-10 w-24 rounded-md border px-2 text-right tabular-nums ${
                          l.cantidadFactura !== l.cantidadPedida
                            ? 'border-sky-400 bg-sky-50' : 'border-gray-300'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" min={0} step="any" inputMode="decimal"
                        value={v?.fisica ?? ''}
                        onChange={(e) => set(i.id, { fisica: e.target.value })}
                        className={`min-h-10 w-24 rounded-md border px-2 text-right tabular-nums ${
                          l.cantidadFisica !== l.cantidadFactura
                            ? 'border-amber-500 bg-amber-50 font-medium' : 'border-gray-300'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(base)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={v?.obs ?? ''}
                        onChange={(e) => set(i.id, { obs: e.target.value })}
                        placeholder={msg?.tono === 'alerta' ? '¿Qué pasó? (obligatorio)' : 'opcional'}
                        className={`min-h-10 w-full rounded-md border px-2 ${
                          msg?.tono === 'alerta' && !v?.obs?.trim()
                            ? 'border-amber-500 bg-amber-50' : 'border-gray-300'
                        }`}
                      />
                    </td>
                  </tr>
                  {/* La consecuencia, en el momento y pegada a su línea. Los
                      dos tonos distinguen los dos ejes a simple vista. */}
                  {msg ? (
                    <tr key={`${i.id}-msg`} className="border-b border-gray-100">
                      <td colSpan={6} className={`px-3 pb-2 text-xs ${
                        msg.tono === 'alerta' ? 'text-amber-800' : 'text-sky-800'
                      }`}>
                        {msg.tono === 'alerta' ? '⚠️' : 'ℹ️'} {msg.texto}
                      </td>
                    </tr>
                  ) : null}
                </>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="card space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
          <span className="text-gray-600">Base imponible</span>
          <span className="tabular-nums">{fmt(totales.base)}</span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
          <span className="text-gray-600">IGV (18%)</span>
          <span className="tabular-nums">{fmt(totales.igv)}</span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-gray-200 pt-2 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{fmt(totales.total)}</span>
        </div>

        {totales.lineasConDiscrepancia > 0 ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-950">
            ⚠️ {totales.lineasConDiscrepancia}{' '}
            {totales.lineasConDiscrepancia === 1 ? 'línea' : 'líneas'} con diferencia entre lo
            facturado y lo que llegó.{' '}
            {totales.esperaNotaCredito
              ? 'La obligación va a quedar esperando la nota de crédito del proveedor antes de poder pagarse.'
              : 'El proveedor tiene que facturar la diferencia.'}
          </p>
        ) : null}

        {/* Qué va a quedar pendiente DESPUÉS de registrar. El cierre de la OC
            no se decide acá: se decide cuando ya se sabe qué llegó. */}
        <p className="text-xs text-gray-600">{mensajePendienteDeCierre(cierre)}</p>

        <BotonRegistrar bloqueado={subiendo !== null || !pathGuia || !pathFactura} />
      </section>
    </form>
  )
}

function CampoDocumento({
  etiqueta, cual, nombre, subiendo, onElegir,
}: {
  etiqueta: string
  cual: 'guia' | 'factura'
  nombre: string | null
  subiendo: boolean
  onElegir: (cual: 'guia' | 'factura', archivo: File | undefined) => void
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-800">{etiqueta} *</span>
      <input
        type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => onElegir(cual, e.target.files?.[0])}
        className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
      />
      {subiendo ? <span className="mt-1 block text-xs text-gray-500">Subiendo…</span> : null}
      {nombre ? <span className="mt-1 block text-xs text-green-700">Subido: {nombre}</span> : null}
    </label>
  )
}

function BotonRegistrar({ bloqueado }: { bloqueado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || bloqueado} className="btn-primary w-full sm:w-auto">
      {pending ? 'Registrando…' : 'Registrar recepción'}
    </button>
  )
}
