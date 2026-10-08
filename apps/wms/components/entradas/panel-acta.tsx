'use client'

import { useCallback, useState } from 'react'
import { Ban, CheckCircle2, ClipboardCheck, Download, FilePlus2, Fingerprint, PenLine, RotateCcw } from 'lucide-react'
import {
  anularActaAccion, confirmarIngresoAccion, firmarActaAccion, generarActaAccion, reemitirActaAccion,
} from '@/app/acciones-entradas'
import { ESTADO_INICIAL, ETIQUETA_ROL_FIRMA, ROLES_FIRMA, puedeFirmarComo, type RolFirma } from '@/domain/entradas'
import type { ActaRecepcionVista, SolicitudDetalle } from '@/domain/entradas-vistas'
import { formatoFechaHora } from '@/domain/fechas'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'
import { ChipActa } from './chips-entradas'
import { FirmaTactil } from './firma-tactil'

function PanelTransportista({ actaId, placaInicial, alFirmar }: { actaId: string; placaInicial?: string; alFirmar: () => void }) {
  const { pendiente, mensaje, ejecutar, limpiar } = useAccion()
  const [nombre, setNombre] = useState('')
  const [dni, setDni] = useState('')
  const [placa, setPlaca] = useState(placaInicial ?? '')
  const [imagen, setImagen] = useState<string | null>(null)
  const e = mensaje?.errores ?? {}
  // Estable: FirmaTactil se reinicia si cambia esta función.
  const alCambiarFirma = useCallback((img: string | null) => { setImagen(img); if (img) limpiar() }, [limpiar])
  return (
    <div className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4" data-testid="panel-transportista">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1"><label htmlFor="t-nombre" className="etiqueta">Nombre completo</label><input id="t-nombre" className={`campo ${e.nombre ? '!border-red-500' : ''}`} value={nombre} onChange={(ev) => setNombre(ev.target.value)} autoComplete="off" />{e.nombre && <p role="alert" className="mt-1 text-xs text-red-700">{e.nombre}</p>}</div>
        <div><label htmlFor="t-dni" className="etiqueta">DNI</label><input id="t-dni" className={`campo tabular ${e.dni ? '!border-red-500' : ''}`} inputMode="numeric" maxLength={8} value={dni} onChange={(ev) => setDni(ev.target.value.replace(/\D/g, ''))} autoComplete="off" />{e.dni && <p role="alert" className="mt-1 text-xs text-red-700">{e.dni}</p>}</div>
        <div><label htmlFor="t-placa" className="etiqueta">Placa</label><input id="t-placa" className={`campo uppercase ${e.placa ? '!border-red-500' : ''}`} value={placa} onChange={(ev) => setPlaca(ev.target.value)} autoComplete="off" />{e.placa && <p role="alert" className="mt-1 text-xs text-red-700">{e.placa}</p>}</div>
      </div>
      <div><p className="etiqueta">Firma del transportista</p><FirmaTactil onCambio={alCambiarFirma} />{e.imagen && <p role="alert" className="mt-1 text-xs text-red-700">{e.imagen}</p>}</div>
      {mensaje?.tipo === 'error' && !Object.keys(e).length && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <button type="button" className="btn-primary btn-sm" disabled={pendiente} data-testid="firmar-transportista"
        onClick={() => ejecutar(() => firmarActaAccion(actaId, { rol: 'TRANSPORTISTA', nombre, dni, placa, imagen: imagen ?? '' }), { alExito: alFirmar })}>
        <PenLine className="h-4 w-4" aria-hidden />{pendiente ? 'Registrando…' : 'Registrar la firma del transportista'}
      </button>
    </div>
  )
}

function FilaFirma({ acta, rol, roles, placa }: { acta: ActaRecepcionVista; rol: RolFirma; roles: Rol[]; placa?: string }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const f = acta.firmas.find((x) => x.rol === rol)
  const puede = acta.estado === 'BORRADOR' && !f && puedeFirmarComo(roles, rol)
  return (
    <li className="py-3" data-testid={`firma-${rol}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{ETIQUETA_ROL_FIRMA[rol]}</p>
          {f ? <p className="text-sm text-gray-600">{f.nombre}{f.dni ? ` · DNI ${f.dni}` : ''}{f.placa ? ` · ${f.placa}` : ''} · {formatoFechaHora(f.firmadoEn)}</p>
            : <p className="text-sm text-gray-600">{rol === 'TRANSPORTISTA' ? 'Firma en pantalla, con nombre, DNI y placa.' : 'Firma con tu usuario.'}</p>}
        </div>
        {f ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-800"><CheckCircle2 className="h-4 w-4" aria-hidden />Firmó</span>
          : puede ? (rol === 'TRANSPORTISTA'
              ? <button type="button" className="btn-secondary btn-sm" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)} data-testid="abrir-transportista"><PenLine className="h-4 w-4" aria-hidden />{abierto ? 'Cerrar' : 'Firma del transportista'}</button>
              : <button type="button" className="btn-primary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => firmarActaAccion(acta.id, { rol }))} data-testid={`firmar-${rol}`}><PenLine className="h-4 w-4" aria-hidden />{pendiente ? 'Firmando…' : 'Firmar'}</button>)
          : acta.estado === 'BORRADOR' ? <span className="text-sm text-gray-600">Falta su firma</span> : null}
      </div>
      {f?.imagen && <img src={f.imagen} alt={`Firma de ${f.nombre}`} className="mt-2 h-16 rounded border border-gray-200 bg-white p-1" />}
      {abierto && puede && rol === 'TRANSPORTISTA' && <PanelTransportista actaId={acta.id} placaInicial={placa} alFirmar={() => setAbierto(false)} />}
      {mensaje?.tipo === 'error' && rol !== 'TRANSPORTISTA' && <div className="mt-2"><Aviso tipo="error">{mensaje.texto}</Aviso></div>}
    </li>
  )
}

export function PanelActa({ solicitud, roles, motivoSinActa, base }: { solicitud: SolicitudDetalle; roles: Rol[]; motivoSinActa: string | null; base: string }) {
  const ingreso = { ...solicitud, confirmado: !!solicitud.recepcion?.confirmado, confirmadoEn: solicitud.recepcion?.confirmadoEn, placa: solicitud.recepcion?.placa }
  const destino = ESTADO_INICIAL[solicitud.tipo] === 'DEVOLUCIONES' ? 'Devoluciones' : 'Cuarentena'
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const vigente = ingreso.actas.find((a) => a.estado !== 'ANULADA')
  const ultimaAnulada = ingreso.actas.find((a) => a.estado === 'ANULADA' && !ingreso.actas.some((x) => x.reemplazaA === a.id))
  const puedeEjecutar = roles.some((r) => r === 'jefe_almacen' || r === 'reemplazo_jefe' || r === 'auxiliar' || r === 'asistente_dt')
  const puedeAnular = roles.some((r) => r === 'jefe_almacen' || r === 'reemplazo_jefe' || r === 'direccion_tecnica')

  return (
    <div className="mt-3 space-y-4">
      {!vigente && !ultimaAnulada && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Cuando hayas verificado todas las líneas y tengas la temperatura, el acta sale prellenada desde la solicitud, con su número (I-AAAAMM-correlativo), y pasa a firmas.</p>
          {motivoSinActa && <Aviso tipo="info" testid="motivo-sin-acta">{motivoSinActa}</Aviso>}
          {puedeEjecutar && <button type="button" className="btn-primary" disabled={!!motivoSinActa || pendiente} onClick={() => ejecutar(() => generarActaAccion(ingreso.id), { exito: 'Acta generada. Ahora pasa a firmas.' })} data-testid="generar-acta"><FilePlus2 className="h-5 w-5" aria-hidden />{pendiente ? 'Generando…' : 'Generar el acta de recepción'}</button>}
        </div>
      )}

      {!vigente && ultimaAnulada && (
        <div className="space-y-3">
          <Aviso tipo="atencion">El acta {ultimaAnulada.numero} está anulada. {puedeEjecutar ? 'Corrige lo que haga falta arriba y emite otra vinculada (el número anulado no se reutiliza).' : 'Quien registra la entrada emite la nueva.'}</Aviso>
          {puedeEjecutar && <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => reemitirActaAccion(ultimaAnulada.id), { exito: 'Acta reemitida. Hay que firmarla de nuevo.' })} data-testid="reemitir-acta"><RotateCcw className="h-5 w-5" aria-hidden />{pendiente ? 'Reemitiendo…' : 'Emitir el acta nueva'}</button>}
        </div>
      )}

      {vigente && (
        <div className="space-y-4" data-testid="acta-vigente">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="tabular font-heading text-2xl font-semibold text-gray-900" data-testid="numero-acta">{vigente.numero}</p>
              <p className="flex items-center gap-1.5 text-xs text-gray-600"><Fingerprint className="h-3.5 w-3.5" aria-hidden />Huella <code className="tabular">{vigente.hash.slice(0, 12)}…</code>{vigente.reemplazaANumero && <> · reemplaza a {vigente.reemplazaANumero}</>}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2"><ChipActa estado={vigente.estado} /><a className="btn-secondary btn-sm" href={`${base}/acta/${vigente.id}/pdf`} target="_blank" rel="noopener" data-testid="pdf-acta"><Download className="h-4 w-4" aria-hidden />Ver el PDF</a><a className="btn-secondary btn-sm" href={`${base}/acta/${vigente.id}/xlsx`} download data-testid="xlsx-acta"><Download className="h-4 w-4" aria-hidden />Descargar Excel</a></div>
          </div>
          {vigente.estado === 'BORRADOR' && !ingreso.bloqueadoPorFirmas && <p className="text-sm text-gray-700">Puedes corregir lotes y datos hasta que alguien firme. Con la primera firma, el contenido queda fijo.</p>}
          {vigente.estado === 'BORRADOR' && ingreso.bloqueadoPorFirmas && <Aviso tipo="info">Ya hay firmas: el contenido del acta quedó fijo. Si hay un error, anúlala con motivo y emite otra.</Aviso>}
          <ul className="divide-y divide-gray-100" aria-label="Firmas del acta">
            {ROLES_FIRMA.map((r) => <FilaFirma key={r} acta={vigente} rol={r} roles={roles} placa={ingreso.placa} />)}
          </ul>

          {vigente.estado === 'FIRMADA' && !ingreso.confirmado && (
            <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
              <p className="text-sm text-teal-950"><strong>Acta firmada por las cuatro partes.</strong> Al confirmar, las unidades nacen en {destino} en las posiciones elegidas y quedan esperando su evaluación organoléptica.</p>
              {puedeEjecutar && <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => confirmarIngresoAccion(ingreso.id), { exito: `Ingreso confirmado. Las unidades están en ${destino}.` })} data-testid="confirmar-ingreso"><ClipboardCheck className="h-5 w-5" aria-hidden />{pendiente ? 'Confirmando…' : 'Confirmar el ingreso'}</button>}
            </div>
          )}
          {ingreso.confirmado && <Aviso tipo="ok" testid="ingreso-confirmado">Ingreso confirmado el {formatoFechaHora(ingreso.confirmadoEn)}. Las unidades están en {destino}.</Aviso>}

          {vigente.estado === 'FIRMADA' && puedeAnular && (
            <div>
              {!anulando ? <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setAnulando(true)} data-testid="abrir-anular"><Ban className="h-4 w-4" aria-hidden />Anular esta acta…</button> : (
                <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-700">Un acta firmada no se edita. Si hay un error, se anula con motivo y se emite otra vinculada; ambas quedan guardadas. <strong>El stock ya ingresado no cambia.</strong></p>
                  <div><label htmlFor="motivo-anulacion" className="etiqueta">Motivo</label><input id="motivo-anulacion" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" /></div>
                  <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => anularActaAccion(vigente.id, motivo), { exito: 'Acta anulada.', alExito: () => setAnulando(false) })} data-testid="confirmar-anular">Anular el acta</button><button type="button" className="btn-secondary btn-sm" onClick={() => setAnulando(false)}>No anular</button></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}

      {ingreso.actas.filter((a) => a.id !== vigente?.id).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-800">Actas anteriores</h4>
          <ul className="mt-1 divide-y divide-gray-100 text-sm" data-testid="actas-anteriores">
            {ingreso.actas.filter((a) => a.id !== vigente?.id).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><span className="tabular font-medium text-gray-900">{a.numero}</span> <ChipActa estado={a.estado} /></span>
                <span className="text-gray-600">{a.motivoAnulacion ? `Motivo: ${a.motivoAnulacion}` : ''}{a.reemplazadaPorNumero ? ` · reemplazada por ${a.reemplazadaPorNumero}` : ''}</span>
                <a className="text-sm text-gray-800 underline" href={`${base}/acta/${a.id}/pdf`} target="_blank" rel="noopener">PDF</a>{' · '}<a className="text-sm text-gray-800 underline" href={`${base}/acta/${a.id}/xlsx`} download>Excel</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
