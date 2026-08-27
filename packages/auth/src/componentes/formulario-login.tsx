'use client'

import { useState } from 'react'
import { crearClienteNavegador } from '../client'
import { Aviso, CLASES_BOTON, CLASES_INPUT, Etiqueta, MarcoAuth } from './marco-auth'

/** Pantalla de "Iniciar sesión" — correo y contraseña. */
export function FormularioLogin({ volverA = '/' }: { volverA?: string }) {
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)

    const supabase = crearClienteNavegador()
    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password,
    })

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : error.message
      )
      setEnviando(false)
      return
    }

    // Recarga completa para que el middleware vea la cookie recién puesta.
    window.location.assign(volverA)
  }

  return (
    <MarcoAuth titulo="Iniciar sesión" descripcion="Entrá con tu correo de Logisalud.">
      <form onSubmit={enviar} noValidate>
        <div>
          <Etiqueta htmlFor="correo">Correo</Etiqueta>
          <input
            id="correo"
            type="email"
            required
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="nombre@logisalud.com"
            className={CLASES_INPUT}
          />
        </div>

        <div className="mt-4">
          <Etiqueta htmlFor="password">Contraseña</Etiqueta>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={CLASES_INPUT}
          />
        </div>

        <button type="submit" disabled={enviando} className={`${CLASES_BOTON} mt-6`}>
          {enviando ? 'Entrando…' : 'Iniciar sesión'}
        </button>

        {error ? <Aviso tono="error">{error}</Aviso> : null}
      </form>
    </MarcoAuth>
  )
}
