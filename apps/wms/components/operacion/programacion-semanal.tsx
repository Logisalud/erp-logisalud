'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardCheck, Play, X } from 'lucide-react'
import { cancelarProgramacionAccion, generarConteoProgramadoAccion, programarConteoSemanalAccion } from '@/app/acciones-operacion'
import { UBICACIONES_POR_CONTEO_DEFECTO, conteosPorProgramar, sugerirRotacion, sumarDiasISO, type Cobertura, type ProgramacionVista } from '@/domain/operacion'
import { formatoFecha } from '@/domain/fechas'
import { normalizar } from '@/domain/busqueda'
import { CHIP_OK, CHIP_SIN_MARCAR, CHIP_TEAL, PILDORA_ACTIVA, PILDORA_DESHABILITADA, PILDORA_INACTIVA } from '../estilos-opcion'
import { Aviso } from '../entradas/aviso'
import { useAccion } from '../usar-accion'
import type { PosicionContable } from '../inventario/form-programar-conteo'

const ORDINAL = ['primer', 'segundo', 'tercer']

/** Los tres inventarios cíclicos de la semana: se programan por rotación (lo que hace más tiempo no se cuenta, primero) y se generan cuando toca contar. */
export function ProgramacionSemanal({ semana, hoyLunes, programaciones, cobertura, posiciones, puedeProgramar, porSemana, ubicacionesPorConteo = UBICACIONES_POR_CONTEO_DEFECTO }: {
  semana: string; hoyLunes: string; programaciones: ProgramacionVista[]; cobertura: Cobertura[]; posiciones: PosicionContable[]; puedeProgramar: boolean; porSemana: number; ubicacionesPorConteo?: number
}) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [armando, setArmando] = useState<number | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [nota, setNota] = useState('')
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  const faltan = conteosPorProgramar(programaciones, porSemana)
  const yaEnSemana = useMemo(() => new Set(programaciones.filter((p) => p.tipo === 'ROTATIVO' && p.estado !== 'CANCELADO').flatMap((p) => p.posiciones.map((x) => x.id))), [programaciones])
  const ultima = useMemo(() => new Map(cobertura.map((c) => [c.posicionId, c.ultima])), [cobertura])
  const libres = useMemo(() => posiciones.filter((p) => !p.ocupada), [posiciones])
  const visibles = useMemo(() => {
    const base = q.trim() ? libres.filter((p) => normalizar(`${p.codigo} ${p.area}`).includes(normalizar(q))) : libres
    const orden = new Map(sugerirRotacion(base, cobertura, base.length, yaEnSemana).map((p, i) => [p.id, i]))
    return base.filter((p) => orden.has(p.id)).sort((a, b) => orden.get(a.id)! - orden.get(b.id)!).slice(0, 48)
  }, [libres, cobertura, yaEnSemana, q])

  const abrir = (orden: number) => {
    const sugeridas = sugerirRotacion(libres, cobertura, ubicacionesPorConteo, new Set([...yaEnSemana]))
    setSel(new Set(sugeridas.map((p) => p.id))); setArmando(orden); setQ(''); setNota('')
  }
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const esSemanaActual = semana === hoyLunes

  return (
    <section aria-labelledby="h-prog" className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 md:p-5" data-testid="programacion-semanal">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="h-prog" className="font-heading text-xl font-medium tracking-wide text-gray-900">Conteos de la semana</h2>
          <p className="tabular flex items-center gap-1.5 text-sm text-gray-700" data-testid="semana-actual"><CalendarDays className="h-4 w-4" aria-hidden />Del {formatoFecha(semana)} al {formatoFecha(sumarDiasISO(semana, 6))}{esSemanaActual ? ' · esta semana' : ''}</p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Cambiar de semana">
          <Link href={`/conteos?semana=${sumarDiasISO(semana, -7)}`} className="btn-secondary btn-sm" data-testid="semana-anterior"><ChevronLeft className="h-4 w-4" aria-hidden />Anterior</Link>
          {!esSemanaActual && <Link href="/conteos" className="btn-secondary btn-sm">Hoy</Link>}
          <Link href={`/conteos?semana=${sumarDiasISO(semana, 7)}`} className="btn-secondary btn-sm" data-testid="semana-siguiente">Siguiente<ChevronRight className="h-4 w-4" aria-hidden /></Link>
        </nav>
      </div>

      <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200" data-testid="conteos-semana">
        {Array.from({ length: porSemana }, (_, i) => i + 1).map((orden) => {
          const p = programaciones.find((x) => x.tipo === 'ROTATIVO' && x.orden === orden && x.estado !== 'CANCELADO')
          return (
            <li key={orden} className="space-y-2 p-3 md:p-4" data-testid="slot-conteo" data-orden={orden} data-estado={p?.estado ?? 'LIBRE'}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-gray-900">Conteo {orden}</h3>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${p?.estado === 'GENERADO' ? CHIP_OK : p ? CHIP_TEAL : CHIP_SIN_MARCAR}`}>
                  {p?.estado === 'GENERADO' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />}{p?.estado === 'GENERADO' ? 'Generado' : p ? 'Programado' : 'Sin programar'}
                </span>
              </div>
              {p ? (
                <>
                  <p className="tabular text-sm text-gray-800">{p.posiciones.map((x) => x.codigo).join(' · ')}</p>
                  {p.estado === 'GENERADO' && p.conteoId && <Link href={`/conteos/${p.conteoId}`} className="inline-flex min-h-10 items-center text-sm text-teal-800 underline underline-offset-2" data-testid="ir-conteo-generado">Ver el conteo {p.conteoNumero}</Link>}
                  {p.estado === 'PROGRAMADO' && puedeProgramar && (
                    cancelando === p.id ? (
                      <div className="space-y-2">
                        <label htmlFor={`mot-${p.id}`} className="etiqueta">¿Por qué se cancela?</label>
                        <input id={`mot-${p.id}`} className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" data-testid="cancelar-motivo" />
                        <div className="flex gap-2">
                          <button type="button" className="btn-primary btn-sm" disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => cancelarProgramacionAccion(p.id, motivo), { exito: 'Programación cancelada.', alExito: () => { setCancelando(null); setMotivo('') } })} data-testid="cancelar-confirmar">Cancelar el conteo</button>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setCancelando(null)}>No cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-primary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => generarConteoProgramadoAccion(p.id), { exito: 'Conteo generado: las ubicaciones quedan en pausa hasta cerrarlo.' })} data-testid="generar-conteo"><Play className="h-4 w-4" aria-hidden />Contar ahora</button>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setCancelando(p.id)} data-testid="cancelar-programacion"><X className="h-4 w-4" aria-hidden />Cancelar</button>
                      </div>
                    )
                  )}
                </>
              ) : puedeProgramar ? (
                <button type="button" className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${armando === orden ? PILDORA_ACTIVA : PILDORA_INACTIVA}`} aria-expanded={armando === orden} onClick={() => (armando === orden ? setArmando(null) : abrir(orden))} data-testid="programar-slot"><ClipboardCheck className="h-4 w-4" aria-hidden />Programar el {ORDINAL[orden - 1] ?? `conteo ${orden}`} conteo</button>
              ) : <p className="text-sm text-gray-700">Lo programa el Jefe de Almacén.</p>}

              {armando === orden && !p && (
                <div className="space-y-3 rounded-lg bg-gray-50 p-3" data-testid="armar-conteo">
                  <p className="text-sm text-gray-800">Te sugerimos las {ubicacionesPorConteo} ubicaciones que hace más tiempo no se cuentan. Cambia las que quieras.</p>
                  <label htmlFor="q-prog" className="sr-only">Buscar ubicación</label>
                  <input id="q-prog" className="campo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ubicación (A-15.1)" autoComplete="off" data-testid="programar-buscar" />
                  <ul className="grid max-h-64 gap-1.5 overflow-auto sm:grid-cols-2 lg:grid-cols-3" data-testid="programar-posiciones">
                    {visibles.map((x) => (
                      <li key={x.id}>
                        <label className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${sel.has(x.id) ? PILDORA_ACTIVA : PILDORA_INACTIVA}`}>
                          <input type="checkbox" className="h-4 w-4" checked={sel.has(x.id)} onChange={() => alternar(x.id)} data-testid={`prog-pos-${x.codigo}`} />
                          <span className="min-w-0"><span className="tabular block font-medium">{x.codigo}</span><span className="block truncate text-xs text-gray-700">{ultima.get(x.id) ? `Último: ${formatoFecha(ultima.get(x.id)!)}` : 'Nunca contada'}</span></span>
                        </label>
                      </li>
                    ))}
                    {visibles.length === 0 && <li className="text-sm text-gray-700">Ninguna ubicación libre coincide.</li>}
                  </ul>
                  {posiciones.some((x) => x.ocupada) && <p className="flex items-center gap-1.5 text-xs text-gray-700"><span className={`rounded border px-1.5 py-0.5 ${PILDORA_DESHABILITADA}`}>No disponible</span>Las ubicaciones con movimientos por verificar no se pueden contar todavía.</p>}
                  <div>
                    <label htmlFor="nota-prog" className="etiqueta">Nota <span className="font-normal text-gray-700">(opcional)</span></label>
                    <input id="nota-prog" className="campo" value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off" />
                  </div>
                  <button type="button" className="btn-primary w-full sm:w-auto" disabled={pendiente || sel.size === 0} onClick={() => ejecutar(() => programarConteoSemanalAccion(semana, orden, [...sel], nota.trim() || undefined), { exito: `Conteo ${orden} programado.`, alExito: () => setArmando(null) })} data-testid="programar-confirmar"><Check className="h-5 w-5" aria-hidden />Programar el conteo {orden} ({sel.size})</button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <p className="text-sm text-gray-700" data-testid="faltan-conteos">{faltan.length === 0 ? 'Los tres conteos de la semana están programados.' : `Falta${faltan.length === 1 ? '' : 'n'} programar ${faltan.length === 1 ? 'el conteo' : 'los conteos'} ${faltan.join(', ')}.`}</p>

      {programaciones.filter((p) => p.tipo === 'EXTRA').length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-900">Conteos extra de esta semana</h3>
          <ul className="mt-1 space-y-1 text-sm text-gray-800">
            {programaciones.filter((p) => p.tipo === 'EXTRA').map((p) => <li key={p.id}>{p.posiciones.map((x) => x.codigo).join(', ')} · {p.nota}{p.conteoId ? <> · <Link href={`/conteos/${p.conteoId}`} className="underline">{p.conteoNumero}</Link></> : ''}</li>)}
          </ul>
        </div>
      )}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </section>
  )
}
