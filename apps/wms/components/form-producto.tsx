'use client'

import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import { TriangleAlert } from 'lucide-react'
import { crearProductoAccion, type EstadoFormulario } from '@/app/acciones'

function Campo({
  nombre, etiqueta, ayuda, error, requerido, placeholder, tipo = 'text',
}: { nombre: string; etiqueta: string; ayuda?: string; error?: string; requerido?: boolean; placeholder?: string; tipo?: string }) {
  const id = `campo-${nombre}`
  return (
    <div>
      <label htmlFor={id} className="etiqueta">{etiqueta}{requerido && <span className="text-red-700"> *</span>}</label>
      <input
        id={id} name={nombre} type={tipo} placeholder={placeholder} className={`campo ${error ? '!border-red-500' : ''}`}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined} autoComplete="off"
      />
      {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>
        : ayuda ? <p id={`${id}-ayuda`} className="mt-1 text-xs text-gray-600">{ayuda}</p> : null}
    </div>
  )
}

function Guardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary" data-testid="guardar-producto">
      {pending ? 'Guardando…' : 'Guardar producto'}
    </button>
  )
}

const inicial: EstadoFormulario = {}

export function FormProducto() {
  const [estado, accion] = useFormState(crearProductoAccion, inicial)
  const e = estado.errores ?? {}
  return (
    <form action={accion} className="space-y-6" noValidate>
      {estado.ok === false && estado.mensaje && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid="error-formulario">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>{estado.mensaje}</p>
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">El producto</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo nombre="codigo" etiqueta="Código" requerido error={e.codigo} ayuda="El mismo código que usa Compras." />
          <Campo nombre="descripcion" etiqueta="Nombre" requerido error={e.descripcion} placeholder="Dapagliflozina 10 mg" />
          <Campo nombre="presentacion" etiqueta="Presentación" placeholder="Caja x 30 tabletas" error={e.presentacion} />
          <Campo nombre="unidadMedida" etiqueta="Unidad" placeholder="TABLETA" ayuda="Si lo dejas vacío se usa UND." error={e.unidadMedida} />
          <Campo nombre="marca" etiqueta="Marca" error={e.marca} />
          <Campo nombre="principioActivo" etiqueta="Principio activo" error={e.principioActivo} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Registro sanitario</legend>
        <p className="text-sm text-gray-600">Dirección Técnica lo valida después. Mientras tanto el producto queda “por validar” y sus lotes no se pueden aprobar.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo nombre="registroSanitario" etiqueta="Número de registro" placeholder="EG-12345" error={e.registroSanitario} />
          <Campo nombre="rsVence" etiqueta="Vencimiento del registro" placeholder="30/06/2030" ayuda="Puedes escribir 30/06/2030, 2030-06-30 o solo 06/2030." error={e.rsVence} />
          <Campo nombre="fabricante" etiqueta="Fabricante" error={e.fabricante} />
          <Campo nombre="formaPresentacion" etiqueta="Forma farmacéutica" placeholder="Tableta recubierta" error={e.formaPresentacion} />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Guardar />
        <Link href="/productos" className="btn-secondary">Cancelar</Link>
      </div>
    </form>
  )
}
