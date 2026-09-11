import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";
import {
  claveDeNombre,
  parseStockRows,
  resolverStockImport,
  resumirStockImport,
  type RawCell,
  type RawRow,
  type StockImportResumen,
  type StockIssue,
  type StockLoteResuelto,
} from "@/domain/stock-import";

/**
 * Carga masiva de stock desde CSV o Excel.
 *
 * Mismo contrato que los otros dos importadores: `preview` no escribe nada
 * y `publish` escribe lo que la vista previa mostró. La escritura es un
 * upsert sobre (product_id, inventory_source_id, lote), así que volver a
 * cargar el mismo archivo actualiza el lote; nunca lo duplica.
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
  lotes: StockLoteResuelto[];
  resumen: StockImportResumen;
  errors: StockIssue[];
  warnings: StockIssue[];
  codigosSinProducto: string[];
  fuentesDesconocidas: string[];
  fuentesInactivas: string[];
  /** Para que el usuario vea contra qué nombres se está comparando. */
  fuentesDisponibles: string[];
  /** La que se aplica a las filas sin FUENTE. */
  fuentePorDefecto: string;
  /**
   * Columnas opcionales que el archivo NO trae. Se muestran antes de
   * publicar porque su ausencia es silenciosa: la carga funciona igual y
   * uno se entera después, mirando la pantalla de stock y sin entender por
   * qué falta un dato que ayer estaba.
   */
  columnasAusentes: string[];
};

/**
 * El almacén que se asume cuando la fila no dice nada.
 *
 * Decisión de negocio confirmada (2026-09-10): el archivo real deja la
 * columna FUENTE vacía en la mayoría de las filas, y hoy hay un solo
 * almacén activo. Si algún día hay más de uno, esto tiene que volver a
 * preguntarse en vez de seguir asumiendo.
 */
const FUENTE_POR_DEFECTO = "Almacén Central Lima";

async function cargarCatalogos() {
  const supabase = createClient();

  const [productos, fuentes, stock] = await Promise.all([
    supabase.from("products").select("id, codigo_interno, descripcion, controla_lote"),
    // Todas, no sólo las activas: si el archivo nombra una fuente inactiva
    // hay que decir eso y no "no existe" (que empujaría a duplicarla).
    supabase.from("inventory_sources").select("id, nombre, estado"),
    supabase
      .from("stock_lotes")
      .select("product_id, inventory_source_id, lote, cantidad_disponible"),
  ]);

  if (productos.error) throw new Error(productos.error.message);
  if (fuentes.error) throw new Error(fuentes.error.message);
  if (stock.error) throw new Error(stock.error.message);

  const existentes = new Map<string, number>();
  for (const fila of stock.data ?? []) {
    existentes.set(
      `${fila.product_id}|${fila.inventory_source_id}|${fila.lote}`,
      Number(fila.cantidad_disponible),
    );
  }

  const fuentesLista = fuentes.data ?? [];
  const fuentePorDefecto = fuentesLista.find(
    (f) => claveDeNombre(f.nombre) === claveDeNombre(FUENTE_POR_DEFECTO),
  );
  if (!fuentePorDefecto) {
    throw new Error(
      `No existe la fuente de stock "${FUENTE_POR_DEFECTO}" en el catálogo, y el archivo trae ` +
        "filas sin fuente. Creala en Maestros → Despacho antes de importar.",
    );
  }

  return {
    productos: productos.data ?? [],
    fuentes: fuentesLista,
    fuentePorDefecto,
    existentes,
  };
}

