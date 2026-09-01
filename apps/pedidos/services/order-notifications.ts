import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "./audit-log";
import { sendEmail } from "./email";
import { buildOrderExcel, buildOrderExcelFilename } from "./order-excel";
import {
  buildOrderEmailSubject,
  renderOrderEmailHtml,
  renderOrderEmailText,
  type OrderEmailData,
  type OrderEmailItem,
  type OrderEmailPrecioEspecial,
} from "@/domain/order-email";
import { displayNombreProducto } from "@/domain/products";

// ---------------------------------------------------------------------
// Destinatarios (gestión por el administrador)
// ---------------------------------------------------------------------

export type NotificationRecipient = {
  id: string;
  email: string;
  nombre_referencial: string | null;
  activo: boolean;
  fecha_creacion: string;
};

/** Lee con el cliente de sesión: la RLS ya restringe a administrador. */
export async function listNotificationRecipients(): Promise<NotificationRecipient[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_notification_recipients")
    .select("id, email, nombre_referencial, activo, fecha_creacion")
    .order("fecha_creacion", { ascending: true });

  if (error) throw new Error(error.message);
  return data as unknown as NotificationRecipient[];
}

export async function addNotificationRecipient(
  input: { email: string; nombreReferencial: string | null },
  actor: string,
): Promise<NotificationRecipient> {
  const supabase = createClient();
  const email = input.email.trim().toLowerCase();

  const { data, error } = await supabase
    .from("order_notification_recipients")
    .insert({ email, nombre_referencial: input.nombreReferencial?.trim() || null })
    .select("id, email, nombre_referencial, activo, fecha_creacion")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Ese correo ya está en la lista.");
    if (error.code === "23514") throw new Error("El correo no tiene un formato válido.");
    throw new Error(error.message);
  }

  await logAudit({
    actor,
    accion: "agregar_destinatario_notificacion",
    entidad: "order_notification_recipients",
    entidadId: (data as { id: string }).id,
    datosDespues: { email, nombreReferencial: input.nombreReferencial ?? null },
  });

  return data as unknown as NotificationRecipient;
}

export async function updateNotificationRecipient(
  id: string,
  input: { email?: string; nombreReferencial?: string | null; activo?: boolean },
  actor: string,
): Promise<void> {
  const supabase = createClient();

  const { data: antes, error: antesError } = await supabase
    .from("order_notification_recipients")
    .select("email, nombre_referencial, activo")
    .eq("id", id)
    .single();
  if (antesError) throw new Error(antesError.message);

  const patch: Record<string, unknown> = {};
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();
  if (input.nombreReferencial !== undefined) {
    patch.nombre_referencial = input.nombreReferencial?.trim() || null;
  }
  if (input.activo !== undefined) patch.activo = input.activo;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("order_notification_recipients").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Ese correo ya está en la lista.");
    if (error.code === "23514") throw new Error("El correo no tiene un formato válido.");
    throw new Error(error.message);
  }

  await logAudit({
    actor,
    accion: "editar_destinatario_notificacion",
    entidad: "order_notification_recipients",
    entidadId: id,
    datosAntes: antes,
    datosDespues: patch,
  });
}

export type NotificationLogEntry = {
  id: number;
  order_id: string | null;
  estado: "enviado" | "fallido" | "sin_destinatarios";
  destinatarios: string[];
  proveedor: string | null;
  error_mensaje: string | null;
  created_at: string;
};

export async function listNotificationLogs(limit = 30): Promise<NotificationLogEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notification_logs")
    .select("id, order_id, estado, destinatarios, proveedor, error_mensaje, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data as unknown as NotificationLogEntry[];
}

// ---------------------------------------------------------------------
// Envío al pasar el pedido a SUBMITTED
// ---------------------------------------------------------------------

type OrderRow = {
  numero: number;
  fecha_envio: string | null;
  created_at: string;
  razon_social_snapshot: string | null;
  direccion_snapshot: string | null;
  canal_snapshot: string | null;
  zona_snapshot: string | null;
  vendedor_snapshot: string | null;
  customer: { razon_social: string; ruc_o_documento: string } | null;
  payment_terms: { nombre: string } | null;
};

