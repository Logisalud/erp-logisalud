import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "./audit-log";
import { emailFromAddress, sendEmail } from "./email";
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
import { etiquetaCondicionPago } from "@/domain/payment-terms";
import {
  asuntoDeRespuesta,
  cabecerasDeHilo,
  esMessageIdValido,
  normalizarDominio,
  nuevoMessageId,
} from "@/domain/email-threading";

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
  dias_credito_solicitados: number | null;
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
  precio_fijado_por_admin: boolean | null;
  precio_lista_original: number | string | null;
  motivo_precio_especial: string | null;
  product: { codigo_interno: string; descripcion: string } | null;
};

type ApprovalRow = {
  order_item_id: string;
  precio_solicitado: number | string | null;
  porcentaje_descuento: number | string | null;
  precio_original: number | string | null;
  estado: string;
  approval_decisions:
    | { decision: string; precio_aprobado: number | string | null; fecha: string }[]
    | null;
};

function num(value: number | string | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Un precio que fijó el administrador no pasa por approval_requests —no le
 * pide permiso a nadie—, pero en el correo y en el Excel tiene que verse
 * igual de marcado que un descuento aprobado: quien recibe el pedido
 * necesita notar que esa línea no va a precio de lista.
 */
function precioEspecialDeAdmin(item: ItemRow): OrderEmailPrecioEspecial | null {
  if (!item.precio_fijado_por_admin) return null;
  const precio = num(item.precio_unitario);
  return {
    precioOriginal: item.precio_lista_original === null ? null : num(item.precio_lista_original),
    precioSolicitado: precio,
    porcentajeDescuento: null,
    estado: "RESUELTO",
    decision: "FIJADO_POR_ADMIN",
    precioAprobado: precio,
    motivo: item.motivo_precio_especial,
  };
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
        `numero, fecha_envio, created_at, dias_credito_solicitados,
         razon_social_snapshot, direccion_snapshot, canal_snapshot, zona_snapshot, vendedor_snapshot,
         customer:customers(razon_social, ruc_o_documento),
         payment_terms:payment_terms(nombre)`,
      )
      .eq("id", orderId)
      .maybeSingle(),
    admin
      .from("order_items")
      .select(
        "id, cantidad, precio_unitario, igv, subtotal, total, " +
          "precio_fijado_por_admin, precio_lista_original, motivo_precio_especial, " +
          "product:products(codigo_interno, descripcion)",
      )
      .eq("order_id", orderId),
    // Solicitudes de precio especial del pedido. Se leen aparte y no con un
    // join sobre order_items porque son la excepción: la enorme mayoría de
    // los pedidos no tiene ninguna.
    admin
      .from("approval_requests")
      .select(
        `order_item_id, precio_solicitado, porcentaje_descuento, precio_original, estado,
         approval_decisions(decision, precio_aprobado, fecha)`,
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
    const ultima = [...(row.approval_decisions ?? [])]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .at(-1);
    especialPorItem.set(row.order_item_id, {
      precioOriginal: row.precio_original === null ? null : num(row.precio_original),
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
    precioEspecial: especialPorItem.get(i.id) ?? precioEspecialDeAdmin(i),
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
    // Con días escritos a mano, el nombre del catálogo ("Crédito (otro
    // número de días)") no dice nada: se muestra el plazo real.
    condicionPago: etiquetaCondicionPago(
      order.payment_terms?.nombre,
      order.dias_credito_solicitados,
    ),
    items,
  };
}

type HiloDelPedido = {
  /** Si ya salió al menos un correo: entonces este es una respuesta. */
  abierto: boolean;
  /** Cadena de Message-IDs del hilo, del más viejo al más nuevo. */
  referencias: string[];
};

/**
 * El hilo de correo del pedido: el ancla y la cadena de mensajes que ya
 * salieron. El ancla vive en `orders` y no se deduce de los logs porque es
 * el dato que define el hilo; los logs aportan el resto de la cadena.
 *
 * Sólo entran los envíos que de verdad salieron (los logs de un envío
 * fallido no tienen message_id) y los ids sintácticamente válidos: un id
 * roto en `References` rompe el emparentado sin avisar.
 */
async function leerHiloDelPedido(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<HiloDelPedido> {
  const [orderResult, logsResult] = await Promise.all([
    admin.from("orders").select("email_thread_message_id").eq("id", orderId).maybeSingle(),
    admin
      .from("notification_logs")
      .select("message_id, created_at")
      .eq("order_id", orderId)
      .not("message_id", "is", null)
      .order("created_at", { ascending: true }),
  ]);

  if (orderResult.error) throw new Error(orderResult.error.message);
  if (logsResult.error) throw new Error(logsResult.error.message);

  const ancla = (orderResult.data as { email_thread_message_id: string | null } | null)
    ?.email_thread_message_id ?? null;
  const enviados = ((logsResult.data ?? []) as Array<{ message_id: string | null }>)
    .map((l) => l.message_id)
    .filter((id): id is string => esMessageIdValido(id));

  // El ancla primero aunque el log correspondiente se haya perdido: es la
  // referencia que emparenta todo el hilo.
  const referencias = esMessageIdValido(ancla)
    ? [ancla as string, ...enviados.filter((id) => id !== ancla)]
    : enviados;

  return { abierto: referencias.length > 0, referencias };
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
  return notificarPedido({ orderId, estadoResultado, actor, tipo: "pedido_enviado" });
}

/**
 * Avisa que el pedido cayó en excepción comercial y espera decisión.
 *
 * Sin esto, el aprobador tenía que acordarse de mirar la bandeja: el pedido
 * se frena y nadie se enteraba. El cuerpo es el mismo detalle del pedido, con
 * las líneas negociadas marcadas y sus dos precios.
 */
export async function notifyDiscountRequested(
  orderId: string,
  estadoResultado: string,
  actor: string,
): Promise<NotifyResult> {
  return notificarPedido({
    orderId,
    estadoResultado,
    actor,
    tipo: "descuento_solicitado",
    evento: {
      asunto: "Descuento por aprobar — pedido",
      titulo: `Descuento por aprobar — pedido #__NUMERO__`,
      lead:
        "Un vendedor pidió un precio especial. El pedido no avanza hasta que " +
        "se apruebe o se rechace en Aprobaciones comerciales.",
    },
  });
}

/**
 * Avisa cómo se resolvió la excepción comercial, para que el ciclo quede
 * trazado por correo y no sólo en la pantalla del aprobador.
 */
export async function notifyDiscountResolved(
  orderId: string,
  estadoResultado: string,
  actor: string,
  decision: string,
): Promise<NotifyResult> {
  const aprobado = decision === "APROBAR" || decision === "APROBAR_OTRO_PRECIO";
  const rechazado = decision === "RECHAZAR";
  return notificarPedido({
    orderId,
    estadoResultado,
    actor,
    tipo: "descuento_resuelto",
    evento: {
      asunto: aprobado
        ? "Descuento aprobado — pedido"
        : rechazado
          ? "Descuento rechazado — pedido"
          : "Solicitud de descuento — pedido",
      titulo: aprobado
        ? "Descuento aprobado — pedido #__NUMERO__"
        : rechazado
          ? "Descuento rechazado — pedido #__NUMERO__"
          : "Solicitud de descuento — pedido #__NUMERO__",
      lead: aprobado
        ? "El precio especial quedó aplicado. Abajo, cada línea negociada con su precio de lista y el aprobado."
        : rechazado
          ? "El descuento se rechazó y el pedido volvió a borrador: las líneas quedan al precio de lista."
          : "Se pidió más información sobre la solicitud; el pedido sigue frenado.",
    },
  });
}

type EventoPlantilla = { asunto: string; titulo: string; lead: string | null };

/**
 * El envío en sí, común a los tres avisos.
 *
 * NUNCA lanza: el pedido ya está guardado, y un problema de correo no puede
 * revertirlo ni mostrarle un error a quien no hizo nada mal. Todo desenlace
 * queda en pedidos.notification_logs para reintentar a mano.
 */
async function notificarPedido({
  orderId,
  estadoResultado,
  actor,
  tipo,
  evento,
}: {
  orderId: string;
  estadoResultado: string;
  actor: string;
  tipo: "pedido_enviado" | "descuento_solicitado" | "descuento_resuelto";
  evento?: EventoPlantilla;
}): Promise<NotifyResult> {
  const admin = createAdminClient();

  async function registrar(
    result: NotifyResult,
    proveedorMessageId: string | null,
    proveedor: string | null,
    messageId: string | null = null,
  ) {
    const { error } = await admin.from("notification_logs").insert({
      order_id: orderId,
      tipo,
      estado: result.estado,
      destinatarios: result.destinatarios,
      proveedor,
      proveedor_message_id: proveedorMessageId,
      message_id: messageId,
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
        accion: `notificar_sin_destinatarios:${tipo}`,
        entidad: "orders",
        entidadId: orderId,
        datosDespues: { motivo: "sin destinatarios configurados, correo no enviado" },
      });
      return result;
    }

    const base = await loadOrderEmailData(orderId, estadoResultado);
    if (!base) {
      const result: NotifyResult = {
        estado: "fallido",
        destinatarios,
        error: "No se pudo leer el pedido para armar el correo.",
      };
      await registrar(result, null, null);
      return result;
    }

    const data: OrderEmailData = evento
      ? {
          ...base,
          evento: {
            asunto: evento.asunto,
            titulo: evento.titulo.replace("__NUMERO__", String(base.numero)),
            lead: evento.lead,
          },
        }
      : base;

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

    // Threading: este correo tiene su propio Message-ID y, si el pedido ya
    // tiene hilo abierto, responde dentro de él. Ver domain/email-threading.ts
    // para por qué el id lo generamos nosotros.
    const hilo = await leerHiloDelPedido(admin, orderId);
    const messageId = nuevoMessageId({
      numero: base.numero,
      dominio: normalizarDominio(emailFromAddress()),
      unico: randomUUID(),
    });
    const headers = cabecerasDeHilo({ messageId, referencias: hilo.referencias });

    // Dentro de un hilo, el asunto es el MISMO del correo inicial con
    // "Re: " adelante. El evento concreto (descuento aprobado, rechazado)
    // se lee en el título del cuerpo: cambiar el asunto es lo que hace que
    // Outlook abra una conversación nueva.
    // El asunto base se recalcula, no se guarda: sale del número del pedido
    // y de la razón social del snapshot, que quedan fijos al enviarse.
    const asuntoBase = buildOrderEmailSubject({ ...data, evento: null });
    const asunto = hilo.abierto ? asuntoDeRespuesta(asuntoBase) : asuntoBase;

    const sent = await sendEmail({
      to: destinatarios,
      subject: asunto,
      html: renderOrderEmailHtml(data),
      text: renderOrderEmailText(data),
      attachments,
      headers,
    });

    if (!sent.ok) {
      const result: NotifyResult = { estado: "fallido", destinatarios, error: sent.error };
      // Sin message_id: el correo no salió, así que ese id no existe en
      // ninguna bandeja y meterlo en la cadena de References rompería el
      // emparentado de los que sí salgan.
      await registrar(result, null, sent.proveedor);
      return result;
    }

    const result: NotifyResult = { estado: "enviado", destinatarios };
    await registrar(result, sent.messageId, sent.proveedor, messageId);

    // El primer correo que sale de verdad abre el hilo: queda como ancla y
    // su asunto es el que van a llevar todas las respuestas.
    if (!hilo.abierto) {
      const { error } = await admin
        .from("orders")
        .update({ email_thread_message_id: messageId })
        .eq("id", orderId);
      if (error) console.error("No se pudo guardar el ancla del hilo de correo:", error.message);
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const result: NotifyResult = { estado: "fallido", destinatarios: [], error };
    await registrar(result, null, null);
    return result;
  }
}
