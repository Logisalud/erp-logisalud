import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";

export type ApprovalRequestWithOrder = {
  id: string;
  order_id: string;
  order_item_id: string;
  precio_solicitado: number | null;
  porcentaje_descuento: number | null;
  cantidad: number;
  motivo: string;
  competencia_negociacion: string | null;
  comentario: string | null;
  evidencia_url: string | null;
  created_at: string;
  order: { id: string; estado: string; customer: { razon_social: string } | null } | null;
  order_item: { product: { descripcion: string } | null; precio_unitario: number } | null;
};

export async function createApprovalRequest(input: {
  orderId: string;
  orderItemId: string;
  solicitadoPor: string;
  precioSolicitado?: number;
  porcentajeDescuento?: number;
  cantidad: number;
  motivo: string;
  competenciaNegociacion?: string;
  comentario?: string;
  evidenciaUrl?: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .insert({
      order_id: input.orderId,
      order_item_id: input.orderItemId,
      solicitado_por: input.solicitadoPor,
      precio_solicitado: input.precioSolicitado ?? null,
      porcentaje_descuento: input.porcentajeDescuento ?? null,
      cantidad: input.cantidad,
      motivo: input.motivo,
      competencia_negociacion: input.competenciaNegociacion ?? null,
      comentario: input.comentario ?? null,
      evidencia_url: input.evidenciaUrl ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function listPendingApprovalRequests(): Promise<ApprovalRequestWithOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .select(
      `id, order_id, order_item_id, precio_solicitado, porcentaje_descuento, cantidad, motivo,
      competencia_negociacion, comentario, evidencia_url, created_at,
      order:orders(id, estado, customer:customers(razon_social)),
      order_item:order_items(precio_unitario, product:products(descripcion))`,
    )
    .eq("estado", "PENDIENTE")
    .order("created_at");

  if (error) throw new Error(error.message);
  return data as unknown as ApprovalRequestWithOrder[];
}

export type ApprovalDecision = "APROBAR" | "RECHAZAR" | "APROBAR_OTRO_PRECIO" | "SOLICITAR_INFO";

export async function decideApprovalRequest(input: {
  requestId: string;
  decision: ApprovalDecision;
  precioAprobado?: number;
  comentario?: string;
  actor: string;
}) {
  const supabase = createClient();
  const { error } = await supabase.rpc("decide_approval_request", {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_precio_aprobado: input.precioAprobado ?? null,
    p_comentario: input.comentario ?? null,
  });
  if (error) throw new Error(error.message);

  if (input.decision === "SOLICITAR_INFO") {
    const { data: request } = await supabase
      .from("approval_requests")
      .select("order_id")
      .eq("id", input.requestId)
      .single();
    if (request) {
      await supabase.from("order_observations").insert({
        order_id: request.order_id,
        autor: input.actor,
        comentario: input.comentario ?? "Se solicitó más información sobre la solicitud de descuento.",
        contexto: "COMMERCIAL_EXCEPTION",
      });
    }
  }

  await logAudit({
    actor: input.actor,
    accion: "decidir_solicitud_descuento",
    entidad: "approval_requests",
    entidadId: input.requestId,
    datosDespues: { decision: input.decision, precioAprobado: input.precioAprobado, comentario: input.comentario },
  });
}
