'use client'

import Link from 'next/link'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Archive, CheckCircle2, Clock, FileText, Info, Printer, ScanLine, Thermometer, TriangleAlert, Upload } from 'lucide-react'
import { corregirCierreRutaAccion, cerrarRutaAccion, leerLoggerAccion, registrarImpresionLsFrAccion, subirEscaneoLsFrAccion, type ResultadoLogger } from '@/app/acciones-rutas'
import { AYUDA_TEMPERATURA_RUTA, LIMITE_TEMPERATURA_RUTA_C, type ResumenLeido } from '@/domain/data-logger'
import { leerTemperatura, motivoNoSeCierra, motivoNoSeEscanea, tamanoLegible } from '@/domain/cierre-ruta'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { PENDIENTES_LS_FR, cierreVigente, escaneoVigente, textoTemperatura, type RegistroLsFrVista } from '@/domain/ls-fr-43-03'
import type { RutaVista } from '@/domain/rutas'
import { Aviso } from '../entradas/aviso'
import { useAccion } from '../usar-accion'
import { PanelLecturasLogger, ResumenLecturaLeida } from './lecturas-logger'

const chip = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const CHIP_OK = 'border-green-200 bg-green-50 text-green-800'
const CHIP_AVISO = 'border-amber-300 bg-amber-50 text-amber-900'
const CHIP_NEUTRO = 'border-gray-300 bg-gray-50 text-gray-700'

/** Una fila de estado del formato: ícono + título + lo que pasó (o lo que falta) y, a la derecha, su acción. */
function Paso({ icono, titulo, estado, testid, children }: { icono: ReactNode; titulo: string; estado: ReactNode; testid: string; children?: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-gray-100 pt-4 first:border-t-0 first:pt-0" aria-label={titulo} data-testid={testid}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-gray-500" aria-hidden>{icono}</span>
        <h3 className="font-medium text-gray-900">{titulo}</h3>
        {estado}
      </div>
      {children}
    </section>
  )
}

function Campo({ id, etiqueta, ayuda, error, children }: { id: string; etiqueta: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="etiqueta">{etiqueta}{ayuda && <span className="font-normal text-gray-600"> {ayuda}</span>}</label>
      {children}
      {error && <p className="mt-1 text-sm text-red-800" role="alert">{error}</p>}
    </div>
  )
}

/** Lo que pasó con las lecturas del archivo al cerrar o corregir, en una frase que termina en espacio (o vacía). `maxima` es lo que se anotó a mano. */
function textoLogger(r: ResultadoLogger | undefined, maxima: number | null): string {
  const aviso = (excede: boolean) => (excede ? ` Pasó el límite de ${String(LIMITE_TEMPERATURA_RUTA_C).replace('.', ',')} °C: avisamos a Dirección Técnica y al Jefe de Transporte; Dirección Técnica decide qué se hace con la mercadería.` : '')
  if (!r) return ''
  if (r.estado === 'GUARDADO') {
    return `Leímos el archivo y guardamos sus lecturas.${aviso(r.excede)}${r.coincide === false ? ' La mínima o la máxima que anotaste no coincide con el archivo: revísalo en «Lecturas del data logger».' : ''}${r.dentroDeFecha ? '' : ' Las lecturas no son del día de la ruta: revisa que sea el archivo de este viaje.'} `
  }
  return `No pudimos leer las lecturas del archivo (${r.motivo.replace(/\.$/, '')}); quedó guardado tal cual y vale lo que anotaste.${maxima !== null && maxima > LIMITE_TEMPERATURA_RUTA_C ? aviso(true) : ''} `
}

/**
 * El formato LS-FR.43.03 de la ruta: lo genera el WMS desde la ruta. Aquí se IMPRIME la copia que viaja con el conductor (queda registrado quién y cuándo),
 * se sube el ESCANEO firmado (conductor y Dirección Técnica; se conserva 5 años) y se CIERRA la ruta con el archivo del data logger y la temperatura mínima y máxima.
 */
