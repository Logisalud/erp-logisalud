'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { registrarPagoDirectoAction, type EstadoFormulario } from './actions'
import type { ValoresPagoDirecto } from '@/domain/valores-pago-directo'
import {
  CONDICIONES_PAGO_DIAS,
  etiquetaCondicionPago,
  igvSegun,
  totalSegun,
} from '@/domain/obligacion'
import { BuscadorProveedor, type ProveedorElegido } from '@/components/buscador-proveedor'
import { CampoDetraccion } from '@/components/campo-detraccion'
import { CampoArchivo } from '@/components/campo-archivo'
import { excedeTamanoMaximo, mensajeArchivoDemasiadoGrande } from '@/domain/archivo'
import { exentoDelTope } from '@/domain/obligacion'
import { subirVoucherAltaAction } from './actions'

type CategoriaOpcion = { id: string; nombre: string }

const fmt = (n: number) => n.toFixed(2)

export function FormularioPagoDirecto({
  categorias,
  inicial,
  accionServidor = registrarPagoDirectoAction,
  textoBoton,
  textoEnviando,
}: {
  categorias: CategoriaOpcion[]
  /** Valores guardados, al editar. Sin esto arranca vacío y es el de alta —
   * es el MISMO componente en los dos modos, para que una regla nueva entre
   * en los dos caminos a la vez. */
  inicial?: ValoresPagoDirecto
  accionServidor?: (previo: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>
  textoBoton?: string
  textoEnviando?: string
}) {
  const editando = !!inicial
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionServidor, null)
  const sucio = useMarcarSucioAlEditar(estado)
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(inicial?.proveedor ?? null)
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>(inicial?.moneda ?? 'PEN')
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ?? '')
  const [baseImponible, setBaseImponible] = useState(inicial?.baseImponible ?? '')
  const [tieneDetraccion, setTieneDetraccion] = useState<boolean | null>(inicial?.tieneDetraccion ?? null)
  const [porcentajeDetraccion, setPorcentajeDetraccion] = useState(inicial?.porcentajeDetraccion ?? '')
  const [montoDetraccion, setMontoDetraccion] = useState(inicial?.montoDetraccion ?? '')
  // Al editar, "pendiente de factura" es el ESTADO guardado y no se cambia
  // desde acá: pasar de cotización a factura real es "Completar factura",
  // que además recalcula el vencimiento (ver services/obligaciones.ts).
  const [pendienteFactura, setPendienteFactura] = useState(inicial?.pendienteFactura ?? false)
  const [sinIgv, setSinIgv] = useState(inicial?.sinIgv ?? false)
  const [condicionPagoDias, setCondicionPagoDias] = useState<number | null>(
    inicial?.condicionPagoDias ?? null
  )
  // Backlog pre-ERP: en esa categoría el pago SIEMPRE ya ocurrió, así que se
  // ofrece documentarlo en el mismo envío. Mismo criterio de visibilidad que
  // usa el resto del módulo para esta categoría — se decide por NOMBRE, y el
  // servidor lo revalida contra la base.
  const [yaPagado, setYaPagado] = useState(false)
  const [voucherPath, setVoucherPath] = useState<string | null>(null)
  const [voucherNombre, setVoucherNombre] = useState<string | null>(null)
  const [subiendoVoucher, setSubiendoVoucher] = useState(false)
  const [errorVoucher, setErrorVoucher] = useState<string | null>(null)

  const categoriaNombre = categorias.find((c) => c.id === categoriaId)?.nombre ?? null
  const esBacklog = exentoDelTope(categoriaNombre)

  const elegirVoucher = async (archivo: File | undefined) => {
    if (!archivo) {
      setVoucherPath(null)
      setVoucherNombre(null)
      setErrorVoucher(null)
      return
    }
    if (excedeTamanoMaximo(archivo.size)) {
      setErrorVoucher(mensajeArchivoDemasiadoGrande(archivo.name, archivo.size))
      setVoucherPath(null)
      setVoucherNombre(null)
      return
    }
    setSubiendoVoucher(true)
    setErrorVoucher(null)
    const datos = new FormData()
    datos.append('archivo', archivo)
    const resultado = await subirVoucherAltaAction(datos)
    setSubiendoVoucher(false)
    if ('path' in resultado) {
      setVoucherPath(resultado.path)
      setVoucherNombre(archivo.name)
    } else {
      setVoucherPath(null)
      setVoucherNombre(null)
      setErrorVoucher(`${resultado.error} Puedes registrar igual y subir la constancia después desde la ficha.`)
    }
  }

  // Pieza B1: el IGV no es editable, pero sí tiene que verse mientras se
  // escribe la base — antes había que guardar para descubrir el total.
  // Con "Sin IGV" marcado vale 0 y el total es la base sola (migración 0046).
  const base = Number(baseImponible) || 0
  const igv = igvSegun(base, sinIgv)
  const total = totalSegun(base, sinIgv)

  // Pieza F: se propone la condición del proveedor y se puede ajustar. El
  // `??` mira el estado local primero para no pisar lo que la persona eligió
  // a mano al cambiar de proveedor.
  const condicionEfectiva = condicionPagoDias ?? proveedor?.condicionPagoDias ?? 30

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  // Pieza G: registrar en dólares es la excepción, no un ítem más de un
  // desplegable — el cambio de moneda pide confirmación explícita.
  const elegirMoneda = (nueva: 'PEN' | 'USD') => {
    if (nueva === 'USD' && moneda !== 'USD') {
      const ok = window.confirm('¿Estás seguro? Vas a registrar este pago en dólares.')
      if (!ok) return
    }
    setMoneda(nueva)
  }

  return (
    <form action={accion} onChange={sucio.onChange} onSubmit={sucio.onSubmit} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      {/* El aviso por correo (Pieza D) necesita los nombres, no los ids. */}
      <input type="hidden" name="proveedorNombre" value={proveedor?.nombre ?? ''} />
      <input type="hidden" name="categoriaNombre" value={categorias.find((c) => c.id === categoriaId)?.nombre ?? ''} />

      <section className="card space-y-3">
        <Campo etiqueta="Proveedor *" error={errorDe('proveedorId')}>
          <BuscadorProveedor valor={proveedor} onElegir={setProveedor} />
          <input type="hidden" name="proveedorId" value={proveedor?.id ?? ''} />
          <input type="hidden" name="proveedorFuente" value={proveedor?.fuente ?? 'compra'} />
        </Campo>

        <Campo etiqueta="Categoría *" error={errorDe('categoriaId')}>
          <select
            name="categoriaId" required value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="" disabled>Elige una…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Para qué es este gasto *" error={errorDe('descripcion')}>
          <textarea name="descripcion" rows={2} required defaultValue={inicial?.descripcion} className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </Campo>
      </section>

      <section className="card space-y-3">
        {editando ? (
          <p className="text-sm text-gray-600">
            {pendienteFactura
              ? 'Pendiente de factura — para cargar los datos reales del comprobante usa "Completar factura" desde la ficha, que además recalcula el vencimiento.'
              : 'Con factura registrada.'}
          </p>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox" name="pendienteFactura" value="si"
              checked={pendienteFactura}
              onChange={(e) => setPendienteFactura(e.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <span>
              <span className="font-medium text-gray-800">El proveedor todavía no emitió la factura</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Registra el compromiso con la cotización y queda <strong>pendiente de factura</strong>. No se puede
                pagar hasta completar los datos reales del comprobante.
              </span>
            </span>
          </label>
        )}

        {pendienteFactura ? (
          editando ? null : (
            <Campo etiqueta="📎 Cotización que sustenta el monto">
              <CampoArchivo
                nombre="cotizacion" accept="application/pdf,image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
              />
            </Campo>
          )
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="N° de factura *" error={errorDe('numeroFactura')}>
                <input type="text" name="numeroFactura" required defaultValue={inicial?.numeroFactura} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
              </Campo>
              <Campo etiqueta="Fecha de factura *" error={errorDe('fechaFactura')}>
                <input
                  type="date" name="fechaFactura" required
                  defaultValue={inicial?.fechaFactura ?? new Date().toISOString().slice(0, 10)}
                  className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                />
              </Campo>
            </div>
            {editando ? null : (
              <Campo etiqueta="📎 Factura escaneada (opcional)">
                <CampoArchivo
                  nombre="factura" accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
                />
              </Campo>
            )}
          </div>
        )}
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Moneda *" error={errorDe('moneda')}>
          <div className="flex gap-2">
            {(['PEN', 'USD'] as const).map((m) => (
              <button
                key={m} type="button" onClick={() => elegirMoneda(m)}
                aria-pressed={moneda === m}
                className={`min-h-12 flex-1 rounded-md border px-3 font-medium ${
                  moneda === m
                    ? 'border-logisalud-green bg-logisalud-green text-white'
                    : 'border-gray-300 bg-white text-gray-700'
                }`}
              >
                {m === 'PEN' ? 'S/ Soles' : 'US$ Dólares'}
              </button>
            ))}
          </div>
          <input type="hidden" name="moneda" value={moneda} />
        </Campo>

        <Campo etiqueta="Condición de pago *" error={errorDe('condicionPagoDias')}>
          <select
            name="condicionPagoDias" value={condicionEfectiva}
            onChange={(e) => setCondicionPagoDias(Number(e.target.value))}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            {CONDICIONES_PAGO_DIAS.map((d) => (
              <option key={d} value={d}>{etiquetaCondicionPago(d)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {proveedor
              ? `Propuesta del proveedor: ${etiquetaCondicionPago(proveedor.condicionPagoDias)}. El vencimiento se cuenta desde la fecha de factura.`
              : 'El vencimiento del pago se cuenta desde la fecha de factura.'}
          </p>
        </Campo>

        {moneda === 'USD' ? (
          <Campo etiqueta="Tipo de cambio *" error={errorDe('tipoCambio')}>
            <input type="number" name="tipoCambio" min="0" step="0.0001" required defaultValue={inicial?.tipoCambio} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        ) : null}

        <Campo etiqueta="Base imponible (sin IGV) *" error={errorDe('baseImponible')}>
          <input
            type="number" name="baseImponible" min="0" step="0.01" required
            value={baseImponible}
            onChange={(e) => setBaseImponible(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          {/* Aplica a todas las categorías por igual: lo que decide si hay
              IGV es la operación real (ej. un alquiler a persona natural),
              no en qué casillero del catálogo cayó el gasto. */}
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              type="checkbox" name="sinIgv" value="true" checked={sinIgv}
              onChange={(e) => setSinIgv(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-gray-300"
            />
            <span>
              <span className="font-medium">Sin IGV (no genera IGV)</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Marca esto si la operación no está gravada — por ejemplo un alquiler a una persona
                natural. El IGV queda en 0 y el total es la base sola.
              </span>
            </span>
          </label>
        </Campo>

        <div className="sm:col-span-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Base imponible</span><span className="tabular-nums">{fmt(base)}</span></div>
          <div className="flex justify-between">
            <span className="text-gray-600">{sinIgv ? 'IGV (no aplica)' : 'IGV (18%)'}</span>
            <span className="tabular-nums">{fmt(igv)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>Total</span><span className="tabular-nums">{fmt(total)}</span>
          </div>
        </div>
      </section>

      <CampoDetraccion
        total={total}
        moneda={moneda}
        tieneDetraccion={tieneDetraccion}
        onTieneDetraccionChange={setTieneDetraccion}
        porcentaje={porcentajeDetraccion}
        onPorcentajeChange={setPorcentajeDetraccion}
        monto={montoDetraccion}
        onMontoChange={setMontoDetraccion}
        errorTieneDetraccion={errorDe('tieneDetraccion')}
        errorPorcentaje={errorDe('porcentajeDetraccion')}
        errorMonto={errorDe('montoDetraccion')}
      />

      {/* Solo en la categoría del backlog: ahí el pago SIEMPRE es del
          pasado y el archivo no es una factura pendiente sino la constancia
          de que ya se pagó. Si se marca, la obligación nace y pasa directo a
          "pagada", sin conformidad ni propuesta. */}
      {esBacklog && !editando ? (
        <section className="card space-y-3 border-2 border-logisalud-green">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox" name="yaPagado" value="si"
              checked={yaPagado}
              onChange={(e) => setYaPagado(e.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <span>
              <span className="font-medium text-gray-800">Ya se pagó — adjuntar constancia</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Para el backlog anterior al ERP: el pago ya ocurrió. Marca esto y el registro
                queda como <strong>Pagado</strong> de una vez, sin pedir conformidad ni entrar a
                una propuesta.
              </span>
            </span>
          </label>

          {yaPagado ? (
            <>
              <input type="hidden" name="voucherHistoricoPath" value={voucherPath ?? ''} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Fecha real del pago *">
                  <input
                    type="date" name="fechaPagoHistorico" required
                    className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    La que figura en el voucher, no la de hoy.
                  </p>
                </Campo>
                <Campo etiqueta="N° de operación">
                  <input
                    type="text" name="numeroOperacionHistorico"
                    className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                </Campo>
              </div>
              <Campo etiqueta="📎 Constancia del pago">
                {/* Se sube al elegirla, en su propio request: en este mismo
                    formulario ya puede viajar una cotización o una factura, y
                    dos archivos juntos pasarían del límite de body. */}
                <input
                  type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => elegirVoucher(e.target.files?.[0])}
                  className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
                />
                {subiendoVoucher ? (
                  <p className="mt-1 text-xs text-gray-500">Subiendo…</p>
                ) : voucherNombre ? (
                  <p className="mt-1 text-xs text-green-700">Subida: {voucherNombre}</p>
                ) : null}
                {errorVoucher ? (
                  <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {errorVoucher}
                  </p>
                ) : null}
              </Campo>
            </>
          ) : null}
        </section>
      ) : null}

      <BotonGuardar
        texto={textoBoton ?? (yaPagado ? 'Registrar pago ya realizado' : 'Registrar pago directo')}
        textoEnviando={textoEnviando ?? 'Registrando…'}
        bloqueado={subiendoVoucher}
      />
    </form>
  )
}

function BotonGuardar({
  texto, textoEnviando, bloqueado,
}: { texto: string; textoEnviando: string; bloqueado?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <>
      <button
        type="submit" disabled={pending || bloqueado}
        className="btn-primary w-full sm:w-auto"
      >
        {pending ? textoEnviando : texto}
      </button>
      {bloqueado ? (
        <p className="mt-1 text-xs text-gray-500">Espera a que termine de subir la constancia.</p>
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
