'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { BadgeCheck, CircleAlert, CircleCheck, CircleDashed, Download, Save } from 'lucide-react'
import { registrarInspeccionAccion, supervisarInspeccionAccion } from '@/app/acciones-inspecciones'
import {
  ETIQUETA_MARCA, FORMATOS, MARCAS, MAXIMO_DIAS_ATRAS, TIPOS_INSPECCION, armarMes, esConforme, itemsTodoSi, mesLargo, motivoNoPuedeSupervisar, puntosNoConformes, sumarDias, validarInspeccion,
  type DiaDelMes, type InspeccionVista, type Items, type Marca, type TipoInspeccion,
} from '@/domain/inspecciones'
import type { Rol } from '@/domain/tipos'
import type { VehiculoInspeccion } from '@/services/repositorio-inspecciones'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
const diaCorto = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })

/**
 * Inspección de la unidad: la lista del día (Sí / No / No aplica; todo viene en «Sí» y se cambia solo lo que no es así), el mes completo y la descarga del formato en Word.
 * La hace quien conduce o ayuda; la supervisa OTRA persona. No frena la salida de ninguna ruta.
 */
export function InspeccionUnidad({ tipo, vehiculos, vehiculoId, mes, hoy, inspecciones, roles, personaId, error }: {
  tipo: TipoInspeccion; vehiculos: VehiculoInspeccion[]; vehiculoId?: string; mes: string; hoy: string; inspecciones: InspeccionVista[]; roles: readonly Rol[]; personaId: string; error?: string | null
}) {
  const router = useRouter()
  const formato = FORMATOS[tipo]
  const dias = useMemo(() => armarMes(mes, inspecciones), [mes, inspecciones])
  const ir = (cambios: Record<string, string>) => { const p = new URLSearchParams({ tipo, ...(vehiculoId ? { vehiculo: vehiculoId } : {}), mes, ...cambios }); router.push(`/inspecciones?${p.toString()}`) }
  const vehiculo = vehiculos.find((v) => v.id === vehiculoId)

  return (
    <div className="mx-auto max-w-5xl space-y-5" data-testid="inspeccion-unidad">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Inspección de la unidad</h1>
        <p className="mt-1 text-gray-600">Lo haces una vez al día por vehículo y lo supervisa otro conductor. No frena la salida de la ruta: es el registro del formato.</p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Qué inspección">
        {TIPOS_INSPECCION.map((t) => (
          <Link key={t} href={`/inspecciones?tipo=${t}${vehiculoId ? `&vehiculo=${vehiculoId}` : ''}&mes=${mes}`} aria-current={t === tipo ? 'page' : undefined} data-testid={`tipo-${t}`}
            className={`inline-flex min-h-12 items-center rounded-lg border px-4 text-base font-medium ${t === tipo ? 'border-green-700 bg-green-50 text-green-900' : 'border-gray-300 bg-white text-gray-800'}`}>
            {FORMATOS[t].corto} <span className="ml-2 text-xs text-gray-600">{FORMATOS[t].codigo}</span>
          </Link>
        ))}
      </nav>

      {error && <Aviso tipo="error" testid="inspeccion-error">{error}</Aviso>}
      {vehiculos.length === 0 && !error && <Aviso tipo="info" testid="inspeccion-sin-vehiculos">Todavía no hay vehículos disponibles. El Jefe de Transporte los registra en Rutas → Recursos.</Aviso>}

      {vehiculos.length > 0 && (
        <section className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2" aria-label="Vehículo y mes">
          <div>
            <label htmlFor="insp-veh" className="etiqueta">Vehículo</label>
            <select id="insp-veh" className="campo" value={vehiculoId ?? ''} onChange={(e) => ir({ vehiculo: e.target.value })} data-testid="inspeccion-vehiculo">
              <option value="">Elige el vehículo…</option>
              {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.placa}{v.descripcion ? ` — ${v.descripcion}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="insp-mes" className="etiqueta">Mes</label>
            <input id="insp-mes" type="month" className="campo" value={mes} max={hoy.slice(0, 7)} onChange={(e) => e.target.value && ir({ mes: e.target.value })} data-testid="inspeccion-mes" />
          </div>
        </section>
      )}

      {vehiculo && (
        <>
          <FormularioDelDia key={`${tipo}-${vehiculo.id}`} tipo={tipo} vehiculoId={vehiculo.id} hoy={hoy} inspecciones={inspecciones} />
          <MesCompleto tipo={tipo} dias={dias} mes={mes} roles={roles} personaId={personaId} vehiculoId={vehiculo.id} />
          <a href={`/wms/inspecciones/word?tipo=${tipo}&vehiculo=${vehiculo.id}&mes=${mes}`} className="btn-secondary inline-flex" data-testid="descargar-word"><Download className="h-5 w-5" aria-hidden />Descargar el formato de {mesLargo(mes)} en Word ({formato.codigo})</a>
        </>
      )}
    </div>
  )
}

function FormularioDelDia({ tipo, vehiculoId, hoy, inspecciones }: { tipo: TipoInspeccion; vehiculoId: string; hoy: string; inspecciones: InspeccionVista[] }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const formato = FORMATOS[tipo]
  const [fecha, setFecha] = useState(hoy)
  const [items, setItems] = useState<Items>(() => itemsTodoSi(tipo))
  const [observaciones, setObservaciones] = useState('')
  const yaHay = inspecciones.find((i) => i.fecha === fecha)
  const noConformes = puntosNoConformes(tipo, items)
  const errores = validarInspeccion({ tipo, vehiculoId, fecha, hoy, items, observaciones })
  const grupos = [...new Set(formato.puntos.map((p) => p.grupo))]

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4" aria-label="Inspección del día" data-testid="inspeccion-formulario">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-heading text-xl font-medium tracking-wide text-gray-900">Inspección de {fecha === hoy ? 'hoy' : diaCorto(fecha)}</h2>
        <div><label htmlFor="insp-fecha" className="etiqueta">Fecha</label><input id="insp-fecha" type="date" className="campo" min={sumarDias(hoy, -MAXIMO_DIAS_ATRAS)} max={hoy} value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} data-testid="inspeccion-fecha" /></div>
      </div>

      {yaHay ? (
        <Aviso tipo="ok" testid="inspeccion-ya-hecha">Ya hay una inspección de este día, hecha por {yaHay.realizadaNombre} a las {hora(yaHay.realizadaEn)}. {yaHay.conforme ? 'Salió conforme.' : 'Salió NO conforme.'}</Aviso>
      ) : (
        <>
          <p className="text-sm text-gray-700">Todo viene en «Sí» (lo normal). Cambia solo lo que no esté bien o no aplique.</p>
          {grupos.map((g) => (
            <fieldset key={g} className="space-y-1">
              <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-700">{g}</legend>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {formato.puntos.filter((p) => p.grupo === g).map((p) => (
                  <li key={p.clave} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="inspeccion-punto" data-clave={p.clave}>
                    <span className="min-w-0 flex-1 text-[15px] text-gray-900">{p.etiqueta}</span>
                    <div className="flex gap-1" role="radiogroup" aria-label={p.etiqueta}>
                      {MARCAS.map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={items[p.clave] === m} onClick={() => setItems((x) => ({ ...x, [p.clave]: m as Marca }))} data-testid={`marca-${p.clave}-${m}`}
                          className={`min-h-11 min-w-16 rounded-md border px-3 text-sm font-medium ${items[p.clave] === m ? (m === 'NO' ? 'border-red-700 bg-red-50 text-red-900' : m === 'SI' ? 'border-green-700 bg-green-50 text-green-900' : 'border-gray-500 bg-gray-100 text-gray-900') : 'border-gray-300 bg-white text-gray-700'}`}>
                          {ETIQUETA_MARCA[m]}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}

          <div>
            <label htmlFor="insp-obs" className="etiqueta">Observaciones {esConforme(tipo, items) ? '(opcional)' : '(obligatorias: hay puntos no conformes)'}</label>
            <textarea id="insp-obs" rows={2} className="campo !min-h-20 py-2" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} data-testid="inspeccion-observaciones" />
          </div>
          {noConformes.length > 0 && <p className="flex items-start gap-1.5 text-sm text-red-800" data-testid="inspeccion-no-conforme"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />No conforme: {noConformes.map((x) => x.etiqueta).join('; ')}.</p>}
          {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} testid="inspeccion-mensaje">{mensaje.texto}</Aviso>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary min-h-14" disabled={pendiente || errores.length > 0} data-testid="inspeccion-guardar"
              onClick={() => ejecutar(() => registrarInspeccionAccion({ tipo, vehiculoId, fecha, items, observaciones: observaciones.trim() || undefined }), { exito: 'Inspección guardada. Ahora la supervisa otro conductor.' })}>
              <Save className="h-5 w-5" aria-hidden />{pendiente ? 'Guardando…' : 'Guardar la inspección'}
            </button>
            {errores.length > 0 && <p className="text-sm text-gray-700" data-testid="inspeccion-falta">{errores[0]}.</p>}
          </div>
        </>
      )}
    </section>
  )
}

function MesCompleto({ tipo, dias, mes, roles, personaId, vehiculoId }: { tipo: TipoInspeccion; dias: DiaDelMes[]; mes: string; roles: readonly Rol[]; personaId: string; vehiculoId: string }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const hechas = dias.filter((d) => d.inspeccion).length
  return (
    <section className="rounded-xl border border-gray-200 bg-white" aria-label="Mes completo" data-testid="inspeccion-mes-lista" data-vehiculo={vehiculoId}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <h2 className="font-heading text-xl font-medium tracking-wide text-gray-900">{mesLargo(mes)}</h2>
        <p className="text-sm text-gray-700" data-testid="inspeccion-resumen">{hechas} de {dias.length} días con inspección</p>
      </div>
      {mensaje && <div className="px-4 pt-3"><Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso></div>}
      <ul className="divide-y divide-gray-100">
        {dias.map((d) => {
          const i = d.inspeccion
          const no = i ? motivoNoPuedeSupervisar(roles, personaId, i) : null
          return (
            <li key={d.fecha} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm" data-testid="inspeccion-dia" data-fecha={d.fecha} data-estado={!i ? 'SIN' : i.conforme ? 'CONFORME' : 'NO_CONFORME'}>
              <span className="tabular w-24 font-medium text-gray-900">{diaCorto(d.fecha)}</span>
              {!i ? <span className="inline-flex items-center gap-1.5 text-gray-600"><CircleDashed className="h-4 w-4" aria-hidden />Sin inspección</span>
                : i.conforme ? <span className="inline-flex items-center gap-1.5 text-green-800"><CircleCheck className="h-4 w-4" aria-hidden />Conforme</span>
                : <span className="inline-flex items-center gap-1.5 text-red-800"><CircleAlert className="h-4 w-4" aria-hidden />No conforme</span>}
              {i && <span className="text-gray-700">Hizo: {i.realizadaNombre}</span>}
              {i && (i.supervisadaNombre ? <span className="inline-flex items-center gap-1.5 text-gray-700"><BadgeCheck className="h-4 w-4 text-green-700" aria-hidden />Supervisó: {i.supervisadaNombre}</span>
                : !no ? <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => supervisarInspeccionAccion(i.id), { exito: 'Supervisión registrada.' })} data-testid="supervisar-inspeccion">Supervisar</button>
                : <span className="text-gray-600">Falta supervisar{no === 'La supervisa otra persona, no quien la hizo' ? ' (la hace otro conductor)' : ''}</span>)}
              {i?.observaciones && <span className="basis-full text-gray-700">«{i.observaciones}»</span>}
            </li>
          )
        })}
      </ul>
      <p className="px-4 py-2 text-xs text-gray-600">{FORMATOS[tipo].leyenda ?? ''}</p>
    </section>
  )
}
