import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Download, FolderOpen, ShieldAlert } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puede } from '@/domain/permisos'
import { ETIQUETA_TIPO_INGRESO, puedeGenerarActa, puedePrepararSolicitud } from '@/domain/entradas'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { ChipEstado } from '@/components/chips'
import { AccionesSolicitud } from '@/components/entradas/acciones-solicitud'
import { Aviso } from '@/components/entradas/aviso'
import { BloqueCantidadFisica } from '@/components/entradas/bloque-fisico'
import { TablaCantidades } from '@/components/entradas/cantidades'
import { ChipActa, ChipAlerta, ChipPaso, ChipTipoIngreso } from '@/components/entradas/chips-entradas'
import { DatosRecepcion } from '@/components/entradas/datos-recepcion'
import { HistorialSolicitud } from '@/components/entradas/historial-solicitud'
import { LineasSolicitud } from '@/components/entradas/lineas-solicitud'
import { PanelActa } from '@/components/entradas/panel-acta'

export const metadata = { title: 'Solicitud de ingreso — WMS LOGISALUD' }

const PASOS = [
  { id: 'solicitud', t: 'Solicitud' },
  { id: 'recepcion', t: 'Recepción' },
  { id: 'firmas', t: 'Acta y firmas' },
  { id: 'calidad', t: 'Calidad' },
] as const

