/**
 * Carga masiva de stock: parseo y resolución puros.
 *
 * Hasta acá el stock se cargaba fila por fila desde la base. Con 177
 * productos y varias fuentes eso no es una tarea, es una tarde.
 *
 * Mismo criterio que el importador de precios y el de clientes: primero se
 * entiende el archivo y se muestra qué va a pasar (cuántos se crean,
 * cuántos se actualizan, qué códigos no existen), y sólo después se
 * escribe. Nada acá toca Supabase ni lee archivos — eso vive en
 * services/stock-import.ts — para poder probar el criterio completo sin
 * base de datos.
 */

export type RawCell = string | number | Date | null | undefined;
export type RawRow = RawCell[];

export type StockIssue = {
  /** 1-indexado sobre el archivo, como lo ve el usuario en Excel. */
  rowNumber: number;
  code: string;
  message: string;
};

export type ParsedStockRow = {
  rowNumber: number;
  codigoProducto: string;
  fuente: string;
  cantidad: number;
};

export type StockColumnMap = {
  codigoProducto: number;
  fuente: number;
  cantidad: number;
};

export type StockParseResult = {
  /** 1-indexado; null si no se encontró una fila de cabeceras reconocible. */
  headerRowNumber: number | null;
  columns: StockColumnMap | null;
  rows: ParsedStockRow[];
  errors: StockIssue[];
};

/** Cabeceras aceptadas por columna. Se comparan normalizadas. */
const CABECERAS = {
  codigoProducto: ["codigo_producto", "codigo producto", "codigo", "codigo_interno", "producto"],
  fuente: [
    "inventory_source",
    "fuente",
    "fuente_stock",
    "fuente de stock",
    "almacen",
    "origen",
  ],
  cantidad: [
    "cantidad_disponible",
    "cantidad disponible",
    "cantidad",
    "stock",
    "disponible",
    "saldo",
  ],
} as const;

function normalizar(valor: RawCell): string {
  if (valor === null || valor === undefined) return "";
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Comparación de nombres libres (producto, fuente): sin tildes, sin caso. */
export function claveDeNombre(valor: string): string {
  return normalizar(valor);
}

function buscarColumna(fila: RawRow, aceptadas: readonly string[]): number {
  return fila.findIndex((celda) => {
    const texto = normalizar(celda).replace(/\s+/g, " ");
    return aceptadas.some((a) => texto === a || texto === a.replace(/_/g, " "));
  });
}

/**
 * Encuentra la fila de cabeceras. No se asume que sea la primera: los
 * archivos que la gente arma a mano suelen traer un título arriba, y
 * exigirle una plantilla exacta es la clase de rigidez que hace que el
 * importador no se use.
 */
export function encontrarCabeceras(
  rows: RawRow[],
): { headerRowNumber: number; columns: StockColumnMap } | null {
  const limite = Math.min(rows.length, 20);
  for (let i = 0; i < limite; i++) {
    const fila = rows[i] ?? [];
    const codigoProducto = buscarColumna(fila, CABECERAS.codigoProducto);
    const fuente = buscarColumna(fila, CABECERAS.fuente);
    const cantidad = buscarColumna(fila, CABECERAS.cantidad);
    if (codigoProducto !== -1 && fuente !== -1 && cantidad !== -1) {
      return { headerRowNumber: i + 1, columns: { codigoProducto, fuente, cantidad } };
    }
  }
  return null;
}

function textoDeCelda(valor: RawCell): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return "";
  return String(valor).trim();
}

/**
 * Cantidad tolerante con lo que Excel y la gente escriben: celdas
 * numéricas de verdad, "1 200" con espacios, "1,5" con coma decimal y
 * "1.200,50" al formato local. Lo que no se entiende se RECHAZA en vez de
 * adivinarse: un stock inventado es peor que una fila que el usuario
 * tiene que corregir.
 */
export function parsearCantidad(valor: RawCell): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const texto = textoDeCelda(valor);
  if (texto === "") return null;

  const sinEspacios = texto.replace(/\s/g, "");
  // Con los dos separadores presentes no hay ambigüedad: la coma es el
  // decimal y el punto agrupa miles. Con sólo coma, es el decimal.
  const normalizado =
    sinEspacios.includes(",") && sinEspacios.includes(".")
      ? sinEspacios.replace(/\./g, "").replace(",", ".")
      : sinEspacios.replace(",", ".");

  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

