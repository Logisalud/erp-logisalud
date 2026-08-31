/**
 * Parser puro de listas de precios de proveedor (sección 8 del PRD).
 * Recibe filas ya leídas de Excel como array-of-arrays (0-indexado);
 * la lectura del .xlsx en sí vive en services/price-lists.ts. Así esto
 * se puede testear sin exceljs ni un archivo real.
 */

export type CellValue = string | number | Date | null | undefined;
export type RawRow = CellValue[];

export type ParsedProductRow = {
  rowIndex: number;
  codigoProveedor: string | null;
  codigoLogisalud: string;
  codigoBonificacion: string | null;
  producto: string;
  principioActivo: string | null;
  presentacion: string | null;
  unidadMedida: string | null;
  /**
   * Nombre del proveedor tal como viene en la columna PROVEEDOR del
   * archivo consolidado (2026-08). Es null en los archivos viejos, uno
   * por proveedor, donde el proveedor lo elige el admin en la UI.
   */
  proveedorNombre: string | null;
  linea: string | null;
  vvfSinIgv: number | null;
  vvdSinIgv: number | null;
  igv: number | null;
  fechaVigenciaProveedor: string | null;
  pvfDistribuidora: number | null;
  pvfInstituciones: number | null;
  pvfSubdistrib: number | null;
  pvfMinicadenas: number | null;
  pvfMayoristaTop: number | null;
  pvfFarma: number | null;
};

export type RowIssue = {
  rowIndex: number;
  code: string;
  message: string;
};

export type ColumnMap = {
  codigoProveedor: number;
  codigoLogisalud: number;
  codigoBonificacion: number;
  producto: number;
  principioActivo: number;
  presentacion: number;
  unidadMedida: number;
  proveedor: number;
  linea: number;
  vvf: number;
  vvd: number;
  igv: number;
  fechaVigencia: number;
  pvfDistribuidora: number;
  pvfInstituciones: number;
  pvfSubdistrib: number;
  pvfMinicadenas: number;
  pvfMayoristaTop: number;
  pvfFarma: number;
  /**
   * true cuando Subdistribuidoras y Minicadenas comparten UNA sola
   * columna en el archivo (pvfSubdistrib === pvfMinicadenas), como en
   * el consolidado 2026-08. Mismo patrón que MAYORISTA/TOP, que ya
   * venía compartido desde la carga original.
   */
  subdistribMinicadenasCompartidas: boolean;
};

export type ParseResult = {
  headerRowIndex: number;
  columnMap: ColumnMap;
  products: ParsedProductRow[];
  sectionHeaders: { rowIndex: number; label: string }[];
  errors: RowIssue[];
  warnings: RowIssue[];
};

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalizeHeader(value: CellValue): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "") // quita tildes (NFD las separa en marcas combinantes)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isBlankCell(value: CellValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function findColumnByText(headerRow: RawRow, matcher: (normalized: string) => boolean): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (matcher(normalizeHeader(headerRow[i]))) return i;
  }
  return -1;
}

/**
 * Una columna "MARGEN - PVF ..." no es un precio: es el margen
 * calculado sobre ese precio. El consolidado 2026-08 trae una por
 * canal, justo después de los PVF, y todas contienen el mismo texto
 * que la columna de precio que las origina — así que cualquier
 * matcher de PVF tiene que excluirlas explícitamente o se queda con
 * el margen en lugar del precio.
 */
function isMarginHeader(normalized: string): boolean {
  return normalized.startsWith("MARGEN");
}

function findPriceColumn(headerRow: RawRow, matcher: (normalized: string) => boolean): number {
  return findColumnByText(headerRow, (h) => !isMarginHeader(h) && matcher(h));
}

/**
 * Busca la fila de encabezado real (varía de fila por archivo) por la
 * celda de código LOGISALUD, y arma el mapeo de columnas.
 *
 * Los encabezados cambian entre archivos, así que todo se detecta por
 * texto salvo unidadMedida. Detalles que importan:
 *
 *  - El código propio se llamó "CÓDIGO LOGISALUD" en los archivos por
 *    proveedor y "CODIGO LOGISA" en el consolidado 2026-08.
 *  - codigoProveedor: en los archivos viejos su encabezado variaba
 *    (CÓDIGO DIPHASAC / BIOSANA / PRADES) y solo se lo podía ubicar
 *    por posición, inmediatamente a la izquierda del código LOGISALUD.
 *    El consolidado ya trae "CODIGO PROVEEDOR" explícito y encima lo
 *    pone a la DERECHA, así que el texto manda y la posición queda de
 *    respaldo.
 *  - igv: "VVF (Sin IGV)" y "VVD (SIN IGV)" también contienen "IGV" y
 *    vienen antes en el consolidado; hay que descartarlas o el IGV
 *    termina leyendo el VVF.
 *  - pvfDistribuidora: "PVF SUBDISTRIBUIDORAS/MINICADENAS" contiene
 *    "DISTRIBUIDORA"; se excluye para no confundir el costo de
 *    referencia con el precio de un canal.
 *  - unidadMedida: columna inmediatamente a la derecha de
 *    presentación y SIN encabezado. Esa condición de encabezado vacío
 *    es la que evita tomar por unidad de medida a "PROVEEDOR", que en
 *    el consolidado ocupa justo ese lugar.
 */
