import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  INITIAL_CUSTOMER_LIMIT,
  MIN_SEARCH_LENGTH,
  SEARCH_RESULT_LIMIT,
  normalizeSearchTerm,
  soloDigitos,
} from "@/domain/customer-search";
import { resolveTipoComprobantePermitido } from "@/domain/customers";

export type PendingCustomer = {
  id: string;
  ruc_o_documento: string;
  razon_social: string;
  nombre_comercial: string | null;
  tipo_comprobante_permitido: string;
  es_agente_retencion: boolean;
  created_at: string;
  canal: { nombre: string } | null;
  zona: { nombre: string } | null;
  condicion_pago: { nombre: string } | null;
  customer_addresses: Array<{ direccion: string; ubigeo: string | null; es_principal: boolean }>;
};

export type ActiveCustomerOption = {
  id: string;
  razon_social: string;
  nombre_comercial: string | null;
  ruc_o_documento: string;
  canal_id: number | null;
  condicion_pago_habitual_id: number | null;
};

const CUSTOMER_OPTION_COLUMNS =
  "id, razon_social, nombre_comercial, ruc_o_documento, canal_id, condicion_pago_habitual_id";

/**
 * Primeros clientes ACTIVO visibles para el usuario actual, para que el
 * selector no abra vacío.
 *
 * **Es una primera página, no la cartera.** Son 3.4k clientes y PostgREST
 * tope las respuestas en 1.000 filas: traerlos todos al navegador sería
 * lento y —lo que pasó en producción— silenciosamente truncado. Buscar es
 * trabajo de `searchActiveCustomers`, en el servidor.
 *
 * RLS ya limita por zona si es vendedor, o muestra todos si es
 * admin/control_pedidos — ver customers_select en 0012_customers.sql.
 */
export async function listActiveCustomers(
  limit: number = INITIAL_CUSTOMER_LIMIT,
): Promise<ActiveCustomerOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_OPTION_COLUMNS)
    .eq("estado", "ACTIVO")
    .order("razon_social")
    .limit(limit);

  if (error) throw new Error(error.message);
  return data as unknown as ActiveCustomerOption[];
}

/**
 * Busca clientes ACTIVO por RUC/documento, razón social o nombre
 * comercial. Corre en el servidor con el cliente del usuario (nunca el
 * admin), así que **la RLS por zona aplica igual**: un vendedor solo
 * encuentra clientes de su(s) zona(s), un admin busca sobre todos.
 *
 * Coincidencia por `ilike %term%`, no por prefijo: la cartera legacy trae
 * nombres con basura al inicio (asteriscos, barras), así que buscar
 * "EJEMPLO" tiene que encontrar "**** COMERCIAL EJEMPLO S.C.R.L.".
 *
 * Si el término son puros dígitos se busca además por RUC con los dígitos
 * pelados, para que un RUC tipeado con espacios o guiones igual caiga.
 */
export async function searchActiveCustomers(
  rawQuery: string,
  limit: number = SEARCH_RESULT_LIMIT,
): Promise<ActiveCustomerOption[]> {
  const term = normalizeSearchTerm(rawQuery);
  if (term.length < MIN_SEARCH_LENGTH) return [];

  const patrones = [
    `razon_social.ilike.%${term}%`,
    `nombre_comercial.ilike.%${term}%`,
    `ruc_o_documento.ilike.%${term}%`,
  ];

  const digitos = soloDigitos(term);
  if (digitos.length >= MIN_SEARCH_LENGTH && digitos !== term) {
    patrones.push(`ruc_o_documento.ilike.%${digitos}%`);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_OPTION_COLUMNS)
    .eq("estado", "ACTIVO")
    .or(patrones.join(","))
    .order("razon_social")
    .limit(limit);

  if (error) throw new Error(error.message);
  return data as unknown as ActiveCustomerOption[];
}

/**
 * Solicitud de cliente nuevo (Fase 2, "Flujo de cliente nuevo") desde el
 * flujo de toma de pedido (Fase 4): siempre queda en
 * PENDIENTE_DE_VALIDACION, sin importar el rol de quien la crea — un
 * admin puede insertar con cualquier estado según su policy de RLS,
 * pero acá se fuerza igual porque es una SOLICITUD, no un alta directa.
 * El pedido que la use queda en NEW_CUSTOMER_VALIDATION al enviarse
 * (ver domain/orders.ts) hasta que control_pedidos/admin la apruebe.
 */
