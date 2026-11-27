import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { esRebote, type EventoResend } from "@/domain/resend-webhook";

/**
 * Guarda lo que el proveedor cuenta después del envío.
 *
 * Se escribe con la service role key: el que llama es un webhook sin
 * sesión, y si registrar un rebote dependiera de una policy, el propio
 * registro del fallo podría fallar — el mismo criterio que el log de
 * envíos (migración 0044).
 */
export async function registrarEventoDeCorreo(evento: EventoResend): Promise<{
  guardado: boolean;
  rebote: boolean;
  notificationLogId: number | null;
}> {
  const admin = createAdminClient();

  const { data: log } = await admin
    .from("notification_logs")
    .select("id, rebotados")
    .eq("proveedor_message_id", evento.messageId)
    .maybeSingle();

  const logId = (log as { id: number } | null)?.id ?? null;

  // Una fila por destinatario: el correo va a varios y el evento es de uno.
  // Sin destinatarios, igual se guarda una fila: un evento sin "to" sigue
  // diciendo algo del envío, y descartarlo sería tapar justo lo que
  // interesa ver.
  const destinatarios = evento.destinatarios.length > 0 ? evento.destinatarios : [null];
  const filas = destinatarios.map((destinatario) => ({
    notification_log_id: logId,
    proveedor_message_id: evento.messageId,
    tipo: evento.tipo,
    destinatario,
    detalle: evento.detalle,
    ocurrido_en: evento.ocurridoEn,
  }));

  // `ignoreDuplicates`: el webhook llega "al menos una vez" y Resend puede
  // repetir el mismo evento. Repetirlo no es un error, es lo esperable.
  const { error } = await admin
    .from("notification_events")
    .upsert(filas, {
      onConflict: "proveedor_message_id,tipo,destinatario",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(error.message);

  const rebote = esRebote(evento.tipo);

  // La vista rápida del log, para que la pantalla pinte el aviso sin
  // cruzar tablas. Se acumulan sin repetir: un mismo correo puede rebotar
  // para dos destinatarios distintos.
  if (rebote && logId !== null) {
    const previos = ((log as { rebotados?: string[] } | null)?.rebotados ?? []).filter(Boolean);
    const nuevos = evento.destinatarios.filter((d) => !previos.includes(d));
    if (nuevos.length > 0) {
      const { error: errorLog } = await admin
        .from("notification_logs")
        .update({ rebotados: [...previos, ...nuevos] })
        .eq("id", logId);
      if (errorLog) throw new Error(errorLog.message);
    }
  }

  return { guardado: true, rebote, notificationLogId: logId };
}
