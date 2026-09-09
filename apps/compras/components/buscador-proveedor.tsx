'use client'

import { useEffect, useRef, useState } from 'react'
import { crearProveedorRapidoAction } from '@/app/proveedores/acciones-rapidas'
import type { TipoProveedorUnificado } from '@/domain/proveedor'

export type ProveedorElegido = {
  id: string
  nombre: string
  condicionPagoDias: number
  moneda: string
  /** compras.proveedores o servicios.proveedores_servicio — solo viene
   * poblado cuando el combobox busca sin `tipo` (Pago Directo, que puede
   * pagarle a cualquiera de los dos). En OC (tipo='mercaderia'/'bien')
   * siempre es 'compra', no hace falta que el formulario lo use. */
  fuente?: 'compra' | 'servicio'
}

/**
 * Combobox de proveedor con búsqueda en el servidor por RUC o razón social.
 *
 * No es un <select>: mismo criterio que BuscadorProducto — la cartera de
 * proveedores va a seguir creciendo y un <select> obliga a precargarla
 * entera. Trae debounce y descarte de respuestas viejas.
 *
 * También permite crear un proveedor nuevo sin salir de la pantalla ("+
 * Crear proveedor nuevo" al final de la lista) — llama a
 * crearProveedorRapidoAction() y elige el recién creado solo. Si `tipo` no
 * viene (caso Pago Directo, que puede pagarle a mercadería/bien o a
 * servicio) pide un toggle extra para saber a qué tabla va.
 */
export function BuscadorProveedor({
  valor,
  onElegir,
  tipo,
}: {
  valor: ProveedorElegido | null
  onElegir: (p: ProveedorElegido | null) => void
  tipo?: 'mercaderia' | 'bien'
}) {
  const [termino, setTermino] = useState('')
  const [opciones, setOpciones] = useState<ProveedorElegido[]>([])
  const [buscando, setBuscando] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [creando, setCreando] = useState(false)
  const pedidoActual = useRef(0)

  useEffect(() => {
    if (!termino.trim()) {
      setOpciones([])
      return
    }
    const miPedido = ++pedidoActual.current
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: termino })
        if (tipo) params.set('tipo', tipo)
        const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/proveedores?${params}`)
        const json = await r.json()
        if (miPedido === pedidoActual.current) setOpciones(json.proveedores ?? [])
      } finally {
        if (miPedido === pedidoActual.current) setBuscando(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [termino, tipo])

  function elegir(p: ProveedorElegido | null) {
    onElegir(p)
    setTermino('')
    setAbierto(false)
    setCreando(false)
  }

  if (valor) {
    return (
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">{valor.nombre}</p>
        <button type="button" onClick={() => elegir(null)} className="shrink-0 text-sm text-logisalud-teal underline">
          Cambiar
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={termino}
        onChange={(e) => { setTermino(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        placeholder="Buscar por RUC o razón social…"
        className="min-h-12 w-full rounded-md border border-gray-300 px-3"
      />
      {abierto ? (
        creando ? (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white p-3 shadow-md">
            <FormularioProveedorRapido
              tipoFijo={tipo}
              nombreSugerido={termino}
              onCreado={(p) => elegir(p)}
              onCancelar={() => setCreando(false)}
            />
          </div>
        ) : termino.trim() ? (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-md">
            {buscando && opciones.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">Buscando…</li>
            ) : opciones.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">Nada coincide.</li>
            ) : (
              opciones.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => elegir(p)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {p.nombre}
                  </button>
                </li>
              ))
            )}
            <li className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="block w-full px-3 py-2 text-left text-sm font-medium text-logisalud-teal hover:bg-gray-50"
              >
                + Crear proveedor nuevo
              </button>
            </li>
          </ul>
        ) : null
      ) : null}
    </div>
  )
}

/**
 * Alta mínima (RUC, razón social, condición de pago, moneda) para no
 * interrumpir el formulario que la persona ya estaba llenando — los datos
 * de contacto se completan después desde la ficha del proveedor si hacen
 * falta. `tipoFijo` viene de OC (mercadería/bien): ya se sabe a qué tabla
 * va, no hace falta preguntar. Sin `tipoFijo` (Pago Directo), pregunta si
 * es un proveedor de servicio.
 */
function FormularioProveedorRapido({
  tipoFijo, nombreSugerido, onCreado, onCancelar,
}: {
  tipoFijo?: 'mercaderia' | 'bien'
  nombreSugerido: string
  onCreado: (p: ProveedorElegido) => void
  onCancelar: () => void
}) {
  const [ruc, setRuc] = useState('')
  const [razonSocial, setRazonSocial] = useState(nombreSugerido)
  const [condicionPagoDias, setCondicionPagoDias] = useState('30')
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN')
  const [esServicio, setEsServicio] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function crear() {
    setError(null)
    const tipo: TipoProveedorUnificado = tipoFijo ?? (esServicio ? 'servicio' : 'ambos')
    const dias = Number(condicionPagoDias)
    if (!/^\d{11}$/.test(ruc.trim())) return setError('El RUC tiene que tener 11 dígitos.')
    if (!razonSocial.trim()) return setError('Escribe la razón social.')
    if (Number.isNaN(dias) || dias < 0) return setError('Los días de condición de pago tienen que ser 0 o más.')

    setEnviando(true)
    const resultado = await crearProveedorRapidoAction({
      tipo, ruc: ruc.trim(), razonSocial: razonSocial.trim(), condicionPagoDias: dias, monedaPrincipal: moneda,
    })
    setEnviando(false)
    if ('errores' in resultado) {
      setError(resultado.errores[0]?.mensaje ?? 'No se pudo registrar el proveedor.')
      return
    }
    onCreado(resultado.proveedor)
  }

  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium text-gray-800">Proveedor nuevo</p>

      <label className="block text-sm">
        <span className="text-gray-600">RUC *</span>
        <input
          type="text" inputMode="numeric" maxLength={11} value={ruc}
          onChange={(e) => setRuc(e.target.value)}
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
      </label>

      <label className="block text-sm">
        <span className="text-gray-600">Razón social *</span>
        <input
          type="text" value={razonSocial}
          onChange={(e) => setRazonSocial(e.target.value)}
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="text-gray-600">Condición de pago</span>
          <input
            type="number" min={0} value={condicionPagoDias}
            onChange={(e) => setCondicionPagoDias(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Moneda</span>
          <select
            value={moneda} onChange={(e) => setMoneda(e.target.value as 'PEN' | 'USD')}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="PEN">PEN</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>

      {!tipoFijo ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={esServicio} onChange={(e) => setEsServicio(e.target.checked)} className="h-5 w-5" />
          Es un proveedor de servicio (notaría, seguros, courier…)
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={crear} disabled={enviando} className="btn-primary min-h-10 flex-1 disabled:opacity-60">
          {enviando ? 'Creando…' : 'Crear y elegir'}
        </button>
        <button type="button" onClick={onCancelar} className="btn-secondary min-h-10">
          Cancelar
        </button>
      </div>
    </div>
  )
}