export function parseStockRows(rows: RawRow[]): StockParseResult {
  const cabeceras = encontrarCabeceras(rows);
  if (!cabeceras) {
    return {
      headerRowNumber: null,
      columns: null,
      rows: [],
      errors: [
        {
          rowNumber: 1,
          code: "SIN_CABECERAS",
          message:
            "No se encontraron las columnas codigo_producto, inventory_source y cantidad_disponible en las primeras 20 filas.",
        },
      ],
    };
  }

  const { headerRowNumber, columns } = cabeceras;
  const parsed: ParsedStockRow[] = [];
  const errors: StockIssue[] = [];

  for (let i = headerRowNumber; i < rows.length; i++) {
    const fila = rows[i] ?? [];
    const rowNumber = i + 1;

    const codigoProducto = textoDeCelda(fila[columns.codigoProducto]).toUpperCase();
    const fuente = textoDeCelda(fila[columns.fuente]);
    const cantidadCruda = fila[columns.cantidad];

    // Fila completamente vacía: es el relleno normal al final de una hoja,
    // no un error que valga la pena mostrarle a nadie.
    if (codigoProducto === "" && fuente === "" && textoDeCelda(cantidadCruda) === "") continue;

    if (codigoProducto === "") {
      errors.push({ rowNumber, code: "SIN_CODIGO", message: "Falta el código de producto." });
      continue;
    }
    if (fuente === "") {
      errors.push({
        rowNumber,
        code: "SIN_FUENTE",
        message: `${codigoProducto}: falta la fuente de stock.`,
      });
      continue;
    }

    const cantidad = parsearCantidad(cantidadCruda);
    if (cantidad === null) {
      errors.push({
        rowNumber,
        code: "CANTIDAD_INVALIDA",
        message: `${codigoProducto}: la cantidad "${textoDeCelda(cantidadCruda)}" no es un número.`,
      });
      continue;
    }
    if (cantidad < 0) {
      errors.push({
        rowNumber,
        code: "CANTIDAD_NEGATIVA",
        message: `${codigoProducto}: la cantidad no puede ser negativa.`,
      });
      continue;
    }

    parsed.push({ rowNumber, codigoProducto, fuente, cantidad });
  }

  return { headerRowNumber, columns, rows: parsed, errors };
}

// ---------------------------------------------------------------------
// Resolución contra los catálogos
// ---------------------------------------------------------------------

export type CatalogoProducto = { id: string; codigo_interno: string; descripcion: string };
export type CatalogoFuente = { id: number; nombre: string; estado?: string };

export type StockItemResuelto = {
  rowNumber: number;
  codigoProducto: string;
  descripcion: string;
  productId: string;
  inventorySourceId: number;
  fuenteNombre: string;
  cantidad: number;
  /** Qué va a pasar al publicar. */
  accion: "crear" | "actualizar";
  /** Lo que hay hoy en la base, sólo cuando la acción es actualizar. */
  cantidadActual: number | null;
};

export type StockResolveResult = {
  items: StockItemResuelto[];
  errors: StockIssue[];
  /** Códigos del archivo que no existen en el catálogo de productos. */
  codigosSinProducto: string[];
  /** Fuentes del archivo que no existen en el catálogo. */
  fuentesDesconocidas: string[];
  /** Fuentes que existen pero están inactivas: no es lo mismo que no existir. */
  fuentesInactivas: string[];
};

/**
 * Cruza las filas del archivo con los catálogos y decide crear o
 * actualizar. Una fila que no resuelve no se descarta en silencio: se
 * reporta, porque "cargué 150 y quedaron 148" sin decir cuáles es la forma
 * más rápida de perderle la confianza a un importador.
 */
