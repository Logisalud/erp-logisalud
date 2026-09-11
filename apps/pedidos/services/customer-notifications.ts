import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "./email";
import { logAudit } from "./audit-log";
import { combinarDestinatarios } from "@/domain/notification-recipients";
import {
  buildCustomerEmailSubject,
  renderCustomerEmailHtml,
  renderCustomerEmailText,
  type CustomerEmailData,
} from "@/domain/customer-email";

/**
 * Aviso por correo cuando Control de Pedidos resuelve un cliente nuevo.
 *
 * Va a la MISMA lista de destinatarios que los avisos de pedido, más el
 * vendedor que lo registró — que es el que de verdad está esperando la
 * respuesta y hasta ahora no se enteraba de nada: registraba el cliente y
 * tenía que volver a la pantalla a probar si ya podía usarlo.
 *
 * **Nunca lanza.** La decisión ya está tomada y guardada; un problema de
 * correo no puede revertirla ni mostrarle un error a quien aprobó bien. El
 * desenlace queda en `pedidos.notification_logs` para reintentar a mano,
 * igual que con los pedidos.
 *
 * No entra en el hilo del pedido a propósito: es un aviso sobre el CLIENTE,
 * y puede no haber ningún pedido (o haber varios, y no hay un hilo que sea
 * "el" correcto).
 */

export type NotifyCustomerResult = {
  estado: "enviado" | "fallido" | "sin_destinatarios";
  destinatarios: string[];
  error?: string;
};

export async function notifyCustomerValidated(input: {
  customerId: string;
  decision: "ACTIVO" | "RECHAZADO";
  actor: string;
  /** Los pedidos que estaban esperando a este cliente. */
  pedidosDestrabados: Array<{ id: string; numero: number | null }>;
}): Promise<NotifyCustomerResult> {
  const admin = createAdminClient();
  const tipo = input.decision === "ACTIVO" ? "cliente_aprobado" : "cliente_rechazado";

  async function registrar(
    result: NotifyCustomerResult,
    proveedorMessageId: string | null,
    proveedor: string | null,
  ) {
    const { error } = await admin.from("notification_logs").insert({
      customer_id: input.customerId,
      tipo,
      estado: result.estado,
      destinatarios: result.destinatarios,
      proveedor,
      proveedor_message_id: proveedorMessageId,
      error_mensaje: result.error ?? null,
    });
    if (error) console.error("No se pudo registrar notification_log:", error.message);
  }

  try {
    // Se resuelve una sola vez: hace falta el correo (destinatario) y el
    // nombre (cuerpo del aviso) de la misma persona.
    const solicitante = await perfilDelSolicitante(admin, input.customerId);

    const data = await cargarDatosDelCliente(
      admin,
      input.customerId,
      input.decision,
      solicitante?.nombre ?? null,
    );
    if (!data) {
      const result: NotifyCustomerResult = {
        estado: "fallido",
        destinatarios: [],
        error: "No se pudo leer el cliente para armar el correo.",
      };
      await registrar(result, null, null);
      return result;
    }

    // La lista fija se lee con la service role key: su RLS es sólo para
    // administrador y quien aprueba puede ser control_pedidos.
    const { data: recipients, error: recipientsError } = await admin
      .from("order_notification_recipients")
      .select("email")
      .eq("activo", true);
    if (recipientsError) throw new Error(recipientsError.message);

    const fijos = ((recipients ?? []) as Array<{ email: string }>).map((r) => r.email);
    const destinatarios = combinarDestinatarios(fijos, [solicitante?.email]);

    if (destinatarios.length === 0) {
      const result: NotifyCustomerResult = { estado: "sin_destinatarios", destinatarios: [] };
      await registrar(result, null, null);
      await logAudit({
        actor: input.actor,
        accion: `notificar_sin_destinatarios:${tipo}`,
        entidad: "customers",
        entidadId: input.customerId,
        datosDespues: { motivo: "sin destinatarios configurados, correo no enviado" },
      });
      return result;
    }

    const completa: CustomerEmailData = {
      ...data,
      pedidosDestrabados: input.pedidosDestrabados,
    };

    const sent = await sendEmail({
      to: destinatarios,
      subject: buildCustomerEmailSubject(completa),
      html: renderCustomerEmailHtml(completa),
      text: renderCustomerEmailText(completa),
    });

    if (!sent.ok) {
      const result: NotifyCustomerResult = { estado: "fallido", destinatarios, error: sent.error };
      await registrar(result, null, sent.proveedor);
      return result;
    }

    const result: NotifyCustomerResult = { estado: "enviado", destinatarios };
    await registrar(result, sent.messageId, sent.proveedor);
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const result: NotifyCustomerResult = { estado: "fallido", destinatarios: [], error };
    await registrar(result, null, null);
    return result;
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function cargarDatosDelCliente(
  admin: AdminClient,
  customerId: string,
  decision: "ACTIVO" | "RECHAZADO",
  vendedor: string | null,
): Promise<Omit<CustomerEmailData, "pedidosDestrabados"> | null> {
  const { data, error } = await admin
    .from("customers")
    .select(
      "razon_social, ruc_o_documento, created_at, fecha_validacion, canal:sales_channels(nombre), zona:zones(nombre), condicion_pago:payment_terms(nombre), customer_addresses(direccion, es_principal)",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  type Fila = {
    razon_social: string;
    ruc_o_documento: string;
    created_at: string | null;
    fecha_validacion: string | null;
    canal: { nombre: string } | null;
    zona: { nombre: string } | null;
    condicion_pago: { nombre: string } | null;
    customer_addresses: Array<{ direccion: string; es_principal: boolean }> | null;
  };
  const fila = data as unknown as Fila;

  const direcciones = fila.customer_addresses ?? [];
  const principal = direcciones.find((d) => d.es_principal) ?? direcciones[0] ?? null;

  return {
    decision,
    razonSocial: fila.razon_social,
    rucODocumento: fila.ruc_o_documento,
    vendedor,
    zona: fila.zona?.nombre ?? null,
    canal: fila.canal?.nombre ?? null,
    condicionPago: fila.condicion_pago?.nombre ?? null,
    direccion: principal?.direccion ?? null,
    fechaSolicitud: fila.created_at,
    fechaValidacion: fila.fecha_validacion ?? new Date().toISOString(),
  };
}

/**
 * El vendedor que registró el cliente sale de `customers.solicitado_por`,
 * que es un usuario de Auth: puede no tener `sellers` (un administrador
 * dando de alta) y puede no tener correo. En cualquiera de los dos casos el
 * aviso igual sale a la lista fija.
 */
async function perfilDelSolicitante(
  admin: AdminClient,
  customerId: string,
): Promise<{ email: string | null; nombre: string | null } | null> {
  try {
    const { data: customer, error } = await admin
      .from("customers")
      .select("solicitado_por")
      .eq("id", customerId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const userId = (customer as { solicitado_por: string | null } | null)?.solicitado_por ?? null;
    if (!userId) return null;

    const [{ data: perfil }, { data: seller }] = await Promise.all([
      admin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle(),
      admin.from("sellers").select("nombre_completo").eq("user_id", userId).maybeSingle(),
    ]);

    const p = perfil as { email: string | null; full_name: string | null } | null;
    const s = seller as { nombre_completo: string } | null;
    return { email: p?.email ?? null, nombre: s?.nombre_completo ?? p?.full_name ?? null };
  } catch (err) {
    console.error(
      "No se pudo resolver quién registró el cliente; el aviso sale sólo a la lista fija:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
