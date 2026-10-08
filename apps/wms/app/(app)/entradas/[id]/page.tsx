import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, FolderOpen, ShieldAlert } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puede } from '@/domain/permisos'
import { ETIQUETA_TIPO_INGRESO, puedeGenerarActa } from '@/domain/entradas'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { ChipEstado } from '@/components/chips'
import { Aviso } from '@/components/entradas/aviso'
import { ChipActa, ChipAlerta, ChipPaso, ChipTipoIngreso } from '@/components/entradas/chips-entradas'
import { DatosRecepcion } from '@/components/entradas/datos-recepcion'
import { EditorLotes } from '@/components/entradas/editor-lotes'
import { PanelActa } from '@/components/entradas/panel-acta'
import { Solicitud } from '@/components/entradas/solicitud'

export const metadata = { title: 'Ingreso — WMS LOGISALUD' }

const PASOS = [
  { id: 'DATOS_Y_LOTES', t: 'Lotes y datos' },
  { id: 'FIRMAS', t: 'Acta y firmas' },
  { id: 'CONFIRMAR', t: 'Confirmar' },
  { id: 'CONFIRMADO', t: 'Calidad' },
] as const

export default async function DetalleIngreso({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const id = decodeURIComponent(params.id)
  const [ing, posiciones, panorama] = await Promise.all([repo.obtenerIngreso(id), repo.posicionesDeCuarentena(), repo.panorama()])
  if (!ing) notFound()

  const puedeEjecutar = puede(ctx.roles, 'ejecutar')
  const editable = !ing.confirmado && !ing.bloqueadoPorFirmas && puedeEjecutar
  const motivoSinActa = puedeGenerarActa({ cuadra: ing.cuadra, tieneTemperatura: ing.temperaturaC != null, tipo: ing.tipo, tieneDocOriginal: !!ing.docOriginalNumero })
  const titulo = ing.tipo === 'COMPRA_LOCAL' ? `${ing.ocCodigo}` : ing.tipo === 'DEVOLUCION' ? `Devolución · ${ing.propietario}` : `Ingreso de ${ing.propietario}`
  const prefijo = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  const idxPaso = ing.paso === 'DATOS_Y_LOTES' || ing.paso === 'ACTA' ? 0 : ing.paso === 'FIRMAS' ? 1 : ing.paso === 'CONFIRMAR' ? 2 : 3
  const alertasAbiertas = ing.alertas.filter((a) => a.estado === 'ABIERTA')
  const referencia = ing.tipo === 'COMPRA_LOCAL' ? ing.contraparteNombre : ing.tipo === 'DEVOLUCION' ? `${ing.docOriginalTipo === 'BOLETA' ? 'Boleta' : 'Factura'} original ${ing.docOriginalNumero}` : `Guía ${ing.guiaNumero}`

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/entradas" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Entradas</Link>

      <header>
        <div className="flex flex-wrap items-center gap-2"><ChipTipoIngreso tipo={ing.tipo} /><ChipPaso paso={ing.paso} /></div>
        <h1 className="mt-2 font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900" data-testid="titulo-ingreso">{titulo}</h1>
        <p className="mt-1 text-gray-700">{ETIQUETA_TIPO_INGRESO[ing.tipo]} · propietario <strong>{ing.propietario}</strong>{referencia ? ` · ${referencia}` : ''}</p>
        <p className="text-sm text-gray-600">Registrado el {formatoFechaHora(ing.creadoEn)}{ing.creadoPor ? ` por ${ing.creadoPor}` : ''}{ing.guiaNumero && ing.tipo === 'COMPRA_LOCAL' ? ` · guía ${ing.guiaNumero}` : ''}</p>
      </header>

      <ol className="grid grid-cols-4 gap-2" aria-label="Avance del ingreso">
        {PASOS.map((p, i) => (
          <li key={p.id} aria-current={i === idxPaso ? 'step' : undefined} className={`rounded-md border-t-4 px-2 pb-1 pt-2 text-xs font-medium sm:text-sm ${i < idxPaso ? 'border-logisalud-green text-green-900' : i === idxPaso ? 'border-logisalud-teal text-gray-900' : 'border-gray-200 text-gray-500'}`}>
            <span className="tabular text-[11px] text-gray-500">{i + 1}</span> {p.t}
          </li>
        ))}
      </ol>

      {alertasAbiertas.length > 0 && (
        <section aria-label="Alertas de este ingreso" className="space-y-2" data-testid="alertas-ingreso">
          {alertasAbiertas.map((a) => <Aviso key={a.id} tipo="atencion"><span className="mb-1 flex"><ChipAlerta tipo={a.tipo} /></span>{a.mensaje}</Aviso>)}
          <Link href="/alertas" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-800 underline">Ver todas las alertas <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </section>
      )}

      <section aria-labelledby="lotes">
        <h2 id="lotes" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Lotes</h2>
        <p className="mb-3 text-sm text-gray-600">Reparte cada producto en los lotes que trae. La suma tiene que ser exactamente la cantidad de referencia.</p>
        <div className="space-y-4">
          {ing.lineas.map((l) => <EditorLotes key={l.id} ingresoId={ing.id} linea={l} posiciones={posiciones} editable={editable} hoy={panorama.hoy} />)}
        </div>
      </section>

      <section className="card" aria-labelledby="datos">
        <h2 id="datos" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Datos de la recepción</h2>
        <p className="text-sm text-gray-600">Lo que Compras no sabe: temperatura, bultos, vehículo y verificaciones. Van en el acta.</p>
        <DatosRecepcion ingreso={ing} editable={editable} hoy={panorama.hoy} />
      </section>

      <section className="card" aria-labelledby="acta">
        <h2 id="acta" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Acta de Recepción</h2>
        <PanelActa ingreso={ing} roles={ctx.roles} motivoSinActa={motivoSinActa} base={`${prefijo}/entradas/${ing.id}`} />
      </section>

      {ing.confirmado && (
        <section className="card" aria-labelledby="calidad">
          <h2 id="calidad" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Evaluación organoléptica</h2>
          <p className="text-sm text-gray-600">Una acta por producto y lote. La llena Sandra; Katia decide Aprobado o Bajas/Rechazados.</p>
          <ul className="mt-3 divide-y divide-gray-100" data-testid="lista-organolepticas">
            {ing.organolepticas.map((o) => (
              <li key={o.id}>
                <Link href={`/calidad/${o.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:bg-gray-50">
                  <span className="min-w-0"><span className="block truncate font-medium text-gray-900">{o.producto}</span><span className="block text-sm text-gray-600">Lote {o.lote} · vence {formatoFecha(o.vence)} · {o.cantidadLote.toLocaleString('es-PE')} und. · muestra de {o.cantidadMuestra}</span></span>
                  <span className="flex items-center gap-2">{o.decision ? <ChipEstado estado={o.decision} /> : <ChipActa estado={o.estado === 'PENDIENTE_DT' ? 'PENDIENTE_DT' : 'BORRADOR'} />}<ArrowRight className="h-4 w-4 text-gray-400" aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>
          {ing.organolepticas.some((o) => (o.rsVence ?? '9999') < panorama.hoy && !o.decision) && (
            <div className="mt-3"><Aviso tipo="atencion"><span className="flex items-center gap-1.5 font-medium"><ShieldAlert className="h-4 w-4" aria-hidden />Hay un registro sanitario vencido</span>Ese lote se puede rechazar, pero no aprobar, hasta que Dirección Técnica resuelva el registro.</Aviso></div>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="solicitud">
        <h2 id="solicitud" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Solicitud de Ingreso</h2>
        <Solicitud ingreso={ing} puedeEditar={puedeEjecutar} />
      </section>

      {ing.expedienteId && (
        <Link href={`/expedientes/${ing.expedienteId}`} className="btn-secondary" data-testid="ver-expediente"><FolderOpen className="h-5 w-5" aria-hidden />Ver el expediente de {ing.ocCodigo ?? 'este ingreso'}</Link>
      )}
    </div>
  )
}
