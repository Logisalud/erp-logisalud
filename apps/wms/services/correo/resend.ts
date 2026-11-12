import 'server-only'

// Envío de correos con Resend (https://resend.com/docs/api-reference/emails/send-email). Sin RESEND_API_KEY o sin remitente no se envía nada (el aviso queda apagado): nunca falla la operación que lo pidió.
export interface CorreoSaliente { para: string[]; asunto: string; texto: string; html: string; /** Resend ignora un segundo envío con la misma clave en 24 horas. */ clave?: string }
export type ResultadoCorreo = { ok: true; id?: string } | { ok: false; motivo: string }

const URL_RESEND = 'https://api.resend.com/emails'

export function correoConfigurado(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.RESEND_API_KEY?.trim() && !!env.RESEND_FROM?.trim()
}

export async function enviarCorreo(c: CorreoSaliente, env: Record<string, string | undefined> = process.env, enviar: typeof fetch = fetch): Promise<ResultadoCorreo> {
  const clave = env.RESEND_API_KEY?.trim(); const de = env.RESEND_FROM?.trim()
  if (!clave || !de) return { ok: false, motivo: 'El envío de correos no está configurado (RESEND_API_KEY y RESEND_FROM)' }
  if (c.para.length === 0) return { ok: false, motivo: 'No hay a quién avisar' }
  try {
    const r = await enviar(URL_RESEND, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json', ...(c.clave ? { 'Idempotency-Key': c.clave } : {}) },
      body: JSON.stringify({ from: de, to: c.para, subject: c.asunto, text: c.texto, html: c.html }),
    })
    if (!r.ok) return { ok: false, motivo: `Resend respondió ${r.status}` }
    const j = (await r.json().catch(() => null)) as { id?: string } | null
    return { ok: true, id: j?.id }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'No se pudo conectar con Resend' }
  }
}