type ItemRow = {
  id: string;
  cantidad: number | string;
  precio_unitario: number | string;
  igv: number | string;
  subtotal: number | string;
  total: number | string;
  product: { codigo_interno: string; descripcion: string } | null;
};

type ApprovalRow = {
  order_item_id: string;
  precio_solicitado: number | string | null;
  porcentaje_descuento: number | string | null;
  estado: string;
  approval_decisions:
    | { decision: string; precio_aprobado: number | string | null; created_at: string }[]
    | null;
};

function num(value: number | string | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Lee todo lo que el correo necesita. Usa la service role key porque
 * corre después de que el pedido ya quedó SUBMITTED: los datos son los
 * snapshots que grabó pedidos.submit_order, y el notificar no debería
 * depender de qué puede leer el vendedor que envió.
 *
 * También la usa la descarga directa del Excel desde la pantalla del pedido,
 * para que el archivo sea EXACTAMENTE el mismo que va adjunto al correo. Ojo:
 * como lee con service role, quien la llame tiene que haber verificado antes
 * que el usuario puede ver ese pedido — la descarga lo hace consultando el
 * pedido con el cliente del usuario, donde la RLS decide.
 */
export async function loadOrderEmailData(
  orderId: string,
  estadoResultado: string,
): Promise<OrderEmailData | null> {
  const admin = createAdminClient();

  const [orderResult, itemsResult, approvalsResult] = await Promise.all([
    admin
      .from("orders")
      .select(
        `numero, fecha_envio, created_at,
         razon_social_snapshot, direccion_snapshot, canal_snapshot, zona_snapshot, vendedor_snapshot,
         customer:customers(razon_social, ruc_o_documento),
         payment_terms:payment_terms(nombre)`,
      )
      .eq("id", orderId)
      .maybeSingle(),
    admin
      .from("order_items")
      .select(
        "id, cantidad, precio_unitario, igv, subtotal, total, product:products(codigo_interno, descripcion)",
      )
      .eq("order_id", orderId),
    // Solicitudes de precio especial del pedido. Se leen aparte y no con un
    // join sobre order_items porque son la excepción: la enorme mayoría de
    // los pedidos no tiene ninguna.
    admin
      .from("approval_requests")
      .select(
        `order_item_id, precio_solicitado, porcentaje_descuento, estado,
         approval_decisions(decision, precio_aprobado, created_at)`,
      )
      .eq("order_id", orderId),
  ]);

  if (orderResult.error) throw new Error(orderResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (approvalsResult.error) throw new Error(approvalsResult.error.message);
  if (!orderResult.data) return null;

  // Una solicitud puede acumular varias decisiones (SOLICITAR_INFO y después
  // la resolución): manda la última.
  const especialPorItem = new Map<string, OrderEmailPrecioEspecial>();
  for (const row of (approvalsResult.data ?? []) as unknown as ApprovalRow[]) {
    const ultima = [...(row.approval_decisions ?? [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ).at(-1);
    especialPorItem.set(row.order_item_id, {
      precioSolicitado: row.precio_solicitado === null ? null : num(row.precio_solicitado),
      porcentajeDescuento:
        row.porcentaje_descuento === null ? null : num(row.porcentaje_descuento),
      estado: row.estado,
      decision: ultima?.decision ?? null,
      precioAprobado:
        ultima?.precio_aprobado === null || ultima?.precio_aprobado === undefined
          ? null
          : num(ultima.precio_aprobado),
    });
  }

  const order = orderResult.data as unknown as OrderRow;
  const items: OrderEmailItem[] = ((itemsResult.data ?? []) as unknown as ItemRow[]).map((i) => ({
    codigo: i.product?.codigo_interno ?? "—",
    // El correo y el Excel los lee la oficina, que corre el mismo riesgo de
    // confundir un producto con su bonificación: misma descripción exacta.
    descripcion: i.product
      ? displayNombreProducto(i.product.descripcion, i.product.codigo_interno)
      : "—",
    cantidad: num(i.cantidad),
    precioUnitario: num(i.precio_unitario),
    igv: num(i.igv),
    subtotal: num(i.subtotal),
    total: num(i.total),
    precioEspecial: especialPorItem.get(i.id) ?? null,
  }));

  return {
    numero: order.numero,
    fechaEnvio: order.fecha_envio ?? order.created_at,
    estadoResultado,
    cliente: {
      // El snapshot manda: es lo que el pedido tenía al enviarse.
      razonSocial: order.razon_social_snapshot ?? order.customer?.razon_social ?? "—",
      rucODocumento: order.customer?.ruc_o_documento ?? "—",
      direccionEntrega: order.direccion_snapshot,
      canal: order.canal_snapshot,
      zona: order.zona_snapshot,
    },
    vendedor: order.vendedor_snapshot,
    condicionPago: order.payment_terms?.nombre ?? null,
    items,
  };
}

export type NotifyResult = {
  estado: "enviado" | "fallido" | "sin_destinatarios";
  destinatarios: string[];
  error?: string;
};

/**
 * Notifica por correo que un pedido pasó a SUBMITTED.
 *
 * NUNCA lanza: el pedido ya está enviado y guardado, y un problema de
 * correo no puede revertirlo ni mostrarle un error al vendedor por algo
 * que no hizo mal. Todo desenlace — incluido "no hay destinatarios
 * configurados" — queda en pedidos.notification_logs para poder
 * reintentar a mano después.
 */
export async function notifyOrderSubmitted(
  orderId: string,
  estadoResultado: string,
  actor: string,
): Promise<NotifyResult> {
  const admin = createAdminClient();

  async function registrar(result: NotifyResult, messageId: string | null, proveedor: string | null) {
    const { error } = await admin.from("notification_logs").insert({
      order_id: orderId,
      tipo: "pedido_enviado",
      estado: result.estado,
      destinatarios: result.destinatarios,
      proveedor,
      proveedor_message_id: messageId,
      error_mensaje: result.error ?? null,
    });
    // Si ni el log se puede escribir, no hay nada más que hacer acá: no
    // se va a tumbar el envío del pedido por eso.
    if (error) console.error("No se pudo registrar notification_log:", error.message);
  }

  try {
    // La lista se lee con la service role key: quien envía el pedido es
    // un vendedor, y la RLS de order_notification_recipients es solo
    // para administrador.
    const { data: recipients, error: recipientsError } = await admin
      .from("order_notification_recipients")
      .select("email")
      .eq("activo", true);
    if (recipientsError) throw new Error(recipientsError.message);

    const destinatarios = ((recipients ?? []) as Array<{ email: string }>).map((r) => r.email);

    if (destinatarios.length === 0) {
      const result: NotifyResult = { estado: "sin_destinatarios", destinatarios: [] };
      await registrar(result, null, null);
      await logAudit({
        actor,
        accion: "notificar_pedido_sin_destinatarios",
        entidad: "orders",
        entidadId: orderId,
        datosDespues: { motivo: "sin destinatarios configurados, correo no enviado" },
      });
      return result;
    }

    const data = await loadOrderEmailData(orderId, estadoResultado);
    if (!data) {
      const result: NotifyResult = {
        estado: "fallido",
        destinatarios,
        error: "No se pudo leer el pedido para armar el correo.",
      };
      await registrar(result, null, null);
      return result;
    }

    // El Excel es un adjunto: si falla generarlo, el correo sale igual con
    // el detalle en el cuerpo. Perder el adjunto es peor que no avisar,
    // pero mucho menos peor que no mandar nada.
    let attachments: Array<{ filename: string; content: Buffer }> = [];
    try {
      attachments = [
        { filename: buildOrderExcelFilename(data), content: await buildOrderExcel(data) },
      ];
    } catch (err) {
      console.error(
        "No se pudo generar el Excel del pedido; se envía el correo sin adjunto:",
        err instanceof Error ? err.message : err,
      );
    }

    const sent = await sendEmail({
      to: destinatarios,
      subject: buildOrderEmailSubject(data),
      html: renderOrderEmailHtml(data),
      text: renderOrderEmailText(data),
      attachments,
    });

    if (!sent.ok) {
      const result: NotifyResult = { estado: "fallido", destinatarios, error: sent.error };
      await registrar(result, null, sent.proveedor);
      return result;
    }

    const result: NotifyResult = { estado: "enviado", destinatarios };
    await registrar(result, sent.messageId, sent.proveedor);
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const result: NotifyResult = { estado: "fallido", destinatarios: [], error };
    await registrar(result, null, null);
    return result;
  }
}
