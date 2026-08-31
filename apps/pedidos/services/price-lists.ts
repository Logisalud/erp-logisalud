import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "./audit-log";
import { parseWorkbookToRows } from "./price-lists-parser";
import {
  parsePriceListRows,
  decideTaxTreatment,
  buildChannelPrices,
  type ParsedProductRow,
  type ParseResult,
} from "@/domain/price-list-import";

const STORAGE_BUCKET = "price-lists";

async function getCurrentIgvRate(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tax_configurations")
    .select("valor")
    .eq("nombre", "IGV")
    .is("vigente_hasta", null)
    .single();
  if (error) throw new Error(`No se pudo leer la tasa de IGV vigente: ${error.message}`);
  return Number(data.valor);
}

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalizeSupplierName(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

type SupplierRef = { id: number; nombre: string };

async function loadSuppliers(): Promise<SupplierRef[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("suppliers").select("id, nombre");
  if (error) throw new Error(`No se pudo leer el catálogo de proveedores: ${error.message}`);
  return data as SupplierRef[];
}

/**
 * El consolidado 2026-08 trae una columna PROVEEDOR por fila: un solo
 * archivo con los 5 proveedores. Cada proveedor se publica como su
 * propia `price_lists`, así el historial y la vigencia siguen siendo por
 * proveedor igual que con los archivos separados de antes.
 *
 * Los archivos por proveedor no tienen esa columna; ahí manda el
 * proveedor que el admin eligió en la UI (`fallbackSupplierId`).
 *
 * Un nombre de proveedor que no está en el catálogo NO se crea al vuelo:
 * se reporta como error de la fila. Crear proveedores desde un nombre
 * escrito a mano en un Excel es justo la manera de terminar con
 * "BIOSANA", "Biosana " y "Bio Sana" como tres proveedores distintos.
 */
function resolveSupplierId(
  proveedorNombre: string | null,
  suppliers: SupplierRef[],
  fallbackSupplierId: number,
): number | null {
  if (proveedorNombre === null) return fallbackSupplierId;
  const target = normalizeSupplierName(proveedorNombre);
  const match = suppliers.find((s) => normalizeSupplierName(s.nombre) === target);
  return match ? match.id : null;
}

export type PreviewProduct = ParsedProductRow & {
  isNew: boolean;
  afectacionTributaria: "GRAVADO" | "INAFECTO";
  tasaAplicable: number;
  supplierId: number | null;
  supplierNombre: string | null;
};

export type ImportPreview = {
  fileName: string;
  supplierId: number;
  headerRowIndex: number;
  igvRate: number;
  products: PreviewProduct[];
  /** Desglose por proveedor: cada uno se publica como su propia lista. */
  porProveedor: Array<{ supplierId: number; nombre: string; productos: number }>;
  sectionHeaders: ParseResult["sectionHeaders"];
  errors: ParseResult["errors"];
  warnings: ParseResult["warnings"];
};

export async function previewPriceListImport(
  file: File,
  supplierId: number,
): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const rows = await parseWorkbookToRows(buffer);
  const parsed = parsePriceListRows(rows);
  const igvRate = await getCurrentIgvRate();
  const suppliers = await loadSuppliers();

  const supabase = createClient();
  const codes = parsed.products.map((p) => p.codigoLogisalud);
  const existing =
    codes.length > 0
      ? await supabase.from("products").select("codigo_interno").in("codigo_interno", codes)
      : { data: [] as { codigo_interno: string }[], error: null };
  if (existing.error) throw new Error(existing.error.message);
  const existingCodes = new Set(existing.data.map((p) => p.codigo_interno));

  const errors = [...parsed.errors];
  const products: PreviewProduct[] = parsed.products.map((p) => {
    const resolved = resolveSupplierId(p.proveedorNombre, suppliers, supplierId);
    if (resolved === null) {
      errors.push({
        rowIndex: p.rowIndex,
        code: "UNKNOWN_SUPPLIER",
        message: `${p.codigoLogisalud}: el proveedor "${p.proveedorNombre}" no existe en el catálogo.`,
      });
    }
    const supplier = suppliers.find((s) => s.id === resolved) ?? null;
    return {
      ...p,
      isNew: !existingCodes.has(p.codigoLogisalud),
      ...decideTaxTreatment(p, igvRate),
      supplierId: resolved,
      supplierNombre: supplier?.nombre ?? null,
    };
  });

  const porProveedor = suppliers
    .map((s) => ({
      supplierId: s.id,
      nombre: s.nombre,
      productos: products.filter((p) => p.supplierId === s.id).length,
    }))
    .filter((s) => s.productos > 0);

  return {
    fileName: file.name,
    supplierId,
    headerRowIndex: parsed.headerRowIndex,
    igvRate,
    products,
    porProveedor,
    sectionHeaders: parsed.sectionHeaders,
    errors,
    warnings: parsed.warnings,
  };
}

