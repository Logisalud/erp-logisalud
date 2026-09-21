import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";
import { notifyAdministrativeExceptionResolved, type NotifyResult } from "./order-notifications";

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

/**
 * Resuelve una excepción administrativa.
 *
 * **Aprobar NO es reevaluar.** Hasta el 2026-09-21 esta función llamaba a
 * `reevaluate_order`, que recalcula el estado con la misma regla que frenó
 * el pedido: como aprobar no cambia la condición de pago del pedido ni la
 * habitual del cliente, la regla volvía a dar ADMINISTRATIVE_EXCEPTION y el
 * pedido regresaba a la bandeja. El pedido #68 quedó con tres aprobaciones
 * registradas y ninguna surtió efecto.
 *
 * Ahora aprueba `approve_administrative_exception`, que deja la decisión
 * escrita en el pedido y recién entonces recalcula, sin volver a mirar la
 * condición de pago. El pedido puede caer igual en excepción comercial o en
 * validación de cliente: aprobar el plazo no aprueba esas otras cosas.
 */
export async function resolveAdministrativeException(input: {
  orderId: string;
  decision: "APROBAR" | "DEVOLVER";
  motivo: string;
  actor: string;
}): Promise<{ estado: string | null; notificacion: NotifyResult | null }> {
  const supabase = createClient();
  let estado: string | null = null;

  if (input.decision === "APROBAR") {
    const { data, error } = await supabase.rpc("approve_administrative_exception", {
      p_order_id: input.orderId,
      p_motivo: input.motivo,
    });
    if (error) throw new Error(error.message);
    estado = (data as string | null) ?? null;
  } else {
    const { error } = await supabase.rpc("apply_order_transition", {
      p_order_id: input.orderId,
      p_estado_nuevo: "DRAFT",
      p_motivo: input.motivo,
    });
    if (error) throw new Error(error.message);
    estado = "DRAFT";
  }

  await logAudit({
    actor: input.actor,
    accion: "resolver_excepcion_administrativa",
    entidad: "orders",
    entidadId: input.orderId,
    datosDespues: { decision: input.decision, motivo: input.motivo, estadoResultante: estado },
  });

  // El aviso va DESPUÉS y no lanza nunca: el pedido ya quedó liberado y un
  // problema de correo no puede revertirlo. Antes no se avisaba nada — el
  // correo de "pedido enviado" había salido al enviarlo, justo cuando el
  // pedido NO iba a operaciones — así que Operaciones no se enteraba de que
  // el pedido ya estaba libre.
  const notificacion =
    input.decision === "APROBAR" && estado !== null
      ? await notifyAdministrativeExceptionResolved(input.orderId, estado, input.actor)
      : null;

  return { estado, notificacion };
}

/** El estado del pedido, para decidir si la observación además se avisa. */
export async function getOrderEstado(orderId: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("estado")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { estado: string } | null)?.estado ?? null;
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