export function resolverStockImport(
  filas: ParsedStockRow[],
  catalogos: {
    productos: CatalogoProducto[];
    fuentes: CatalogoFuente[];
    /** Stock ya registrado, por `${productId}|${inventorySourceId}`. */
    existentes: Map<string, number>;
  },
): StockResolveResult {
  const porCodigo = new Map(
    catalogos.productos.map((p) => [claveDeNombre(p.codigo_interno), p]),
  );
  const porFuente = new Map(catalogos.fuentes.map((f) => [claveDeNombre(f.nombre), f]));

  const items: StockItemResuelto[] = [];
  const errors: StockIssue[] = [];
  const codigosSinProducto = new Set<string>();
  const fuentesDesconocidas = new Set<string>();
  const fuentesInactivas = new Set<string>();
  // Última fila gana, pero se avisa: dos filas del mismo producto+fuente
  // suelen ser un copy/paste, y publicar la primera en silencio deja al
  // usuario creyendo que cargó la otra.
  const vistos = new Map<string, number>();

  for (const fila of filas) {
    const producto = porCodigo.get(claveDeNombre(fila.codigoProducto));
    if (!producto) {
      codigosSinProducto.add(fila.codigoProducto);
      errors.push({
        rowNumber: fila.rowNumber,
        code: "PRODUCTO_DESCONOCIDO",
        message: `${fila.codigoProducto}: no existe ningún producto con ese código.`,
      });
      continue;
    }

    const fuente = porFuente.get(claveDeNombre(fila.fuente));
    if (!fuente) {
      fuentesDesconocidas.add(fila.fuente);
      errors.push({
        rowNumber: fila.rowNumber,
        code: "FUENTE_DESCONOCIDA",
        message: `${fila.codigoProducto}: la fuente de stock "${fila.fuente}" no existe en el catálogo.`,
      });
      continue;
    }

    // Una fuente inactiva existe pero está fuera de uso: decir "no existe"
    // mandaría al usuario a crear un duplicado.
    if (fuente.estado !== undefined && fuente.estado !== "activo") {
      fuentesInactivas.add(fuente.nombre);
      errors.push({
        rowNumber: fila.rowNumber,
        code: "FUENTE_INACTIVA",
        message: `${fila.codigoProducto}: la fuente "${fuente.nombre}" está inactiva. Reactivala en Maestros → Despacho o usá otra.`,
      });
      continue;
    }

    const clave = `${producto.id}|${fuente.id}`;
    const duplicadaEnFila = vistos.get(clave);
    if (duplicadaEnFila !== undefined) {
      errors.push({
        rowNumber: fila.rowNumber,
        code: "DUPLICADO_EN_ARCHIVO",
        message: `${fila.codigoProducto} en ${fuente.nombre}: repetido (también en la fila ${duplicadaEnFila}). Se aplica el último valor.`,
      });
      const anterior = items.findIndex((i) => `${i.productId}|${i.inventorySourceId}` === clave);
      if (anterior !== -1) items.splice(anterior, 1);
    }
    vistos.set(clave, fila.rowNumber);

    const cantidadActual = catalogos.existentes.get(clave);
    items.push({
      rowNumber: fila.rowNumber,
      codigoProducto: producto.codigo_interno,
      descripcion: producto.descripcion,
      productId: producto.id,
      inventorySourceId: fuente.id,
      fuenteNombre: fuente.nombre,
      cantidad: fila.cantidad,
      accion: cantidadActual === undefined ? "crear" : "actualizar",
      cantidadActual: cantidadActual ?? null,
    });
  }

  return {
    items,
    errors,
    codigosSinProducto: Array.from(codigosSinProducto),
    fuentesDesconocidas: Array.from(fuentesDesconocidas),
    fuentesInactivas: Array.from(fuentesInactivas),
  };
}

export type StockImportResumen = {
  crear: number;
  actualizar: number;
  /** Filas que van a quedar igual: ya tienen exactamente esa cantidad. */
  sinCambio: number;
};

export function resumirStockImport(items: StockItemResuelto[]): StockImportResumen {
  let crear = 0;
  let actualizar = 0;
  let sinCambio = 0;
  for (const item of items) {
    if (item.accion === "crear") crear++;
    else if (item.cantidadActual === item.cantidad) sinCambio++;
    else actualizar++;
  }
  return { crear, actualizar, sinCambio };
}