export type PublishResult = {
  /** Primera lista creada. Se conserva por compatibilidad. */
  priceListId: string;
  /** Una lista por proveedor presente en el archivo. */
  priceLists: Array<{
    priceListId: string;
    supplierId: number;
    supplierNombre: string;
    productCount: number;
    itemCount: number;
  }>;
  productCount: number;
  itemCount: number;
  skippedErrorCount: number;
};

/**
 * Las filas con error (código faltante o duplicado) ya vienen
 * excluidas de `parsed.products` desde el dominio — se omiten de la
 * publicación, no bloquean el resto del archivo. El admin ya las vio
 * marcadas en el preview antes de confirmar; bloquear todo el archivo
 * por unas pocas filas problemáticas frenaría el resto de un catálogo
 * válido sin necesidad.
 */
export async function publishPriceListImport(
  file: File,
  supplierId: number,
  actorUserId: string,
): Promise<PublishResult> {
  const buffer = await file.arrayBuffer();
  const rows = await parseWorkbookToRows(buffer);
  const parsed = parsePriceListRows(rows);

  if (parsed.products.length === 0) {
    throw new Error("No se encontraron productos válidos para publicar.");
  }

  const igvRate = await getCurrentIgvRate();
  const suppliers = await loadSuppliers();

  // Un proveedor desconocido aborta la publicación completa, a
  // diferencia de las filas sin código o duplicadas: acá no se trata de
  // unas pocas filas sueltas sino de que el archivo apunta a un
  // proveedor que no existe, y publicar "lo que se pudo" dejaría la
  // lista partida a la mitad sin que nadie se dé cuenta.
  const desconocidos = Array.from(
    new Set(
      parsed.products
        .filter((p) => resolveSupplierId(p.proveedorNombre, suppliers, supplierId) === null)
        .map((p) => p.proveedorNombre ?? "(sin proveedor)"),
    ),
  );
  if (desconocidos.length > 0) {
    throw new Error(
      `El archivo menciona proveedores que no están en el catálogo: ${desconocidos.join(", ")}. ` +
        "Créalos en Maestros → Proveedores antes de publicar.",
    );
  }

  const admin = createAdminClient();
  const storagePath = `${supplierId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) throw new Error(`No se pudo guardar el archivo: ${uploadError.message}`);

  const payload = parsed.products.map((p) => {
    const tax = decideTaxTreatment(p, igvRate);
    return {
      supplierId: resolveSupplierId(p.proveedorNombre, suppliers, supplierId) as number,
      codigoLogisalud: p.codigoLogisalud,
      codigoProveedor: p.codigoProveedor,
      codigoBonificacion: p.codigoBonificacion,
      producto: p.producto,
      principioActivo: p.principioActivo,
      presentacion: p.presentacion,
      unidadMedida: p.unidadMedida,
      afectacionTributaria: tax.afectacionTributaria,
      tasaAplicable: tax.tasaAplicable,
      vvfSinIgv: p.vvfSinIgv,
      vvdSinIgv: p.vvdSinIgv,
      costoReferencialDistribuidora: p.pvfDistribuidora,
      fechaVigenciaProveedor: p.fechaVigenciaProveedor,
      channelPrices: buildChannelPrices(p),
    };
  });

  // Una price_lists por proveedor: la vigencia y el historial de precios
  // son por proveedor (el trigger close_previous_price_list cierra la
  // lista anterior de ESE proveedor), así que un archivo consolidado se
  // publica como N listas, no como una sola mezclada.
  const grupos = new Map<number, typeof payload>();
  for (const p of payload) {
    const actual = grupos.get(p.supplierId);
    if (actual) actual.push(p);
    else grupos.set(p.supplierId, [p]);
  }

  const supabase = createClient();
  const publicadas: PublishResult["priceLists"] = [];

  for (const [grupoSupplierId, productos] of Array.from(grupos.entries())) {
    const { data: priceListId, error: rpcError } = await supabase.rpc("publish_price_list", {
      p_supplier_id: grupoSupplierId,
      p_archivo_nombre: file.name,
      p_archivo_storage_path: storagePath,
      p_products: productos,
    });

    if (rpcError) {
      // Las listas ya publicadas quedan; borrar el archivo subido las
      // dejaría sin respaldo, así que solo se limpia si no se publicó
      // ninguna.
      if (publicadas.length === 0) {
        await admin.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {});
      }
      const nombre =
        suppliers.find((s) => s.id === grupoSupplierId)?.nombre ?? String(grupoSupplierId);
      throw new Error(
        `No se pudo publicar la lista de ${nombre}: ${rpcError.message}. ` +
          (publicadas.length > 0
            ? `Ya se publicaron ${publicadas.length} lista(s) de otros proveedores.`
            : "No se publicó ninguna lista."),
      );
    }

    publicadas.push({
      priceListId: priceListId as string,
      supplierId: grupoSupplierId,
      supplierNombre:
        suppliers.find((s) => s.id === grupoSupplierId)?.nombre ?? String(grupoSupplierId),
      productCount: productos.length,
      itemCount: productos.reduce((sum, p) => sum + p.channelPrices.length, 0),
    });
  }

  const itemCount = payload.reduce((sum, p) => sum + p.channelPrices.length, 0);

  await logAudit({
    actor: actorUserId,
    accion: "publicar_lista_precios",
    entidad: "price_lists",
    entidadId: publicadas[0].priceListId,
    datosDespues: {
      archivo: file.name,
      listasPorProveedor: publicadas.map((l) => ({
        priceListId: l.priceListId,
        proveedor: l.supplierNombre,
        productos: l.productCount,
        items: l.itemCount,
      })),
      productos: payload.length,
      items: itemCount,
      filasOmitidasPorError: parsed.errors.length,
    },
  });

  return {
    priceListId: publicadas[0].priceListId,
    priceLists: publicadas,
    productCount: payload.length,
    itemCount,
    skippedErrorCount: parsed.errors.length,
  };
}

export type PriceListHistoryEntry = {
  id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  archivo_nombre: string;
  publicado_en: string;
  supplier: { nombre: string } | null;
  item_count: number;
};

export async function listPriceListHistory(): Promise<PriceListHistoryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("price_lists")
    .select("*, supplier:suppliers(nombre), price_list_items(count)")
    .order("publicado_en", { ascending: false });

  if (error) throw new Error(error.message);

  return (data as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    fecha_inicio: row.fecha_inicio as string,
    fecha_fin: row.fecha_fin as string | null,
    archivo_nombre: row.archivo_nombre as string,
    publicado_en: row.publicado_en as string,
    supplier: row.supplier as { nombre: string } | null,
    item_count: ((row.price_list_items as Array<{ count: number }>)[0]?.count as number) ?? 0,
  }));
}
