import "server-only";
import { cleanEnv } from "@/lib/env";
import { normalizarMessageId } from "@/domain/email-threading";

/**
 * Envío de correo vía Resend.
 *
 * Por qué Resend: es el proveedor con mejor encaje en Next.js sobre
 * Vercel (mismo ecosistema, sin SMTP que abrir desde una función
 * serverless) y su API de envío es un solo POST. Por eso se llama con
 * `fetch` directo en vez de agregar el SDK: una dependencia menos que
 * mantener para un endpoint que no va a cambiar.
 *
 * `messageId` del resultado es el id INTERNO de Resend (un UUID), no el
 * `Message-ID` del correo. El `Message-ID` real —el que hace falta para
 * armar un hilo— se lee después con `fetchResendMessageId`, porque Resend
 * reescribe el de salida con el suyo e ignora cualquier valor propio que
 * se mande en `headers` (comprobado contra un encabezado real).
 *
 * Variables de entorno (ver .env.example):
 *  - RESEND_API_KEY   — key del proyecto en Resend.
 *  - RESEND_FROM_EMAIL — remitente, sobre un dominio verificado en
 *    Resend. Sin verificar el dominio, Resend rechaza el envío.
 *
 * Si falta cualquiera de las dos, sendEmail devuelve un fallo explícito
 * en vez de lanzar: quien llama decide si eso bloquea su flujo. En el
 * caso del pedido, no lo bloquea.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
};

export type SendEmailInput = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /**
   * Encabezados propios. Se usan para el threading del pedido
   * (`Message-ID`, `In-Reply-To`, `References`): sin ellos, cada aviso
   * llega como una conversación nueva. La API de Resend acepta headers
   * libres en el campo `headers` del payload.
   */
  headers?: Record<string, string>;
};

export type SendEmailResult =
  | { ok: true; proveedor: "resend"; messageId: string | null }
  | { ok: false; proveedor: "resend"; error: string };

/** Remitente configurado, para colgar el Message-ID de un dominio nuestro. */
export function emailFromAddress(): string {
  return cleanEnv(process.env.RESEND_FROM_EMAIL);
}

export function isEmailConfigured(): boolean {
  return cleanEnv(process.env.RESEND_API_KEY) !== "" && cleanEnv(process.env.RESEND_FROM_EMAIL) !== "";
}

/**
 * El `Message-ID` REAL que Resend le puso a un correo ya enviado.
 *
 * `GET /emails/{id}` devuelve `message_id` (además de id, to, from,
 * subject, html, text, cc, bcc, reply_to, created_at, scheduled_at,
 * last_event, tags y object). Ese es el único valor que sirve como
 * `In-Reply-To`: el que mandamos nosotros no sobrevive al envío.
 *
 * Nunca lanza y nunca bloquea: sin este id el correo ya salió igual, sólo
 * queda sin hilo. Devuelve null también cuando el correo todavía está en
 * cola y Resend no le asignó `message_id`; quien llama puede reintentar.
 */
export async function fetchResendMessageId(resendId: string): Promise<string | null> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey || !resendId) return null;

  try {
    const response = await fetch(`${RESEND_ENDPOINT}/${encodeURIComponent(resendId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.error(`Resend GET /emails/${resendId} respondió ${response.status}`);
      return null;
    }
    const body = (await response.json().catch(() => null)) as
      | { message_id?: string | null; last_event?: string }
      | null;
    return normalizarMessageId(body?.message_id);
  } catch (err) {
    console.error(
      `No se pudo leer el Message-ID de Resend para ${resendId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  const from = cleanEnv(process.env.RESEND_FROM_EMAIL);

  if (!apiKey || !from) {
    return {
      ok: false,
      proveedor: "resend",
      error:
        "Falta configurar el envío de correo: se requieren RESEND_API_KEY y RESEND_FROM_EMAIL.",
    };
  }
  if (input.to.length === 0) {
    return { ok: false, proveedor: "resend", error: "Sin destinatarios." };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.headers && Object.keys(input.headers).length > 0
          ? { headers: input.headers }
          : {}),
        // La API REST de Resend espera el adjunto en base64.
        ...(input.attachments && input.attachments.length > 0
          ? {
              attachments: input.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString("base64"),
              })),
            }
          : {}),
      }),
      // Un proveedor colgado no debe dejar al vendedor esperando en la
      // pantalla de "enviar pedido". El pedido ya está guardado.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detalle = await response.text().catch(() => "");
      return {
        ok: false,
        proveedor: "resend",
        error: `Resend respondió ${response.status}${detalle ? `: ${detalle.slice(0, 500)}` : ""}`,
      };
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, proveedor: "resend", messageId: body?.id ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, proveedor: "resend", error };
  }
}
