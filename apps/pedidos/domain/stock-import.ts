/**
 * Carga masiva de stock POR LOTE: parseo y resolución puros.
 *
 * El archivo real de stock diario trae una fila por lote, no por producto:
 * el mismo código aparece varias veces, cada vez con su lote, su fecha de
 * vencimiento y su cantidad. Ese detalle es justamente lo que hace falta
 * para despachar —qué lote sale y cuál vence primero—, así que se carga
 * tal cual y la suma por producto la hace la vista `stock_levels`.
 *
 * Mismo criterio que los otros importadores: primero se entiende el
 * archivo y se muestra qué va a pasar, y sólo después se escribe. Nada acá
 * toca Supabase ni lee archivos —eso vive en services/stock-import.ts—
 * para poder probar el criterio completo sin base de datos.
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
  /** Vacío = almacén por defecto. Lo resuelve `resolverStockImport`. */
  fuente: string;
  lote: string;
  /** ISO `YYYY-MM-DD`, o null si el archivo no la trae. */
  fechaVencimiento: string | null;
  cantidad: number;
  proveedor: string | null;
};

export type StockColumnMap = {
  codigoProducto: number;
  /** -1 cuando el archivo no trae columna de fuente. */
  fuente: number;
  lote: number;
  /** -1 cuando el archivo no trae fecha de vencimiento. */
  fechaVencimiento: number;
  cantidad: number;
  /** -1 cuando el archivo no trae proveedor. */
  proveedor: number;
};

export type StockParseResult = {
  /** 1-indexado; null si no se encontró una fila de cabeceras reconocible. */
  headerRowNumber: number | null;
  columns: StockColumnMap | null;
  rows: ParsedStockRow[];
  errors: StockIssue[];
};

/**
 * Cabeceras aceptadas por columna. El archivo real escribe "CANTIDA" (sin
 * la D) y "FV" en vez de fecha de vencimiento: se aceptan como vienen en
 * vez de pedirle a la gente que renombre columnas antes de cargar.
 */
const CABECERAS = {
  codigoProducto: ["codigo", "codigo_producto", "codigo producto", "codigo_interno", "producto"],
  fuente: ["fuente", "inventory_source", "fuente_stock", "fuente de stock", "almacen", "origen"],
  lote: ["lote", "nro lote", "numero de lote", "lote_producto"],
  fechaVencimiento: [
    "fv",
    "f.v.",
    "fecha_vencimiento",
    "fecha vencimiento",
    "fecha de vencimiento",
    "vencimiento",
    "vence",
  ],
  cantidad: [
    "cantida",
    "cantidad",
    "cantidad_disponible",
    "cantidad disponible",
    "stock",
    "disponible",
    "saldo",
  ],
  proveedor: ["proveedor", "laboratorio", "marca"],
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
    const texto = normalizar(celda);
    return aceptadas.some((a) => texto === a || texto === a.replace(/_/g, " "));
  });
}

/**
 * Encuentra la fila de cabeceras. No se asume que sea la primera: los
 * archivos que la gente arma a mano suelen traer un título arriba, y
 * exigirle una plantilla exacta es la clase de rigidez que hace que el
 * importador no se use.
 *
 * Lo mínimo indispensable es código, lote y cantidad. Fuente, fecha de
 * vencimiento y proveedor son opcionales: sin fuente se usa el almacén por
 * defecto, y las otras dos son datos que se guardan si vienen.
 */
