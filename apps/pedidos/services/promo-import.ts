import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";
import { leerCsv } from "./stock-import";
import {
  parsePromoRows,
  resolverPromoImport,
  resumirPromoImport,
  type PromoBonificacionResuelta,
  type PromoEscalaResuelta,
  type PromoImportResumen,
  type PromoIssue,
  type PromoNota,
  type PromoResuelta,
  type RawCell,
  type RawRow,
} from "@/domain/promo-import";

/**
 * Importador de promociones de Diphasac.
 *
 * Mismo contrato que los otros importadores: `preview` no escribe nada y
 * `publish` escribe lo que la vista previa mostró. La diferencia es que
 * acá una fila mal leída no carga un dato flojo: cambia el precio de un
 * pedido. Por eso la vista previa contrasta el precio que calculamos con
 * el que declara el archivo, y una fila que no cuadra no se publica.
 *
 * El descuento condicionado (Ibucalm + Mucoflux) NO se importa: en el
 * archivo es una nota en prosa. Se carga a mano en la migración 1017 y
 * acá sólo se muestra como nota para que se vea que existe.
 */

// ---------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------

function cellPlainValue(value: ExcelJS.CellValue): RawCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return cellPlainValue(value.result as ExcelJS.CellValue);
    if ("richText" in value) {
      return (value.richText as Array<{ text: string }>).map((t) => t.text).join("");
    }
    if ("text" in value) return String((value as { text: unknown }).text);
    return null;
  }
  if (typeof value === "boolean") return String(value);
  return value;
}

async function leerExcel(buffer: ArrayBuffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: RawRow[] = Array.from({ length: worksheet.rowCount }, () => []);
  const maxCol = worksheet.columnCount;
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const arr: RawRow = [];
    for (let c = 1; c <= maxCol; c++) arr.push(cellPlainValue(row.getCell(c).value));
    rows[rowNumber - 1] = arr;
  });
  return rows;
}

async function leerArchivo(file: File): Promise<RawRow[]> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt") || nombre.endsWith(".tsv")) {
    return leerCsv(await file.text()) as RawRow[];
  }
  return leerExcel(await file.arrayBuffer());
}

// ---------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------

export type PromoImportPreview = {
  fileName: string;
  headerRowNumber: number | null;
  promos: PromoResuelta[];
  resumen: PromoImportResumen;
  errors: PromoIssue[];
  notas: PromoNota[];
  codigosSinProducto: string[];
};

async function cargarCatalogos() {
  const supabase = createClient();

  const [productos, canales, precios, escalas, bonificaciones] = await Promise.all([
    supabase.from("products").select("id, codigo_interno, codigo_proveedor, descripcion, estado"),
    supabase.from("sales_channels").select("id, nombre"),
    supabase
      .from("price_list_items")
      .select("product_id, sales_channel_id, precio")
      .is("vigente_hasta", null),
    supabase.from("promo_escalas").select("product_id, sales_channel_id").is("vigente_hasta", null),
    supabase
      .from("promo_bonificaciones")
      .select("product_id, sales_channel_id")
      .is("vigente_hasta", null),
  ]);

  for (const respuesta of [productos, canales, precios, escalas, bonificaciones]) {
    if (respuesta.error) throw new Error(respuesta.error.message);
  }

  const mapaPrecios = new Map<string, number>();
  for (const fila of precios.data ?? []) {
    mapaPrecios.set(`${fila.product_id}|${fila.sales_channel_id}`, Number(fila.precio));
  }

  const vigentes = new Set<string>();
  for (const fila of escalas.data ?? []) {
    vigentes.add(`ESCALA|${fila.product_id}|${fila.sales_channel_id}`);
  }
  for (const fila of bonificaciones.data ?? []) {
    vigentes.add(`BONIFICACION|${fila.product_id}|${fila.sales_channel_id}`);
  }

  return {
    productos: productos.data ?? [],
    canales: canales.data ?? [],
    precios: mapaPrecios,
    vigentes,
  };
}

export async function previewPromoImport(file: File): Promise<PromoImportPreview> {
  const rows = await leerArchivo(file);
  const parsed = parsePromoRows(rows);
  const catalogos = await cargarCatalogos();
  const resuelto = resolverPromoImport(parsed.promos, catalogos);

  return {
    fileName: file.name,
    headerRowNumber: parsed.headerRowNumber,
    promos: resuelto.promos,
    resumen: resumirPromoImport(resuelto.promos),
    errors: [...parsed.errors, ...resuelto.errors].sort((a, b) => a.rowNumber - b.rowNumber),
    notas: parsed.notas,
    codigosSinProducto: resuelto.codigosSinProducto,
  };
}

