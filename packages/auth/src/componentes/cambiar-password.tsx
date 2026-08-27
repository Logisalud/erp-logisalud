'use client'

import { useState } from 'react'
import { crearClienteNavegador } from '../client'
import { Aviso, CLASES_BOTON, CLASES_INPUT, Etiqueta, MarcoAuth } from './marco-auth'

const MINIMO = 8

/**
 * Cambiar la propia contraseña, ya con sesión iniciada.
 *
 * Existe porque las cuentas se crean con una contraseña temporal generada por
 * administración y entregada a mano: lo primero que va a querer hacer cada
 * persona al entrar es cambiarla por una suya.
 *
 * Pide la contraseña actual y la verifica antes de cambiarla. Supabase no lo
 * exige —`updateUser` cambia la contraseña con solo tener sesión— pero sin esa
 * verificación, una sesión abierta en una computadora compartida deja que
 * cualquiera se apropie de la cuenta. En Almacén las máquinas se comparten.
 */
export function CambiarPassword({ alTerminar = '/' }: { alTerminar?: string }) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (nueva.length < MINIMO) {
      setError(`La contraseña nueva necesita al menos ${MINIMO} caracteres.`)
      return
    }
    if (nueva !== repetir) {
      setError('Las dos contraseñas nuevas no coinciden.')
      return
    }
    if (nueva === actual) {
      setError('La contraseña nueva tiene que ser distinta de la actual.')
      return
    }

    setEnviando(true)
    const supabase = crearClienteNavegador()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email) {
      setError('No hay una sesión activa. Iniciá sesión de nuevo.')
      setEnviando(false)
      return
    }

    // Verificar la actual reautenticando. Si es incorrecta, no se cambia nada.
    const { error: errorLogin } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: actual,
    })
    if (errorLogin) {
      setError('La contraseña actual no es correcta.')
      setEnviando(false)
      return
    }

    const { error: errorUpdate } = await supabase.auth.updateUser({ password: nueva })
    if (errorUpdate) {
      setError(errorUpdate.message)
      setEnviando(false)
      return
    }

    setListo(true)
  }

  if (listo) {
    return (
      <MarcoAuth titulo="Contraseña cambiada">
        <Aviso tono="ok">
          Listo. La próxima vez que entres, usá la contraseña nueva.
        </Aviso>
        <a
          href={alTerminar}
          className={`${CLASES_BOTON} mt-5 inline-flex items-center justify-center`}
        >
          Volver al ERP
        </a>
      </MarcoAuth>
    )
  }

  return (
    <MarcoAuth
      titulo="Cambiar contraseña"
      descripcion="Si entraste con una contraseña que te dieron, cambiala por una tuya."
    >
      <form onSubmit={enviar} noValidate>
        <div>
          <Etiqueta htmlFor="actual">Contraseña actual</Etiqueta>
          <input
            id="actual"
            type="password"
            required
            autoComplete="current-password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            className={CLASES_INPUT}
          />
        </div>

        <div className="mt-4">
          <Etiqueta htmlFor="nueva">Contraseña nueva</Etiqueta>
          <input
            id="nueva"
            type="password"
            required
            autoComplete="new-password"
            minLength={MINIMO}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            className={CLASES_INPUT}
          />
          <p className="mt-1.5 text-xs text-gray-500">Al menos {MINIMO} caracteres.</p>
        </div>

        <div className="mt-4">
          <Etiqueta htmlFor="repetir">Repetí la contraseña nueva</Etiqueta>
          <input
            id="repetir"
            type="password"
            required
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            className={CLASES_INPUT}
          />
        </div>

        <button type="submit" disabled={enviando} className={`${CLASES_BOTON} mt-6`}>
          {enviando ? 'Guardando…' : 'Cambiar contraseña'}
        </button>

        {error ? <Aviso tono="error">{error}</Aviso> : null}
      </form>
    </MarcoAuth>
  )
}