export function PanelLsFr({ ruta, registro, puedeCerrar = false, puedeRegistrar = false }: { ruta: RutaVista; registro: RegistroLsFrVista | null; puedeCerrar?: boolean; puedeRegistrar?: boolean }) {
  const impresion = useAccion()
  const escaneo = useAccion()
  const cierre = useAccion()
  const correccion = useAccion()
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [cambiandoEscaneo, setCambiandoEscaneo] = useState(false)
  const [historial, setHistorial] = useState(false)
  const [okImpresion, setOkImpresion] = useState<string | null>(null)
  const [okCierre, setOkCierre] = useState<string | null>(null)
  const [okCorreccion, setOkCorreccion] = useState<string | null>(null)

  if (!registro) {
    return (
      <section className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-700" aria-label="Formato LS-FR.43.03" data-testid="lsfr-pendiente">
        <p className="font-medium text-gray-900">Formato LS-FR.43.03 · Planificación de ruta</p>
        <p className="mt-1">Se crea cuando confirmas la ruta.</p>
      </section>
    )
  }

  const cierreActual = cierreVigente(registro)
  const escaneoActual = escaneoVigente(registro)
  const impresiones = registro.impresiones
  const ultima = impresiones[0]
  const cerrada = ruta.estado === 'CERRADA'
  const sinEscaneo = motivoNoSeEscanea(ruta.estado)
  const sinCierre = motivoNoSeCierra(ruta.estado)
  const { min, max } = registro.tempRango

  // La ventana se abre en el clic (así el navegador no la bloquea) y se llena cuando la impresión quedó registrada.
  const imprimir = () => {
    const ventana = window.open('', '_blank')
    setOkImpresion(null)
    impresion.ejecutar(() => registrarImpresionLsFrAccion(ruta.id), {
      alExito: (r) => {
        if (ventana) ventana.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/rutas/${ruta.id}/pdf`
        setOkImpresion(`Impresión registrada (${r.impresiones === 1 ? 'la primera' : `la n.º ${r.impresiones}`}). ${ventana ? 'Se abrió el PDF para imprimir.' : 'Abre el PDF con «Ver el PDF» para imprimirlo.'} Siguiente: entrega la copia al conductor antes de la salida.`)
      },
    })
  }

  const alSubirEscaneo = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('rutaId', ruta.id)
    escaneo.ejecutar(() => subirEscaneoLsFrAccion(fd), {
      exito: `Escaneo subido. ${cerrada ? 'El formato quedó archivado.' : 'Siguiente: cuando la unidad vuelva, cierra la ruta con el archivo del data logger.'} Se conserva ${registro.conservacionAnios} años.`,
      alExito: () => setCambiandoEscaneo(false),
    })
  }
  const alCerrar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('rutaId', ruta.id)
    const maxima = leerTemperatura(String(fd.get('tempMax') ?? ''))
    cierre.ejecutar(() => cerrarRutaAccion(fd), {
      alExito: (r) => setOkCierre(`Ruta cerrada. Guardamos el archivo del data logger${r.fueraDeRango ? ' y marcamos que la temperatura salió del rango del formato' : ''}. ${textoLogger(r.logger, maxima)}${escaneoActual ? 'El formato quedó archivado.' : 'Siguiente: sube el escaneo del formato firmado.'}`),
    })
  }
  const alCorregir = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('rutaId', ruta.id)
    const maxima = leerTemperatura(String(fd.get('tempMax') ?? ''))
    correccion.ejecutar(() => corregirCierreRutaAccion(fd), { alExito: (r) => { setOkCorreccion(`Cierre corregido. Guardamos la versión nueva y la anterior queda en el historial. ${textoLogger(r.logger, maxima)}`.trim()); setCorrigiendo(false) } })
  }
  const errCierre = cierre.mensaje?.errores ?? {}
  const errCorreccion = correccion.mensaje?.errores ?? {}
  const errEscaneo = escaneo.mensaje?.errores ?? {}

  return (
    <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 md:p-5" aria-label="Formato LS-FR.43.03" data-testid="lsfr-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-gray-900">Formato {registro.codigo} · Planificación de ruta</h2>
          <p className="text-sm text-gray-700">Versión {registro.version} · {registro.filas.length} {registro.filas.length === 1 ? 'fila' : 'filas'} en {registro.paginas} {registro.paginas === 1 ? 'página' : 'páginas'} · usuario: <strong className="font-medium">{registro.usuario ?? 'sin dato'}</strong> · lo genera el WMS desde la ruta</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeRegistrar && (
            <button type="button" className="btn-primary" onClick={imprimir} disabled={impresion.pendiente} data-testid="imprimir-lsfr"><Printer className="h-5 w-5" aria-hidden />{impresion.pendiente ? 'Registrando…' : 'Imprimir la copia del conductor'}</button>
          )}
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/rutas/${ruta.id}/pdf`} target="_blank" rel="noopener" className="btn-secondary" data-testid="ver-lsfr"><FileText className="h-5 w-5" aria-hidden />Ver el PDF</a>
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/rutas/${ruta.id}/paquete`} target="_blank" rel="noopener" className="btn-secondary" data-testid="paquete-ruta"><FileText className="h-5 w-5" aria-hidden />Imprimir el paquete documental de la ruta</a>
        </div>
      </div>
      {registro.conductorReal && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="lsfr-conductor-documentos">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />El formato lleva a {registro.conductor}. El conductor real de la ruta es {registro.conductorReal} y así queda registrado, junto con cada impresión.
        </p>
      )}
      {impresion.mensaje?.tipo === 'error' && <Aviso tipo="error" testid="impresion-error">{impresion.mensaje.texto}</Aviso>}
      {okImpresion && impresion.mensaje?.tipo !== 'error' && <Aviso tipo="ok" testid="impresion-ok">{okImpresion}</Aviso>}

      {/* 1. La copia impresa */}
      <Paso icono={<Printer className="h-5 w-5" />} titulo="Copia impresa" testid="paso-impresion"
        estado={impresiones.length > 0
          ? <span className={`${chip} ${CHIP_OK}`}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Impresa {impresiones.length === 1 ? 'una vez' : `${impresiones.length} veces`}</span>
          : <span className={`${chip} ${CHIP_AVISO}`}><TriangleAlert className="h-3.5 w-3.5" aria-hidden />Sin imprimir</span>}>
        {impresiones.length > 0
          ? <p className="text-sm text-gray-700" data-testid="impresion-ultima">La última la imprimió {ultima.por} el {formatoFechaHora(ultima.en)}{ultima.antesDeSalir ? ', antes de la salida' : ', después de la salida'}.</p>
          : <p className="text-sm text-gray-700" data-testid="impresion-pendiente">La copia viaja con el conductor: se imprime antes de la salida. Al liberar la unidad te avisamos si todavía no se imprimió.</p>}
      </Paso>

      {/* 2. El escaneo firmado */}
      <Paso icono={<ScanLine className="h-5 w-5" />} titulo="Escaneo del formato firmado" testid="paso-escaneo"
        estado={escaneoActual
          ? <span className={`${chip} ${CHIP_OK}`}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Subido</span>
          : <span className={`${chip} ${CHIP_NEUTRO}`}><Clock className="h-3.5 w-3.5" aria-hidden />{sinEscaneo ? 'Todavía no se puede subir' : 'Falta subirlo'}</span>}>
        {escaneoActual ? (
          <div className="space-y-2 text-sm text-gray-700">
            <p data-testid="escaneo-actual"><Link href={`/rutas/${ruta.id}/archivo/escaneo`} target="_blank" className="font-medium text-green-800 underline">{escaneoActual.nombre}</Link> · {tamanoLegible(escaneoActual.bytes)} · lo subió {escaneoActual.subidoPor} el {formatoFechaHora(escaneoActual.subidoEn)}</p>
            <p data-testid="escaneo-conservacion"><Archive className="mr-1.5 inline h-4 w-4 text-gray-500" aria-hidden />Se conserva {registro.conservacionAnios} años, en físico y en digital: hasta el {formatoFecha(escaneoActual.conservarHasta)}. Nada se borra.</p>
            {puedeRegistrar && !cambiandoEscaneo && <button type="button" className="btn-secondary btn-sm" onClick={() => setCambiandoEscaneo(true)} data-testid="cambiar-escaneo">Subir un escaneo nuevo</button>}
          </div>
        ) : sinEscaneo ? (
          <p className="text-sm text-gray-700" data-testid="escaneo-aun-no">Se sube desde que la unidad se libera, con las firmas del conductor y de Dirección Técnica. Hoy la ruta está {ruta.estado === 'BORRADOR' ? 'en borrador' : 'planificada'}.</p>
        ) : !puedeRegistrar ? (
          <p className="text-sm text-gray-700" data-testid="escaneo-falta">Falta el escaneo firmado. Lo sube el Jefe de Transporte, el Jefe de Almacén o Dirección Técnica.</p>
        ) : null}
        {puedeRegistrar && !sinEscaneo && (!escaneoActual || cambiandoEscaneo) && (
          <form onSubmit={alSubirEscaneo} className="space-y-3" data-testid="form-escaneo">
            <Campo id="escaneo-archivo" etiqueta="Escaneo firmado" ayuda="(PDF, JPG o PNG, hasta 10 MB)" error={errEscaneo.archivo}>
              <input id="escaneo-archivo" name="archivo" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*" className="campo" required aria-invalid={!!errEscaneo.archivo} data-testid="escaneo-archivo" />
            </Campo>
            {escaneoActual && (
              <Campo id="escaneo-motivo" etiqueta="¿Por qué lo cambias?" ayuda="(el anterior se conserva)" error={errEscaneo.motivo}>
                <input id="escaneo-motivo" name="motivo" className="campo" autoComplete="off" required data-testid="escaneo-motivo" />
              </Campo>
            )}
            {escaneo.mensaje?.tipo === 'error' && !escaneo.mensaje.errores && <Aviso tipo="error" testid="escaneo-error">{escaneo.mensaje.texto}</Aviso>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={escaneo.pendiente} data-testid="escaneo-subir"><Upload className="h-5 w-5" aria-hidden />{escaneo.pendiente ? 'Subiendo…' : 'Subir el escaneo'}</button>
              {cambiandoEscaneo && <button type="button" className="btn-secondary" onClick={() => setCambiandoEscaneo(false)}>Cancelar</button>}
            </div>
          </form>
        )}
        {escaneo.mensaje?.tipo === 'ok' && <Aviso tipo="ok" testid="escaneo-ok">{escaneo.mensaje.texto}</Aviso>}
        {registro.escaneos.length > 1 && (
          <details className="text-sm text-gray-700" onToggle={(e) => setHistorial((e.target as HTMLDetailsElement).open)} data-testid="escaneo-historial">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-gray-900">Versiones anteriores ({registro.escaneos.length - 1})</summary>
            {historial && <ul className="space-y-1 pl-1">{registro.escaneos.filter((x) => !x.vigente).map((x) => <li key={x.version}>Versión {x.version}: <Link href={`/rutas/${ruta.id}/archivo/escaneo?v=${x.version}`} target="_blank" className="font-medium text-green-800 underline">{x.nombre}</Link> · {x.subidoPor} · {formatoFechaHora(x.subidoEn)}</li>)}</ul>}
          </details>
        )}
      </Paso>

      {/* 3. El cierre de la ruta: data logger, mínima y máxima */}
      <Paso icono={<Thermometer className="h-5 w-5" />} titulo="Cierre de la ruta y temperatura" testid="paso-cierre"
        estado={cerrada && cierreActual
          ? <span className={`${chip} ${cierreActual.fueraDeRango ? CHIP_AVISO : CHIP_OK}`} data-testid="cierre-chip">{cierreActual.fueraDeRango ? <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}Cerrada · {textoTemperatura(cierreActual.tempMin, cierreActual.tempMax)}</span>
          : <span className={`${chip} ${CHIP_NEUTRO}`}><Clock className="h-3.5 w-3.5" aria-hidden />{sinCierre ? 'Todavía no se puede cerrar' : 'Por cerrar'}</span>}>
        {cerrada && cierreActual ? (
          <div className="space-y-2 text-sm text-gray-700">
            <p data-testid="cierre-datos">Mínima <strong className="tabular font-medium text-gray-900">{cierreActual.tempMin.toFixed(1).replace('.', ',')} °C</strong> · máxima <strong className="tabular font-medium text-gray-900">{cierreActual.tempMax.toFixed(1).replace('.', ',')} °C</strong> · la cerró {cierreActual.cerradoPor} el {formatoFechaHora(cierreActual.cerradoEn)}.
              {' '}Archivo del data logger: <Link href={`/rutas/${ruta.id}/archivo/data-logger`} target="_blank" className="font-medium text-green-800 underline" data-testid="cierre-archivo">{cierreActual.archivoNombre}</Link> ({tamanoLegible(cierreActual.archivoBytes)}).</p>
            {cierreActual.fueraDeRango && <p className="flex items-start gap-2 text-amber-950" data-testid="cierre-fuera-de-rango"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />La temperatura salió del rango del formato ({min} °C – {max} °C). Queda marcado en el cierre y en el PDF; Dirección Técnica decide qué se hace.</p>}
            {cierreActual.observaciones && <p>Observaciones: {cierreActual.observaciones}</p>}
            {puedeCerrar && !corrigiendo && <button type="button" className="btn-secondary btn-sm" onClick={() => setCorrigiendo(true)} data-testid="corregir-cierre">Corregir el cierre</button>}
            {corrigiendo && (
              <form onSubmit={alCorregir} className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3" data-testid="form-correccion">
                <FormularioCierre prefijo="corr" errores={errCorreccion} valores={{ min: cierreActual.tempMin, max: cierreActual.tempMax }} />
                <Campo id="corr-motivo" etiqueta="¿Por qué corriges el cierre?" error={errCorreccion.motivo}><input id="corr-motivo" name="motivo" className="campo" autoComplete="off" required data-testid="corr-motivo" /></Campo>
                {correccion.mensaje?.tipo === 'error' && !correccion.mensaje.errores && <Aviso tipo="error">{correccion.mensaje.texto}</Aviso>}
                <div className="flex flex-wrap gap-2"><button type="submit" className="btn-primary" disabled={correccion.pendiente} data-testid="corr-guardar">{correccion.pendiente ? 'Guardando…' : 'Guardar la corrección'}</button><button type="button" className="btn-secondary" onClick={() => setCorrigiendo(false)}>Cancelar</button></div>
              </form>
            )}
            {okCorreccion && !corrigiendo && <Aviso tipo="ok" testid="correccion-ok">{okCorreccion}</Aviso>}
            {registro.cierres.length > 1 && (
              <details className="text-sm text-gray-700" data-testid="cierre-historial">
                <summary className="min-h-11 cursor-pointer py-2 font-medium text-gray-900">Versiones anteriores del cierre ({registro.cierres.length - 1})</summary>
                <ul className="space-y-1 pl-1">{registro.cierres.filter((x) => !x.vigente).map((x) => <li key={x.version}>Versión {x.version}: {textoTemperatura(x.tempMin, x.tempMax)} · <Link href={`/rutas/${ruta.id}/archivo/data-logger?v=${x.version}`} target="_blank" className="font-medium text-green-800 underline">{x.archivoNombre}</Link> · {x.cerradoPor} · {formatoFechaHora(x.cerradoEn)}</li>)}</ul>
              </details>
            )}
            <PanelLecturasLogger rutaId={ruta.id} logger={registro.logger ?? []} fechaRuta={ruta.fecha} puedeImportar={puedeCerrar} cerrada sinSalir={false} />
          </div>
        ) : sinCierre ? (
          <p className="text-sm text-gray-700" data-testid="cierre-aun-no">Se cierra cuando la unidad salió: ahí adjuntas el informe del data logger (Elitech RC-61, PDF o CSV), lo leemos por ti y revisas la temperatura mínima y la máxima.</p>
        ) : !puedeCerrar ? (
          <p className="text-sm text-gray-700" data-testid="cierre-solo-jt">La unidad ya salió. La ruta la cierra el Jefe de Transporte, con el archivo del data logger y la temperatura mínima y máxima.</p>
        ) : (
          <form onSubmit={alCerrar} className="space-y-3" data-testid="form-cierre">
            <p className="text-sm text-gray-700">La unidad ya salió. Descarga el informe del data logger (Elitech RC-61, PDF o CSV) y súbelo aquí tal cual: lo leemos, llenamos la mínima y la máxima y avisamos si pasó el límite de 24,9 °C. Si no se puede leer, anótalas a mano.</p>
            <FormularioCierre prefijo="cierre" errores={errCierre} />
            {cierre.mensaje?.tipo === 'error' && !cierre.mensaje.errores && <Aviso tipo="error" testid="cierre-error">{cierre.mensaje.texto}</Aviso>}
            <button type="submit" className="btn-primary" disabled={cierre.pendiente} data-testid="cerrar-ruta"><CheckCircle2 className="h-5 w-5" aria-hidden />{cierre.pendiente ? 'Cerrando…' : 'Cerrar la ruta'}</button>
          </form>
        )}
        <p className="text-xs text-gray-600" data-testid="ayuda-temperatura">{AYUDA_TEMPERATURA_RUTA}</p>
        {okCierre && cerrada && !okCorreccion && <Aviso tipo="ok" testid="cierre-ok">{okCierre}</Aviso>}
      </Paso>

      {registro.pendientes.length > 0 && (
        <details className="text-sm text-gray-700" data-testid="lsfr-definiciones">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-gray-900"><Info className="mr-1.5 inline h-4 w-4 text-gray-500" aria-hidden />Todavía sin definir ({registro.pendientes.length})</summary>
          <ul className="list-disc space-y-1 pl-5">{registro.pendientes.map((k) => <li key={k}>{PENDIENTES_LS_FR[k] ?? k}</li>)}</ul>
          <p className="mt-1">No bloquean la ruta: el formato sale con lo que ya está definido.</p>
        </details>
      )}
    </section>
  )
}

/**
 * Archivo del data logger, mínima, máxima y observaciones (los usan el cierre y su corrección). Al elegir el archivo (PDF o CSV del RC-61) se lee en el servidor, se muestra lo que
 * se encontró y se llenan la mínima y la máxima; siguen siendo editables. Si no se puede leer, se anotan a mano.
 */
function FormularioCierre({ prefijo, errores, valores }: { prefijo: string; errores: Record<string, string>; valores?: { min: number; max: number } }) {
  const [min, setMin] = useState(valores ? String(valores.min).replace('.', ',') : '')
  const [max, setMax] = useState(valores ? String(valores.max).replace('.', ',') : '')
  const [lectura, setLectura] = useState<{ estado: 'leyendo' } | { estado: 'ok'; resumen: ResumenLeido } | { estado: 'no'; mensaje: string } | null>(null)
  const leer = async (archivo: File | undefined) => {
    if (!archivo) { setLectura(null); return }
    setLectura({ estado: 'leyendo' })
    const fd = new FormData(); fd.set('archivo', archivo)
    const r = await leerLoggerAccion(fd)
    if (r.ok) {
      setLectura({ estado: 'ok', resumen: r.resumen })
      setMin(r.resumen.estadisticas.min.toFixed(1).replace('.', ',')); setMax(r.resumen.estadisticas.max.toFixed(1).replace('.', ','))
    } else setLectura({ estado: 'no', mensaje: r.errores?.archivo ?? r.mensaje })
  }
  return (
    <>
      <Campo id={`${prefijo}-archivo`} etiqueta="Archivo del data logger" ayuda="(PDF o CSV del Elitech RC-61, tal cual lo descargaste, hasta 10 MB)" error={errores.archivo}>
        <input id={`${prefijo}-archivo`} name="archivo" type="file" className="campo" required aria-invalid={!!errores.archivo} onChange={(e) => void leer(e.target.files?.[0])} data-testid={`${prefijo}-archivo`} />
      </Campo>
      <div aria-live="polite" data-testid={`${prefijo}-lectura`}>
        {lectura?.estado === 'leyendo' && <p className="flex items-center gap-2 text-sm text-gray-700" data-testid={`${prefijo}-leyendo`}><Clock className="h-4 w-4" aria-hidden />Leyendo el archivo…</p>}
        {lectura?.estado === 'ok' && <ResumenLecturaLeida resumen={lectura.resumen} />}
        {lectura?.estado === 'no' && <Aviso tipo="info" testid={`${prefijo}-no-leido`}><p>{lectura.mensaje}</p><p className="mt-1">Puedes cerrar la ruta igual: anota la mínima y la máxima a mano y guardamos el archivo tal cual.</p></Aviso>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={`${prefijo}-min`} etiqueta="Temperatura mínima (°C)" error={errores.tempMin}>
          <input id={`${prefijo}-min`} name="tempMin" inputMode="decimal" autoComplete="off" placeholder="17,5" value={min} onChange={(e) => setMin(e.target.value)} className="campo tabular" required aria-invalid={!!errores.tempMin} data-testid={`${prefijo}-min`} />
        </Campo>
        <Campo id={`${prefijo}-max`} etiqueta="Temperatura máxima (°C)" error={errores.tempMax}>
          <input id={`${prefijo}-max`} name="tempMax" inputMode="decimal" autoComplete="off" placeholder="22,8" value={max} onChange={(e) => setMax(e.target.value)} className="campo tabular" required aria-invalid={!!errores.tempMax} data-testid={`${prefijo}-max`} />
        </Campo>
      </div>
      <Campo id={`${prefijo}-obs`} etiqueta="Observaciones" ayuda="(opcional)">
        <input id={`${prefijo}-obs`} name="observaciones" className="campo" autoComplete="off" data-testid={`${prefijo}-obs`} />
      </Campo>
    </>
  )
}