export async function requestNewCustomer(input: {
  rucODocumento: string;
  razonSocial: string;
  canalId: number;
  zonaId: number;
  condicionPagoHabitualId: number;
  direccion: string;
  solicitadoPor: string;
}): Promise<{ customer: ActiveCustomerOption; addressId: string }> {
  const supabase = createClient();

  // El comprobante permitido se DERIVA del documento, no se deja en el
  // default de la tabla ('FACTURA'): un DNI en el campo de RUC no puede
  // facturar, y el constraint customers_boleta_only_sin_ruc_valido rechaza
  // la fila entera. Eso era el error de servidor al registrar un cliente
  // con DNI — el caso más común de cliente nuevo.
  const tipoComprobante = resolveTipoComprobantePermitido(input.rucODocumento);

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      ruc_o_documento: input.rucODocumento,
      razon_social: input.razonSocial,
      canal_id: input.canalId,
      zona_id: input.zonaId,
      condicion_pago_habitual_id: input.condicionPagoHabitualId,
      tipo_comprobante_permitido: tipoComprobante,
      estado: "PENDIENTE_DE_VALIDACION",
      solicitado_por: input.solicitadoPor,
    })
    .select(CUSTOMER_OPTION_COLUMNS)
    .single();

  if (customerError) {
    if (customerError.code === "23505") {
      throw new Error("Ya existe un cliente con ese RUC/documento.");
    }
    // Errores crudos de la base son ilegibles y llegan a la pantalla como
    // "An error occurred in the Server Components render". Los dos que de
    // verdad puede provocar este formulario se traducen.
    if (customerError.code === "42501" || /row-level security/i.test(customerError.message)) {
      throw new Error(MENSAJE_ZONA_AJENA);
    }
    if (customerError.code === "23514") {
      throw new Error(
        "El documento no corresponde a un RUC de contribuyente válido y el cliente quedaría sin " +
          "comprobante posible. Revisá el número antes de registrarlo.",
      );
    }
    throw new Error(customerError.message);
  }

  const { data: address, error: addressError } = await supabase
    .from("customer_addresses")
    .insert({
      customer_id: customer.id,
      direccion: input.direccion,
      es_principal: true,
      solicitado_por: input.solicitadoPor,
    })
    .select("id")
    .single();

  if (addressError) throw new Error(addressError.message);

  return { customer: customer as unknown as ActiveCustomerOption, addressId: address.id };
}

/**
 * Un vendedor sólo ve —y por lo tanto sólo puede usar— los clientes de su
 * zona (`customers_select`). Si registra uno en otra zona, la fila entra
 * pero no la puede leer de vuelta: PostgREST devuelve el INSERT ...
 * RETURNING como violación de RLS y la pantalla se cae con un error de
 * servidor. Mejor decirle qué pasó.
 */
/**
 * Las zonas que el usuario puede elegir al registrar un cliente.
 *
 * Un administrador ve todas. Un vendedor ve sólo las suyas, porque un
 * cliente en otra zona le queda invisible por RLS: la pantalla no debería
 * ofrecerle una opción que la base le va a rechazar.
 *
 * La lista sale de `current_user_zone_ids()`, la misma función que usa la
 * policy — no se reimplementa el criterio acá.
 */
export async function listZonasSeleccionables(
  esAdmin: boolean,
): Promise<Array<{ id: number; nombre: string }>> {
  const supabase = createClient();

  if (esAdmin) {
    const { data, error } = await supabase.from("zones").select("id, nombre").order("nombre");
    if (error) throw new Error(error.message);
    return data as Array<{ id: number; nombre: string }>;
  }

  const { data: propias, error: zonasError } = await supabase.rpc("current_user_zone_ids");
  if (zonasError) throw new Error(zonasError.message);

  const ids = (propias as Array<number> | null) ?? [];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("zones")
    .select("id, nombre")
    .in("id", ids)
    .order("nombre");
  if (error) throw new Error(error.message);
  return data as Array<{ id: number; nombre: string }>;
}

export const MENSAJE_ZONA_AJENA =
  "Esa zona no es tuya, así que el cliente quedaría invisible para vos y no lo podrías usar en " +
  "un pedido. Elegí una de tus zonas o pedile a un administrador que lo registre.";