export default async function DetalleSolicitud({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const id = decodeURIComponent(params.id)
  const sol = await repo.obtenerSolicitud(id)
  if (!sol) notFound()
  const [posiciones, panorama] = await Promise.all([repo.posicionesDestino(sol.tipo), repo.panorama()])

  const puedeRecibir = puede(ctx.roles, 'ejecutar')
  const puedePreparar = puedePrepararSolicitud(ctx.roles)
  const enRecepcion = sol.estado === 'EN_RECEPCION'
  const editableRecepcion = enRecepcion && !sol.bloqueadoPorFirmas && puedeRecibir
  // Ajustar: antes de autorizar lo prepara Dirección Técnica o Sandra; ya programada, también el almacén.
  const puedeAjustar = sol.estado === 'BORRADOR' || sol.estado === 'ENVIADA' ? puedePreparar : puedePreparar || puedeRecibir
  const motivoSinActa = enRecepcion ? puedeGenerarActa({
    tipo: sol.tipo, tieneDocOriginal: !!sol.docOriginalNumero, tieneTemperatura: sol.recepcion?.temperaturaC != null,
    lineas: sol.lineas.filter((l) => l.cantidad > 0).map((l) => ({ descripcion: l.descripcion, lote: l.lote, verificacion: l.verificacion, tienePosicion: !!l.posicionId })),
  }) : null
  const titulo = sol.numero
  const prefijo = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  const idxPaso = sol.estado === 'CERRADA' ? 3 : sol.paso === 'FIRMAS' || sol.paso === 'CONFIRMAR' ? 2 : enRecepcion ? 1 : 0
  const alertasAbiertas = sol.alertas.filter((a) => a.estado === 'ABIERTA')
  const referencia = sol.tipo === 'COMPRA_LOCAL' ? sol.ocCodigo : sol.tipo === 'DEVOLUCION' ? `${sol.docOriginalTipo === 'BOLETA' ? 'Boleta' : 'Factura'} original ${sol.docOriginalNumero}` : sol.guiaNumero ? `Guía ${sol.guiaNumero}` : undefined
  const destino = sol.estadoInicial === 'DEVOLUCIONES' ? 'Devoluciones' : 'Cuarentena'

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/entradas" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Entradas</Link>

      <header>
        <div className="flex flex-wrap items-center gap-2"><ChipTipoIngreso tipo={sol.tipo} /><ChipPaso paso={sol.paso} tipo={sol.tipo} /></div>
        <h1 className="tabular mt-2 font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900" data-testid="titulo-solicitud">{titulo}</h1>
        <p className="mt-1 text-gray-700">{ETIQUETA_TIPO_INGRESO[sol.tipo]} · propietario <strong>{sol.propietario}</strong>{referencia ? ` · ${referencia}` : ''}{sol.contraparteNombre ? ` · ${sol.contraparteNombre}` : ''}</p>
        <p className="text-sm text-gray-600">Preparada el {formatoFechaHora(sol.creadoEn)}{sol.creadoPor ? ` por ${sol.creadoPor}` : ''}{sol.guiaNumero && sol.tipo === 'COMPRA_LOCAL' ? ` · guía ${sol.guiaNumero}` : ''}{sol.fechaPrevista ? ` · llega el ${formatoFecha(sol.fechaPrevista)}` : ''}</p>
        <a className="btn-secondary btn-sm mt-2" href={`/entradas/${sol.id}/pdf`} target="_blank" rel="noopener" data-testid="pdf-solicitud"><Download className="h-4 w-4" aria-hidden />Ver la solicitud en PDF</a>
        {sol.tipo === 'DEVOLUCION' && <p className="mt-1 text-sm text-gray-700">Se deja en el Área de Devoluciones y no pasa por Cuarentena: su acta organoléptica decide si va a Aprobado o a Bajas/Rechazados.</p>}
      </header>

      <ol className="grid grid-cols-4 gap-2" aria-label="Avance del ingreso">
        {PASOS.map((p, i) => (
          <li key={p.id} aria-current={i === idxPaso ? 'step' : undefined} className={`border-t-4 px-2 pb-1 pt-2 text-xs font-medium sm:text-sm ${i < idxPaso ? 'border-logisalud-green text-green-900' : i === idxPaso ? 'border-logisalud-teal text-gray-900' : 'border-gray-200 text-gray-500'}`}>
            <span className="tabular text-[11px] text-gray-500">{i + 1}</span> {p.t}
          </li>
        ))}
      </ol>

      {sol.estado === 'CERRADA' && sol.tipo === 'COMPRA_LOCAL' && <BloqueCantidadFisica bloques={sol.cantidadFisica} ocId={sol.ocId} ocCodigo={sol.ocCodigo} solicitudNumero={sol.numero} />}

      {alertasAbiertas.length > 0 && (
        <section aria-label="Alertas de esta solicitud" className="space-y-2" data-testid="alertas-ingreso">
          {alertasAbiertas.map((a) => <Aviso key={a.id} tipo="atencion"><span className="mb-1 flex"><ChipAlerta tipo={a.tipo} /></span>{a.mensaje}</Aviso>)}
          <Link href="/alertas" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-800 underline">Ver todas las alertas <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </section>
      )}

      <AccionesSolicitud solicitud={sol} puedePreparar={puedePreparar} puedeRecibir={puedeRecibir} />

      <section aria-labelledby="lineas">
        <h2 id="lineas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">{enRecepcion ? 'Verifica lo que llegó' : 'Lo que se espera'}</h2>
        <p className="mb-3 text-sm text-gray-600">
          {enRecepcion ? 'La solicitud dice qué esperamos. Confirma cada línea: si coincide, sigue; si hay una diferencia, la solicitud se actualiza con su motivo y queda el historial.'
            : sol.estado === 'CERRADA' ? 'Lo recibido, línea por línea.' : 'Producto, lote, vencimiento y cantidad anunciados. Sin inventario todavía.'}
        </p>
        <LineasSolicitud solicitud={sol} posiciones={posiciones} hoy={panorama.hoy} puedeRecibir={puedeRecibir} puedeAjustar={puedeAjustar} />
      </section>

      {sol.recepcion && (
        <section className="card" aria-labelledby="datos">
          <h2 id="datos" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Datos de la recepción</h2>
          <p className="text-sm text-gray-600">Lo que solo se sabe al recibir: temperatura, bultos, vehículo y verificaciones. Van en el acta.</p>
          <DatosRecepcion solicitud={sol} editable={editableRecepcion} hoy={panorama.hoy} />
        </section>
      )}

      {sol.recepcion && (
        <section className="card" aria-labelledby="acta">
          <h2 id="acta" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Acta de Recepción</h2>
          <PanelActa solicitud={sol} roles={ctx.roles} motivoSinActa={motivoSinActa} base={`${prefijo}/entradas/${sol.id}`} />
        </section>
      )}

      {sol.estado === 'CERRADA' && (
        <section className="card" aria-labelledby="calidad">
          <h2 id="calidad" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Evaluación organoléptica</h2>
          <p className="text-sm text-gray-600">Una acta por producto y lote. La llena Sandra; Katia decide Aprobado o Bajas/Rechazados. Mientras tanto, las unidades esperan en {destino}.</p>
          <ul className="mt-3 divide-y divide-gray-100" data-testid="lista-organolepticas">
            {sol.organolepticas.map((o) => (
              <li key={o.id}>
                <Link href={`/calidad/${o.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:bg-gray-50">
                  <span className="min-w-0"><span className="block truncate font-medium text-gray-900">{o.producto}</span><span className="block text-sm text-gray-600">Lote {o.lote} · vence {formatoFecha(o.vence)} · {o.cantidadLote.toLocaleString('es-PE')} und. · muestra de {o.cantidadMuestra}</span></span>
                  <span className="flex items-center gap-2">{o.decision ? <ChipEstado estado={o.decision} /> : <ChipActa estado={o.estado === 'PENDIENTE_DT' ? 'PENDIENTE_DT' : 'BORRADOR'} />}<ArrowRight className="h-4 w-4 text-gray-400" aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>
          {sol.organolepticas.some((o) => (o.rsVence ?? '9999') < panorama.hoy && !o.decision) && (
            <div className="mt-3"><Aviso tipo="atencion"><span className="flex items-center gap-1.5 font-medium"><ShieldAlert className="h-4 w-4" aria-hidden />Hay un registro sanitario vencido</span>Ese lote se puede rechazar, pero no aprobar, hasta que Dirección Técnica resuelva el registro.</Aviso></div>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="cantidades">
        <h2 id="cantidades" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Las cantidades</h2>
        <div className="mt-3"><TablaCantidades solicitud={sol} /></div>
      </section>

      <section className="card" aria-labelledby="solicitud">
        <h2 id="solicitud" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Historial de la solicitud</h2>
        <HistorialSolicitud solicitud={sol} puedeEditar={puedeAjustar} />
      </section>

      {sol.expedienteId && (
        <Link href={`/expedientes/${sol.expedienteId}`} className="btn-secondary" data-testid="ver-expediente"><FolderOpen className="h-5 w-5" aria-hidden />Ver el expediente de {sol.ocCodigo ?? sol.numero}</Link>
      )}
    </div>
  )
}
