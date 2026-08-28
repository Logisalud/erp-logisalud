'use client'

import { useState } from 'react'
import { crearClienteNavegador } from '../client'
import { Aviso, CLASES_BOTON, CLASES_INPUT, Etiqueta, MarcoAuth } from './marco-auth'

/**
 * Login sin contraseña.
 *
 * Se pide el correo, Supabase manda un mensaje, y la persona entra de una de
 * dos formas:
 *
 *   1. Hace clic en el link del correo. Va a /auth/callback, que canjea el
 *      código por sesión en el servidor.
 *   2. Escribe el código de 6 dígitos que viene en el mismo correo.
 *
 * Las dos, no una. El link solo funciona en el MISMO navegador que lo pidió
 * (PKCE guarda ahí el verificador), y es normal pedirlo en la computadora y
 * abrir el correo en el celular. Cuando eso pasa, el link falla y el código
 * es la salida — sin él la persona queda trabada sin entender por qué.
 *
 * Para que el código llegue, la plantilla de "Magic Link" en Supabase tiene
 * que incluir {{ .Token }} además de {{ .ConfirmationURL }}.
 */
export function FormularioLogin({
  volverA = '/',
  errorInicial,
}: {
  volverA?: string
  /** Mensaje que dejó /auth/callback cuando el canje del link falló. */
  errorInicial?: string
}) {
  const [correo, setCorreo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(errorInicial ?? null)
  const [enviando, setEnviando] = useState(false)

  const destino =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?volver_a=${encodeURIComponent(volverA)}`
      : undefined

  async function pedirEnlace(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)

    const supabase = crearClienteNavegador()
    const { error } = await supabase.auth.signInWithOtp({
      email: correo.trim().toLowerCase(),
      options: {
        emailRedirectTo: destino,
        // La cuenta se crea sola en el primer ingreso. Quien no esté en
        // public.usuarios_esperados entra pero queda sin perfil, y sin perfil
        // las políticas RLS le niegan todo.
        shouldCreateUser: true,
      },
    })

    if (error) {
      setError(
        /rate limit|too many/i.test(error.message)
          ? 'Se pidieron demasiados correos seguidos. Espera un minuto y prueba de nuevo.'
          : error.message
      )
      setEnviando(false)
      return
    }

    setEnviado(true)
    setEnviando(false)
  }

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)

    const supabase = crearClienteNavegador()
    const { error } = await supabase.auth.verifyOtp({
      email: correo.trim().toLowerCase(),
      token: codigo.trim(),
      type: 'email',
    })

    if (error) {
      setError(
        /expired|invalid/i.test(error.message)
          ? 'El código no es válido o ya venció. Pedí uno nuevo.'
          : error.message
      )
      setEnviando(false)
      return
    }

    // Recarga completa para que el middleware vea la cookie recién puesta.
    window.location.assign(volverA)
  }

  if (enviado) {
    return (
      <MarcoAuth
        titulo="Revisa tu correo"
        descripcion={`Mandamos un mensaje a ${correo.trim().toLowerCase()}.`}
      >
        <p className="text-sm text-gray-600">
          Haz clic en el link del correo para entrar. Si abriste el correo en otro
          dispositivo, escribe aquí el código de 6 dígitos que viene en el mismo mensaje.
        </p>

        <form onSubmit={verificarCodigo} className="mt-5" noValidate>
          <Etiqueta htmlFor="codigo">Código del correo</Etiqueta>
          <input
            id="codigo"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className={`${CLASES_INPUT} text-center text-lg tracking-[0.4em]`}
          />

          <button
            type="submit"
            disabled={enviando || codigo.length < 6}
            className={`${CLASES_BOTON} mt-5`}
          >
            {enviando ? 'Verificando…' : 'Entrar con el código'}
          </button>
        </form>

        {error ? <Aviso tono="error">{error}</Aviso> : null}

        <button
          type="button"
          onClick={() => {
            setEnviado(false)
            setCodigo('')
            setError(null)
          }}
          className="mt-5 text-sm text-logisalud-teal underline"
        >
          Usar otro correo o pedir el mensaje de nuevo
        </button>
      </MarcoAuth>
    )
  }

  return (
    <MarcoAuth
      titulo="Iniciar sesión"
      descripcion="Pon tu correo de Logisalud y te mandamos un link para entrar. No hace falta contraseña."
    >
      <form onSubmit={pedirEnlace} noValidate>
        <Etiqueta htmlFor="correo">Correo</Etiqueta>
        <input
          id="correo"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoFocus
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="nombre@logisalud.com"
          className={CLASES_INPUT}
        />

        <button type="submit" disabled={enviando} className={`${CLASES_BOTON} mt-6`}>
          {enviando ? 'Enviando…' : 'Enviarme el link'}
        </button>

        {error ? <Aviso tono="error">{error}</Aviso> : null}
      </form>
    </MarcoAuth>
  )
}
