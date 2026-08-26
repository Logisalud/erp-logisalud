"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { decideApprovalRequest, type ApprovalDecision } from "@/services/approvals";

export async function decidirSolicitud(
  requestId: string,
  decision: ApprovalDecision,
  precioAprobado: number | undefined,
  comentario: string | undefined,
) {
  const userId = await requireUserId();
  await decideApprovalRequest({ requestId, decision, precioAprobado, comentario, actor: userId });
  revalidatePath("/aprobador-comercial");
}
