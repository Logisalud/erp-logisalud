'use client'

import { useState } from 'react'
import { Trash2, Upload, UserPlus } from 'lucide-react'
import { cargarContactosCsvAccion, eliminarContactoVendedorAccion, guardarContactoVendedorAccion, guardarOpcionSeguimientoAccion } from '@/app/acciones-contactos'
import { telefonoBonito, type ClaveOpcionSeguimiento, type ContactoVendedorVista, type ErrorFilaContacto, type OpcionesSeguimiento } from '@/domain/seguimiento'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** Para el Administrador: los teléfonos de los vendedores (a mano o con un CSV) y las opciones de la pantalla del cliente. */
export function ConfigSeguimiento({ contactos, opciones }: { contactos: ContactoVendedorVista[]; opciones: OpcionesSeguimiento }) {
  const a = useAccion()
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [errores, setErrores] = useState<ErrorFilaContacto[]>([])
  const [guardados, setGuardados] = useState<number | null>(null)
  const [ver, setVer] = useState(opciones)
  const opcion = (clave: ClaveOpcionSeguimiento, valor: string) => a.ejecutar(() => guardarOpcionSeguimientoAccion(clave, valor), { exito: 'Guardado.' })
  const subir = async (f: File | undefined) => {
    if (!f) return
    const texto = await f.text()
    a.ejecutar(() => cargarContactosCsvAccion(texto), { alExito: (r) => { setGuardados(r.guardados); setErrores(r.errores) } })
  }
  return (
    <div className="space-y-6" data-testid="config-seguimiento">
      {a.mensaje?.tipo === 'error' && <Aviso tipo="error" testid="seg-error">{a.mensaje.texto}</Aviso>}
      {a.mensaje?.tipo === 'ok' && <Aviso tipo="ok" testid="seg-ok">{a.mensaje.texto}</Aviso>}

      <section className="card space-y-4 p-5" aria-labelledby="h-contactos">
        <div>
          <h2 id="h-contactos" className="font-heading text-xl font-medium tracking-wide text-gray-900">Teléfonos de los vendedores</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-700">Escribe el nombre del vendedor tal como llega de Pedidos y su celular (9 dígitos, se guarda con +51). Si un vendedor no tiene número, el cliente no ve el botón «Escribir a mi vendedor»: no hay otro contacto.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
          <div><label htmlFor="cv-nombre" className="etiqueta">Vendedor</label><input id="cv-nombre" className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" data-testid="cv-nombre" /></div>
          <div><label htmlFor="cv-tel" className="etiqueta">Celular</label><input id="cv-tel" className="campo tabular" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" placeholder="987 654 321" data-testid="cv-telefono" /></div>
          <button type="button" className="btn-primary" disabled={a.pendiente} data-testid="cv-guardar" onClick={() => a.ejecutar(() => guardarContactoVendedorAccion(nombre, telefono), { exito: 'Contacto guardado.', alExito: () => { setNombre(''); setTelefono('') } })}><UserPlus className="h-5 w-5" aria-hidden />Guardar</button>
        </div>
        <div>
          <label className="btn-secondary inline-flex cursor-pointer"><Upload className="h-5 w-5" aria-hidden />Cargar un CSV (nombre, teléfono)
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" data-testid="cv-csv" onChange={(e) => { void subir(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>
        {guardados !== null && <Aviso tipo={errores.length ? 'error' : 'ok'} testid="cv-resultado">Se guardaron {guardados} contactos{errores.length ? `; ${errores.length} filas no sirven:` : '.'}{errores.length > 0 && <ul className="mt-1 list-disc pl-5">{errores.map((e) => <li key={e.fila}>Fila {e.fila} {e.nombre && `(${e.nombre})`}: {e.motivo}</li>)}</ul>}</Aviso>}
        {contactos.length === 0 ? <p className="text-sm text-gray-700" data-testid="cv-vacio">Aún no hay teléfonos cargados.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left" data-testid="cv-tabla">
            <thead><tr className="border-b border-gray-200 text-sm text-gray-700"><th className="py-2 pr-3 font-medium">Vendedor</th><th className="py-2 pr-3 font-medium">Celular</th><th className="py-2"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{contactos.map((c) => (
              <tr key={c.id} className="border-b border-gray-100" data-testid={`cv-fila-${c.id}`}>
                <td className="py-2 pr-3 text-gray-900">{c.nombre}</td><td className="tabular py-2 pr-3 text-gray-900">{telefonoBonito(c.telefono)}</td>
                <td className="py-2 text-right"><button type="button" className="btn-secondary" disabled={a.pendiente} aria-label={`Quitar a ${c.nombre}`} onClick={() => a.ejecutar(() => eliminarContactoVendedorAccion(c.id), { exito: 'Contacto quitado.' })}><Trash2 className="h-5 w-5" aria-hidden /></button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="h-opciones">
        <h2 id="h-opciones" className="font-heading text-xl font-medium tracking-wide text-gray-900">Opciones de la pantalla</h2>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5" checked={ver.rutaVisible} data-testid="op-ruta" onChange={(e) => { setVer({ ...ver, rutaVisible: e.target.checked }); opcion('seguimiento_ruta_visible', String(e.target.checked)) }} />
          <span><span className="block font-medium text-gray-900">Mostrar «Van X de Y entregas de tu ruta»</span><span className="text-sm text-gray-700">Solo cuentas; no muestra a otros clientes. No sale si la ruta tiene una sola parada.</span></span></label>
        <div><label htmlFor="op-guia" className="etiqueta">¿Cuándo se ve la guía de remisión?</label>
          <select id="op-guia" className="campo sm:max-w-sm" value={ver.guiaVisible} data-testid="op-guia" onChange={(e) => { setVer({ ...ver, guiaVisible: e.target.value as 'SIEMPRE' | 'DESPUES_ENTREGA' }); opcion('seguimiento_guia_visible', e.target.value) }}>
            <option value="SIEMPRE">Siempre, apenas esté aceptada</option><option value="DESPUES_ENTREGA">Solo después de entregado</option></select></div>
        {([['seguimiento_whatsapp_prueba', 'whatsappPrueba', 'Número de prueba (modo piloto)', 'En piloto el botón escribe a este número, nunca al vendedor real.'],
          ['seguimiento_base_url', 'baseUrl', 'Dirección propia para los clientes', 'Por ejemplo https://seguimiento.logisalud.pe — se usa al salir a producción.']] as const).map(([clave, campo, titulo, ayuda]) => (
          <div key={clave}><label htmlFor={`op-${clave}`} className="etiqueta">{titulo}</label>
            <input id={`op-${clave}`} className="campo sm:max-w-sm" value={ver[campo]} data-testid={`op-${campo}`} onChange={(e) => setVer({ ...ver, [campo]: e.target.value })} onBlur={() => { if (ver[campo] !== opciones[campo]) opcion(clave, ver[campo]) }} autoComplete="off" />
            <p className="mt-1 text-sm text-gray-700">{ayuda}</p></div>))}
      </section>
    </div>
  )
}
