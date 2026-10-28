"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { decideApprovalRequest, type ApprovalDecision } from "@/services/approvals";
import { decidirBloqueoDeCredito } from "@/services/credito";
import { falloDe, type ResultadoAccion } from "@/domain/acciones";

/**
 * Resolver una solicitud de descuento.
 *
 * Devuelve el fallo en vez de lanzarlo. Cuando lanzaba, el error subía hasta
 * el error boundary y se llevaba puesta la pantalla ENTERA: una solicitud
 * problemática dejaba sin ver también a las otras, que no tenían nada que
 * ver. Pasó el 2026-09-23 con un pedido que seguía en DRAFT.
 *
 * Es además lo que dice la convención del repo para un mensaje que tiene que
 * leer una persona (ver domain/acciones.ts).
 */
export async function decidirSolicitud(
  requestId: string,
  decision: ApprovalDecision,
  precioAprobado: number | undefined,
  comentario: string | undefined,
): Promise<ResultadoAccion> {
  try {
    const userId = await requireUserId();
    await decideApprovalRequest({ requestId, decision, precioAprobado, comentario, actor: userId });
    revalidatePath("/aprobador-comercial");
    return { ok: true };
  } catch (err) {
    return falloDe(err, "No se pudo resolver la solicitud.");
  }
}

/**
 * Levantar (o confirmar) el freno por deuda de un pedido.
 *
 * Aprobar reevalúa el pedido: si no le queda ninguna otra excepción, sale a
 * operaciones. Rechazar lo deja frenado — el pedido no se borra, queda para
 * cuando el cliente pague.
 */
export async function decidirBloqueo(
  orderId: string,
  decision: "aprobado" | "rechazado",
  motivo: string | undefined,
): Promise<ResultadoAccion> {
  try {
    const userId = await requireUserId();
    await decidirBloqueoDeCredito({
      orderId,
      decision,
      motivo: motivo?.trim() ? motivo.trim() : null,
      actor: userId,
    });
    revalidatePath("/aprobador-comercial");
    return { ok: true };
  } catch (err) {
    return falloDe(err, "No se pudo resolver el bloqueo por deuda.");
  }
}
