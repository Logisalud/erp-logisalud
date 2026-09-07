import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "./audit-log";
import {
  buildLegacyVendorMap,
  mapCustomerRows,
  mapLegacySnapshotRows,
  parseCsv,
  pisaTrabajoManual,
  resolverCamposDeCartera,
  type ClienteExistente,
  type ImportRefs,
  type MappedCustomer,
  type RowIssue,
} from "@/domain/customer-import";
import type { CustomerEstado } from "@/domain/customers";

/** Insert/upsert en tandas: 3.399 filas en una sola sentencia es innecesariamente frágil. */
const BATCH_SIZE = 500;

/**
 * Canal de venta con el que entra la cartera migrada. Supuesto temporal
 * explícito: el archivo de origen no trae clasificación de canal, y sin
 * canal el pedido no se puede enviar — submit_order (0036) aborta con
 * "El cliente no tiene canal de venta asignado; no se puede calcular
 * precio", porque el precio se busca por canal en price_list_items. Es
 * decir: sin este default la cartera entera quedaría inoperativa.
 *
 * La clasificación real (Mayorista/Horizontal/Minicadenas/Tops/Clínicas/
 * Subdistribuidores) se corregirá cliente por cliente cuando el negocio
 * la entregue. Ver docs/business-rules.md.
 */
const CANAL_POR_DEFECTO = "Horizontal";

async function getCanalPorDefectoId(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sales_channels")
    .select("id")
    .eq("nombre", CANAL_POR_DEFECTO)
    .single();

  if (error || !data) {
    throw new Error(
      `No se encontró el canal de venta "${CANAL_POR_DEFECTO}" en el catálogo` +
        `${error ? `: ${error.message}` : "."}`,
    );
  }
  return (data as { id: number }).id;
}

async function inBatches<T>(items: T[], fn: (batch: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    await fn(items.slice(i, i + BATCH_SIZE));
  }
}

/**
 * Catálogos contra los que se resuelve el archivo. Se leen con el cliente
 * de sesión (no el admin): zones y sellers son legibles por cualquier
 * usuario autenticado, así que no hace falta saltarse RLS para esto.
 */
async function loadRefs(codigoByLegacyId: Map<string, string>): Promise<ImportRefs> {
  const supabase = createClient();

  const [zonesResult, sellersResult] = await Promise.all([
    supabase.from("zones").select("id, codigo_zona"),
    supabase.from("sellers").select("id, codigo_representante, zone_id"),
  ]);
  if (zonesResult.error) throw new Error(`No se pudieron leer las zonas: ${zonesResult.error.message}`);
  if (sellersResult.error) throw new Error(`No se pudieron leer los vendedores: ${sellersResult.error.message}`);

  const zones = zonesResult.data as Array<{ id: number; codigo_zona: string | null }>;
  const sellers = sellersResult.data as Array<{
    id: string;
    codigo_representante: string;
    zone_id: number | null;
  }>;

  const zoneIdByCodigo = new Map<string, number>();
  const codigoByZoneId = new Map<number, string>();
  for (const z of zones) {
    if (!z.codigo_zona) continue;
    zoneIdByCodigo.set(z.codigo_zona, z.id);
    codigoByZoneId.set(z.id, z.codigo_zona);
  }

  const sellerIdByCodigo = new Map<string, string>();
  const zoneCodigoBySellerCodigo = new Map<string, string>();
  for (const s of sellers) {
    sellerIdByCodigo.set(s.codigo_representante, s.id);
    const codigo = s.zone_id === null ? undefined : codigoByZoneId.get(s.zone_id);
    if (codigo) zoneCodigoBySellerCodigo.set(s.codigo_representante, codigo);
  }

  return { zoneIdByCodigo, sellerIdByCodigo, zoneCodigoBySellerCodigo, codigoByLegacyId };
}

/**
 * PostgREST tope las respuestas (1.000 filas por defecto), así que
 * cualquier lectura del total de la cartera tiene que paginar — leer sin
 * range daría un conteo silenciosamente truncado.
 */
const PAGE_SIZE = 1000;

async function fetchAllCustomerIds(): Promise<string[]> {
  const supabase = createClient();
  const ids: string[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as Array<{ id: string }>;
    ids.push(...page.map((row) => row.id));
    if (page.length < PAGE_SIZE) break;
  }

  return ids;
}

