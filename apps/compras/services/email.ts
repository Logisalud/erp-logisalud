import 'server-only'
import { cleanEnv } from '@/lib/env'

/**
 * Envío de correo vía Resend. Copiado tal cual de
 * apps/pedidos/services/email.ts (mismo patrón, sin dependencias
 * compartidas — el monorepo no comparte código entre apps más allá de
 * packages/auth) para la notificación de un Anticipo (Pieza 3, sesión
 * 2026-09-04).
 *
 * Variables de entorno (ver .env.example):
 *  - RESEND_API_KEY    — key del proyecto en Resend.
 *  - RESEND_FROM_EMAIL — remitente, sobre el dominio logisalud.com ya
 *    verificado en Resend (el mismo que usa el magic link de login).
 *
 * Si falta cualquiera de las dos, sendEmail devuelve un fallo explícito en
 * vez de lanzar: el envío es best-effort, nunca bloquea la creación de la
 * solicitud que lo dispara.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export type EmailAttachment = {
  filename: string
  content: Buffer
}

export type SendEmailInput = {
  to: string[]
  /** Copia — se usa para que quien creó el registro reciba su propio aviso
   * sin aparecer como destinatario principal (el dueño del aviso es
   * Contabilidad). */
  cc?: string[]
  subject: string
  html: string
  text: string
  attachments?: EmailAttachment[]
}

export type SendEmailResult =
  | { ok: true; proveedor: 'resend'; messageId: string | null }
  | { ok: false; proveedor: 'resend'; error: string }

export function isEmailConfigured(): boolean {
  return cleanEnv(process.env.RESEND_API_KEY) !== '' && cleanEnv(process.env.RESEND_FROM_EMAIL) !== ''
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY)
  const from = cleanEnv(process.env.RESEND_FROM_EMAIL)

  if (!apiKey || !from) {
    return {
      ok: false,
      proveedor: 'resend',
      error: 'Falta configurar el envío de correo: se requieren RESEND_API_KEY y RESEND_FROM_EMAIL.',
    }
  }
  if (input.to.length === 0) {
    return { ok: false, proveedor: 'resend', error: 'Sin destinatarios.' }
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        ...(input.cc && input.cc.length > 0 ? { cc: input.cc } : {}),
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.attachments && input.attachments.length > 0
          ? {
              attachments: input.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString('base64'),
              })),
            }
          : {}),
      }),
      // Un proveedor colgado no debe dejar a la persona esperando en la
      // pantalla de "enviar solicitud". La solicitud ya está guardada.
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const detalle = await response.text().catch(() => '')
      return {
        ok: false,
        proveedor: 'resend',
        error: `Resend respondió ${response.status}${detalle ? `: ${detalle.slice(0, 500)}` : ''}`,
      }
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null
    return { ok: true, proveedor: 'resend', messageId: body?.id ?? null }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { ok: false, proveedor: 'resend', error }
  }
}
