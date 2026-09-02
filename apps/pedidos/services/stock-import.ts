import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";
import {
  parseStockRows,
  resolverStockImport,
  resumirStockImport,
  type RawCell,
  type RawRow,
  type StockImportResumen,
  type StockIssue,
  type StockItemResuelto,
} from "@/domain/stock-import";

/**
 * Carga masiva de stock desde CSV o Excel.
 *
 * Mismo contrato que los otros dos importadores: `preview` no escribe nada
 * y `publish` escribe lo que la vista previa mostró. La escritura es un
 * upsert sobre la PK (product_id, inventory_source_id), así que volver a
 * cargar el mismo archivo actualiza; nunca duplica.
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

/**
 * CSV con el separador que traiga el archivo. Excel en configuración
 * regional española exporta con `;`, y rechazar esos archivos sería
 * rechazar la mitad de los que la gente va a subir.
 */
export function leerCsv(text: string): RawRow[] {
  const sinBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const primeraLinea = sinBom.split(/\r?\n/, 1)[0] ?? "";
  const separador = [";", "\t", ","]
    .map((sep) => ({ sep, veces: primeraLinea.split(sep).length }))
    .sort((a, b) => b.veces - a.veces)[0].sep;

  const rows: RawRow[] = [];
  let campo = "";
  let fila: RawCell[] = [];
  let entreComillas = false;

  for (let i = 0; i < sinBom.length; i++) {
    const char = sinBom[i];
    if (entreComillas) {
      if (char === '"') {
        if (sinBom[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += char;
      }
      continue;
    }
    if (char === '"') {
      entreComillas = true;
    } else if (char === separador) {
      fila.push(campo);
      campo = "";
    } else if (char === "\n") {
      fila.push(campo);
      rows.push(fila);
      fila = [];
      campo = "";
    } else if (char !== "\r") {
      campo += char;
    }
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    rows.push(fila);
  }

  return rows;
}

async function leerArchivo(file: File): Promise<RawRow[]> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt") || nombre.endsWith(".tsv")) {
    return leerCsv(await file.text());
  }
  return leerExcel(await file.arrayBuffer());
}

// ---------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------

export type StockImportPreview = {
  fileName: string;
  headerRowNumber: number | null;
  items: StockItemResuelto[];
  resumen: StockImportResumen;
  errors: StockIssue[];
  codigosSinProducto: string[];
  fuentesDesconocidas: string[];
  fuentesInactivas: string[];
  /** Para que el usuario vea contra qué nombres se está comparando. */
  fuentesDisponibles: string[];
};

async function cargarCatalogos() {
  const supabase = createClient();

  const [productos, fuentes, stock] = await Promise.all([
    supabase.from("products").select("id, codigo_interno, descripcion"),
    // Todas, no sólo las activas: si el archivo nombra una fuente inactiva
    // hay que decir eso y no "no existe" (que empujaría a duplicarla).
    supabase.from("inventory_sources").select("id, nombre, estado"),
    supabase.from("stock_levels").select("product_id, inventory_source_id, cantidad_disponible"),
  ]);

  if (productos.error) throw new Error(productos.error.message);
  if (fuentes.error) throw new Error(fuentes.error.message);
  if (stock.error) throw new Error(stock.error.message);

  const existentes = new Map<string, number>();
  for (const fila of stock.data ?? []) {
    existentes.set(
      `${fila.product_id}|${fila.inventory_source_id}`,
      Number(fila.cantidad_disponible),
    );
  }

  return {
    productos: productos.data ?? [],
    fuentes: fuentes.data ?? [],
    existentes,
  };
}

export async function previewStockImport(file: File): Promise<StockImportPreview> {
  const rows = await leerArchivo(file);
  const parsed = parseStockRows(rows);
  const catalogos = await cargarCatalogos();
  const resuelto = resolverStockImport(parsed.rows, catalogos);

  return {
    fileName: file.name,
    headerRowNumber: parsed.headerRowNumber,
    items: resuelto.items,
    resumen: resumirStockImport(resuelto.items),
    // Los errores de formato van primero: son los que impiden leer la fila.
    errors: [...parsed.errors, ...resuelto.errors].sort((a, b) => a.rowNumber - b.rowNumber),
    codigosSinProducto: resuelto.codigosSinProducto,
    fuentesDesconocidas: resuelto.fuentesDesconocidas,
    fuentesInactivas: resuelto.fuentesInactivas,
    fuentesDisponibles: catalogos.fuentes
      .filter((f) => f.estado === "activo")
      .map((f) => f.nombre),
  };
}

// ---------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------

export type StockImportResult = {
  fileName: string;
  creados: number;
  actualizados: number;
  sinCambio: number;
  /** Filas del archivo que no se pudieron aplicar. */
  omitidos: number;
};

export async function publishStockImport(file: File, actor: string): Promise<StockImportResult> {
  const preview = await previewStockImport(file);

  if (preview.items.length === 0) {
    throw new Error(
      "El archivo no tiene ninguna fila aplicable. Revisá la vista previa antes de publicar.",
    );
  }

  const supabase = createClient();
  // Upsert sobre la PK (product_id, inventory_source_id): actualiza el
  // registro que ya existe y crea el que no. Nunca duplica, que era el
  // riesgo concreto de cargar dos veces el mismo archivo.
  const { error } = await supabase.from("stock_levels").upsert(
    preview.items.map((item) => ({
      product_id: item.productId,
      inventory_source_id: item.inventorySourceId,
      cantidad_disponible: item.cantidad,
      fecha_actualizacion: new Date().toISOString(),
    })),
    { onConflict: "product_id,inventory_source_id" },
  );
  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "importar_stock",
    entidad: "stock_levels",
    entidadId: file.name,
    datosDespues: {
      archivo: file.name,
      creados: preview.resumen.crear,
      actualizados: preview.resumen.actualizar,
      sin_cambio: preview.resumen.sinCambio,
      omitidos: preview.errors.length,
    },
  });

  return {
    fileName: file.name,
    creados: preview.resumen.crear,
    actualizados: preview.resumen.actualizar,
    sinCambio: preview.resumen.sinCambio,
    omitidos: preview.errors.length,
  };
}

// ---------------------------------------------------------------------
// Lo que ya está cargado (para ver el resultado sin salir de la pantalla)
// ---------------------------------------------------------------------

export type StockLevelRow = {
  codigo: string;
  descripcion: string;
  fuente: string;
  cantidad: number;
  fechaActualizacion: string;
};

export async function listStockLevels(limit = 50): Promise<StockLevelRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_levels")
    .select(
      "cantidad_disponible, fecha_actualizacion, product:products(codigo_interno, descripcion), source:inventory_sources(nombre)",
    )
    .order("fecha_actualizacion", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  type Fila = {
    cantidad_disponible: number | string;
    fecha_actualizacion: string;
    product: { codigo_interno: string; descripcion: string } | null;
    source: { nombre: string } | null;
  };

  return ((data ?? []) as unknown as Fila[]).map((f) => ({
    codigo: f.product?.codigo_interno ?? "—",
    descripcion: f.product?.descripcion ?? "—",
    fuente: f.source?.nombre ?? "—",
    cantidad: Number(f.cantidad_disponible),
    fechaActualizacion: f.fecha_actualizacion,
  }));
}