async function fetchCustomerIdsWithActiveAddress(): Promise<Set<string>> {
  const supabase = createClient();
  const ids = new Set<string>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("customer_addresses")
      .select("customer_id")
      .eq("estado", "activo")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as Array<{ customer_id: string }>;
    for (const row of page) ids.add(row.customer_id);
    if (page.length < PAGE_SIZE) break;
  }

  return ids;
}

export type CarteraSummary = {
  total: number;
  activos: number;
  pendientesDeValidacion: number;
  sinDireccion: number;
};

/**
 * Estado de la cartera cargada. `sinDireccion` es el trabajo pendiente
 * real: un cliente sin customer_addresses activa no puede recibir un
 * pedido (orders.customer_address_id es not null).
 */
export async function getCarteraSummary(): Promise<CarteraSummary> {
  const supabase = createClient();

  const [totalResult, activosResult, pendientesResult] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("estado", "ACTIVO"),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("estado", "PENDIENTE_DE_VALIDACION"),
  ]);
  for (const r of [totalResult, activosResult, pendientesResult]) {
    if (r.error) throw new Error(r.error.message);
  }

  const [customerIds, conDireccion] = await Promise.all([
    fetchAllCustomerIds(),
    fetchCustomerIdsWithActiveAddress(),
  ]);

  return {
    total: totalResult.count ?? 0,
    activos: activosResult.count ?? 0,
    pendientesDeValidacion: pendientesResult.count ?? 0,
    sinDireccion: customerIds.filter((id) => !conDireccion.has(id)).length,
  };
}

export type CustomerImportInput = {
  /** CSV de clientes del sistema de origen. */
  clientesCsv: string;
  /** CSV de vendedores: solo se usan las columnas id y codigo. */
  vendedoresCsv: string;
  /** CSV de snapshot legacy de cartera (opcional). */
  snapshotCsv?: string | null;
};

export type CustomerImportPreview = {
  totalFilas: number;
  aCargar: number;
  nuevos: number;
  yaExistentes: number;
  porEstado: { ACTIVO: number; PENDIENTE_DE_VALIDACION: number };
  porTipoComprobante: { FACTURA: number; FACTURA_O_BOLETA: number; BOLETA: number };
  conCelular: number;
  conGeografia: number;
  sinZona: number;
  reasignaciones: number;
  snapshotFilas: number;
  /** Clientes que quedarían sin ninguna dirección de entrega registrada. */
  sinDireccion: number;
  /**
   * Clientes ya existentes que CONSERVAN lo que tienen en vez de volver al
   * default del archivo: canal distinto del por defecto, condición de pago
   * habitual cargada, o estado distinto del que derivaría el archivo.
   */
  conservan: { canal: number; condicionPago: number; estado: number };
  /** Canal que se asignará a todos (supuesto temporal). */
  canalPorDefecto: string;
  errors: RowIssue[];
  warnings: RowIssue[];
  muestra: MappedCustomer[];
};

async function parseAndMap(input: CustomerImportInput) {
  const clientes = parseCsv(input.clientesCsv);
  const vendedores = parseCsv(input.vendedoresCsv);

  const { codigoByLegacyId, errors: vendorErrors } = buildLegacyVendorMap(vendedores);
  const refs = await loadRefs(codigoByLegacyId);
  const mapped = mapCustomerRows(clientes, refs);

  const snapshot = input.snapshotCsv?.trim()
    ? mapLegacySnapshotRows(parseCsv(input.snapshotCsv), refs)
    : { rows: [], errors: [], warnings: [] };

  return {
    totalFilas: clientes.rows.length,
    mapped,
    snapshot,
    errors: [...vendorErrors, ...mapped.errors, ...snapshot.errors],
    warnings: [...mapped.warnings, ...snapshot.warnings],
  };
}

type FilaExistente = ClienteExistente & { tieneDireccion: boolean };

/**
 * Lo que la base ya sabe de los RUC del archivo.
 *
 * Se lee una sola vez y sirve para las dos cosas que dependen de ello: no
 * pisar el canal/condición/estado que alguien puso a mano, y contar
 * cuántos quedarían sin dirección de entrega.
 */