export async function previewStockImport(file: File): Promise<StockImportPreview> {
  const rows = await leerArchivo(file);
  const parsed = parseStockRows(rows);
  const catalogos = await cargarCatalogos();
  const resuelto = resolverStockImport(parsed.rows, catalogos);

  const columnasAusentes: string[] = [];
  if (parsed.columns) {
    if (parsed.columns.fuente === -1) columnasAusentes.push("FUENTE");
    if (parsed.columns.fechaVencimiento === -1) columnasAusentes.push("FV (vencimiento)");
    if (parsed.columns.proveedor === -1) columnasAusentes.push("PROVEEDOR");
  }

  return {
    fileName: file.name,
    headerRowNumber: parsed.headerRowNumber,
    lotes: resuelto.lotes,
    resumen: resumirStockImport(resuelto.lotes),
    // Los errores de formato van primero: son los que impiden leer la fila.
    errors: [...parsed.errors, ...resuelto.errors].sort((a, b) => a.rowNumber - b.rowNumber),
    warnings: resuelto.warnings,
    codigosSinProducto: resuelto.codigosSinProducto,
    fuentesDesconocidas: resuelto.fuentesDesconocidas,
    fuentesInactivas: resuelto.fuentesInactivas,
    fuentesDisponibles: catalogos.fuentes
      .filter((f) => f.estado === "activo")
      .map((f) => f.nombre),
    fuentePorDefecto: catalogos.fuentePorDefecto.nombre,
    columnasAusentes,
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

  if (preview.lotes.length === 0) {
    throw new Error(
      "El archivo no tiene ninguna fila aplicable. Revisá la vista previa antes de publicar.",
    );
  }

  const supabase = createClient();
  const ahora = new Date().toISOString();

  const base = (lote: (typeof preview.lotes)[number]) => ({
    product_id: lote.productId,
    inventory_source_id: lote.inventorySourceId,
    lote: lote.lote,
    fecha_vencimiento: lote.fechaVencimiento,
    cantidad_disponible: lote.cantidad,
    fecha_actualizacion: ahora,
  });

  /*
    Dos upserts y no uno, por una razón concreta que se vio en producción
    (2026-09-11): el archivo de stock del día no siempre trae la columna
    PROVEEDOR, y el upsert anterior mandaba `proveedor: null` para todas las
    filas, borrando el proveedor que ya estaba guardado de una carga
    anterior. Un dato que el archivo no menciona no es un dato vacío.

    PostgREST arma la lista de columnas con la unión de las claves del
    payload, así que la única forma de NO tocar una columna es que no
    aparezca en ninguna fila de ese lote de escritura. De ahí la separación:
    las filas que traen proveedor lo escriben, las que no lo dejan como
    está. Sigue siendo un upsert sobre (product_id, inventory_source_id,
    lote): actualiza el lote que ya existe y crea el que no, nunca duplica.
  */
  const conProveedor = preview.lotes.filter((l) => l.proveedor !== null);
  const sinProveedor = preview.lotes.filter((l) => l.proveedor === null);

  const escrituras = [
    conProveedor.length > 0
      ? supabase
          .from("stock_lotes")
          .upsert(
            conProveedor.map((lote) => ({ ...base(lote), proveedor: lote.proveedor })),
            { onConflict: "product_id,inventory_source_id,lote" },
          )
      : null,
    sinProveedor.length > 0
      ? supabase
          .from("stock_lotes")
          .upsert(sinProveedor.map(base), { onConflict: "product_id,inventory_source_id,lote" })
      : null,
  ].filter((q): q is NonNullable<typeof q> => q !== null);

  for (const resultado of await Promise.all(escrituras)) {
    if (resultado.error) throw new Error(resultado.error.message);
  }

  await logAudit({
    actor,
    accion: "importar_stock",
    entidad: "stock_lotes",
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
  lote: string;
  fechaVencimiento: string | null;
  fuente: string;
  cantidad: number;
  fechaActualizacion: string;
};

/**
 * Los últimos lotes cargados, para ver el resultado sin salir de la
 * pantalla del importador.
 *
 * Lee `stock_lotes` y no la vista `stock_levels`: la vista agrega —perdería
 * justamente el lote— y además, al no tener claves foráneas, PostgREST no
 * puede embeber el producto ni la fuente desde ella.
 */
export async function listStockLevels(limit = 50): Promise<StockLevelRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_lotes")
    .select(
      "lote, fecha_vencimiento, cantidad_disponible, fecha_actualizacion, product:products(codigo_interno, descripcion), source:inventory_sources(nombre)",
    )
    .order("fecha_actualizacion", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  type Fila = {
    lote: string;
    fecha_vencimiento: string | null;
    cantidad_disponible: number | string;
    fecha_actualizacion: string;
    product: { codigo_interno: string; descripcion: string } | null;
    source: { nombre: string } | null;
  };

  return ((data ?? []) as unknown as Fila[]).map((f) => ({
    codigo: f.product?.codigo_interno ?? "—",
    descripcion: f.product?.descripcion ?? "—",
    lote: f.lote,
    fechaVencimiento: f.fecha_vencimiento,
    fuente: f.source?.nombre ?? "—",
    cantidad: Number(f.cantidad_disponible),
    fechaActualizacion: f.fecha_actualizacion,
  }));
}
