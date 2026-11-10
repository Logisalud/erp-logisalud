'use client'

import { useId, useState, type FormEvent } from 'react'
import { CheckCircle2, Clock, FileSearch, Info, Thermometer, TriangleAlert, Upload } from 'lucide-react'
import { importarLoggerAccion } from '@/app/acciones-rutas'
import {
  AYUDA_TEMPERATURA_RUTA, mensajesDeImportacion, momentoCorto, temperaturaTexto, type LecturaLogger, type LecturasLoggerVista, type ResumenLeido,
} from '@/domain/data-logger'
import { formatoFechaHora } from '@/domain/fechas'
import { Aviso } from '../entradas/aviso'
import { useAccion } from '../usar-accion'

const chip = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const CHIP_OK = 'border-green-200 bg-green-50 text-green-800'
const CHIP_ROJO = 'border-red-300 bg-red-50 text-red-900'
const CHIP_AVISO = 'border-amber-300 bg-amber-50 text-amber-900'
const CHIP_NEUTRO = 'border-gray-300 bg-gray-50 text-gray-700'

const coma = (n: number) => String(n).replace('.', ',')
const dia = (m: string) => `${m.slice(8, 10)}/${m.slice(5, 7)}/${m.slice(0, 4)}`
const hora = (m: string) => m.slice(11, 16)

/**
 * La temperatura de la ruta en una línea: el eje va de la mínima a la máxima (con el límite siempre a la vista) y los puntos sobre el límite se marcan con un círculo.
 * Es un apoyo visual: lo importante está escrito al lado (mínima, máxima y cuánto tiempo pasó el límite).
 */
export function GraficoLecturas({ lecturas, limite }: { lecturas: readonly LecturaLogger[]; limite: number }) {
  if (lecturas.length < 2) return null
  const W = 640, H = 170, ml = 44, mr = 12, mt = 12, mb = 28
  const t0 = Date.parse(`${lecturas[0].momento}Z`); const t1 = Date.parse(`${lecturas[lecturas.length - 1].momento}Z`)
  const temps = lecturas.map((l) => l.temperatura)
  const lo = Math.floor(Math.min(...temps, limite - 3)) - 1; const hi = Math.ceil(Math.max(...temps, limite)) + 1
  const x = (m: string) => ml + ((Date.parse(`${m}Z`) - t0) / Math.max(1, t1 - t0)) * (W - ml - mr)
  const y = (c: number) => mt + (1 - (c - lo) / (hi - lo)) * (H - mt - mb)
  const linea = lecturas.map((l) => `${x(l.momento).toFixed(1)},${y(l.temperatura).toFixed(1)}`).join(' ')
  const sobre = lecturas.filter((l) => l.temperatura > limite)
  const marcas = Array.from({ length: 4 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 3))
  return (
    <figure className="min-w-0" data-testid="grafico-lecturas">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-2xl" role="img" aria-label={`Temperatura de la ruta de ${temperaturaTexto(Math.min(...temps))} a ${temperaturaTexto(Math.max(...temps))}; límite ${temperaturaTexto(limite)}; ${sobre.length} ${sobre.length === 1 ? 'lectura sobre el límite' : 'lecturas sobre el límite'}`}>
        {marcas.map((c) => (
          <g key={c}><line x1={ml} x2={W - mr} y1={y(c)} y2={y(c)} stroke="#E5E7EB" strokeWidth="1" /><text x={ml - 6} y={y(c) + 4} textAnchor="end" fontSize="11" fill="#4B5563">{c}°</text></g>
        ))}
        <line x1={ml} x2={W - mr} y1={y(limite)} y2={y(limite)} stroke="#B91C1C" strokeWidth="1.5" strokeDasharray="6 4" />
        <text x={W - mr} y={y(limite) - 5} textAnchor="end" fontSize="11" fontWeight="600" fill="#991B1B">Límite {coma(limite)} °C</text>
        <polyline points={linea} fill="none" stroke="#2F7644" strokeWidth="2" strokeLinejoin="round" />
        {sobre.map((l) => <circle key={l.momento} cx={x(l.momento)} cy={y(l.temperatura)} r="4" fill="#fff" stroke="#B91C1C" strokeWidth="2" />)}
        <text x={ml} y={H - 8} fontSize="11" fill="#4B5563">{dia(lecturas[0].momento).slice(0, 5)} {hora(lecturas[0].momento)}</text>
        <text x={W - mr} y={H - 8} textAnchor="end" fontSize="11" fill="#4B5563">{dia(lecturas[lecturas.length - 1].momento).slice(0, 5)} {hora(lecturas[lecturas.length - 1].momento)}</text>
      </svg>
    </figure>
  )
}