async function leerExistentesPorRuc(
  cliente: { from: (tabla: string) => any },
  rucs: string[],
): Promise<Map<string, FilaExistente>> {
  const porRuc = new Map<string, FilaExistente>();

  await inBatches(rucs, async (batch) => {
    const { data, error } = await cliente
      .from("customers")
      .select(
        "ruc_o_documento, canal_id, condicion_pago_habitual_id, estado, customer_addresses(id)",
      )
      .in("ruc_o_documento", batch);
    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as Array<{
      ruc_o_documento: string;
      canal_id: number | null;
      condicion_pago_habitual_id: number | null;
      estado: string;
      customer_addresses: Array<{ id: string }> | null;
    }>) {
      porRuc.set(row.ruc_o_documento, {
        canalId: row.canal_id,
        condicionPagoHabitualId: row.condicion_pago_habitual_id,
        estado: row.estado as CustomerEstado,
        tieneDireccion: (row.customer_addresses ?? []).length > 0,
      });
    }
  });

  return porRuc;
}

export async function previewCustomerImport(
  input: CustomerImportInput,
): Promise<CustomerImportPreview> {
  const { totalFilas, mapped, snapshot, errors, warnings } = await parseAndMap(input);
  const supabase = createClient();

  const canalPorDefectoId = await getCanalPorDefectoId();
  const rucs = mapped.customers.map((c) => c.rucODocumento);
  const existentes = await leerExistentesPorRuc(supabase, rucs);

  // Cuántos clientes conservan lo que alguien les puso a mano en vez de
  // volver al default del archivo. Va en la vista previa porque es la
  // pregunta que uno se hace antes de reimportar: "¿esto me pisa lo que
  // corregí?".
  const conservan = { canal: 0, condicionPago: 0, estado: 0 };
  for (const c of mapped.customers) {
    const existente = existentes.get(c.rucODocumento);
    if (!existente) continue;
    const pisaria = pisaTrabajoManual({
      existente,
      canalPorDefectoId,
      estadoDelArchivo: c.estado,
    });
    if (pisaria.canal) conservan.canal++;
    if (pisaria.condicionPago) conservan.condicionPago++;
    if (pisaria.estado) conservan.estado++;
  }

  const porEstado = { ACTIVO: 0, PENDIENTE_DE_VALIDACION: 0 };
  const porTipoComprobante = { FACTURA: 0, FACTURA_O_BOLETA: 0, BOLETA: 0 };
  for (const c of mapped.customers) {
    if (c.estado === "ACTIVO") porEstado.ACTIVO++;
    if (c.estado === "PENDIENTE_DE_VALIDACION") porEstado.PENDIENTE_DE_VALIDACION++;
    porTipoComprobante[c.tipoComprobantePermitido]++;
  }

  return {
    totalFilas,
    aCargar: mapped.customers.length,
    nuevos: mapped.customers.filter((c) => !existentes.has(c.rucODocumento)).length,
    yaExistentes: mapped.customers.filter((c) => existentes.has(c.rucODocumento)).length,
    conservan,
    porEstado,
    porTipoComprobante,
    conCelular: mapped.customers.filter((c) => c.celular !== null).length,
    conGeografia: mapped.customers.filter((c) => c.departamento !== null).length,
    sinZona: mapped.customers.filter((c) => c.zonaId === null).length,
    reasignaciones: mapped.customers.filter((c) => c.reasignacion !== null).length,
    snapshotFilas: snapshot.rows.length,
    sinDireccion: mapped.customers.filter(
      (c) => !existentes.get(c.rucODocumento)?.tieneDireccion,
    ).length,
    canalPorDefecto: CANAL_POR_DEFECTO,
    errors,
    warnings,
    muestra: mapped.customers.slice(0, 25),
  };
}

export type CustomerImportResult = {
  canalPorDefecto: string;
  clientesCargados: number;
  activos: number;
  pendientesDeValidacion: number;
  contactosCreados: number;
  reasignacionesCargadas: number;
  /**
   * Clientes ya existentes a los que se les respetó lo cargado a mano en
   * vez de volver al default del archivo.
   */
  preservados: { canal: number; condicionPago: number; estado: number };
  snapshotFilasCargadas: number;
  sinDireccion: number;
  filasOmitidasPorError: number;
};

/**
 * Carga la cartera real. Usa la service role key porque es una migración
 * de datos masiva que crea clientes en estado ACTIVO — algo que ninguna
 * policy de RLS permite (customers_insert_vendedor obliga a
 * PENDIENTE_DE_VALIDACION, y aun como admin serían 3.399 round-trips con
 * sesión). Queda registrado en audit_logs con el actor real.
 *
 * Es idempotente: los clientes se upsertan por ruc_o_documento, y el
 * historial de reasignación y el snapshot legacy se reemplazan en vez de
 * acumularse al correr de nuevo.
 */
