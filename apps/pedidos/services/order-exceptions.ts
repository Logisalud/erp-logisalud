import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";

export type AdministrativeExceptionOrder = {
  id: string;
  fecha_envio: string | null;
  customer: { razon_social: string } | null;
  seller: { nombre_completo: string } | null;
  payment_terms: { nombre: string } | null;
};

export async function listAdministrativeExceptionOrders(): Promise<AdministrativeExceptionOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, fecha_envio, customer:customers(razon_social), seller:sellers(nombre_completo), payment_terms:payment_terms(nombre)",
    )
    .eq("estado", "ADMINISTRATIVE_EXCEPTION")
    .order("fecha_envio");

  if (error) throw new Error(error.message);
  return data as unknown as AdministrativeExceptionOrder[];
}

export async function resolveAdministrativeException(input: {
  orderId: string;
  decision: "APROBAR" | "DEVOLVER";
  motivo: string;
  actor: string;
}) {
  const supabase = createClient();

  if (input.decision === "APROBAR") {
    const { error } = await supabase.rpc("reevaluate_order", { p_order_id: input.orderId, p_motivo: input.motivo });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.rpc("apply_order_transition", {
      p_order_id: input.orderId,
      p_estado_nuevo: "DRAFT",
      p_motivo: input.motivo,
    });
    if (error) throw new Error(error.message);
  }

  await logAudit({
    actor: input.actor,
    accion: "resolver_excepcion_administrativa",
    entidad: "orders",
    entidadId: input.orderId,
    datosDespues: { decision: input.decision, motivo: input.motivo },
  });
}

export async function addOrderObservation(input: {
  orderId: string;
  comentario: string;
  contexto?: string;
  actor: string;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("order_observations").insert({
    order_id: input.orderId,
    autor: input.actor,
    comentario: input.comentario,
    contexto: input.contexto ?? null,
  });
  if (error) throw new Error(error.message);
}