/** Lo que se leyó del archivo, antes de cerrar la ruta (y de guardar nada). */
export function ResumenLecturaLeida({ resumen }: { resumen: ResumenLeido }) {
  const e = resumen.estadisticas
  return (
    <div className="space-y-2" data-testid="logger-leido">
      <Aviso tipo={e.excede ? 'atencion' : 'ok'} testid={e.excede ? 'logger-leido-excede' : 'logger-leido-ok'}>
        <p>
          Leímos <strong className="font-medium">{e.puntos.toLocaleString('es-PE')} lecturas</strong> del {dia(e.primera)} {hora(e.primera)} al {dia(e.ultima)} {hora(e.ultima)}
          {resumen.intervaloMin ? `, una cada ${resumen.intervaloMin} min` : ''}. Mínima <strong className="tabular font-medium">{temperaturaTexto(e.min)}</strong>, máxima <strong className="tabular font-medium">{temperaturaTexto(e.max)}</strong>.
        </p>
        {e.excede
          ? <p className="mt-1" data-testid="logger-leido-aviso">Ojo: {e.sobreLimite} {e.sobreLimite === 1 ? 'lectura pasa' : 'lecturas pasan'} el límite de {temperaturaTexto(e.limite)}; la más alta fue a las {hora(e.momentoMaxima)} y estuvo {e.minutosSobreLimite} min por encima. Al cerrar la ruta avisamos a Dirección Técnica y al Jefe de Transporte.</p>
          : <p className="mt-1">Ninguna pasa el límite de {temperaturaTexto(e.limite)}. Ya llenamos la mínima y la máxima: revísalas antes de cerrar.</p>}
        {resumen.avisos.map((a) => <p key={a} className="mt-1">{a}</p>)}
      </Aviso>
    </div>
  )
}

