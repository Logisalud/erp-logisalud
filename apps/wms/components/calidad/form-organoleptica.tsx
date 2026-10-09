'use client'

import { useMemo, useState } from 'react'
import { CheckCheck, Download, Fingerprint, Send } from 'lucide-react'
import { decidirOrganolepticaAccion, guardarOrganolepticaAccion } from '@/app/acciones-entradas'
import {
  CHECKLIST_ORGANOLEPTICO, ETIQUETA_DECISION, ETIQUETA_RESPUESTA, faltantesParaEnviar, itemsNoConformes, sugerirConclusion, validarDecision,
  type Checklist, type DatosOrganoleptica, type Respuesta,
} from '@/domain/entradas'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'
import { formatoFechaHora } from '@/domain/fechas'
import { ChipEstado } from '../chips'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { SEGMENTO_CONFORME, SEGMENTO_NO_CONFORME, SEGMENTO_NO_APLICA, SEGMENTO_INACTIVO, PILDORA_ACTIVA, PILDORA_ACTIVA_ROJA, PILDORA_INACTIVA, PILDORA_INACTIVA_HOVER } from '@/components/estilos-opcion'

const RESPUESTAS: Respuesta[] = ['C', 'NC', 'NA']
const TXT: Record<Respuesta, string> = { C: 'Conforme', NC: 'No conforme', NA: 'No aplica' }

function Segmentado({ nombre, valor, onCambio, deshabilitado }: { nombre: string; valor?: Respuesta; onCambio: (r: Respuesta) => void; deshabilitado: boolean }) {
  return (
    <div role="radiogroup" aria-label={nombre} className="inline-flex shrink-0 overflow-hidden rounded-full border border-gray-300 bg-white">
      {RESPUESTAS.map((r) => {
        const on = valor === r
        const cls = on ? (r === 'C' ? SEGMENTO_CONFORME : r === 'NC' ? SEGMENTO_NO_CONFORME : SEGMENTO_NO_APLICA) : SEGMENTO_INACTIVO
        return (
          <button key={r} type="button" role="radio" aria-checked={on} disabled={deshabilitado} onClick={() => onCambio(r)}
            className={`min-h-11 min-w-12 px-3 text-xs font-semibold transition duration-fast disabled:cursor-not-allowed ${cls} ${r !== 'C' ? 'border-l border-gray-300' : ''}`}>
            <span aria-hidden>{r === 'C' ? '✓ ' : r === 'NC' ? '✕ ' : ''}{r === 'NA' ? 'N.A.' : r === 'C' ? 'Sí' : 'No'}</span><span className="sr-only">{TXT[r]}</span>
          </button>
        )
      })}
    </div>
  )
}

