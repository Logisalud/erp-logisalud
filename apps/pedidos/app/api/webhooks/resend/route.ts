import { NextRequest, NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { firmaValida, leerEvento } from "@/domain/resend-webhook";
import { registrarEventoDeCorreo } from "@/services/notification-events";

export const dynamic = "force-dynamic";

/**
 * Lo que Resend cuenta después del envío: entregado, rebotado, marcado
 * como spam.
 *
 * Existe por un caso concreto: a SUSANA RAMOS no le llegó ni uno de 66
 * correos en dos meses. Su buzón se dio de baja cuando dejó la empresa y
 * se recreó con la misma dirección; mientras no existió, los correos
 * rebotaron y Resend puso su dirección en la lista de supresión. Desde ahí
 * contestaba "aceptado" y tiraba el correo sin entregarlo. El ERP los
 * registró todos como enviados y se descubrió porque ella avisó.
 *
 * Configurar en https://resend.com/webhooks apuntando a
 * `POST /api/webhooks/resend`, con los eventos `email.bounced`,
 * `email.complained` y `email.delivered`, y copiar el signing secret a
 * `RESEND_WEBHOOK_SECRET`.
 *
 * Siempre responde 200 cuando la firma es nuestra, incluso si el evento no
 * se entiende: un 4xx hace que Resend reintente en loop y llene la cola de
 * reintentos con algo que no va a mejorar solo.
 */
export async function POST(req: NextRequest) {
  const secreto = cleanEnv(process.env.RESEND_WEBHOOK_SECRET);
  if (!secreto) {
    console.error("[webhook resend] RESEND_WEBHOOK_SECRET no está definida: se rechaza el evento.");
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  // El cuerpo CRUDO: la firma se calcula sobre el texto exacto que mandó
  // Resend. Volver a serializar el JSON cambiaría un espacio y no validaría.
  const cuerpo = await req.text();

  if (
    !firmaValida({
      cuerpo,
      svixId: req.headers.get("svix-id"),
      svixTimestamp: req.headers.get("svix-timestamp"),
      svixSignature: req.headers.get("svix-signature"),
      secreto,
    })
  ) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const evento = leerEvento(cuerpo);
  if (!evento) return NextResponse.json({ ok: true, ignorado: "evento sin forma conocida" });

  try {
    const r = await registrarEventoDeCorreo(evento);
    return NextResponse.json({ ok: true, tipo: evento.tipo, ...r });
  } catch (err) {
    // Acá sí conviene el 500: el evento era válido y no se pudo guardar,
    // así que el reintento de Resend es exactamente lo que se quiere.
    console.error("[webhook resend] no se pudo registrar el evento:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