/** Un vendedor sin zonas no puede registrar clientes: no hay dónde ponerlos. */
export const MENSAJE_SIN_ZONA_ASIGNADA =
  "No tenés ninguna zona asignada, así que no podés registrar clientes. Pedile a un " +
  "administrador que te asigne tu zona.";

export async function listCustomerAddresses(customerId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("id, direccion, es_principal")
    .eq("customer_id", customerId)
    .eq("estado", "activo")
    .order("es_principal", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Registra una dirección de entrega para un cliente que ya existe. Es la
 * salida del bloqueo "cliente sin dirección" del flujo de pedido: la
 * cartera migrada entró sin direcciones (el origen no las traía), así que
 * la primera vez que se le vende a un cliente hay que capturarla.
 *
 * No fuerza el rol: la RLS de customer_addresses ya decide quién puede
 * (vendedor solo en su zona y a su nombre; control_pedidos/admin en
 * cualquiera) — ver 0013_customer_addresses_contacts.sql.
 */
export async function addCustomerAddress(input: {
  customerId: string;
  direccion: string;
  ubigeo?: string | null;
  referencia?: string | null;
  solicitadoPor: string;
}): Promise<{ id: string; direccion: string; es_principal: boolean }> {
  const supabase = createClient();

  const { data: existing, error: existingError } = await supabase
    .from("customer_addresses")
    .select("id")
    .eq("customer_id", input.customerId)
    .eq("estado", "activo");
  if (existingError) throw new Error(existingError.message);

  const { data, error } = await supabase
    .from("customer_addresses")
    .insert({
      customer_id: input.customerId,
      direccion: input.direccion,
      ubigeo: input.ubigeo ?? null,
      referencia: input.referencia ?? null,
      es_principal: (existing ?? []).length === 0,
      solicitado_por: input.solicitadoPor,
    })
    .select("id, direccion, es_principal")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as { id: string; direccion: string; es_principal: boolean };
}

export async function listPendingCustomers(): Promise<PendingCustomer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      `*,
      canal:sales_channels(nombre),
      zona:zones(nombre),
      condicion_pago:payment_terms(nombre),
      customer_addresses(direccion, ubigeo, es_principal)`,
    )
    .eq("estado", "PENDIENTE_DE_VALIDACION")
    .order("created_at");

  if (error) throw new Error(error.message);
  return data as unknown as PendingCustomer[];
}

export async function resolveCustomerValidation(
  customerId: string,
  decision: "ACTIVO" | "RECHAZADO",
  actor: string,
) {
  const supabase = createClient();

  // El cambio de estado en sí queda registrado por el trigger
  // customers_audit (ver 0017_master_data_audit_triggers.sql).
  const { data, error } = await supabase
    .from("customers")
    .update({
      estado: decision,
      validado_por: actor,
      fecha_validacion: new Date().toISOString(),
    })
    .eq("id", customerId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Fase 4: todo pedido que quedó esperando a este cliente
  // (NEW_CUSTOMER_VALIDATION) se destraba con la misma decisión — si el
  // cliente quedó ACTIVO, se reevalúa la bifurcación (puede seguir a
  // READY_FOR_OPERATIONS o caer en otra excepción); si fue RECHAZADO, el
  // pedido vuelve a DRAFT (un cliente rechazado no puede seguir
  // avanzando solo).
  const { data: pendingOrders, error: pendingError } = await supabase
    .from("orders")
    .select("id")
    .eq("customer_id", customerId)
    .eq("estado", "NEW_CUSTOMER_VALIDATION");
  if (pendingError) throw new Error(pendingError.message);

  for (const order of pendingOrders ?? []) {
    if (decision === "ACTIVO") {
      const { error: rpcError } = await supabase.rpc("reevaluate_order", {
        p_order_id: order.id,
        p_motivo: "Cliente validado",
      });
      if (rpcError) throw new Error(rpcError.message);
    } else {
      const { error: rpcError } = await supabase.rpc("apply_order_transition", {
        p_order_id: order.id,
        p_estado_nuevo: "DRAFT",
        p_motivo: "Cliente rechazado",
      });
      if (rpcError) throw new Error(rpcError.message);
    }
  }

  return data;
}
