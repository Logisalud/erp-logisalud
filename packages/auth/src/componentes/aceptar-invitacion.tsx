'use client'

import { useEffect, useRef, useState } from 'react'
import { crearClienteNavegador } from '../client'
import { Aviso, CLASES_BOTON, CLASES_INPUT, Etiqueta, MarcoAuth } from './marco-auth'

type Estado =
  | { paso: 'verificando' }
  | { paso: 'listo'; correo: string | null }
  | { paso: 'invalido'; motivo: string }
  | { paso: 'hecho' }

const MINIMO_PASSWORD = 8

/**
 * Pantalla de "Aceptar invitación / Crear contraseña".
 *
 * Supabase manda el link de invitación con el token en el **fragmento** de la
 * URL (#access_token=...&refresh_token=...&type=invite). El fragmento no viaja
 * al servidor, así que esto tiene que resolverse en el cliente.
 *
 * Se lee el hash a mano antes de que supabase-js lo consuma, se establece la
 * sesión con ese token, y recién entonces se deja poner la contraseña. Sirve
 * igual para `type=recovery` (restablecer contraseña olvidada), que llega con
 * la misma forma.
 */
export function AceptarInvitacion({ irA = '/' }: { irA?: string }) {
  const [estado, setEstado] = useState<Estado>({ paso: 'verificando' })
  const [password, setPassword] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const yaCorrio = useRef(false)

  useEffect(() => {
    // En React 18 dev el efecto corre dos veces; el hash ya se limpió en la
    // primera pasada, así que la segunda encontraría vacío y marcaría el link
    // como inválido sin razón.
    if (yaCorrio.current) return
    yaCorrio.current = true

    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
    const params = new URLSearchParams(hash)

    const descripcionError = params.get('error_description')
    if (descripcionError) {
      setEstado({
        paso: 'invalido',
        motivo:
          /expired/i.test(descripcionError)
            ? 'El link de invitación venció. Pedile a Sebas o Andrés que te reenvíen la invitación.'
            : descripcionError,
      })
      return
    }

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    async function establecer() {
      const supabase = crearClienteNavegador()

      if (accessToken && refreshToken) {
        // Se saca el token de la barra de direcciones antes de cualquier otra
        // cosa, para que no quede en el historial ni en un screenshot.
        window.history.replaceState(null, '', window.location.pathname + window.location.search)

        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          setEstado({ paso: 'invalido', motivo: `El link no es válido: ${error.message}` })
          return
        }
        setEstado({ paso: 'listo', correo: data.user?.email ?? null })
        return
      }

      // Sin token en el hash: puede ser que ya haya sesión (recargó la página).
      const {
        data: { user },
      } = await supabase.auth.getUser()

      setEstado(
        user
          ? { paso: 'listo', correo: user.email ?? null }
          : {
              paso: 'invalido',
              motivo:
                'Falta el token de invitación en el link. Abrí el link tal como llegó en el correo, sin recortarlo.',
            }
      )
    }

    void establecer()
  }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MINIMO_PASSWORD) {
      setError(`La contraseña necesita al menos ${MINIMO_PASSWORD} caracteres.`)
      return
    }
    if (password !== repetir) {
      setError('Las dos contraseñas no coinciden.')
      return
    }

    setEnviando(true)
    const supabase = crearClienteNavegador()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setEnviando(false)
      return
    }

    setEstado({ paso: 'hecho' })
  }

  if (estado.paso === 'verificando') {
    return (
      <MarcoAuth titulo="Verificando invitación">
        <p className="text-sm text-gray-600">Un momento…</p>
      </MarcoAuth>
    )
  }

  if (estado.paso === 'invalido') {
    return (
      <MarcoAuth titulo="No pudimos validar la invitación">
        <Aviso tono="error">{estado.motivo}</Aviso>
        <a href="/login" className="mt-5 block text-sm text-logisalud-teal underline">
          Ir a iniciar sesión
        </a>
      </MarcoAuth>
    )
  }

  if (estado.paso === 'hecho') {
    return (
      <MarcoAuth titulo="Contraseña creada">
        <Aviso tono="ok">Tu cuenta quedó lista. Ya podés entrar al ERP.</Aviso>
        <a href={irA} className={`${CLASES_BOTON} mt-5 inline-flex items-center justify-center`}>
          Entrar al ERP
        </a>
      </MarcoAuth>
    )
  }

  return (
    <MarcoAuth
      titulo="Creá tu contraseña"
      descripcion={
        estado.correo
          ? `Estás activando la cuenta de ${estado.correo}.`
          : 'Elegí la contraseña con la que vas a entrar al ERP.'
      }
    >
      <form onSubmit={enviar} noValidate>
        <div>
          <Etiqueta htmlFor="password">Contraseña nueva</Etiqueta>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={MINIMO_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={CLASES_INPUT}
          />
          <p className="mt-1.5 text-xs text-gray-500">Al menos {MINIMO_PASSWORD} caracteres.</p>
        </div>

        <div className="mt-4">
          <Etiqueta htmlFor="repetir">Repetí la contraseña</Etiqueta>
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
          {enviando ? 'Guardando…' : 'Guardar contraseña'}
        </button>

        {error ? <Aviso tono="error">{error}</Aviso> : null}
      </form>
    </MarcoAuth>
  )
}