// ---------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------

export type PromoImportResult = {
  fileName: string;
  escalas: number;
  bonificaciones: number;
  filasEscritas: number;
  cerradas: number;
  omitidas: number;
};

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function ayerISO(): string {
  const ayer = new Date();
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  return ayer.toISOString().slice(0, 10);
}

/**
 * Publica lo que mostró la vista previa. Versionado igual que las listas
 * de precios: lo vigente se cierra ayer y lo nuevo empieza hoy, en vez de
 * sobrescribirse. Un pedido de la semana pasada tiene que poder explicarse
 * con la promoción que estaba vigente ese día.
 */
export async function publishPromoImport(file: File, actor: string): Promise<PromoImportResult> {
  const preview = await previewPromoImport(file);

  if (preview.promos.length === 0) {
    throw new Error(
      "El archivo no tiene ninguna promoción aplicable. Revisá la vista previa antes de publicar.",
    );
  }

  const supabase = createClient();
  const hoy = hoyISO();
  const ayer = ayerISO();
  let cerradas = 0;

  const escalas = preview.promos.filter((p): p is PromoEscalaResuelta => p.tipo === "ESCALA");
  const bonificaciones = preview.promos.filter(
    (p): p is PromoBonificacionResuelta => p.tipo === "BONIFICACION",
  );

  for (const [tabla, promos] of [
    ["promo_escalas", escalas],
    ["promo_bonificaciones", bonificaciones],
  ] as const) {
    if (promos.length === 0) continue;

    const productIds = Array.from(new Set(promos.map((p) => p.productId)));
    const canalIds = Array.from(new Set(promos.flatMap((p) => p.canales.map((c) => c.id))));

    const cierre = await supabase
      .from(tabla)
      .update({ vigente_hasta: ayer })
      .is("vigente_hasta", null)
      .lt("vigente_desde", hoy)
      .in("product_id", productIds)
      .in("sales_channel_id", canalIds)
      .select("id");
    if (cierre.error) throw new Error(cierre.error.message);
    cerradas += cierre.data?.length ?? 0;

    // Publicar dos veces el mismo día reemplaza: la promo de esta mañana
    // no llegó a estar vigente un día entero y la clave única no admite
    // dos filas con el mismo vigente_desde. Corregir el archivo y volver a
    // subirlo es el caso normal, no una excepción.
    const borrado = await supabase
      .from(tabla)
      .delete()
      .eq("vigente_desde", hoy)
      .in("product_id", productIds)
      .in("sales_channel_id", canalIds);
    if (borrado.error) throw new Error(borrado.error.message);
  }

  if (escalas.length > 0) {
    const filas = escalas.flatMap((p) =>
      p.canales.map((canal) => ({
        product_id: p.productId,
        sales_channel_id: canal.id,
        cantidad_minima: p.cantidadMinima,
        porcentaje_descuento: p.porcentajeDescuento,
        etiqueta_origen: p.etiquetaOrigen,
        precio_promocional_declarado: p.precioDeclarado,
        vigente_desde: hoy,
      })),
    );
    const { error } = await supabase.from("promo_escalas").insert(filas);
    if (error) throw new Error(error.message);
  }

  if (bonificaciones.length > 0) {
    const filas = bonificaciones.flatMap((p) =>
      p.canales.map((canal) => ({
        product_id: p.productId,
        sales_channel_id: canal.id,
        cantidad_comprada: p.cantidadComprada,
        cantidad_gratis: p.cantidadGratis,
        // Null: se bonifica el mismo producto. Ninguna de las 13 del
        // archivo declara un producto distinto.
        producto_bonificado_id: null,
        precio_promocional_declarado: p.precioDeclarado,
        vigente_desde: hoy,
      })),
    );
    const { error } = await supabase.from("promo_bonificaciones").insert(filas);
    if (error) throw new Error(error.message);
  }

  await logAudit({
    actor,
    accion: "importar_promociones",
    entidad: "promo_escalas",
    entidadId: file.name,
    datosDespues: {
      archivo: file.name,
      escalas: escalas.length,
      bonificaciones: bonificaciones.length,
      filas_escritas: preview.resumen.filasAEscribir,
      promociones_cerradas: cerradas,
      omitidas: preview.errors.length,
      notas_no_importadas: preview.notas.length,
    },
  });

  return {
    fileName: file.name,
    escalas: escalas.length,
    bonificaciones: bonificaciones.length,
    filasEscritas: preview.resumen.filasAEscribir,
    cerradas,
    omitidas: preview.errors.length,
  };
}

