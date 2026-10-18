'use client'

import { useMemo, useState } from 'react'
import { CheckCheck, Save } from 'lucide-react'
import { registrarEvaluacionBajaAccion } from '@/app/acciones-bajas'
import { CHECKLIST_ORGANOLEPTICO, sugerirConclusion, type Checklist, type Respuesta } from '@/domain/entradas'
import { MENSAJE_BAJA, faltantesEvaluacion, type EvaluacionBajaVista } from '@/domain/bajas'
import { PILDORA_ACTIVA, PILDORA_ACTIVA_ROJA, PILDORA_INACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'
import { Segmentado } from '../calidad/form-organoleptica'
import { Aviso } from '../entradas/aviso'
import { useAccion } from '../usar-accion'

/** La evaluación del deterioro o daño: el mismo checklist del acta organoléptica (LS-FR.55.02). Cada guardado es una versión nueva: la última vale. */
export function FormEvaluacionBaja({ lineaId, previa, onTerminar }: { lineaId: string; previa?: EvaluacionBajaVista; onTerminar: (texto: string) => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [checklist, setChecklist] = useState<Checklist>(previa?.checklist ?? {})
  const [cert, setCert] = useState<boolean | null>(previa?.certAnalisis ?? null)
  const [obs, setObs] = useState(previa?.observacion ?? '')
  const [conclusion, setConclusion] = useState<'CONFORME' | 'NO_CONFORME' | null>(previa?.conclusion ?? null)
  const [solo, setSolo] = useState(!previa)
  const [materiales, setMateriales] = useState<Set<string>>(() => new Set(CHECKLIST_ORGANOLEPTICO.filter((g) => g.opcional && g.items.some((i) => previa?.checklist[i.id])).map((g) => g.id)))

  const datos = { checklist, certAnalisis: cert, observacion: obs, conclusion }
  const faltan = useMemo(() => faltantesEvaluacion(datos), [checklist, cert, obs, conclusion]) // eslint-disable-line react-hooks/exhaustive-deps
  const grupos = CHECKLIST_ORGANOLEPTICO.filter((g) => !g.opcional || materiales.has(g.id))
  const opcionales = CHECKLIST_ORGANOLEPTICO.filter((g) => g.opcional)

  function responder(id: string, r: Respuesta) {
    const nuevo = { ...checklist, [id]: r }
    setChecklist(nuevo)
    if (solo) setConclusion(sugerirConclusion(nuevo))
  }
  function marcarConformes() {
    const nuevo = { ...checklist }
    for (const g of CHECKLIST_ORGANOLEPTICO) if (!g.opcional || materiales.has(g.id)) for (const i of g.items) if (!nuevo[i.id]) nuevo[i.id] = 'C'
    setChecklist(nuevo)
    if (solo) setConclusion(sugerirConclusion(nuevo))
  }
  const guardar = () => ejecutar(() => registrarEvaluacionBajaAccion(lineaId, datos), { exito: MENSAJE_BAJA.evaluacionGuardada, alExito: () => onTerminar(MENSAJE_BAJA.evaluacionGuardada) })

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-3.5" data-testid="form-evaluacion-baja">
      <p className="text-sm text-gray-800">Revisa el producto como en el acta organoléptica. Para que sustente una baja, marca <strong>No</strong> en lo que está dañado y concluye <strong>No conforme</strong>.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-700">Para cada punto marca <strong>Sí</strong>, <strong>No</strong> o <strong>N.A.</strong></p>
        <button type="button" className="btn-secondary btn-sm" onClick={marcarConformes} data-testid="eval-marcar-conformes"><CheckCheck className="h-4 w-4" aria-hidden />Marcar lo que falta como conforme</button>
      </div>
      {grupos.map((g) => (
        <section key={g.id} aria-labelledby={`eg-${lineaId}-${g.id}`} className="rounded-md border border-gray-200 bg-white p-3">
          <h4 id={`eg-${lineaId}-${g.id}`} className="font-heading text-sm font-medium uppercase tracking-wide text-gray-800">{g.titulo}</h4>
          <ul className="mt-1 divide-y divide-gray-100">
            {g.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                <span className="min-w-0 flex-1 text-sm text-gray-900">{i.texto}</span>
                <Segmentado nombre={i.texto} valor={checklist[i.id]} onCambio={(r) => responder(i.id, r)} deshabilitado={false} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <fieldset>
        <legend className="etiqueta">Material del envase</legend>
        <div className="flex flex-wrap gap-2">
          {opcionales.map((g) => {
            const on = materiales.has(g.id)
            return <button key={g.id} type="button" role="checkbox" aria-checked={on} onClick={() => setMateriales((m) => { const n = new Set(m); if (on) n.delete(g.id); else n.add(g.id); return n })} className={`min-h-11 rounded-full border px-4 text-sm font-medium transition duration-fast ${on ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`}>{g.titulo.replace('III. ', '')}</button>
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="etiqueta">Trae certificado de análisis o protocolo analítico</legend>
        <div role="radiogroup" aria-label="Trae certificado de análisis o protocolo analítico" className="flex gap-2">{[true, false].map((v) => <button key={String(v)} type="button" role="radio" aria-checked={cert === v} onClick={() => setCert(v)} className={`min-h-11 min-w-20 rounded-full border px-4 text-sm font-medium ${cert === v ? PILDORA_ACTIVA : PILDORA_INACTIVA}`}>{v ? 'Sí' : 'No'}</button>)}</div>
      </fieldset>
      <div><label htmlFor={`obs-${lineaId}`} className="etiqueta">Lo que viste (observación)</label><textarea id={`obs-${lineaId}`} rows={2} className="campo py-2" value={obs} onChange={(e) => setObs(e.target.value)} data-testid="eval-observacion" /></div>
      <fieldset>
        <legend className="etiqueta">Conclusión</legend>
        <div role="radiogroup" aria-label="Conclusión de la evaluación" className="flex flex-wrap gap-2">{([['CONFORME', 'Conforme'], ['NO_CONFORME', 'No conforme']] as const).map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={conclusion === v} onClick={() => { setConclusion(v); setSolo(false) }} data-testid={`eval-conclusion-${v}`} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${conclusion === v ? (v === 'CONFORME' ? PILDORA_ACTIVA : PILDORA_ACTIVA_ROJA) : PILDORA_INACTIVA}`}>{t}</button>)}</div>
      </fieldset>
      {faltan.length > 0 && <Aviso tipo="info" testid="eval-faltan"><p className="font-medium">Para guardar la evaluación falta:</p><ul className="mt-1 list-disc pl-5">{faltan.map((f) => <li key={f}>{f}</li>)}</ul></Aviso>}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={pendiente || faltan.length > 0} onClick={guardar} data-testid="eval-guardar"><Save className="h-5 w-5" aria-hidden />{pendiente ? 'Guardando…' : 'Guardar la evaluación'}</button>
        <button type="button" className="btn-secondary" disabled={pendiente} onClick={() => onTerminar('')}>Cancelar</button>
      </div>
    </div>
  )
}