export function findHeaderAndColumns(
  rows: RawRow[],
): { headerRowIndex: number; columnMap: ColumnMap } | null {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const codigoLogisaludIdx = findColumnByText(
      row,
      (h) => h === "CODIGO LOGISALUD" || h === "CODIGO LOGISA" || h.startsWith("CODIGO LOGISA"),
    );
    if (codigoLogisaludIdx === -1) continue;

    const presentacionIdx = findColumnByText(
      row,
      (h) => h.includes("PRESENTACION") || h.includes("PRESENT"),
    );
    const unidadMedidaIdx =
      presentacionIdx !== -1 && isBlankCell(row[presentacionIdx + 1]) ? presentacionIdx + 1 : -1;

    const codigoProveedorPorTexto = findColumnByText(row, (h) => h.includes("CODIGO PROVEEDOR"));

    const pvfSubdistrib = findPriceColumn(row, (h) => h.includes("SUBDISTRIB"));
    const pvfMinicadenas = findPriceColumn(row, (h) => h.includes("MINICADENA"));

    const columnMap: ColumnMap = {
      codigoLogisalud: codigoLogisaludIdx,
      codigoProveedor:
        codigoProveedorPorTexto !== -1 ? codigoProveedorPorTexto : codigoLogisaludIdx - 1,
      codigoBonificacion: findColumnByText(row, (h) => h.includes("BONIFICACION")),
      producto: findColumnByText(
        row,
        (h) => h === "PRODUCTO" || (h.includes("DESCRIPCION") && h.includes("PRODUCTO")),
      ),
      principioActivo: findColumnByText(
        row,
        (h) => h.includes("PRINCIPIO ACTIVO") || h.includes("COMPOSICION"),
      ),
      presentacion: presentacionIdx,
      unidadMedida: unidadMedidaIdx,
      proveedor: findColumnByText(row, (h) => h === "PROVEEDOR"),
      linea: findColumnByText(row, (h) => h === "LINEA"),
      vvf: findColumnByText(row, (h) => h.includes("VVF")),
      vvd: findColumnByText(row, (h) => h.includes("VVD")),
      igv: findColumnByText(
        row,
        (h) => h.includes("IGV") && !h.includes("VVF") && !h.includes("VVD"),
      ),
      fechaVigencia: findColumnByText(row, (h) => h.includes("FECHA")),
      pvfDistribuidora: findPriceColumn(
        row,
        (h) => h.includes("DISTRIBUIDORA") && !h.includes("SUBDISTRIBUIDORA"),
      ),
      pvfInstituciones: findPriceColumn(row, (h) => h.includes("INSTITUCIONES")),
      pvfSubdistrib,
      pvfMinicadenas,
      pvfMayoristaTop: findPriceColumn(row, (h) => h.includes("MAYORISTA") || h.includes("TOP")),
      pvfFarma: findPriceColumn(row, (h) => h.includes("FARMA")),
      subdistribMinicadenasCompartidas:
        pvfSubdistrib !== -1 && pvfSubdistrib === pvfMinicadenas,
    };

    return { headerRowIndex: r, columnMap };
  }
  return null;
}

/**
 * Fila de encabezado de sección (ej. "LÍNEA MARCAS METABOLICAS Mx"):
 * no es un producto ni un error, se omite del resultado.
 *
 * No se asume una columna fija — en archivos reales el título puede
 * caer en cualquier columna. Y como suele ser una celda combinada,
 * ExcelJS replica el mismo valor en cada celda del rango combinado al
 * leerlas individualmente; por eso el criterio no es "una sola celda
 * no vacía" sino "todas las celdas no vacías de la fila tienen
 * exactamente el mismo texto" (un producto real nunca repite el mismo
 * valor en código, descripción y precios a la vez).
 */
function soleNonBlankCellText(row: RawRow): string | null {
  const distinctValues = new Set<string>();
  let sample: string | null = null;

  for (const cell of row) {
    if (isBlankCell(cell)) continue;
    const text = String(cell).trim();
    distinctValues.add(text);
    sample = text;
  }

  return distinctValues.size === 1 ? sample : null;
}

/**
 * Texto envuelto completamente entre paréntesis (ej. "(Ver leyenda)")
 * — patrón típico de una aclaración, nunca un código ni nombre de
 * producto real.
 */
