'use client'

import { useState } from 'react'

// Opciones reales usadas hoy con los proveedores del módulo (Biosana 90,
// Diphasac 120, Dare Nutrition 90, Prades 75/90/105) más Contado — no es
// una lista cerrada: "Otro" siempre deja escribir cualquier valor.
const OPCIONES = [0, 75, 90, 105, 120]

function etiquetaDias(dias: number): string {
  return dias === 0 ? 'Contado' : `${dias} días`
}

export function SelectorCondicionPago({
  name,
  defaultValue,
  required,
  id,
}: {
  name: string
  defaultValue?: number | null
  required?: boolean
  id?: string
}) {
  const inicial = defaultValue ?? null
  const inicialEsOpcion = inicial !== null && OPCIONES.includes(inicial)
  const [modo, setModo] = useState<'opcion' | 'otro'>(
    inicial === null || inicialEsOpcion ? 'opcion' : 'otro'
  )
  const [valor, setValor] = useState<number | ''>(inicial ?? '')

  return (
    <div className="space-y-2">
      <select
        id={id}
        required={required}
        className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
        value={modo === 'otro' ? 'otro' : valor === '' ? '' : String(valor)}
        onChange={(e) => {
          if (e.target.value === 'otro') {
            setModo('otro')
          } else {
            setModo('opcion')
            setValor(Number(e.target.value))
          }
        }}
      >
        <option value="" disabled>
          Elegir...
        </option>
        {OPCIONES.map((dias) => (
          <option key={dias} value={dias}>
            {etiquetaDias(dias)}
          </option>
        ))}
        <option value="otro">Otro (especificar días)</option>
      </select>

      {modo === 'otro' ? (
        <input
          type="number"
          min={0}
          required={required}
          placeholder="Cantidad de días (0 = contado)"
          value={valor}
          onChange={(e) => setValor(e.target.value === '' ? '' : Number(e.target.value))}
          className="min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
      ) : null}

      {/* El Server Action sigue leyendo este mismo `name` de FormData — no
          cambia nada en services/domain, solo cómo se elige el valor.
          Los inputs visibles de arriba son los que validan `required`
          (un <input type="hidden"> no participa de la validación del
          navegador), este solo transporta el valor final. */}
      <input type="hidden" name={name} value={valor === '' ? '' : valor} />
    </div>
  )
}