export async function publishCustomerImport(
  input: CustomerImportInput,
  actorUserId: string,
): Promise<CustomerImportResult> {
  const { mapped, snapshot, errors } = await parseAndMap(input);

  if (mapped.customers.length === 0) {
    throw new Error("No se encontraron clientes válidos para cargar.");
  }

  const canalId = await getCanalPorDefectoId();
  const admin = createAdminClient();

  // Lo que la base ya tiene: sobre un cliente que ya existe, el canal, la
  // condición de pago habitual y el estado NO se pisan — ver
  // resolverCamposDeCartera. Se lee antes del upsert porque después ya no
  // se puede distinguir lo que había de lo que acaba de escribirse.
  const existentes = await leerExistentesPorRuc(
    admin,
    mapped.customers.map((c) => c.rucODocumento),
  );

  const preservados = { canal: 0, condicionPago: 0, estado: 0 };
  for (const c of mapped.customers) {
    const existente = existentes.get(c.rucODocumento);
    if (!existente) continue;
    const pisaria = pisaTrabajoManual({
      existente,
      canalPorDefectoId: canalId,
      estadoDelArchivo: c.estado,
    });
    if (pisaria.canal) preservados.canal++;
    if (pisaria.condicionPago) preservados.condicionPago++;
    if (pisaria.estado) preservados.estado++;
  }

  // --- Clientes -------------------------------------------------------
  const idByRuc = new Map<string, string>();
  await inBatches(mapped.customers, async (batch) => {
    const { data, error } = await admin
      .from("customers")
      .upsert(
        batch.map((c) => {
          // El archivo manda en identificación y ubicación; los tres
          // campos que se corrigen a mano en la app, no.
          const campos = resolverCamposDeCartera({
            existente: existentes.get(c.rucODocumento) ?? null,
            canalPorDefectoId: canalId,
            estadoDelArchivo: c.estado,
          });

          return {
            ruc_o_documento: c.rucODocumento,
            razon_social: c.razonSocial,
            zona_id: c.zonaId,
            vendedor_id: c.vendedorId,
            tipo_comprobante_permitido: c.tipoComprobantePermitido,
            zona_asignada_manualmente: c.zonaAsignadaManualmente,
            distrito: c.distrito,
            provincia: c.provincia,
            departamento: c.departamento,
            whatsapp: c.celular,
            estado: campos.estado,
            canal_id: campos.canalId,
            // En un cliente nuevo entra null: el archivo de origen no trae
            // condición de pago y no se inventa una. El vendedor elige la
            // del pedido, y sin habitual definida eso no dispara excepción
            // administrativa (ver 0043 y domain/orders.ts). En uno que ya
            // existe se conserva la que tenga.
            condicion_pago_habitual_id: campos.condicionPagoHabitualId,
          };
        }),
        { onConflict: "ruc_o_documento" },
      )
      .select("id, ruc_o_documento");
    if (error) throw new Error(`No se pudieron cargar los clientes: ${error.message}`);
    for (const row of (data ?? []) as Array<{ id: string; ruc_o_documento: string }>) {
      idByRuc.set(row.ruc_o_documento, row.id);
    }
  });

  const customerIds = Array.from(idByRuc.values());

  // --- Contactos (celular del origen) ---------------------------------
  // customer_contacts.nombre es not null y el origen no trae nombre de
  // contacto; se usa la razón social, que es a quién pertenece el número.
  const conCelular = mapped.customers.filter((c) => c.celular !== null);
  const contactosExistentes = new Set<string>();
  await inBatches(customerIds, async (batch) => {
    const { data, error } = await admin
      .from("customer_contacts")
      .select("customer_id, telefono")
      .in("customer_id", batch);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ customer_id: string; telefono: string | null }>) {
      contactosExistentes.add(`${row.customer_id}|${row.telefono ?? ""}`);
    }
  });

  const contactosNuevos = conCelular
    .map((c) => ({ customerId: idByRuc.get(c.rucODocumento), c }))
    .filter(
      (x): x is { customerId: string; c: MappedCustomer } =>
        !!x.customerId && !contactosExistentes.has(`${x.customerId}|${x.c.celular}`),
    )
    .map((x) => ({
      customer_id: x.customerId,
      nombre: x.c.razonSocial,
      telefono: x.c.celular,
      es_principal: true,
    }));

  await inBatches(contactosNuevos, async (batch) => {
    const { error } = await admin.from("customer_contacts").insert(batch);
    if (error) throw new Error(`No se pudieron cargar los contactos: ${error.message}`);
  });

  // --- Historial de reasignación --------------------------------------
  // Se reemplaza lo migrado antes (fuente = migracion_piloto) para que
  // correr el importador de nuevo no duplique historial. Lo registrado
  // desde la app (fuente = app) no se toca.
  await inBatches(customerIds, async (batch) => {
    const { error } = await admin
      .from("customer_seller_reassignments")
      .delete()
      .eq("fuente", "migracion_piloto")
      .in("customer_id", batch);
    if (error) throw new Error(error.message);
  });

  const reasignaciones = mapped.customers
    .filter((c) => c.reasignacion !== null)
    .map((c) => ({
      customer_id: idByRuc.get(c.rucODocumento),
      vendedor_anterior_id: c.reasignacion!.vendedorAnteriorId,
      vendedor_nuevo_id: c.vendedorId,
      fecha_reasignacion: c.reasignacion!.fechaReasignacion,
      fuente: "migracion_piloto",
    }))
    .filter((r) => !!r.customer_id);

  await inBatches(reasignaciones, async (batch) => {
    const { error } = await admin.from("customer_seller_reassignments").insert(batch);
    if (error) throw new Error(`No se pudo cargar el historial de reasignación: ${error.message}`);
  });

  // --- Snapshot legacy (solo referencia) ------------------------------
  let snapshotFilasCargadas = 0;
  if (snapshot.rows.length > 0) {
    const { error: deleteError } = await admin
      .from("legacy_vendor_snapshots")
      .delete()
      .eq("fuente", "cobranzas");
    if (deleteError) throw new Error(deleteError.message);

    await inBatches(snapshot.rows, async (batch) => {
      const { error } = await admin.from("legacy_vendor_snapshots").insert(
        batch.map((r) => ({
          ruc: r.ruc,
          vendedor_id_snapshot: r.vendedorIdSnapshot,
          fuente: "cobranzas",
        })),
      );
      if (error) throw new Error(`No se pudo cargar el snapshot legacy: ${error.message}`);
    });
    snapshotFilasCargadas = snapshot.rows.length;
  }

  // --- Cuántos quedan sin dirección de entrega ------------------------
  const conDireccion = new Set<string>();
  await inBatches(customerIds, async (batch) => {
    const { data, error } = await admin
      .from("customer_addresses")
      .select("customer_id")
      .eq("estado", "activo")
      .in("customer_id", batch);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ customer_id: string }>) {
      conDireccion.add(row.customer_id);
    }
  });

  // Los estados que quedaron ESCRITOS, no los que derivaba el archivo: en
  // un cliente que ya existía manda el que tenía.
  const estadosEscritos = mapped.customers.map(
    (c) =>
      resolverCamposDeCartera({
        existente: existentes.get(c.rucODocumento) ?? null,
        canalPorDefectoId: canalId,
        estadoDelArchivo: c.estado,
      }).estado,
  );

  const result: CustomerImportResult = {
    canalPorDefecto: CANAL_POR_DEFECTO,
    clientesCargados: idByRuc.size,
    activos: estadosEscritos.filter((e) => e === "ACTIVO").length,
    pendientesDeValidacion: estadosEscritos.filter((e) => e === "PENDIENTE_DE_VALIDACION").length,
    preservados,
    contactosCreados: contactosNuevos.length,
    reasignacionesCargadas: reasignaciones.length,
    snapshotFilasCargadas,
    sinDireccion: customerIds.filter((id) => !conDireccion.has(id)).length,
    filasOmitidasPorError: errors.length,
  };

  await logAudit({
    actor: actorUserId,
    accion: "importar_cartera_clientes",
    entidad: "customers",
    // canalId y la condición null son lo que se aplica a los clientes
    // NUEVOS; a los que ya existían se les respetó lo que tenían.
    datosDespues: { ...result, canalIdNuevos: canalId, condicionPagoHabitualIdNuevos: null },
  });

  return result;
}