function isParentheticalNote(text: string): boolean {
  const t = text.trim();
  return t.length > 2 && t.startsWith("(") && t.endsWith(")");
}

function cellToString(value: CellValue): string {
  return String(value ?? "").trim();
}

function cellToStringOrNull(value: CellValue): string | null {
  const s = cellToString(value);
  return s === "" ? null : s;
}

/**
 * Precio vacío, en cero, o "-" se trata como "sin precio para ese
 * canal" (no como error) — así lo pidió el negocio explícitamente.
 */
function cellToPriceOrNull(value: CellValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value === 0 ? null : value;
  const trimmed = String(value).trim();
  if (trimmed === "" || trimmed === "-") return null;
  const n = Number(trimmed.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return n === 0 ? null : n;
}

function cellToDateOrNull(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    // fecha serial de Excel (época 1899-12-30)
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + value * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const trimmed = String(value).trim();
  if (trimmed === "" || trimmed === "-") return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function parsePriceListRows(rows: RawRow[]): ParseResult {
  const found = findHeaderAndColumns(rows);
  if (!found) {
    return {
      headerRowIndex: -1,
      columnMap: {} as ColumnMap,
      products: [],
      sectionHeaders: [],
      errors: [
        {
          rowIndex: -1,
          code: "HEADER_NOT_FOUND",
          message: 'No se encontró la fila de encabezado (celda "CÓDIGO LOGISALUD").',
        },
      ],
      warnings: [],
    };
  }

  const { headerRowIndex, columnMap } = found;
  const products: ParsedProductRow[] = [];
  const sectionHeaders: { rowIndex: number; label: string }[] = [];
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(isBlankCell)) continue; // fila totalmente vacía, se ignora

    const sectionLabel = soleNonBlankCellText(row);
    if (sectionLabel !== null) {
      sectionHeaders.push({ rowIndex: r, label: sectionLabel });
      continue;
    }

    const codigoLogisalud = cellToString(row[columnMap.codigoLogisalud]);
    if (codigoLogisalud === "") {
      errors.push({
        rowIndex: r,
        code: "MISSING_CODE",
        message: "Fila sin CÓDIGO LOGISALUD — no se puede importar.",
      });
      continue;
    }

    // Una fila con código pero sin descripción real no es un producto
    // (caso real: un SKU discontinuado que quedó en el Excel del
    // proveedor con el código y nada más — ver docs/data-model.md).
    const producto = cellToString(row[columnMap.producto]);
    if (producto === "") {
      errors.push({
        rowIndex: r,
        code: "MISSING_DESCRIPTION",
        message: `Fila ignorada: código "${codigoLogisalud}" sin descripción de producto.`,
      });
      continue;
    }

    // Notas/leyendas al pie de la tabla (ej. "LEYENDA: VVF= Valor de
    // Venta Farmacia") a veces caen justo en la columna de código.
    // Un texto envuelto entre paréntesis en código o descripción es
    // casi siempre una aclaración, no un producto real.
    if (isParentheticalNote(codigoLogisalud) || isParentheticalNote(producto)) {
      errors.push({
        rowIndex: r,
        code: "SUSPICIOUS_NOTE",
        message: `Fila ignorada: parece una nota/leyenda, no un producto ("${codigoLogisalud}" / "${producto}").`,
      });
      continue;
    }

    const pvfInstituciones = cellToPriceOrNull(row[columnMap.pvfInstituciones]);
    const pvfSubdistrib = cellToPriceOrNull(row[columnMap.pvfSubdistrib]);
    const pvfMinicadenas = cellToPriceOrNull(row[columnMap.pvfMinicadenas]);
    const pvfMayoristaTop = cellToPriceOrNull(row[columnMap.pvfMayoristaTop]);
    const pvfFarma = cellToPriceOrNull(row[columnMap.pvfFarma]);

    // Cuando Subdistribuidoras y Minicadenas comparten columna, avisar
    // una sola vez: son el mismo dato, dos advertencias por la misma
    // celda vacía solo inflan el preview.
    const priceFields: Array<[string, number | null]> = columnMap.subdistribMinicadenasCompartidas
      ? [
          ["PVF INSTITUCIONES", pvfInstituciones],
          ["PVF SUBDISTRIBUIDORAS/MINICADENAS", pvfSubdistrib],
          ["PVF MAYORISTA/TOP", pvfMayoristaTop],
          ["PVF FARMA", pvfFarma],
        ]
      : [
          ["PVF INSTITUCIONES", pvfInstituciones],
          ["PVF SUBDISTRIB.", pvfSubdistrib],
          ["PVF MINICADENAS", pvfMinicadenas],
          ["PVF MAYORISTA/TOP", pvfMayoristaTop],
          ["PVF FARMA", pvfFarma],
        ];
    for (const [label, value] of priceFields) {
      if (value === null) {
        warnings.push({
          rowIndex: r,
          code: "NO_PRICE",
          message: `${codigoLogisalud}: sin precio en ${label}.`,
        });
      }
    }

    products.push({
      rowIndex: r,
      codigoProveedor: cellToStringOrNull(row[columnMap.codigoProveedor]),
      codigoLogisalud,
      codigoBonificacion: cellToStringOrNull(row[columnMap.codigoBonificacion]),
      producto,
      principioActivo: cellToStringOrNull(row[columnMap.principioActivo]),
      presentacion: cellToStringOrNull(row[columnMap.presentacion]),
      unidadMedida: cellToStringOrNull(row[columnMap.unidadMedida]),
      proveedorNombre: cellToStringOrNull(row[columnMap.proveedor]),
      linea: cellToStringOrNull(row[columnMap.linea]),
      vvfSinIgv: cellToPriceOrNull(row[columnMap.vvf]),
      vvdSinIgv: cellToPriceOrNull(row[columnMap.vvd]),
      igv: cellToPriceOrNull(row[columnMap.igv]),
      fechaVigenciaProveedor: cellToDateOrNull(row[columnMap.fechaVigencia]),
      pvfDistribuidora: cellToPriceOrNull(row[columnMap.pvfDistribuidora]),
      pvfInstituciones,
      // Con columna compartida, el mismo valor alimenta los dos
      // canales (mismo patrón que MAYORISTA/TOP).
      pvfSubdistrib,
      pvfMinicadenas: columnMap.subdistribMinicadenasCompartidas ? pvfSubdistrib : pvfMinicadenas,
      pvfMayoristaTop,
      pvfFarma,
    });
  }

  // Códigos LOGISALUD duplicados dentro del archivo: se tratan como
  // error bloqueante (no se adivina cuál de los dos es el correcto) y
  // se sacan de la lista de productos a publicar.
  const countByCode = new Map<string, number>();
  for (const p of products) {
    countByCode.set(p.codigoLogisalud, (countByCode.get(p.codigoLogisalud) ?? 0) + 1);
  }
  const duplicated = new Set(
    Array.from(countByCode.entries())
      .filter(([, count]) => count > 1)
      .map(([code]) => code),
  );

  const deduped = products.filter((p) => !duplicated.has(p.codigoLogisalud));
  for (const p of products) {
    if (duplicated.has(p.codigoLogisalud)) {
      errors.push({
        rowIndex: p.rowIndex,
        code: "DUPLICATE_CODE",
        message: `Código LOGISALUD duplicado en el archivo: ${p.codigoLogisalud}.`,
      });
    }
  }

  return {
    headerRowIndex,
    columnMap,
    products: deduped,
    sectionHeaders,
    errors,
    warnings,
  };
}