export function FormOrganoleptica({ acta, puedeEditar, puedeDecidir, hoy, base }: { acta: OrganolepticaVista; puedeEditar: boolean; puedeDecidir: boolean; hoy: string; base: string }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const bloqueada = acta.estado === 'FIRMADA'
  const editable = puedeEditar && !bloqueada
  const [checklist, setChecklist] = useState<Checklist>(acta.datos.checklist)
  const [cert, setCert] = useState<boolean | null>(acta.datos.certAnalisis)
  const [obs, setObs] = useState(acta.datos.observacion ?? '')
  const [destino, setDestino] = useState(acta.datos.destinoSugerido)
  const [conclusion, setConclusion] = useState(acta.datos.conclusion)
  const [concluyoSolo, setConcluyoSolo] = useState(acta.datos.conclusion == null)
  const [materiales, setMateriales] = useState<Set<string>>(() => new Set(CHECKLIST_ORGANOLEPTICO.filter((g) => g.opcional && g.items.some((i) => acta.datos.checklist[i.id])).map((g) => g.id)))
  const [obsDt, setObsDt] = useState('')

  const datos: DatosOrganoleptica = { certAnalisis: cert, checklist, observacion: obs, destinoSugerido: destino, conclusion }
  const faltan = useMemo(() => faltantesParaEnviar(datos), [checklist, cert, destino, conclusion]) // eslint-disable-line react-hooks/exhaustive-deps
  const noConformes = itemsNoConformes(checklist)
  const rsVencido = !!acta.rsVence && acta.rsVence < hoy
  const rotaAprobar = validarDecision('APROBADO', conclusion, acta.rsVence, hoy)

  function responder(id: string, r: Respuesta) {
    const nuevo = { ...checklist, [id]: r }
    setChecklist(nuevo)
    if (concluyoSolo) setConclusion(sugerirConclusion(nuevo))
  }
  function marcarConformes() {
    const nuevo = { ...checklist }
    for (const g of CHECKLIST_ORGANOLEPTICO) if (!g.opcional || materiales.has(g.id)) for (const i of g.items) if (!nuevo[i.id]) nuevo[i.id] = 'C'
    setChecklist(nuevo)
    if (concluyoSolo) setConclusion(sugerirConclusion(nuevo))
  }
  const guardar = (enviar: boolean) => ejecutar(() => guardarOrganolepticaAccion(acta.id, { certAnalisis: cert, checklist, observacion: obs, destinoSugerido: destino, conclusion }, enviar),
    { exito: enviar ? 'Enviada a Dirección Técnica.' : 'Borrador guardado.' })

  const grupos = CHECKLIST_ORGANOLEPTICO.filter((g) => !g.opcional || materiales.has(g.id) || bloqueada)
  const opcionales = CHECKLIST_ORGANOLEPTICO.filter((g) => g.opcional)

  return (
    <div className="space-y-6">
      <section className="card" aria-labelledby="datos-producto">
        <h2 id="datos-producto" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">I. El producto</h2>
        <dl className="mt-2 grid gap-x-8 divide-y divide-gray-100 text-sm sm:grid-cols-2 sm:divide-y-0">
          {[
            ['Producto', acta.producto], ['Nombre genérico', acta.principioActivo], ['Lote', acta.lote], ['Vence', acta.vence ? new Date(`${acta.vence}T00:00:00Z`).toLocaleDateString('es-PE', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : undefined],
            ['Registro sanitario', acta.registroSanitario], ['Vence el registro', acta.rsVence], ['Fabricante', acta.fabricante], ['Forma de presentación', acta.formaPresentacion],
            ['Propietario', acta.propietario], ['Referencia', acta.referencia], ['Cantidad del lote', `${acta.cantidadLote.toLocaleString('es-PE')} unidades`],
          ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-gray-600">{k}</dt><dd className="text-right text-gray-900">{v || '—'}</dd></div>)}
        </dl>
        <p className="mt-3 rounded-md bg-teal-50 p-3 text-sm text-teal-950" data-testid="muestra"><strong>Toma {acta.cantidadMuestra} unidades de muestra.</strong> Es el techo de la raíz de {acta.cantidadLote.toLocaleString('es-PE')} más 1. La muestra vuelve completa a su caja: no descuenta stock.</p>
        {rsVencido && <div className="mt-3"><Aviso tipo="error" testid="aviso-rs-vencido"><strong>El registro sanitario está vencido.</strong> Este lote se puede rechazar, pero no aprobar, hasta que Dirección Técnica resuelva el registro.</Aviso></div>}
      </section>

      {!bloqueada && editable && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-700">Para cada punto marca <strong>Sí</strong> (conforme), <strong>No</strong> (no conforme) o <strong>N.A.</strong></p>
          <button type="button" className="btn-secondary btn-sm" onClick={marcarConformes} data-testid="marcar-conformes"><CheckCheck className="h-4 w-4" aria-hidden />Marcar lo que falta como conforme</button>
        </div>
      )}

      {grupos.map((g) => (
        <section key={g.id} className="card" aria-labelledby={`g-${g.id}`} data-testid={`grupo-${g.id}`}>
          <h2 id={`g-${g.id}`} className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">{g.titulo}</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {g.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                <span className="min-w-0 flex-1 text-sm text-gray-900">{i.texto}</span>
                {editable ? <Segmentado nombre={i.texto} valor={checklist[i.id]} onCambio={(r) => responder(i.id, r)} deshabilitado={false} />
                  : <span className="text-sm font-medium text-gray-900">{checklist[i.id] ? ETIQUETA_RESPUESTA[checklist[i.id]] : '—'}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editable && (
        <fieldset className="card">
          <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">III. Material del envase</legend>
          <p className="text-sm text-gray-600">Marca los materiales que tiene el producto; aparece su checklist.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {opcionales.map((g) => {
              const on = materiales.has(g.id)
              return <button key={g.id} type="button" role="checkbox" aria-checked={on} onClick={() => setMateriales((m) => { const n = new Set(m); if (on) n.delete(g.id); else n.add(g.id); return n })} className={`min-h-11 rounded-full border px-4 text-sm font-medium transition duration-fast ${on ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`}>{g.titulo.replace('III. ', '')}</button>
            })}
          </div>
        </fieldset>
      )}

      <section className="card space-y-5" aria-labelledby="cierre">
        <h2 id="cierre" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Cierre del acta</h2>
        <fieldset>
          <legend className="etiqueta">Trae certificado de análisis o protocolo analítico</legend>
          <div role="radiogroup" className="flex gap-2">{[true, false].map((v) => <button key={String(v)} type="button" role="radio" aria-checked={cert === v} disabled={!editable} onClick={() => setCert(v)} className={`min-h-11 min-w-20 rounded-full border px-4 text-sm font-medium ${cert === v ? PILDORA_ACTIVA : PILDORA_INACTIVA} disabled:cursor-not-allowed`}>{v ? 'Sí' : 'No'}</button>)}</div>
        </fieldset>
        <div><label htmlFor="obs-org" className="etiqueta">Observación</label><textarea id="obs-org" rows={2} className="campo py-2" value={obs} disabled={!editable} onChange={(e) => setObs(e.target.value)} /></div>
        <fieldset>
          <legend className="etiqueta">Destino que sugieres</legend>
          <div role="radiogroup" className="flex flex-wrap gap-2">{([['APROBADO', 'Aprobado'], ['DEVOLUCION', 'Devolución'], ['BAJA', 'Baja']] as const).map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={destino === v} disabled={!editable} onClick={() => setDestino(v)} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${destino === v ? PILDORA_ACTIVA : PILDORA_INACTIVA} disabled:cursor-not-allowed`}>{t}</button>)}</div>
        </fieldset>
        <fieldset>
          <legend className="etiqueta">Conclusión</legend>
          <div role="radiogroup" className="flex flex-wrap gap-2">{([['CONFORME', 'Conforme'], ['NO_CONFORME', 'No conforme']] as const).map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={conclusion === v} disabled={!editable} onClick={() => { setConclusion(v); setConcluyoSolo(false) }} data-testid={`conclusion-${v}`} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${conclusion === v ? (v === 'CONFORME' ? PILDORA_ACTIVA : PILDORA_ACTIVA_ROJA) : PILDORA_INACTIVA} disabled:cursor-not-allowed`}>{t}</button>)}</div>
          {noConformes.length > 0 && editable && <p className="mt-2 text-sm text-red-800">Marcaste como no conforme: {noConformes.slice(0, 3).join('; ')}{noConformes.length > 3 ? ` y ${noConformes.length - 3} más` : ''}.</p>}
        </fieldset>
        {acta.estado !== 'FIRMADA' && editable && (
          <div className="space-y-3 border-t border-gray-200 pt-4">
            {faltan.length > 0 && <Aviso tipo="info" testid="faltan-enviar"><p className="font-medium">Para enviarla a Dirección Técnica falta:</p><ul className="mt-1 list-disc pl-5">{faltan.map((f) => <li key={f}>{f}</li>)}</ul></Aviso>}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-secondary" disabled={pendiente} onClick={() => guardar(false)} data-testid="guardar-borrador">Guardar borrador</button>
              {acta.estado === 'BORRADOR' && <button type="button" className="btn-primary" disabled={pendiente || faltan.length > 0} onClick={() => guardar(true)} data-testid="enviar-dt"><Send className="h-5 w-5" aria-hidden />Enviar a Dirección Técnica</button>}
              {acta.estado === 'PENDIENTE_DT' && <span className="inline-flex items-center text-sm text-amber-900">Ya está en la cola de Dirección Técnica; puedes seguir corrigiéndola.</span>}
            </div>
          </div>
        )}
      </section>

      {acta.estado === 'PENDIENTE_DT' && puedeDecidir && (
        <section className="card border-2 border-logisalud-teal" aria-labelledby="decision" data-testid="panel-decision">
          <h2 id="decision" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Decisión de Dirección Técnica</h2>
          <p className="mt-1 text-sm text-gray-700">Al firmar, las {acta.cantidadLote.toLocaleString('es-PE')} unidades de este lote cambian de estado en su lugar y quedan por trasladar. Aprobado nunca vuelve a Cuarentena.</p>
          <div className="mt-3"><label htmlFor="obs-dt" className="etiqueta">Observación (obligatoria si rechazas)</label><input id="obs-dt" className="campo" value={obsDt} onChange={(e) => setObsDt(e.target.value)} autoComplete="off" /></div>
          {!rotaAprobar.ok && <div className="mt-3"><Aviso tipo="atencion" testid="motivo-no-aprobar">{rotaAprobar.mensaje}</Aviso></div>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" disabled={pendiente || !rotaAprobar.ok} onClick={() => ejecutar(() => decidirOrganolepticaAccion(acta.id, 'APROBADO', obsDt || undefined), { exito: 'Acta firmada: el lote quedó Aprobado.' })} data-testid="aprobar">Aprobar y firmar</button>
            <button type="button" className="btn-secondary" disabled={pendiente} onClick={() => ejecutar(() => decidirOrganolepticaAccion(acta.id, 'BAJAS_RECHAZADOS', obsDt || undefined), { exito: 'Acta firmada: el lote pasó a Bajas/Rechazados.' })} data-testid="rechazar">Enviar a Bajas/Rechazados y firmar</button>
          </div>
        </section>
      )}

      {bloqueada && acta.decision && (
        <section className="card" aria-labelledby="resultado" data-testid="resultado-acta">
          <h2 id="resultado" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Acta firmada</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-gray-900">Decisión: <ChipEstado estado={acta.decision} /> <span className="text-sm text-gray-600">{ETIQUETA_DECISION[acta.decision]} · {acta.decididoPor} · {formatoFechaHora(acta.decididoEn)}</span></p>
          {acta.observacionDt && <p className="mt-1 text-sm text-gray-700">Observación: {acta.observacionDt}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-600"><Fingerprint className="h-3.5 w-3.5" aria-hidden />Huella <code className="tabular">{acta.hash?.slice(0, 12)}…</code></p>
          <p className="mt-3 text-xs text-gray-600">Un acta firmada no se edita ni se anula: lo que decidió ya cambió el estado del lote. Si hace falta corregirlo, se hace un nuevo cambio de estado hacia Bajas/Rechazados con su sustento.</p>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-2" aria-label="Descargar el acta">
        <a className="btn-secondary btn-sm" href={`${base}/pdf`} target="_blank" rel="noopener" data-testid="pdf-organoleptica"><Download className="h-4 w-4" aria-hidden />Ver el PDF</a>
        <a className="btn-secondary btn-sm" href={`${base}/xlsx`} download data-testid="xlsx-organoleptica"><Download className="h-4 w-4" aria-hidden />Descargar Excel</a>
        {!bloqueada && <span className="text-xs text-gray-600">Mientras no esté firmada, el documento sale marcado como borrador.</span>}
      </section>

      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}
