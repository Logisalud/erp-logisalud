import "server-only";
import { cleanEnv } from "@/lib/env";

/**
 * Envío de correo vía Resend.
 *
 * Por qué Resend: es el proveedor con mejor encaje en Next.js sobre
 * Vercel (mismo ecosistema, sin SMTP que abrir desde una función
 * serverless) y su API de envío es un solo POST. Por eso se llama con
 * `fetch` directo en vez de agregar el SDK: una dependencia menos que
 * mantener para un endpoint que no va a cambiar.
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
};

export type SendEmailResult =
  | { ok: true; proveedor: "resend"; messageId: string | null }
  | { ok: false; proveedor: "resend"; error: string };

export function isEmailConfigured(): boolean {
  return cleanEnv(process.env.RESEND_API_KEY) !== "" && cleanEnv(process.env.RESEND_FROM_EMAIL) !== "";
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
