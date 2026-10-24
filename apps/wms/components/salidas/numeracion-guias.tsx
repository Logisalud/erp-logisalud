'use client'

import { useState } from 'react'
import { CheckCircle2, Hourglass, Plug, ShieldAlert } from 'lucide-react'
import { confirmarCorrelativoGuiaAccion, corregirCorrelativoGuiaAccion, probarConexionNubefactAccion } from '@/app/acciones-picking'
import { ETIQUETA_MODO, NOMBRE_MODO, type ModoNubefact } from '@/domain/guia-electronica'
import { REGLA_PANEL_NUBEFACT, numeroConSerie, puedeAdministrarNumeracion, validarCorrelativoInicial, type EstadoCorrelativo } from '@/domain/numeracion-guias'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { CHIP_AVISO, CHIP_OK } from '../estilos-opcion'

/**
 * «Numeración de guías» (D-162 a D-164): cómo va la serie (TTT1), si el correlativo inicial está confirmado, cuál es la próxima guía y la regla del panel de Nubefact.
 * Quien administra la numeración (Jefe de Transporte o administración del WMS) confirma el primer número cuando Sebas lo indica y, si Nubefact reporta un «salto», lo corrige con un motivo.
 */
export function NumeracionGuias({ estado, modo, roles }: { estado: EstadoCorrelativo; modo: ModoNubefact; roles: readonly Rol[] }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [inicial, setInicial] = useState('')
  const [nota, setNota] = useState('')
  const [ultimo, setUltimo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [conexion, setConexion] = useState<{ ok: boolean; texto: string } | null>(null)
  const [probando, setProbando] = useState(false)
  const puede = puedeAdministrarNumeracion(roles)
  const errorInicial = inicial.trim() ? validarCorrelativoInicial(inicial) : null
  const real = modo !== 'SIMULADOR'

  async function probar() {
    setProbando(true); setConexion(null)
    try { const r = await probarConexionNubefactAccion(); setConexion({ ok: r.ok, texto: r.mensaje }) } catch { setConexion({ ok: false, texto: 'No se pudo probar la conexión. Intenta de nuevo.' }) }
    setProbando(false)
  }

  return (
    <section aria-labelledby="h-numeracion" className="space-y-3 rounded-lg border border-gray-200 bg-white p-4" data-testid="numeracion-guias">
      <h3 id="h-numeracion" className="font-medium text-gray-900">Numeración de guías · serie <span className="tabular">{estado.serie}</span></h3>
      <p className="flex flex-wrap items-center gap-2 text-xs text-gray-800">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${estado.confirmado ? CHIP_OK : CHIP_AVISO}`} data-testid="correlativo-estado" data-confirmado={estado.confirmado}>
          {estado.confirmado ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Hourglass className="h-3.5 w-3.5" aria-hidden />}
          {estado.confirmado ? 'Correlativo confirmado' : 'Falta confirmar el correlativo inicial'}
        </span>
        <span className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1" data-testid="numeracion-entorno" data-modo={modo}>{ETIQUETA_MODO[modo]}</span>
      </p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div><dt className="text-gray-600">Último número del WMS</dt><dd className="tabular text-gray-900" data-testid="numeracion-ultimo">{estado.ultimo > 0 ? numeroConSerie(estado.serie, estado.ultimo) : 'Ninguno todavía'}</dd></div>
        <div><dt className="text-gray-600">Próxima guía</dt><dd className="tabular text-gray-900" data-testid="numeracion-proximo">{numeroConSerie(estado.serie, estado.proximo)}</dd></div>
        <div><dt className="text-gray-600">En curso</dt><dd className="text-gray-900" data-testid="numeracion-en-curso">{estado.enCurso ? `${numeroConSerie(estado.serie, estado.enCurso.numero)}${estado.enCurso.salidaNumero ? ` (${estado.enCurso.salidaNumero})` : ''}` : 'Ninguna'}</dd></div>
      </dl>
      {!estado.confirmado && <p className="text-sm text-gray-800" data-testid="numeracion-bloqueo">Una guía real no sale hasta que se confirme con qué número empieza la serie: lo indica Sebas al salir a producción. Mientras tanto se emite en el simulador o en el entorno de pruebas.</p>}
      <p className="flex items-start gap-2 text-sm text-gray-800" data-testid="regla-panel"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" aria-hidden />{REGLA_PANEL_NUBEFACT}</p>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} testid="numeracion-mensaje">{mensaje.texto}</Aviso>}

      {puede && !estado.confirmado && (
        <form className="space-y-3 rounded-md border border-gray-200 p-3" data-testid="form-confirmar-correlativo" onSubmit={(e) => { e.preventDefault(); if (errorInicial || !inicial.trim()) return; ejecutar(() => confirmarCorrelativoGuiaAccion(estado.serie, Number(inicial), nota), { exito: `Listo: la primera guía real será la ${numeroConSerie(estado.serie, Number(inicial))}. Ya se puede emitir en producción.`, alExito: () => { setInicial(''); setNota('') } }) }}>
          <p className="text-sm font-medium text-gray-900">Confirmar el correlativo inicial</p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <div>
              <label htmlFor="correlativo-inicial" className="etiqueta">Primer número que usará el WMS</label>
              <input id="correlativo-inicial" inputMode="numeric" className="campo tabular" value={inicial} onChange={(e) => setInicial(e.target.value.replace(/\D/g, ''))} data-testid="correlativo-inicial" aria-invalid={!!errorInicial} />
              <p className="mt-1 text-xs text-gray-600">El siguiente al último que muestra Nubefact.</p>
              {errorInicial && <p role="alert" className="mt-1 text-sm text-red-800" data-testid="error-correlativo-inicial">{errorInicial}</p>}
            </div>
            <div><label htmlFor="correlativo-nota" className="etiqueta">Nota (opcional)</label><input id="correlativo-nota" className="campo" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Lo indicó Sebas" /></div>
          </div>
          <button type="submit" className="btn-secondary" disabled={pendiente || !inicial.trim() || !!errorInicial} data-testid="confirmar-correlativo">{pendiente ? 'Guardando…' : 'Confirmar el correlativo'}</button>
        </form>
      )}

      {puede && estado.confirmado && (
        <details className="rounded-md border border-gray-200 p-3" data-testid="corregir-correlativo">
          <summary className="cursor-pointer text-sm font-medium text-gray-900">Corregir el correlativo (si Nubefact dice que se saltó un número)</summary>
          <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (!ultimo.trim() || !motivo.trim()) return; ejecutar(() => corregirCorrelativoGuiaAccion(estado.serie, Number(ultimo), motivo), { exito: `Listo: la próxima guía será la ${numeroConSerie(estado.serie, Number(ultimo) + 1)}.`, alExito: () => { setUltimo(''); setMotivo('') } }) }}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
              <div><label htmlFor="correlativo-ultimo" className="etiqueta">Último número que muestra Nubefact</label><input id="correlativo-ultimo" inputMode="numeric" className="campo tabular" value={ultimo} onChange={(e) => setUltimo(e.target.value.replace(/\D/g, ''))} data-testid="correlativo-ultimo" /></div>
              <div><label htmlFor="correlativo-motivo" className="etiqueta">Motivo</label><input id="correlativo-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Alguien emitió guías desde el panel" data-testid="correlativo-motivo" /></div>
            </div>
            <button type="submit" className="btn-secondary" disabled={pendiente || !ultimo.trim() || !motivo.trim()} data-testid="corregir-correlativo-boton">{pendiente ? 'Guardando…' : 'Corregir el correlativo'}</button>
          </form>
        </details>
      )}

      <div className="space-y-2" data-testid="probar-conexion">
        <p className="text-sm text-gray-800" data-testid="conexion-destino" data-modo={modo}>Esta guía se emite en: <strong className="font-medium text-gray-900">{NOMBRE_MODO[modo]}</strong></p>
        <button type="button" className="btn-secondary btn-sm" onClick={probar} disabled={probando} data-testid="probar-conexion-boton"><Plug className="h-4 w-4" aria-hidden />{probando ? 'Probando…' : real ? 'Probar conexión con Nubefact' : 'Ver a qué estoy conectado'}</button>
        {conexion && <Aviso tipo={conexion.ok ? 'ok' : 'error'} testid="probar-conexion-resultado">{conexion.texto}</Aviso>}
      </div>
    </section>
  )
}