/** El resultado de leer las lecturas guardadas de la ruta: chip del límite, mínima y máxima, cruce con el cierre, gráfico y versiones anteriores. */
export function PanelLecturasLogger({ rutaId, logger, fechaRuta, puedeImportar, cerrada, sinSalir }: { rutaId: string; logger: readonly LecturasLoggerVista[]; fechaRuta: string; puedeImportar: boolean; cerrada: boolean; sinSalir: boolean }) {
  const importacion = useAccion()
  const [leyendo, setLeyendo] = useState(false)
  const id = useId()
  const vigente = logger.find((x) => x.vigente)
  const anteriores = logger.filter((x) => !x.vigente)

  const alImportar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    importacion.ejecutar(() => importarLoggerAccion(fd), { exito: 'Leímos el archivo y guardamos sus lecturas. Quedan al lado del cierre de la ruta.', alExito: () => setLeyendo(false) })
  }
  const errImp = importacion.mensaje?.errores ?? {}
  const mensajes = vigente ? mensajesDeImportacion(vigente, fechaRuta) : []
  const mostrarForm = puedeImportar && !sinSalir && (cerrada || !!vigente) && (leyendo || !vigente)

  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50/60 p-3" data-testid="logger-panel">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Thermometer className="h-4 w-4 text-gray-500" aria-hidden />
        <h4 className="text-sm font-medium text-gray-900">Lecturas del data logger</h4>
        {vigente
          ? <span className={`${chip} ${vigente.excede ? CHIP_ROJO : CHIP_OK}`} data-testid="logger-chip">{vigente.excede ? <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}{vigente.excede ? `Superó el límite de ${temperaturaTexto(vigente.limite)}` : `Dentro del límite de ${temperaturaTexto(vigente.limite)}`}</span>
          : <span className={`${chip} ${CHIP_NEUTRO}`} data-testid="logger-chip"><Clock className="h-3.5 w-3.5" aria-hidden />{sinSalir ? 'Todavía no se puede leer' : 'Sin leer'}</span>}
        {vigente && vigente.coincideConCierre !== null && (
          <span className={`${chip} ${vigente.coincideConCierre ? CHIP_OK : CHIP_AVISO}`} data-testid="logger-cruce-chip">{vigente.coincideConCierre ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <TriangleAlert className="h-3.5 w-3.5" aria-hidden />}{vigente.coincideConCierre ? 'Coincide con el cierre' : 'No coincide con el cierre'}</span>
        )}
      </div>

      {vigente ? (
        <div className="space-y-3 text-sm text-gray-700">
          <p data-testid="logger-datos">
            {vigente.puntos.toLocaleString('es-PE')} lecturas del {dia(vigente.primera)} {hora(vigente.primera)} al {dia(vigente.ultima)} {hora(vigente.ultima)}{vigente.intervaloMin ? `, una cada ${vigente.intervaloMin} min` : ''}.
            {' '}Mínima <strong className="tabular font-medium text-gray-900">{temperaturaTexto(vigente.tempMin)}</strong> · máxima <strong className="tabular font-medium text-gray-900">{temperaturaTexto(vigente.tempMax)}</strong> · promedio <span className="tabular">{temperaturaTexto(vigente.tempProm)}</span>.
            {(vigente.modelo || vigente.serie) && <> Equipo: {[vigente.modelo, vigente.serie && `S/N ${vigente.serie}`].filter(Boolean).join(' · ')}.</>}
          </p>
          {vigente.excede && (
            <p className="flex items-start gap-2 text-red-900" data-testid="logger-excede"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {vigente.lecturasSobreLimite} {vigente.lecturasSobreLimite === 1 ? 'lectura pasó' : 'lecturas pasaron'} el límite{vigente.primeraExcedencia ? `, la primera el ${momentoCorto(vigente.primeraExcedencia)}` : ''}, y la unidad estuvo {vigente.minutosSobreLimite} min por encima. Avisamos a Dirección Técnica y al Jefe de Transporte; Dirección Técnica decide qué se hace con la mercadería.</p>
          )}
          {mensajes.map((m) => <p key={m} className="flex items-start gap-2 text-amber-950" data-testid="logger-cruce"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{m}</p>)}
          <GraficoLecturas lecturas={vigente.lecturas} limite={vigente.limite} />
          <p className="text-xs text-gray-600">Leído de {vigente.archivoNombre} ({vigente.formato}) por {vigente.importadoPor} el {formatoFechaHora(vigente.importadoEn)}. {vigente.umbralEquipoAlto !== undefined ? `El equipo traía su alarma en ${temperaturaTexto(vigente.umbralEquipoAlto)}; nuestro límite es ${temperaturaTexto(vigente.limite)}.` : ''}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-700" data-testid="logger-vacio">
          {sinSalir ? 'Cuando la unidad salga podrás leer aquí el informe del data logger (PDF o CSV del Elitech RC-61): mínima, máxima y cuánto tiempo pasó el límite.'
            : cerrada ? 'Esta ruta se cerró sin leer el informe. Súbelo aquí (PDF o CSV del Elitech RC-61) para guardar las lecturas y cruzarlas con la mínima y la máxima del cierre.'
              : 'Al cerrar la ruta leemos el informe del data logger y guardamos sus lecturas.'}
        </p>
      )}

      {mostrarForm && (
        <form onSubmit={alImportar} className="space-y-3" data-testid="form-logger">
          <input type="hidden" name="rutaId" value={rutaId} />
          <div>
            <label htmlFor={`${id}-arch`} className="etiqueta">Informe del data logger <span className="font-normal text-gray-600">(PDF o CSV, hasta 10 MB)</span></label>
            <input id={`${id}-arch`} name="archivo" type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" className="campo" required aria-invalid={!!errImp.archivo} data-testid="logger-archivo" />
            {errImp.archivo && <p className="mt-1 text-sm text-red-800" role="alert">{errImp.archivo}</p>}
          </div>
          {importacion.mensaje?.tipo === 'error' && !importacion.mensaje.errores && <Aviso tipo="error" testid="logger-error">{importacion.mensaje.texto}</Aviso>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-secondary" disabled={importacion.pendiente} data-testid="logger-importar"><Upload className="h-5 w-5" aria-hidden />{importacion.pendiente ? 'Leyendo…' : 'Leer y guardar las lecturas'}</button>
            {leyendo && <button type="button" className="btn-secondary" onClick={() => setLeyendo(false)}>Cancelar</button>}
          </div>
        </form>
      )}
      {puedeImportar && !sinSalir && vigente && !leyendo && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setLeyendo(true)} data-testid="logger-releer"><FileSearch className="h-4 w-4" aria-hidden />Leer otro archivo</button>
      )}
      {importacion.mensaje?.tipo === 'ok' && <Aviso tipo="ok" testid="logger-ok">{importacion.mensaje.texto}</Aviso>}

      {anteriores.length > 0 && (
        <details className="text-sm text-gray-700" data-testid="logger-historial">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-gray-900">Lecturas anteriores ({anteriores.length})</summary>
          <ul className="space-y-1 pl-1">{anteriores.map((x) => <li key={x.id}>{temperaturaTexto(x.tempMin)} – {temperaturaTexto(x.tempMax)} · {x.puntos} lecturas · {x.archivoNombre} · {x.importadoPor} · {formatoFechaHora(x.importadoEn)}</li>)}</ul>
        </details>
      )}
    </div>
  )
}

export const TEXTO_AYUDA_TEMPERATURA = AYUDA_TEMPERATURA_RUTA
