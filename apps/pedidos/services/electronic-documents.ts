import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "./audit-log";
import {
  buildComprobanteBorrador,
  buildGuiaRemisionBorrador,
  resolverTipoComprobante,
  type DraftFulfillmentData,
  type DraftItem,
  type DraftOrderData,
} from "@/domain/nubefact-draft";
import type { DraftEmisorData, DraftLineaDespachada } from "@/domain/nubefact-draft";
import type { TipoComprobantePermitido } from "@/domain/customers";

/**
 * Borradores de documentación electrónica.
 *
 * ⚠ TODO — Pendiente: reemplazar generación de borrador por llamada real a
 * la API de NubeFact (POST a la ruta configurada con el token), una vez
 * confirmada la estructura exacta de campos contra el manual oficial y
 * rotado el token de forma segura (variables de entorno NUBEFACT_API_URL y
 * NUBEFACT_API_TOKEN, nunca en el repo).
 *
 * HOY no se llama a ninguna URL externa y no se usa ningún token: se genera
 * el JSON, se guarda en pedidos.electronic_document_drafts, y un humano lo
 * revisa contra el manual.
 */

function num(v: number | string | null | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

type OrderRow = {
  numero: number;
  fecha_envio: string | null;
  created_at: string;
  razon_social_snapshot: string | null;
  direccion_snapshot: string | null;
  ubigeo_snapshot: string | null;
  vendedor_snapshot: string | null;
  customer: { razon_social: string; ruc_o_documento: string; tipo_comprobante_permitido: string } | null;
  payment_terms: { nombre: string } | null;
};

type ItemRow = {
  cantidad: number | string;
  precio_unitario: number | string;
  igv: number | string;
  subtotal: number | string;
  total: number | string;
  afectacion_tributaria: string;
  tasa_igv: number | string;
  product: {
    codigo_interno: string;
    descripcion: string;
    unidad_medida: string;
    peso_unitario_futuro: number | string | null;
  } | null;
};

type FulfillmentRow = {
  id: string;
  fecha_despacho: string | null;
  inventory_source: { nombre: string } | null;
  warehouse: { nombre: string; direccion: string | null; ubigeo_codigo: string | null } | null;
  vehicle: { nombre: string } | null;
  driver: { nombre: string } | null;
  transporter: { nombre: string } | null;
  fulfillment_items: Array<{
    cantidad_preparada: number | string;
    lote: string | null;
    fecha_vencimiento: string | null;
    order_item: {
      product: {
        codigo_interno: string;
        descripcion: string;
        unidad_medida: string;
        peso_unitario_futuro: number | string | null;
      } | null;
    } | null;
  }> | null;
};

/**
 * Genera y guarda los dos borradores. NUNCA lanza: corre después de que el
 * despacho quedó grabado y el pedido pasó a DISPATCHED, y un problema
 * generando un JSON para revisión humana no puede revertir un despacho
 * físico ya hecho — mismo criterio que la notificación por correo.
 */
export async function generateElectronicDocumentDrafts(
  orderId: string,
  actor: string,
): Promise<{ ok: boolean; advertencias: string[]; error?: string }> {
  const admin = createAdminClient();

  try {
    const [orderResult, itemsResult, fulfillmentResult] = await Promise.all([
      admin
        .from("orders")
        .select(
          `numero, fecha_envio, created_at, razon_social_snapshot, direccion_snapshot, ubigeo_snapshot, vendedor_snapshot,
           customer:customers(razon_social, ruc_o_documento, tipo_comprobante_permitido),
           payment_terms:payment_terms(nombre)`,
        )
        .eq("id", orderId)
        .maybeSingle(),
      admin
        .from("order_items")
        .select(
          `cantidad, precio_unitario, igv, subtotal, total, afectacion_tributaria, tasa_igv,
           product:products(codigo_interno, descripcion, unidad_medida, peso_unitario_futuro)`,
        )
        .eq("order_id", orderId),
      admin
        .from("fulfillments")
        .select(
          `id, fecha_despacho,
           inventory_source:inventory_sources(nombre),
           warehouse:warehouses(nombre, direccion, ubigeo_codigo),
           vehicle:vehicles(nombre),
           driver:drivers(nombre),
           transporter:transporters(nombre),
           fulfillment_items(
             cantidad_preparada, lote, fecha_vencimiento,
             order_item:order_items(
               product:products(codigo_interno, descripcion, unidad_medida, peso_unitario_futuro)
             )
           )`,
        )
        .eq("order_id", orderId)
        .order("fecha_preparacion", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const { data: companyRow, error: companyError } = await admin
      .from("company_settings")
      .select("razon_social, ruc, direccion, ubigeo_codigo, telefono, email")
      .eq("id", 1)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!companyRow) {
      throw new Error(
        "No hay datos de empresa emisora configurados (pedidos.company_settings). " +
          "Cargarlos en /admin/configuracion/empresa.",
      );
    }
    const company = companyRow as unknown as {
      razon_social: string;
      ruc: string;
      direccion: string;
      ubigeo_codigo: string | null;
      telefono: string | null;
      email: string | null;
    };
    const emisor: DraftEmisorData = {
      razonSocial: company.razon_social,
      ruc: company.ruc,
      direccion: company.direccion,
      ubigeoCodigo: company.ubigeo_codigo,
      telefono: company.telefono,
      email: company.email,
    };

    if (orderResult.error) throw new Error(orderResult.error.message);
    if (itemsResult.error) throw new Error(itemsResult.error.message);
    if (fulfillmentResult.error) throw new Error(fulfillmentResult.error.message);
    if (!orderResult.data) throw new Error("No se encontró el pedido.");

    const order = orderResult.data as unknown as OrderRow;
    const fulfillment = (fulfillmentResult.data as unknown as FulfillmentRow) ?? null;

    const items: DraftItem[] = ((itemsResult.data ?? []) as unknown as ItemRow[]).map((i) => ({
      codigo: i.product?.codigo_interno ?? "—",
      descripcion: i.product?.descripcion ?? "—",
      unidadMedida: i.product?.unidad_medida ?? "UND",
      cantidad: num(i.cantidad),
      precioUnitario: num(i.precio_unitario),
      igv: num(i.igv),
      subtotal: num(i.subtotal),
      total: num(i.total),
      afectacionTributaria: i.afectacion_tributaria === "INAFECTO" ? "INAFECTO" : "GRAVADO",
      tasaIgv: num(i.tasa_igv),
      pesoUnitario:
        i.product?.peso_unitario_futuro === null || i.product?.peso_unitario_futuro === undefined
          ? null
          : num(i.product.peso_unitario_futuro),
    }));

    const data: DraftOrderData = {
      numero: order.numero,
      fechaEmision: order.fecha_envio ?? order.created_at,
      cliente: {
        razonSocial: order.razon_social_snapshot ?? order.customer?.razon_social ?? "—",
        rucODocumento: order.customer?.ruc_o_documento ?? "",
        direccion: order.direccion_snapshot,
        ubigeoCodigo: order.ubigeo_snapshot,
      },
      vendedor: order.vendedor_snapshot,
      condicionPago: order.payment_terms?.nombre ?? null,
      tipoComprobantePermitido: (order.customer?.tipo_comprobante_permitido ??
        "FACTURA") as TipoComprobantePermitido,
      items,
    };

    // Las líneas realmente despachadas: de acá salen el lote y el
    // vencimiento que capturó Operaciones, que la guía concatena en la
    // descripción.
    const lineasDespachadas: DraftLineaDespachada[] = (fulfillment?.fulfillment_items ?? []).map(
      (fi) => ({
        codigo: fi.order_item?.product?.codigo_interno ?? "—",
        descripcion: fi.order_item?.product?.descripcion ?? "—",
        unidadMedida: fi.order_item?.product?.unidad_medida ?? "UND",
        cantidadPreparada: num(fi.cantidad_preparada),
        lote: fi.lote,
        fechaVencimiento: fi.fecha_vencimiento,
        pesoUnitario:
          fi.order_item?.product?.peso_unitario_futuro === null ||
          fi.order_item?.product?.peso_unitario_futuro === undefined
            ? null
            : num(fi.order_item.product.peso_unitario_futuro),
      }),
    );

    const fulfillmentData: DraftFulfillmentData = {
      fuenteStock: fulfillment?.inventory_source?.nombre ?? null,
      almacen: fulfillment?.warehouse?.nombre ?? null,
      direccionPartida: fulfillment?.warehouse?.direccion ?? null,
      ubigeoPartida: fulfillment?.warehouse?.ubigeo_codigo ?? null,
      vehiculo: fulfillment?.vehicle?.nombre ?? null,
      chofer: fulfillment?.driver?.nombre ?? null,
      transportista: fulfillment?.transporter?.nombre ?? null,
      fechaDespacho: fulfillment?.fecha_despacho ?? null,
      lineasDespachadas: lineasDespachadas,
    };

    const comprobante = buildComprobanteBorrador(data, emisor);
    const guia = buildGuiaRemisionBorrador(data, fulfillmentData, emisor);
    const { tipo } = resolverTipoComprobante(data.tipoComprobantePermitido);

    // Se reemplaza el borrador anterior del mismo pedido y tipo: si se
    // regenera, lo que importa es el último, no el historial de intentos.
    const { error: deleteError } = await admin
      .from("electronic_document_drafts")
      .delete()
      .eq("order_id", orderId);
    if (deleteError) throw new Error(deleteError.message);

    const { error: insertError } = await admin.from("electronic_document_drafts").insert([
      {
        order_id: orderId,
        fulfillment_id: fulfillment?.id ?? null,
        tipo: "COMPROBANTE",
        tipo_comprobante: tipo,
        payload: comprobante.payload,
        advertencias: comprobante.advertencias,
        generado_por: actor,
      },
      {
        order_id: orderId,
        fulfillment_id: fulfillment?.id ?? null,
        tipo: "GUIA_REMISION",
        tipo_comprobante: null,
        payload: guia.payload,
        advertencias: guia.advertencias,
        generado_por: actor,
      },
    ]);
    if (insertError) throw new Error(insertError.message);

    const advertencias = [...comprobante.advertencias, ...guia.advertencias];

    await logAudit({
      actor,
      accion: "generar_borradores_documentacion_electronica",
      entidad: "orders",
      entidadId: orderId,
      datosDespues: {
        tipoComprobante: tipo,
        advertencias: advertencias.length,
        nota: "BORRADORES locales para revisión humana; no se envió nada a NubeFact.",
      },
    });

    return { ok: true, advertencias };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("No se pudieron generar los borradores de documentación electrónica:", error);
    return { ok: false, advertencias: [], error };
  }
}

export type ElectronicDocumentDraft = {
  id: string;
  tipo: "COMPROBANTE" | "GUIA_REMISION";
  tipo_comprobante: "FACTURA" | "BOLETA" | null;
  payload: Record<string, unknown>;
  advertencias: string[];
  generado_en: string;
};

/** Lee con el cliente de sesión: la RLS limita a administrador y control_pedidos. */
export async function listDraftsForOrder(orderId: string): Promise<ElectronicDocumentDraft[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("electronic_document_drafts")
    .select("id, tipo, tipo_comprobante, payload, advertencias, generado_en")
    .eq("order_id", orderId)
    .order("tipo");

  if (error) throw new Error(error.message);
  return data as unknown as ElectronicDocumentDraft[];
}

export type OrderWithDrafts = {
  order_id: string;
  numero: number;
  razon_social_snapshot: string | null;
  generado_en: string;
};

/** Pedidos con borradores pendientes de revisar, para la facturadora. */
export async function listOrdersWithDrafts(limit = 50): Promise<OrderWithDrafts[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("electronic_document_drafts")
    .select("order_id, generado_en, order:orders(numero, razon_social_snapshot)")
    .eq("tipo", "COMPROBANTE")
    .order("generado_en", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Array<{
    order_id: string;
    generado_en: string;
    order: { numero: number; razon_social_snapshot: string | null } | null;
  }>).map((r) => ({
    order_id: r.order_id,
    numero: r.order?.numero ?? 0,
    razon_social_snapshot: r.order?.razon_social_snapshot ?? null,
    generado_en: r.generado_en,
  }));
}
