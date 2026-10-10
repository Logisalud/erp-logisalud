'use client'

import { CampoVencimiento } from '../campo-vencimiento'
import { useState } from 'react'
import { CheckCircle2, Pencil, RotateCcw, TriangleAlert } from 'lucide-react'
import { ajustarSolicitudAccion, verificarLineaAccion } from '@/app/acciones-entradas'
import { textoDiferencia, type CambioEntrada } from '@/domain/entradas'
import type { LineaSolicitudVista, PosicionDestino, SolicitudDetalle } from '@/domain/entradas-vistas'
import { formatoFecha, parsearVencimiento } from '@/domain/fechas'
import { situacionRS } from '@/domain/regulatorio'
import { ChipRS } from '../chips'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'
import { ChipVerificacion } from './chips-entradas'

const aTexto = (iso: string) => iso.split('-').reverse().join('/')
const num = (n: number) => n.toLocaleString('es-PE')

/** El formulario de una diferencia (al verificar) o de un ajuste (antes de que llegue). Mismo texto, mismo historial. */
function FormCambio({ solicitud, linea, modo, posicionId, alTerminar }: { solicitud: SolicitudDetalle; linea: LineaSolicitudVista; modo: 'verificar' | 'ajustar'; posicionId?: string; alTerminar: () => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [cantidad, setCantidad] = useState(String(linea.cantidad))
  const [lote, setLote] = useState(linea.lote)
  const [vence, setVence] = useState(linea.venceTexto ?? aTexto(linea.vence))
  const [motivo, setMotivo] = useState('')
  const n = cantidad.trim() === '' ? NaN : Number(cantidad)
  const cambios: string[] = []
  if (Number.isInteger(n) && n !== linea.cantidad) cambios.push('cantidad')
  if (lote.trim() && lote.trim() !== linea.lote) cambios.push('lote')
  const f = vence.trim() ? parsearVencimiento(vence) : null
  if (f && f.fecha !== linea.vence) cambios.push('vencimiento')
  const motivoObligatorio = modo === 'verificar' || solicitud.estado !== 'BORRADOR'
  const puedeGuardar = cambios.length > 0 && Number.isInteger(n) && n >= 0 && (!motivoObligatorio || motivo.trim().length > 0) && (!vence.trim() || !!f)

  const aviso = cambios.length === 0 ? null
    : cambios.length === 1 && cambios[0] === 'cantidad' ? textoDiferencia(linea.cantidad, n)
    : `Actualizaremos la Solicitud: ${[
        cambios.includes('cantidad') ? `cantidad ${linea.cantidad} → ${n}` : '', cambios.includes('lote') ? `lote ${linea.lote} → ${lote.trim()}` : '',
        cambios.includes('vencimiento') ? `vencimiento ${formatoFecha(linea.vence)} → ${formatoFecha(f!.fecha)}` : '',
      ].filter(Boolean).join(' · ')}. El cambio quedará registrado.`

  function guardar() {
    if (modo === 'verificar') {
      ejecutar(() => verificarLineaAccion(solicitud.id, linea.id, {
        coincide: false, cantidad: cambios.includes('cantidad') ? n : undefined, lote: cambios.includes('lote') ? lote.trim() : undefined,
        vence: cambios.includes('vencimiento') ? vence : undefined, motivo, posicionId,
      }), { exito: 'Solicitud actualizada. La línea quedó verificada.', alExito: alTerminar })
    } else {
      const ops: CambioEntrada[] = []
      if (cambios.includes('cantidad')) ops.push({ op: 'LINEA', lineaId: linea.id, campo: 'cantidad', valor: String(n) })
      if (cambios.includes('lote')) ops.push({ op: 'LINEA', lineaId: linea.id, campo: 'lote', valor: lote.trim() })
      if (cambios.includes('vencimiento')) ops.push({ op: 'LINEA', lineaId: linea.id, campo: 'vence', valor: vence })
      ejecutar(() => ajustarSolicitudAccion(solicitud.id, ops, motivo || undefined), { exito: 'Solicitud ajustada. El cambio quedó en el historial.', alExito: alTerminar })
    }
  }

  const id = (c: string) => `${modo}-${linea.id}-${c}`
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3.5" data-testid={modo === 'verificar' ? 'form-diferencia' : 'form-ajuste'}>
      <p className="text-sm font-medium text-amber-950">{modo === 'verificar' ? '¿Qué encontraste distinto?' : 'Ajustar esta línea'}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label htmlFor={id('cantidad')} className="etiqueta">Cantidad {modo === 'verificar' ? 'encontrada' : ''}</label><input id={id('cantidad')} className="campo tabular" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} autoComplete="off" /></div>
        <div><label htmlFor={id('lote')} className="etiqueta">Lote</label><input id={id('lote')} className="campo" value={lote} onChange={(e) => setLote(e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor={id('vence')} className="etiqueta">Vencimiento</label><CampoVencimiento id={id('vence')} value={vence} onChange={setVence} invalido={!!vence.trim() && !f} />{vence.trim() && !f && <p role="alert" className="mt-1 text-xs text-red-700">No entiendo esa fecha. Usa 30/06/2028 o 06/2028.</p>}</div>
      </div>
      <div><label htmlFor={id('motivo')} className="etiqueta">{motivoObligatorio ? '¿Por qué cambia? (queda en el historial)' : '¿Por qué cambia? (opcional)'}</label><input id={id('motivo')} className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: la caja trae 5 unidades menos" autoComplete="off" /></div>
      {aviso && <p className="text-sm text-amber-950" data-testid="texto-diferencia"><TriangleAlert className="mr-1.5 inline h-4 w-4 align-text-bottom" aria-hidden />{aviso}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={pendiente || !puedeGuardar} onClick={guardar} data-testid="actualizar-continuar">{pendiente ? 'Guardando…' : modo === 'verificar' ? 'Actualizar y continuar' : 'Guardar el ajuste'}</button>
        <button type="button" className="btn-secondary btn-sm" onClick={alTerminar}>Cancelar</button>
      </div>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
    </div>
  )
}

function TarjetaLinea({ solicitud, linea, posiciones, hoy, verificando, ajustable }: { solicitud: SolicitudDetalle; linea: LineaSolicitudVista; posiciones: PosicionDestino[]; hoy: string; verificando: boolean; ajustable: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [panel, setPanel] = useState<'ninguno' | 'diferencia' | 'ajuste'>('ninguno')
  const [posicionId, setPosicionId] = useState(linea.posicionId ?? posiciones[0]?.id ?? '')
  const sit = situacionRS(linea.rsVence, hoy)
  const retirada = linea.cantidad === 0
  const cambio = linea.inicial != null && linea.inicial !== linea.cantidad
  const verificada = linea.verificacion === 'COINCIDE' || linea.verificacion === 'AJUSTADA'
  const mostrarVerificar = verificando && !retirada && !verificada
  const donde = posiciones.find((p) => p.id === posicionId)

  return (
    <li className={`card ${retirada ? 'opacity-70' : ''}`} data-testid="linea-solicitud" data-verificacion={linea.verificacion ?? 'ninguna'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-lg font-medium uppercase tracking-wide text-gray-900">{linea.descripcion}</h3>
          <p className="text-sm text-gray-600">{linea.codigo}{linea.registroSanitario ? ` · RS ${linea.registroSanitario}` : ''}</p>
          <p className="mt-1 text-sm text-gray-900">Lote <strong>{linea.lote}</strong> · vence {formatoFecha(linea.vence)}{linea.venceTexto ? ` (escrito ${linea.venceTexto})` : ''}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><ChipRS situacion={sit} /><ChipVerificacion v={linea.verificacion} />{linea.estadoLinea !== 'ESPERADA' && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium leading-none text-amber-900">{retirada ? 'Ya no llega' : 'Ajustada'}</span>}</div>
        </div>
        <div className="text-right" data-testid="cantidad-linea">
          <p className="tabular font-heading text-3xl font-semibold leading-none text-gray-900">{num(linea.cantidad)}</p>
          <p className="mt-1 text-xs text-gray-600">{solicitud.estado === 'EN_RECEPCION' ? 'esperamos' : solicitud.estado === 'CERRADA' ? 'recibidas' : 'unidades'}</p>
          {cambio && <p className="tabular mt-1 text-xs font-medium text-amber-900" data-testid="cambio-cantidad">inicial {num(linea.inicial!)} → final {num(linea.cantidad)}</p>}
        </div>
      </div>

      {linea.posicionCodigo && !mostrarVerificar && <p className="mt-2 text-sm text-gray-700" data-testid="posicion-linea">Se deja en <strong className="tabular">{linea.posicionCodigo}</strong></p>}

      {mostrarVerificar && panel === 'ninguno' && (
        <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3.5" data-testid="verificar-linea">
          <p className="text-sm text-gray-900">Esto es lo que esperamos: <strong className="tabular">{num(linea.cantidad)}</strong> unidades del lote <strong>{linea.lote}</strong>. Confirma lo que encontramos.</p>
          <div className="max-w-sm"><label htmlFor={`pos-${linea.id}`} className="etiqueta">Se deja en</label>
            <select id={`pos-${linea.id}`} className="campo" value={posicionId} onChange={(e) => setPosicionId(e.target.value)}>{posiciones.map((o) => <option key={o.id} value={o.id}>{o.codigo} · {o.area}</option>)}</select>
            {donde && <p className="mt-1 text-xs text-gray-600">{donde.ocupadas > 0 ? `${num(donde.ocupadas)} unidades ya guardadas ahí.` : 'Libre.'}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pendiente || !posicionId} onClick={() => ejecutar(() => verificarLineaAccion(solicitud.id, linea.id, { coincide: true, posicionId }), { exito: 'Línea verificada.' })} data-testid="coincide"><CheckCircle2 className="h-5 w-5" aria-hidden />Coincide</button>
            <button type="button" className="btn-secondary" onClick={() => setPanel('diferencia')} data-testid="hay-diferencia"><TriangleAlert className="h-5 w-5" aria-hidden />Hay una diferencia</button>
          </div>
          {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
        </div>
      )}

      {verificando && !retirada && verificada && panel === 'ninguno' && (
        <div className="mt-3"><button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-gray-800 hover:bg-gray-100" onClick={() => setPanel('diferencia')} data-testid="corregir-verificacion"><RotateCcw className="h-4 w-4" aria-hidden />Corregir lo que verifiqué</button></div>
      )}
      {panel === 'diferencia' && verificando && <FormCambio solicitud={solicitud} linea={linea} modo="verificar" posicionId={posicionId} alTerminar={() => setPanel('ninguno')} />}

      {!verificando && ajustable && !retirada && panel === 'ninguno' && (
        <div className="mt-3"><button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-gray-800 hover:bg-gray-100" onClick={() => setPanel('ajuste')} data-testid="ajustar-linea"><Pencil className="h-4 w-4" aria-hidden />Ajustar esta línea</button></div>
      )}
      {panel === 'ajuste' && <FormCambio solicitud={solicitud} linea={linea} modo="ajustar" alTerminar={() => setPanel('ninguno')} />}
    </li>
  )
}

/** Las líneas de la solicitud: lo que esperamos. Con la recepción en curso, cada una se verifica ("Coincide" o "Hay una diferencia"). */
export function LineasSolicitud({ solicitud, posiciones, hoy, puedeRecibir, puedeAjustar }: { solicitud: SolicitudDetalle; posiciones: PosicionDestino[]; hoy: string; puedeRecibir: boolean; puedeAjustar: boolean }) {
  const verificando = solicitud.estado === 'EN_RECEPCION' && !solicitud.bloqueadoPorFirmas && puedeRecibir
  const ajustable = puedeAjustar && !solicitud.bloqueadoPorFirmas && solicitud.estado !== 'CERRADA' && solicitud.estado !== 'ANULADA'
  const activas = solicitud.lineas.filter((l) => l.cantidad > 0)
  const verificadas = activas.filter((l) => l.verificacion === 'COINCIDE' || l.verificacion === 'AJUSTADA').length
  return (
    <div className="space-y-3">
      {solicitud.estado === 'EN_RECEPCION' && (
        <p className="tabular text-sm font-medium text-gray-900" data-testid="progreso-verificacion">Verificadas {verificadas} de {activas.length}{verificadas === activas.length && activas.length > 0 ? ' · ya puedes generar el acta' : ''}</p>
      )}
      <ul className="space-y-3">
        {solicitud.lineas.map((l) => <TarjetaLinea key={`${l.id}:${l.cantidad}:${l.lote}:${l.verificacion}`} solicitud={solicitud} linea={l} posiciones={posiciones} hoy={hoy} verificando={verificando} ajustable={ajustable} />)}
      </ul>
    </div>
  )
}
