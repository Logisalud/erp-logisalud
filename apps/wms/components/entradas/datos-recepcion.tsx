'use client'

import { useState } from 'react'
import { Save, Thermometer } from 'lucide-react'
import { editarRecepcionAccion } from '@/app/acciones-entradas'
import { TEMPERATURA_MAX_C, TEMPERATURA_MIN_C, temperaturaFueraDeRango } from '@/domain/entradas'
import type { SolicitudDetalle } from '@/domain/entradas-vistas'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'

const VERIFICACIONES: { clave: string; texto: string }[] = [
  { clave: 'cantidadCorresponde', texto: 'La cantidad de cajas y de unidades corresponde a lo indicado en el documento' },
  { clave: 'cajasSelladas', texto: 'Las cajas están debidamente selladas' },
  { clave: 'embalajeLimpio', texto: 'El embalaje no está sucio, arrugado, húmedo ni deteriorado' },
]

const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '')

/** "14:30" de hoy en Lima → ISO. */
function aIso(hhmm: string, hoy: string): string | undefined {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return undefined
  return new Date(`${hoy}T${hhmm}:00-05:00`).toISOString()
}

export function DatosRecepcion({ solicitud, editable, hoy }: { solicitud: SolicitudDetalle; editable: boolean; hoy: string }) {
  const ingreso = { ...solicitud.recepcion!, tipo: solicitud.tipo }
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [temp, setTemp] = useState(ingreso.temperaturaC != null ? String(ingreso.temperaturaC) : '')
  const [bultos, setBultos] = useState(ingreso.bultos != null ? String(ingreso.bultos) : '')
  const [paletas, setPaletas] = useState(ingreso.paletas != null ? String(ingreso.paletas) : '')
  const [placa, setPlaca] = useState(ingreso.placa ?? '')
  const [marca, setMarca] = useState(ingreso.marcaVehiculo ?? '')
  const [conteo, setConteo] = useState(ingreso.tipoConteo ?? '')
  const [inicio, setInicio] = useState(hora(ingreso.horaInicio))
  const [fin, setFin] = useState(hora(ingreso.horaFin))
  const [verif, setVerif] = useState<Record<string, boolean>>(ingreso.verificaciones)
  const [factura, setFactura] = useState(ingreso.facturaNumero ?? '')
  const [obs, setObs] = useState(ingreso.observaciones ?? '')

  const t = temp.trim() === '' ? null : Number(temp.replace(',', '.'))
  const fuera = temperaturaFueraDeRango(t)

  function guardar() {
    ejecutar(() => editarRecepcionAccion(solicitud.id, {
      temperaturaC: t != null && Number.isFinite(t) ? t : null, bultos: bultos ? Number(bultos) : null, paletas: paletas ? Number(paletas) : null,
      placa, marcaVehiculo: marca, tipoConteo: conteo as 'MUESTREO' | 'TOTAL' | 'OTROS' | '', horaInicio: aIso(inicio, hoy) ?? '', horaFin: aIso(fin, hoy) ?? '',
      verificaciones: verif, observaciones: obs, ...(ingreso.tipo === 'COMPRA_LOCAL' ? { facturaNumero: factura } : {}),
    }), { exito: 'Datos de la recepción guardados.' })
  }

  const ro = !editable
  const dato = (k: string, v: string | number | undefined) => <div className="flex justify-between gap-3 py-2"><dt className="text-gray-600">{k}</dt><dd className="text-right text-gray-900">{v === undefined || v === '' ? '—' : v}</dd></div>

  if (ro) {
    return (
      <dl className="mt-2 divide-y divide-gray-100 text-sm" data-testid="datos-lectura">
        {dato('Temperatura', ingreso.temperaturaC != null ? `${ingreso.temperaturaC} °C` : undefined)}
        {dato('Bultos', ingreso.bultos)}{dato('Paletas', ingreso.paletas)}
        {dato('Vehículo', [ingreso.placa, ingreso.marcaVehiculo].filter(Boolean).join(' · '))}
        {dato('Conteo', ingreso.tipoConteo === 'TOTAL' ? 'Al 100 %' : ingreso.tipoConteo === 'MUESTREO' ? 'Por muestreo' : ingreso.tipoConteo === 'OTROS' ? 'Otros' : undefined)}
        {dato('Horario', ingreso.horaInicio ? `${hora(ingreso.horaInicio)} a ${hora(ingreso.horaFin)}` : undefined)}
        {ingreso.tipo === 'COMPRA_LOCAL' && dato('Factura', ingreso.facturaNumero)}
        {dato('Observaciones', ingreso.observaciones)}
      </dl>
    )
  }

  return (
    <div className="mt-3 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="temp" className="etiqueta">Temperatura (°C) <span className="text-red-700">*</span></label>
          <div className="relative"><Thermometer className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden /><input id="temp" className={`campo tabular pl-9 ${fuera ? '!border-amber-500' : ''}`} inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value.replace(/[^\d.,]/g, ''))} autoComplete="off" /></div>
          <p className={`mt-1 text-xs ${fuera ? 'font-medium text-amber-900' : 'text-gray-600'}`} data-testid="ayuda-temperatura">{fuera ? `Fuera del rango de ${TEMPERATURA_MIN_C} a ${TEMPERATURA_MAX_C} °C: se recibe y se avisa a Dirección Técnica.` : `Rango normal: ${TEMPERATURA_MIN_C} a ${TEMPERATURA_MAX_C} °C.`}</p>
        </div>
        <div><label htmlFor="bultos" className="etiqueta">Bultos</label><input id="bultos" className="campo tabular" inputMode="numeric" value={bultos} onChange={(e) => setBultos(e.target.value.replace(/\D/g, ''))} autoComplete="off" /></div>
        <div><label htmlFor="paletas" className="etiqueta">Paletas</label><input id="paletas" className="campo tabular" inputMode="numeric" value={paletas} onChange={(e) => setPaletas(e.target.value.replace(/\D/g, ''))} autoComplete="off" /></div>
        <div><label htmlFor="conteo" className="etiqueta">Tipo de conteo</label><select id="conteo" className="campo" value={conteo} onChange={(e) => setConteo(e.target.value as typeof conteo)}><option value="">Elige</option><option value="TOTAL">Al 100 %</option><option value="MUESTREO">Por muestreo</option><option value="OTROS">Otros</option></select></div>
        <div><label htmlFor="placa" className="etiqueta">Placa del vehículo</label><input id="placa" className="campo uppercase" value={placa} onChange={(e) => setPlaca(e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor="marca" className="etiqueta">Marca del vehículo</label><input id="marca" className="campo" value={marca} onChange={(e) => setMarca(e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor="inicio" className="etiqueta">Hora de inicio</label><input id="inicio" type="time" className="campo tabular" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
        <div><label htmlFor="fin" className="etiqueta">Hora final</label><input id="fin" type="time" className="campo tabular" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
        {ingreso.tipo === 'COMPRA_LOCAL' && <div className="sm:col-span-2"><label htmlFor="factura" className="etiqueta">Factura del proveedor</label><input id="factura" className="campo" value={factura} onChange={(e) => setFactura(e.target.value)} placeholder="Si ya la tienes" autoComplete="off" /></div>}
      </div>
      <fieldset>
        <legend className="etiqueta">Verificación del estado del producto</legend>
        <ul className="space-y-1">
          {VERIFICACIONES.map((v) => (
            <li key={v.clave}><label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 text-sm text-gray-800 hover:bg-gray-50"><input type="checkbox" className="h-5 w-5 rounded border-gray-300 accent-green-600" checked={!!verif[v.clave]} onChange={(e) => setVerif((x) => ({ ...x, [v.clave]: e.target.checked }))} />{v.texto}</label></li>
          ))}
        </ul>
      </fieldset>
      <div><label htmlFor="obs" className="etiqueta">Observaciones</label><textarea id="obs" rows={2} className="campo py-2" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary btn-sm" onClick={guardar} disabled={pendiente} data-testid="guardar-datos"><Save className="h-4 w-4" aria-hidden />{pendiente ? 'Guardando…' : 'Guardar datos'}</button>
      </div>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}
