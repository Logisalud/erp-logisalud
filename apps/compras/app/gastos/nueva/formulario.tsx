'use client'

import { useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { crearSolicitudAction, type EstadoFormulario } from './actions'
import type { ValoresSolicitud } from '@/domain/valores-solicitud'
import { AvisoErrores, useScrollAlPrimerError } from '@/components/errores-formulario'
import { CampoArchivo } from '@/components/campo-archivo'
import { TIPOS_SOLICITUD, ETIQUETA_TIPO, type TipoSolicitud } from '@/domain/gasto'
import { BuscadorPersona } from '@/components/buscador-persona'
import type { OpcionPersona } from '@/domain/buscar-persona'

type CategoriaGasto = { id: string; nombre: string }
type Usuario = { id: string; nombre: string; area: string }
type PersonaSinUsuario = { id: string; nombre: string; activo: boolean }

const SUGERENCIA_IGV = 0.18

/** Ancla del scroll cuando el error no es de ningún campo (ej. "tu cuenta no
 * tiene un área asignada"): no hay nada que corregir en el formulario, así
 * que lo que se muestra es el aviso de al lado del botón. */
const ID_AVISO_ERRORES = 'errores-solicitud-gasto'

export function FormularioSolicitud({
  categorias,
  usuarios,
  personas = [],
  tipoPreseleccionado,
  sugerenciaAutoriza,
  inicial,
  accionServidor = crearSolicitudAction,
  textoBoton = 'Enviar solicitud',
  textoEnviando = 'Enviando…',
}: {
  categorias: CategoriaGasto[]
  usuarios: Usuario[]
  /** Vendedores y demás personas sin login (0081) — se ofrecen junto a los
   * usuarios en "¿Para quién es el anticipo?". */
  personas?: PersonaSinUsuario[]
  tipoPreseleccionado?: TipoSolicitud
  /** Nombre del responsable del área de quien crea la solicitud, o null si
   * esa área no tiene responsable cargado todavía. */
  sugerenciaAutoriza: string | null
  /** Valores guardados, al editar. Sin esto el formulario arranca vacío y
   * es el de alta — es el MISMO componente en los dos modos, así una regla
   * nueva no se agrega en uno y se olvida en el otro. */
  inicial?: ValoresSolicitud
  accionServidor?: (previo: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>
  textoBoton?: string
  textoEnviando?: string
}) {
  const editando = !!inicial
  const opcionesAsignado: OpcionPersona[] = [
    ...usuarios.map((u) => ({ valor: `usuario:${u.id}`, nombre: u.nombre, activo: true })),
    ...personas.map((p) => ({ valor: `persona:${p.id}`, nombre: p.nombre, activo: p.activo })),
  ]
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionServidor, null)
  const sucio = useMarcarSucioAlEditar(estado)
  const [tipo, setTipo] = useState<TipoSolicitud>(inicial?.tipo ?? tipoPreseleccionado ?? 'gasto_directo')
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ?? '')
  const [moneda, setMoneda] = useState(inicial?.moneda ?? 'PEN')
  const [fechaFactura, setFechaFactura] = useState(inicial?.fechaFactura ?? '')
  // Tipo de cambio: SUNAT por defecto, editable (Sebas, 2026-10-23). Si la
  // persona lo escribe a mano, ya no se pisa al cambiar la fecha. Al editar
  // una solicitud que ya lo tiene, se respeta el guardado.
  const [tipoCambio, setTipoCambio] = useState(inicial?.tipoCambio ?? '')
  const [tcAMano, setTcAMano] = useState(!!inicial?.tipoCambio)
  const [tcEstado, setTcEstado] = useState<'' | 'buscando' | 'sunat' | 'sin_dato'>('')
  const [base, setBase] = useState(inicial?.baseImponible ?? '')
  const [igv, setIgv] = useState(inicial?.igv ?? '')
  // Al editar, el IGV guardado se respeta tal cual: recalcularlo al 18%
  // porque alguien tocó la base pisaría un valor que ya estaba revisado.
  const [igvEditadoAMano, setIgvEditadoAMano] = useState(!!inicial)
  const [tipoComprobante, setTipoComprobante] = useState(inicial?.tipoComprobante ?? 'boleta')

  // La fecha que manda: la del comprobante; en un anticipo (que no tiene),
  // la de hoy en Lima.
  const fechaTc = tipo === 'anticipo' || !fechaFactura
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
    : fechaFactura
  useEffect(() => {
    if (moneda !== 'USD' || tcAMano) return
    let vigente = true
    setTcEstado('buscando')
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/tipo-cambio?fecha=${fechaTc}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vigente) return
        if (j?.venta) { setTipoCambio(String(j.venta)); setTcEstado('sunat') } else setTcEstado('sin_dato')
      })
      .catch(() => vigente && setTcEstado('sin_dato'))
    return () => { vigente = false }
  }, [moneda, fechaTc, tcAMano])

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje
  // El formulario es largo y el botón está al final: sin esto, un error de
  // servidor quedaba fuera de pantalla y parecía que el botón no hacía nada.
  useScrollAlPrimerError(estado, ID_AVISO_ERRORES)

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
    <form action={accion} onChange={sucio.onChange} onSubmit={sucio.onSubmit} className="space-y-4">
      <AvisoErrores errores={estado?.errores} />

      {/* El aviso por correo (Pieza D) necesita el nombre, no el id. */}
      <input type="hidden" name="categoriaNombre" value={categorias.find((c) => c.id === categoriaId)?.nombre ?? ''} />

      <section className="card space-y-3">
        {/* El tipo nunca se edita: cambiar un anticipo por un reembolso
            (o al revés) muta dos cosas con ciclos distintos. Para eso se
            anula y se carga de nuevo. */}
        {editando || tipoPreseleccionado ? (
          <>
            <input type="hidden" name="tipo" value={tipo} />
            <p className="text-sm text-gray-600">
              {ETIQUETA_TIPO[tipo]}
              {editando ? <span className="text-gray-400"> · el tipo no se puede cambiar</span> : null}
            </p>
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
          <select
            name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="PEN">PEN — Soles</option>
            <option value="USD">USD — Dólares</option>
          </select>
        </Campo>

        {moneda === 'USD' ? (
          <Campo etiqueta="Tipo de cambio *" error={errorDe('tipoCambio')}>
            <input
              type="number" name="tipoCambio" min="0" step="0.0001" inputMode="decimal"
              value={tipoCambio} placeholder="Ej. 3.4500"
              onChange={(e) => { setTipoCambio(e.target.value); setTcAMano(true) }}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            <p className="mt-1 text-xs text-gray-500">
              {tcEstado === 'buscando'
                ? 'Buscando el tipo de cambio SUNAT…'
                : tcEstado === 'sunat' && !tcAMano
                  ? `Tipo de cambio SUNAT (venta) del ${fechaTc.split('-').reverse().join('/')}. Puedes cambiarlo.`
                  : tcEstado === 'sin_dato' && !tcAMano
                    ? 'No se pudo traer el de SUNAT ahora — escríbelo.'
                    : 'Soles por dólar. Se paga en dólares; esto es para la contabilidad.'}
              {tcAMano ? (
                <button type="button" onClick={() => setTcAMano(false)} className="ml-1 text-logisalud-teal underline">
                  Usar el de SUNAT
                </button>
              ) : null}
            </p>
          </Campo>
        ) : null}

        <Campo etiqueta="Descripción *" error={errorDe('descripcion')}>
          <textarea name="descripcion" rows={3} defaultValue={inicial?.descripcion} className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </Campo>

        {tipo !== 'gasto_directo' ? (
          <Campo etiqueta="Quién autoriza">
            <input
              type="text" name="quienAutoriza" defaultValue={inicial?.quienAutoriza ?? sugerenciaAutoriza ?? ''}
              placeholder="Sugerido: responsable de tu área"
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            <p className="mt-1 text-xs text-gray-500">
              Solo informativo — no bloquea el envío ni le pide a esa persona que entre al
              sistema. El sistema no conoce a tu jefe directo, sugiere el responsable de tu
              área; corrígelo si no es quien corresponde aquí.
            </p>
          </Campo>
        ) : null}

        {tipo !== 'gasto_directo' ? (
          <Campo etiqueta="¿Para cuándo necesitas el dinero?">
            <input type="date" name="fechaRequerida" defaultValue={inicial?.fechaRequerida} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
            <p className="mt-1 text-xs text-gray-500">
              Opcional. Le sirve a Tesorería para priorizar el desembolso — no es un compromiso
              de pago. Si es un viaje, esto no reemplaza las fechas del viaje: normalmente
              necesitas la plata antes de salir.
            </p>
          </Campo>
        ) : null}

        {tipo === 'anticipo' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Monto del anticipo *" error={errorDe('montoAnticipo')}>
                <input type="number" name="montoAnticipo" min="0" step="0.01" defaultValue={inicial?.montoAnticipo} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
              </Campo>
              {usuarios.length > 1 || personas.length > 0 ? (
                <Campo etiqueta="Vendedor o persona asignada" grupo>
                  <BuscadorPersona name="asignado" opciones={opcionesAsignado} valorInicial={inicial?.asignado ?? ''} />
                  <p className="mt-1 text-xs text-gray-500">
                    Si estás armando el anticipo para otra persona (ej. viáticos de un vendedor),
                    elígela aquí — el pago le va a llegar a su cuenta, no a la tuya.
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
                  <input type="text" name="destino" defaultValue={inicial?.destino} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
                </Campo>
                <Campo etiqueta="Fecha de inicio del viaje">
                  <input type="date" name="fechaInicio" defaultValue={inicial?.fechaInicio} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
                </Campo>
                <Campo etiqueta="Fecha de fin del viaje" error={errorDe('fechaFin')}>
                  <input type="date" name="fechaFin" defaultValue={inicial?.fechaFin} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
                </Campo>
              </div>
            </div>

            {editando ? null : (
            <Campo etiqueta="📎 Cotización o sustento">
              <CampoArchivo
                nombre="cotizacion" accept="application/pdf,image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
              />
              <p className="mt-1 text-xs text-gray-500">
                No es una factura — es lo que sustenta el monto pedido (ej. la cotización de un
                vuelo o de un evento), si lo tienes a mano.
              </p>
            </Campo>
            )}
          </>
        ) : (
          <div className="space-y-3 rounded-md border border-gray-200 p-3">
            <p className="text-sm text-gray-600">
              Sube primero la foto o PDF de tu comprobante y después completa la base y el IGV
              tal como figuran ahí — mirando el comprobante al lado.
            </p>

            {editando ? null : (
            <Campo etiqueta="📎 Foto o PDF del comprobante">
              <CampoArchivo
                nombre="archivo" accept="application/pdf,image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
              />
              <p className="mt-1 text-xs text-gray-500">
                Va aquí cualquier comprobante válido: <strong>factura</strong>, boleta o ticket. Si
                tienes factura, esta es su casilla — no hace falta otro lugar.
              </p>
            </Campo>
            )}

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
                  type="date" name="fechaFactura" required={exigeFechaComprobante} value={fechaFactura}
                  onChange={(e) => setFechaFactura(e.target.value)}
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

      {/* El mismo aviso, otra vez, al lado del botón: es donde está la
          persona cuando aprieta Enviar. Repetirlo es a propósito. */}
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

/**
 * `grupo`: para un campo cuyo control es un buscador (combobox) y no un
 * input suelto. Va en un <div> y no en un <label> porque en el iPhone tocar
 * una opción DENTRO de un label le devuelve el foco al input y la opción no
 * se elige (reportado por Sebas en Pago Directo, 2026-10-23).
 */
function Campo({
  etiqueta, error, children, grupo = false,
}: { etiqueta: string; error?: string; children: React.ReactNode; grupo?: boolean }) {
  const Contenedor = grupo ? 'div' : 'label'
  return (
    <Contenedor className="block text-sm" {...(grupo ? { role: 'group', 'aria-label': etiqueta } : {})}>
      <span className="font-medium text-gray-800">{etiqueta}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-red-700">{error}</p> : null}
    </Contenedor>
  )
}