export type TaxTreatment = { afectacionTributaria: "GRAVADO" | "INAFECTO"; tasaAplicable: number };

/**
 * Si VVF e IGV vienen "-"/vacíos, el producto es INAFECTO (tasa 0).
 * Si no, es GRAVADO a la tasa de IGV vigente del sistema (no un valor
 * inventado por fila) — ver pedidos.tax_configurations.
 */
export function decideTaxTreatment(
  row: Pick<ParsedProductRow, "vvfSinIgv" | "igv">,
  currentIgvRate: number,
): TaxTreatment {
  if (row.vvfSinIgv === null && row.igv === null) {
    return { afectacionTributaria: "INAFECTO", tasaAplicable: 0 };
  }
  return { afectacionTributaria: "GRAVADO", tasaAplicable: currentIgvRate };
}

export type ChannelPrice = { channel: string; precio: number };

/**
 * PVF MAYORISTA/TOP alimenta dos canales con el mismo valor. PVF A
 * DISTRIBUIDORA nunca entra acá — es costo de referencia, no precio de
 * venta a ningún canal.
 */
export function buildChannelPrices(row: ParsedProductRow): ChannelPrice[] {
  const items: ChannelPrice[] = [];
  if (row.pvfInstituciones !== null) items.push({ channel: "Clínicas", precio: row.pvfInstituciones });
  if (row.pvfSubdistrib !== null)
    items.push({ channel: "Subdistribuidores", precio: row.pvfSubdistrib });
  if (row.pvfMinicadenas !== null)
    items.push({ channel: "Minicadenas", precio: row.pvfMinicadenas });
  if (row.pvfMayoristaTop !== null) {
    items.push({ channel: "Mayorista", precio: row.pvfMayoristaTop });
    items.push({ channel: "Tops", precio: row.pvfMayoristaTop });
  }
  if (row.pvfFarma !== null) items.push({ channel: "Horizontal", precio: row.pvfFarma });
  return items;
}