export function encontrarCabeceras(
  rows: RawRow[],
): { headerRowNumber: number; columns: StockColumnMap } | null {
  const limite = Math.min(rows.length, 20);
  for (let i = 0; i < limite; i++) {
    const fila = rows[i] ?? [];
    const codigoProducto = buscarColumna(fila, CABECERAS.codigoProducto);
    const lote = buscarColumna(fila, CABECERAS.lote);
    const cantidad = buscarColumna(fila, CABECERAS.cantidad);
    if (codigoProducto !== -1 && lote !== -1 && cantidad !== -1) {
      return {
        headerRowNumber: i + 1,
        columns: {
          codigoProducto,
          lote,
          cantidad,
          fuente: buscarColumna(fila, CABECERAS.fuente),
          fechaVencimiento: buscarColumna(fila, CABECERAS.fechaVencimiento),
          proveedor: buscarColumna(fila, CABECERAS.proveedor),
        },
      };
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
 * Fecha de vencimiento a ISO `YYYY-MM-DD`.
 *
 * La celda del archivo real es una fecha de Excel con hora ("2027-10-30
 * 16:47:55"): la hora es basura del formato, no un dato, y se descarta.
 * Se toman los componentes LOCALES de la fecha y no `toISOString()`, que
 * en zona horaria de Perú retrocede un día.
 */
export function parsearFechaVencimiento(valor: RawCell): string | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, "0");
    const d = String(valor.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const texto = textoDeCelda(valor);
  if (texto === "") return null;

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // dd/mm/yyyy y dd-mm-yyyy, que es como se escribe a mano en Perú.
  const local = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (local) {
    const dia = Number(local[1]);
    const mes = Number(local[2]);
    const anio = Number(local[3].length === 2 ? `20${local[3]}` : local[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }

  return null;
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
            "No se encontraron las columnas CODIGO, LOTE y CANTIDAD en las primeras 20 filas.",
        },
      ],
    };
  }

  const { headerRowNumber, columns } = cabeceras;
  const parsed: ParsedStockRow[] = [];
  const errors: StockIssue[] = [];

  const celda = (fila: RawRow, indice: number): RawCell => (indice === -1 ? null : fila[indice]);

  for (let i = headerRowNumber; i < rows.length; i++) {
    const fila = rows[i] ?? [];
    const rowNumber = i + 1;

    const codigoProducto = textoDeCelda(celda(fila, columns.codigoProducto)).toUpperCase();
    const fuente = textoDeCelda(celda(fila, columns.fuente));
    const lote = textoDeCelda(celda(fila, columns.lote));
    const cantidadCruda = celda(fila, columns.cantidad);
    const proveedor = textoDeCelda(celda(fila, columns.proveedor)) || null;

    // Fila completamente vacía: es el relleno normal al final de una hoja,
    // no un error que valga la pena mostrarle a nadie.
    if (codigoProducto === "" && lote === "" && textoDeCelda(cantidadCruda) === "") continue;

    if (codigoProducto === "") {
      errors.push({ rowNumber, code: "SIN_CODIGO", message: "Falta el código de producto." });
      continue;
    }
    if (lote === "") {
      errors.push({
        rowNumber,
        code: "SIN_LOTE",
        message: `${codigoProducto}: falta el lote. El stock se lleva por lote, así que sin él la fila no se puede cargar.`,
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

    parsed.push({
      rowNumber,
      codigoProducto,
      fuente,
      lote,
      fechaVencimiento: parsearFechaVencimiento(celda(fila, columns.fechaVencimiento)),
      cantidad,
      proveedor,
    });
  }

  return { headerRowNumber, columns, rows: parsed, errors };
}

// ---------------------------------------------------------------------
// Resolución contra los catálogos
// ---------------------------------------------------------------------

export type CatalogoProducto = {
  id: string;
  codigo_interno: string;
  descripcion: string;
  controla_lote?: boolean | null;
};
export type CatalogoFuente = { id: number; nombre: string; estado?: string };

export type StockLoteResuelto = {
  /** Filas del archivo que aportaron a este lote (puede ser más de una). */
  rowNumbers: number[];
  codigoProducto: string;
  descripcion: string;
  productId: string;
  inventorySourceId: number;
  fuenteNombre: string;
  lote: string;
  fechaVencimiento: string | null;
  cantidad: number;
  proveedor: string | null;
  /** Qué va a pasar al publicar. */
  accion: "crear" | "actualizar";
  /** Lo que hay hoy en la base, sólo cuando la acción es actualizar. */
  cantidadActual: number | null;
};

export type StockResolveResult = {
  lotes: StockLoteResuelto[];
  errors: StockIssue[];
  warnings: StockIssue[];
  /** Códigos del archivo que no existen en el catálogo de productos. */
  codigosSinProducto: string[];
  /** Fuentes del archivo que no existen en el catálogo. */
  fuentesDesconocidas: string[];
  /** Fuentes que existen pero están inactivas: no es lo mismo que no existir. */
  fuentesInactivas: string[];
  /** Productos marcados como que NO controlan lote, pero el archivo trae lote. */
  productosSinControlDeLote: string[];
};

/**
 * Cruza las filas del archivo con los catálogos y decide crear o
 * actualizar cada lote. Una fila que no resuelve no se descarta en
 * silencio: se reporta, porque "cargué 200 y quedaron 176" sin decir
 * cuáles es la forma más rápida de perderle la confianza a un importador.
 */
export function resolverStockImport(
  filas: ParsedStockRow[],
  catalogos: {
    productos: CatalogoProducto[];
    fuentes: CatalogoFuente[];
    /** La que se usa cuando la fila no dice fuente. */
    fuentePorDefecto: CatalogoFuente;
    /** Stock ya registrado, por `${productId}|${inventorySourceId}|${lote}`. */
    existentes: Map<string, number>;
  },
): StockResolveResult {
  const porCodigo = new Map(catalogos.productos.map((p) => [claveDeNombre(p.codigo_interno), p]));
  const porFuente = new Map(catalogos.fuentes.map((f) => [claveDeNombre(f.nombre), f]));

  const errors: StockIssue[] = [];
  const warnings: StockIssue[] = [];
  const codigosSinProducto = new Set<string>();
  const fuentesDesconocidas = new Set<string>();
  const fuentesInactivas = new Set<string>();
  const productosSinControlDeLote = new Set<string>();

  /**
   * Un mismo lote puede venir en VARIAS filas del archivo (el real trae 34
   * casos). No es un copy/paste: son entradas distintas del mismo lote, y
   * lo que corresponde con una cantidad es SUMARLAS. Quedarse con la
   * última perdería stock real sin que nadie se entere.
   */
  const porLote = new Map<string, StockLoteResuelto>();

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

    // Sin fuente en la fila manda el almacén por defecto: hoy hay un solo
    // almacén activo y el archivo lo deja en blanco en la mayoría de las
    // filas. Decisión de negocio confirmada, no un supuesto.
    const fuente = fila.fuente === "" ? catalogos.fuentePorDefecto : porFuente.get(claveDeNombre(fila.fuente));
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

    // Avisa, no bloquea: el archivo es la realidad del almacén, y que el
    // catálogo diga que ese producto no controla lote es un dato del
    // catálogo por corregir, no un motivo para descartar stock real.
    if (producto.controla_lote === false) productosSinControlDeLote.add(producto.codigo_interno);

    const clave = `${producto.id}|${fuente.id}|${fila.lote}`;
    const yaVisto = porLote.get(clave);

    if (yaVisto) {
      yaVisto.cantidad += fila.cantidad;
      yaVisto.rowNumbers.push(fila.rowNumber);
      // La fecha de vencimiento del lote es una sola; si dos filas
      // discrepan gana la más temprana, que es la que manda para despachar.
      if (
        fila.fechaVencimiento &&
        (!yaVisto.fechaVencimiento || fila.fechaVencimiento < yaVisto.fechaVencimiento)
      ) {
        yaVisto.fechaVencimiento = fila.fechaVencimiento;
      }
      warnings.push({
        rowNumber: fila.rowNumber,
        code: "LOTE_REPETIDO_EN_ARCHIVO",
        message: `${fila.codigoProducto} lote ${fila.lote}: aparece en varias filas (${yaVisto.rowNumbers.join(", ")}). Las cantidades se SUMAN: ${yaVisto.cantidad}.`,
      });
      continue;
    }

    const cantidadActual = catalogos.existentes.get(clave);
    porLote.set(clave, {
      rowNumbers: [fila.rowNumber],
      codigoProducto: producto.codigo_interno,
      descripcion: producto.descripcion,
      productId: producto.id,
      inventorySourceId: fuente.id,
      fuenteNombre: fuente.nombre,
      lote: fila.lote,
      fechaVencimiento: fila.fechaVencimiento,
      cantidad: fila.cantidad,
      proveedor: fila.proveedor,
      accion: cantidadActual === undefined ? "crear" : "actualizar",
      cantidadActual: cantidadActual ?? null,
    });
  }

  if (productosSinControlDeLote.size > 0) {
    const codigos = Array.from(productosSinControlDeLote).sort();
    warnings.push({
      rowNumber: 0,
      code: "PRODUCTO_SIN_CONTROL_DE_LOTE",
      message:
        `${codigos.length} producto(s) tienen controla_lote = false en el catálogo pero el archivo les trae lote. ` +
        `Se cargan igual; conviene corregir el catálogo. Ejemplos: ${codigos.slice(0, 8).join(", ")}` +
        (codigos.length > 8 ? "…" : ""),
    });
  }

  return {
    lotes: Array.from(porLote.values()),
    errors,
    warnings,
    codigosSinProducto: Array.from(codigosSinProducto),
    fuentesDesconocidas: Array.from(fuentesDesconocidas),
    fuentesInactivas: Array.from(fuentesInactivas),
    productosSinControlDeLote: Array.from(productosSinControlDeLote),
  };
}

export type StockImportResumen = {
  /** Lotes que no existían. */
  crear: number;
  /** Lotes que existen y cambian de cantidad. */
  actualizar: number;
  /** Lotes que ya tienen exactamente esa cantidad. */
  sinCambio: number;
  /** Productos distintos que quedan con stock. */
  productos: number;
  /** Unidades totales del archivo, ya sumados los lotes repetidos. */
  unidades: number;
};

export function resumirStockImport(lotes: StockLoteResuelto[]): StockImportResumen {
  let crear = 0;
  let actualizar = 0;
  let sinCambio = 0;
  for (const lote of lotes) {
    if (lote.accion === "crear") crear++;
    else if (lote.cantidadActual === lote.cantidad) sinCambio++;
    else actualizar++;
  }
  return {
    crear,
    actualizar,
    sinCambio,
    productos: new Set(lotes.map((l) => l.productId)).size,
    unidades: lotes.reduce((acc, l) => acc + l.cantidad, 0),
  };
}