// ---------------------------------------------------------------------
// Lo que ya está cargado
// ---------------------------------------------------------------------

export type PromocionVigente = {
  tipo: "Escala" | "Bonificación" | "Condicionada";
  codigo: string;
  descripcion: string;
  canal: string;
  detalle: string;
  vigenteDesde: string;
};

type FilaProducto = { codigo_interno: string; descripcion: string } | null;
type FilaCanal = { nombre: string } | null;

export async function listPromocionesVigentes(limit = 200): Promise<PromocionVigente[]> {
  const supabase = createClient();

  const [escalas, bonificaciones, condicionadas] = await Promise.all([
    supabase
      .from("promo_escalas")
      .select(
        "cantidad_minima, porcentaje_descuento, vigente_desde, product:products(codigo_interno, descripcion), canal:sales_channels(nombre)",
      )
      .is("vigente_hasta", null)
      .limit(limit),
    supabase
      .from("promo_bonificaciones")
      .select(
        "cantidad_comprada, cantidad_gratis, vigente_desde, product:products(codigo_interno, descripcion), canal:sales_channels(nombre)",
      )
      .is("vigente_hasta", null)
      .limit(limit),
    supabase
      .from("promo_descuentos_condicionados")
      .select(
        "porcentaje_descuento, vigente_desde, product:products!promo_descuentos_condicionados_product_id_fkey(codigo_interno, descripcion), condicion:products!promo_descuentos_condicionados_producto_condicion_id_fkey(codigo_interno), canal:sales_channels(nombre)",
      )
      .is("vigente_hasta", null)
      .limit(limit),
  ]);

  for (const respuesta of [escalas, bonificaciones, condicionadas]) {
    if (respuesta.error) throw new Error(respuesta.error.message);
  }

  const filas: PromocionVigente[] = [];

  for (const f of (escalas.data ?? []) as unknown as Array<{
    cantidad_minima: number | string;
    porcentaje_descuento: number | string;
    vigente_desde: string;
    product: FilaProducto;
    canal: FilaCanal;
  }>) {
    filas.push({
      tipo: "Escala",
      codigo: f.product?.codigo_interno ?? "—",
      descripcion: f.product?.descripcion ?? "—",
      canal: f.canal?.nombre ?? "—",
      detalle: `desde ${Number(f.cantidad_minima)} u. · −${Number(f.porcentaje_descuento)}%`,
      vigenteDesde: f.vigente_desde,
    });
  }

  for (const f of (bonificaciones.data ?? []) as unknown as Array<{
    cantidad_comprada: number | string;
    cantidad_gratis: number | string;
    vigente_desde: string;
    product: FilaProducto;
    canal: FilaCanal;
  }>) {
    filas.push({
      tipo: "Bonificación",
      codigo: f.product?.codigo_interno ?? "—",
      descripcion: f.product?.descripcion ?? "—",
      canal: f.canal?.nombre ?? "—",
      detalle: `compra ${Number(f.cantidad_comprada)} · lleva ${Number(f.cantidad_gratis)}`,
      vigenteDesde: f.vigente_desde,
    });
  }

  for (const f of (condicionadas.data ?? []) as unknown as Array<{
    porcentaje_descuento: number | string;
    vigente_desde: string;
    product: FilaProducto;
    condicion: { codigo_interno: string } | null;
    canal: FilaCanal;
  }>) {
    filas.push({
      tipo: "Condicionada",
      codigo: f.product?.codigo_interno ?? "—",
      descripcion: f.product?.descripcion ?? "—",
      canal: f.canal?.nombre ?? "—",
      detalle: `−${Number(f.porcentaje_descuento)}% con ${f.condicion?.codigo_interno ?? "—"} (1 a 1)`,
      vigenteDesde: f.vigente_desde,
    });
  }

  return filas.sort(
    (a, b) => a.tipo.localeCompare(b.tipo) || a.codigo.localeCompare(b.codigo) || a.canal.localeCompare(b.canal),
  );
}
