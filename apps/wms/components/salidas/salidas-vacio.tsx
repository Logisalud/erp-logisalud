'use client'

import Link from 'next/link'
import { Inbox, Plus, RefreshCw, SearchX } from 'lucide-react'
import { actualizarBandejaAccion } from '@/app/acciones-pedidos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** La frase que explica de dónde vienen las salidas (SA-1): la misma en la pantalla vacía y como subtítulo. */
export const FRASE_ORIGEN_SALIDAS = 'Las salidas nacen de los pedidos. Trae los pedidos nuevos o crea una salida manual'

/**
 * Lo que se ve en «Órdenes de salida» cuando de verdad no hay ninguna: dice de dónde vienen y ofrece los dos caminos. Quien no puede traer pedidos o crear una salida ve
 * quién sí puede (no un botón muerto).
 */
export function SalidasVacio({ puedeTraer, puedeCrear }: { puedeTraer: boolean; puedeCrear: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const traer = () => ejecutar(() => actualizarBandejaAccion(), {
    alExito: () => {},
    exito: 'Listo: los pedidos nuevos ya están en «Pedidos por despachar». Sigue: créales su orden de salida desde allí.',
  })
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-vacio">
      <Inbox className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
      <h2 className="mt-3 font-heading text-xl font-medium tracking-wide text-gray-900">Todavía no hay órdenes de salida</h2>
      <p className="mx-auto mt-1 max-w-md text-gray-700" data-testid="salidas-vacio-frase">{FRASE_ORIGEN_SALIDAS}.</p>
      <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-1.5">
          {puedeTraer
            ? <button type="button" className="btn-primary w-full sm:w-auto" onClick={traer} disabled={pendiente} data-testid="vacio-traer-pedidos"><RefreshCw className={`h-5 w-5 ${pendiente ? 'animate-spin' : ''}`} aria-hidden />{pendiente ? 'Consultando Pedidos…' : 'Traer pedidos nuevos'}</button>
            : <p className="max-w-60 text-sm text-gray-600" data-testid="vacio-traer-sin-permiso">Los pedidos nuevos los trae el Jefe de Transporte o el Jefe de Almacén.</p>}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          {puedeCrear
            ? <Link href="/salidas/nueva" className="btn-secondary w-full sm:w-auto" data-testid="vacio-nueva-orden"><Plus className="h-5 w-5" aria-hidden />Nueva Orden de Salida</Link>
            : <p className="max-w-60 text-sm text-gray-600" data-testid="vacio-nueva-sin-permiso">Una salida manual la crea el Jefe de Transporte, el Jefe de Almacén o quien autoriza salidas sin venta.</p>}
        </div>
      </div>
      {mensaje && (
        <div className="mx-auto mt-5 max-w-lg text-left">
          {mensaje.tipo === 'ok'
            ? <Aviso tipo="ok" testid="vacio-traer-ok"><p>{mensaje.texto} <Link href="/pedidos" className="font-medium underline">Ir a Pedidos por despachar</Link></p></Aviso>
            : <Aviso tipo="error" testid="vacio-traer-error"><p className="font-medium">No se pudieron traer los pedidos.</p><p>{mensaje.texto}</p></Aviso>}
        </div>
      )}
    </div>
  )
}

/** Hay órdenes, pero ninguna coincide con la búsqueda o la etapa elegida. */
export function SalidasSinCoincidencias({ alQuitar }: { alQuitar: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-coincidencias">
      <SearchX className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
      <h2 className="mt-3 font-heading text-xl font-medium tracking-wide text-gray-900">Ninguna orden coincide con tu búsqueda</h2>
      <p className="mx-auto mt-1 max-w-md text-gray-700">Prueba con otro número, cliente o ruta, o cambia la etapa.</p>
      <button type="button" className="btn-secondary mt-5" onClick={alQuitar} data-testid="quitar-filtros-salidas">Quitar filtros</button>
    </div>
  )
}
