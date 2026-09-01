'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { registrarFacturaAction, extraerCamposDeArchivoAction, type EstadoFormulario } from './actions'
import { redondear } from '@/domain/obligacion'

type ItemOC = {
  ocItemId: string
  cantidadPedida: number
  cantidadRecibida: number
  cantidadYaFacturada: number
  precioUnitario: number
  producto: { codigo: string; descripcion: string; unidad_medida: string } | null
}

type TasaDetraccion = { id: string; categoria: string; porcentaje: number; anexo_sunat: string | null }

const SUGERENCIA_IGV = 0.18

export function FormularioFacturaCompra({
  ocId, ocCodigo, moneda, items, tasasDetraccion,
}: {
  ocId: string
  ocCodigo: string
  moneda: string
  items: ItemOC[]
  tasasDetraccion: TasaDetraccion[]
}) {
  const accionConOC = registrarFacturaAction.bind(null, ocId, ocCodigo)
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionConOC, null)
  const sucio = useMarcarSucioAlEditar()
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  const [ocrEstado, setOcrEstado] = useState<'idle' | 'leyendo' | 'hecho'>('idle')
  const [ocrMensaje, setOcrMensaje] = useState<string | null>(null)

  const [numeroFactura, setNumeroFactura] = useState('')
  const [fechaFactura, setFechaFactura] = useState(new Date().toISOString().slice(0, 10))
  const [ruc, setRuc] = useState('')
  const [proveedorNombreLeido, setProveedorNombreLeido] = useState('')
  const [base, setBase] = useState('')
  const [igv, setIgv] = useState('')
  const [igvEditadoAMano, setIgvEditadoAMano] = useState(false)
  const [total, setTotal] = useState('')
  const [totalEditadoAMano, setTotalEditadoAMano] = useState(false)
  const [tasaDetraccionId, setTasaDetraccionId] = useState('')
  const [porcentajeDetraccion, setPorcentajeDetraccion] = useState('')
  const [montoDetraccion, setMontoDetraccion] = useState('')
  const [montoDetraccionEditadoAMano, setMontoDetraccionEditadoAMano] = useState(false)
  const [fechaRecepcionFactura, setFechaRecepcionFactura] = useState('')

  const [lineas, setLineas] = useState<Record<string, { cantidad: string; precio: string }>>(
    Object.fromEntries(
      items.map((i) => [
        i.ocItemId,
        { cantidad: String(Math.max(0, i.cantidadPedida - i.cantidadYaFacturada)), precio: String(i.precioUnitario) },
      ])
    )
  )

  const cambiarBase = (valor: string) => {
    setBase(valor)
    const n = Number(valor) || 0
    if (!igvEditadoAMano) setIgv(n > 0 ? String(redondear(n * SUGERENCIA_IGV)) : '')
    if (!totalEditadoAMano) {
      const igvActual = igvEditadoAMano ? Number(igv) || 0 : redondear(n * SUGERENCIA_IGV)
      setTotal(n > 0 ? String(redondear(n + igvActual)) : '')
    }
  }

  const netoAPagar = redondear((Number(total) || 0) - (Number(montoDetraccion) || 0))

  const elegirTasaDetraccion = (id: string) => {
    setTasaDetraccionId(id)
    const tasa = tasasDetraccion.find((t) => t.id === id)
    if (tasa) {
      setPorcentajeDetraccion(String(tasa.porcentaje))
      if (!montoDetraccionEditadoAMano) {
        setMontoDetraccion(String(redondear((Number(total) || 0) * (tasa.porcentaje / 100))))
      }
    }
  }

  const cambiarPorcentajeDetraccion = (valor: string) => {
    setPorcentajeDetraccion(valor)
    if (!montoDetraccionEditadoAMano) {
      const pct = Number(valor) || 0
      setMontoDetraccion(pct > 0 ? String(redondear((Number(total) || 0) * (pct / 100))) : '')
    }
  }

  async function leerArchivo(archivo: File) {
    setOcrEstado('leyendo')
    setOcrMensaje(null)
    const form = new FormData()
    form.append('archivo', archivo)
    const resultado = await extraerCamposDeArchivoAction(form)
    setOcrEstado('hecho')
    if (!resultado.disponible) {
      setOcrMensaje(resultado.motivoNoDisponible ?? 'No se pudo leer el documento automáticamente — completa a mano.')
      return
    }
    // Solo pre-llena campos que todavía están vacíos — nunca pisa algo que
    // la persona ya tipeó.
    const c = resultado.campos
    if (c.fecha && !fechaFactura) setFechaFactura(c.fecha)
    if (c.ruc && !ruc) setRuc(c.ruc)
    if (c.proveedorNombre && !proveedorNombreLeido) setProveedorNombreLeido(c.proveedorNombre)
    if (c.base != null && !base) cambiarBase(String(c.base))
    if (c.igv != null && !igv) { setIgv(String(c.igv)); setIgvEditadoAMano(true) }
    if (c.total != null && !total) { setTotal(String(c.total)); setTotalEditadoAMano(true) }
    if (c.porcentajeDetraccion != null && !porcentajeDetraccion) cambiarPorcentajeDetraccion(String(c.porcentajeDetraccion))
    setOcrMensaje('Se leyeron algunos campos del documento — revísalos, siguen editables.')
  }

  return (
    <form action={accion} onChange={sucio.onChange} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{errorDe('general')}</p>
      ) : null}
      {errorDe('lineas') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{errorDe('lineas')}</p>
      ) : null}

      <section className="card space-y-2">
        <h2 className="font-heading text-lg">Documento de la factura</h2>
        <label className="block text-sm">
          <span className="text-gray-600">Foto o PDF de la factura</span>
          <input
            type="file" name="archivo" accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) leerArchivo(f) }}
            className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
          />
        </label>
        {ocrEstado === 'leyendo' ? <p className="text-xs text-gray-500">Leyendo el documento…</p> : null}
        {ocrMensaje ? <p className="text-xs text-gray-500">{ocrMensaje}</p> : null}
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="N° de factura" error={errorDe('numeroFactura')}>
          <input
            type="text" name="numeroFactura" required value={numeroFactura}
            onChange={(e) => setNumeroFactura(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </Campo>
        <Campo etiqueta="Fecha de factura" error={errorDe('fechaFactura')}>
          <input
            type="date" name="fechaFactura" required value={fechaFactura}
            onChange={(e) => setFechaFactura(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </Campo>
        <Campo etiqueta="RUC del proveedor">
          <input type="text" name="ruc" value={ruc} onChange={(e) => setRuc(e.target.value)} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </Campo>
        <Campo etiqueta="Fecha de recepción de la factura">
          <input
            type="date" name="fechaRecepcionFactura" value={fechaRecepcionFactura}
            onChange={(e) => setFechaRecepcionFactura(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          <p className="mt-1 text-xs text-gray-500">Informativa — el vencimiento del pago nunca sale de esta fecha.</p>
        </Campo>
        <input type="hidden" name="proveedorNombreLeido" value={proveedorNombreLeido} />
        {moneda === 'USD' ? (
          <Campo etiqueta="Tipo de cambio">
            <input type="number" name="tipoCambio" min="0" step="0.0001" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        ) : null}
      </section>

      <section className="card grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Base">
          <input type="number" name="baseFactura" min="0" step="0.01" value={base} onChange={(e) => cambiarBase(e.target.value)} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </Campo>
        <Campo etiqueta="IGV">
          <input
            type="number" name="igvFactura" min="0" step="0.01" value={igv}
            onChange={(e) => { setIgv(e.target.value); setIgvEditadoAMano(true) }}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </Campo>
        <Campo etiqueta="Total">
          <input
            type="number" name="totalFactura" min="0" step="0.01" value={total}
            onChange={(e) => { setTotal(e.target.value); setTotalEditadoAMano(true) }}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </Campo>
        <p className="sm:col-span-3 text-xs text-gray-500">
          Sugeridos en 18% desde la base — nunca desde el total de la orden de compra. Ajustalos si la factura trae otros valores.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-heading text-lg">Detracción</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Categoría (opcional)">
            <select
              name="tasaDetraccionId" value={tasaDetraccionId} onChange={(e) => elegirTasaDetraccion(e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
            >
              <option value="">Sin detracción</option>
              {tasasDetraccion.map((t) => (
                <option key={t.id} value={t.id}>{t.categoria} — {t.porcentaje}%</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="% detracción">
            <input
              type="number" name="porcentajeDetraccion" min="0" max="100" step="0.01" value={porcentajeDetraccion}
              onChange={(e) => cambiarPorcentajeDetraccion(e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
          <Campo etiqueta="Valor de detracción">
            <input
              type="number" name="montoDetraccion" min="0" step="0.01" value={montoDetraccion}
              onChange={(e) => { setMontoDetraccion(e.target.value); setMontoDetraccionEditadoAMano(true) }}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
        </div>
        <p className="text-sm text-gray-700">Neto a pagar: <span className="font-medium tabular-nums">{netoAPagar.toFixed(2)}</span> {moneda}</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-heading text-lg">Líneas facturadas</h2>
        {items.map((item, i) => {
          const pendiente = Math.max(0, item.cantidadPedida - item.cantidadYaFacturada)
          return (
            <div key={item.ocItemId} className="rounded-md border border-gray-200 p-3">
              <p className="font-medium">
                <span className="font-mono text-xs text-gray-500">{item.producto?.codigo ?? '—'}</span>
                {' '}{item.producto?.descripcion ?? 'producto no legible'}
              </p>
              <p className="text-sm text-gray-500">
                Pedido {item.cantidadPedida}, recibido {item.cantidadRecibida}, disponible para facturar {pendiente}{' '}
                {item.producto?.unidad_medida ?? ''} · precio pactado {item.precioUnitario}
              </p>
              <input type="hidden" name="linea_ocItemId" value={item.ocItemId} />
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-gray-600">Cant. facturada</span>
                  <input
                    type="number" name="linea_cantidadFacturada" min="0" step="any"
                    value={lineas[item.ocItemId]?.cantidad ?? ''}
                    onChange={(e) => setLineas((prev) => ({ ...prev, [item.ocItemId]: { ...prev[item.ocItemId], cantidad: e.target.value } }))}
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                  {errorDe(`lineas.${i}.cantidadFacturada`) ? <p className="mt-1 text-red-700">{errorDe(`lineas.${i}.cantidadFacturada`)}</p> : null}
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Precio facturado</span>
                  <input
                    type="number" name="linea_precioFacturado" min="0" step="0.0001"
                    value={lineas[item.ocItemId]?.precio ?? ''}
                    onChange={(e) => setLineas((prev) => ({ ...prev, [item.ocItemId]: { ...prev[item.ocItemId], precio: e.target.value } }))}
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                </label>
              </div>
              {Number(lineas[item.ocItemId]?.cantidad) > item.cantidadRecibida ? (
                <p className="mt-2 text-xs text-amber-700">
                  Facturas más de lo verificado recibido hasta ahora — si todavía no hay recepción que lo respalde, la
                  factura queda esperando; si ya la hay pero es menos, la diferencia queda como excepción para
                  Contabilidad. No bloquea el registro.
                </p>
              ) : null}
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
      {pending ? 'Guardando…' : 'Registrar factura'}
    </button>
  )
}

function Campo({ etiqueta, error, children }: { etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-800">{etiqueta}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-red-700">{error}</p> : null}
    </label>
  )
}
