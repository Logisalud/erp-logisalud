/**
 * Importador de promociones de Diphasac: lectura y resolución puras.
 *
 * El archivo es la lista de precios completa con dos bloques de promoción
 * pegados a la derecha: uno para Horizontalidad y otro para
 * Mayorista/Subdistribuidora, cada uno con su escala y su bonificación.
 * Acá se entiende el archivo y se decide qué se va a escribir; nada toca
 * Supabase (eso vive en services/promo-import.ts) para poder probar el
 * criterio completo sin base de datos.
 *
 * Dos decisiones que explican casi todo lo demás:
 *
 *   * Se importa el PORCENTAJE, no el precio promocional. El bloque de
 *     Mayorista se expande a 4 canales con PVF distintos; guardar el
 *     precio de uno los rompería a los otros tres. El precio promocional
 *     del archivo se guarda igual, pero como declaración a contrastar.
 *   * La columna de escala a veces trae prosa en vez de un umbral
 *     ("NUEVO PAQUETE: IBUCALM 200 + MUCOFLUX 200 ( S/. 50)"). Eso no es
 *     una fila que el importador pueda entender, y adivinarla es
 *     exactamente el tipo de error que este proyecto ya pagó caro: se
 *     reporta como nota para que una persona la cargue a mano.
 */

export type RawCell = string | number | Date | null | undefined;
export type RawRow = RawCell[];

export type PromoBloque = "HORIZONTALIDAD" | "MAYORISTA";

/**
 * A qué canales aplica cada bloque. El de Mayorista cubre cuatro
 * (confirmado por el usuario); se expande a una fila por canal en vez de
 * una tabla de cruce, para que Comercial pueda cambiar sólo Tops sin
 * tocar el resto.
 */
export const CANALES_POR_BLOQUE: Record<PromoBloque, readonly string[]> = {
  HORIZONTALIDAD: ["Horizontal"],
  MAYORISTA: ["Mayorista", "Subdistribuidores", "Minicadenas", "Tops"],
};

/**
 * El canal cuyo PVF usó el archivo para calcular su precio promocional.
 * Es contra ese precio que se valida la lectura de cada fila.
 */
export const CANAL_DE_REFERENCIA: Record<PromoBloque, string> = {
  HORIZONTALIDAD: "Horizontal",
  MAYORISTA: "Mayorista",
};

export type PromoIssue = {
  /** 1-indexado sobre el archivo, como lo ve el usuario en Excel. */
  rowNumber: number;
  code: string;
  message: string;
};

export type PromoNota = {
  rowNumber: number;
  codigoProveedor: string;
  producto: string;
  bloque: PromoBloque;
  texto: string;
};

export type ParsedEscala = {
  tipo: "ESCALA";
  rowNumber: number;
  codigoProveedor: string;
  producto: string;
  bloque: PromoBloque;
  cantidadMinima: number;
  porcentajeDescuento: number;
  etiquetaOrigen: string;
  precioDeclarado: number | null;
};

export type ParsedBonificacion = {
  tipo: "BONIFICACION";
  rowNumber: number;
  codigoProveedor: string;
  producto: string;
  bloque: PromoBloque;
  cantidadComprada: number;
  cantidadGratis: number;
  precioDeclarado: number | null;
};

export type ParsedPromo = ParsedEscala | ParsedBonificacion;

export type PromoColumnMap = {
  codigoProveedor: number;
  producto: number;
  bloques: Array<{
    bloque: PromoBloque;
    /** Texto del umbral, % de descuento, precio promocional. */
    escala: [number, number, number] | null;
    /** Cantidad comprada, cantidad gratis, precio promocional. */
    bonificacion: [number, number, number] | null;
  }>;
};

export type PromoParseResult = {
  headerRowNumber: number | null;
  columns: PromoColumnMap | null;
  promos: ParsedPromo[];
  notas: PromoNota[];
  errors: PromoIssue[];
};

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

function textoDeCelda(valor: RawCell): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return "";
  return String(valor).trim();
}

/**
 * Número tolerante con lo que Excel y la gente escriben, igual que en el
 * importador de stock. Lo que no se entiende se rechaza en vez de
 * adivinarse.
 */
export function parsearNumero(valor: RawCell): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const texto = textoDeCelda(valor);
  if (texto === "") return null;

  const limpio = texto.replace(/\s/g, "").replace(/%$/, "");
  const normalizado =
    limpio.includes(",") && limpio.includes(".")
      ? limpio.replace(/\./g, "").replace(",", ".")
      : limpio.replace(",", ".");

  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * El archivo escribe los descuentos como fracción (0.15 = 15%). Un valor
 * de 1 o más se toma como porcentaje ya expresado, porque es lo que
 * escribe cualquiera que edite la celda a mano. 0.5 es 50%, no medio por
 * ciento: en una lista de precios mayorista no existe un descuento de
 * medio punto, y el precio declarado del archivo confirma la lectura fila
 * por fila.
 */
export function porcentajeDeCelda(valor: RawCell): number | null {
  const numero = parsearNumero(valor);
  if (numero === null) return null;
  const porcentaje = numero < 1 ? numero * 100 : numero;
  if (porcentaje <= 0 || porcentaje >= 100) return null;
  return Math.round(porcentaje * 100) / 100;
}

/**
 * "DE 2 A MÁS CAJAS" → 2. Devuelve null para cualquier otra cosa: esa
 * celda también aloja notas en prosa, y una nota no es un umbral.
 */
export function umbralDeTexto(texto: string): number | null {
  const limpio = normalizar(texto);
  if (limpio === "") return null;
  const match = limpio.match(/^de\s+(\d+(?:[.,]\d+)?)\s+a\s+mas\b/);
  if (!match) return null;
  const numero = parsearNumero(match[1]);
  return numero !== null && numero > 0 ? numero : null;
}

const CABECERA_CODIGO = ["codigo diphasac", "codigo del proveedor", "codigo proveedor"];
const CABECERA_PRODUCTO = ["producto", "descripcion"];
const CABECERA_ESCALA_HORIZONTAL = "escala para horizontalidad";
const CABECERA_ESCALA_MAYORISTA = "escala para mayorista/subdistribuidora";
const CABECERA_BONIFICACION = "promos via bonificacion";

/**
 * Encuentra la fila de cabeceras y la posición de los dos bloques. El
 * archivo es ancho y los bloques están pegados uno al lado del otro, así
 * que cada bonificación se asigna al bloque de escala que tiene a su
 * izquierda: es lo que hace que agregar una columna al medio no mezcle
 * los canales.
 */
export function encontrarCabeceras(
  rows: RawRow[],
): { headerRowNumber: number; columns: PromoColumnMap } | null {
  const limite = Math.min(rows.length, 20);

  for (let i = 0; i < limite; i++) {
    const fila = rows[i] ?? [];
    const celdas = fila.map(normalizar);

    const codigoProveedor = celdas.findIndex((c) => CABECERA_CODIGO.includes(c));
    if (codigoProveedor === -1) continue;
    const producto = celdas.findIndex((c) => CABECERA_PRODUCTO.includes(c));

    const escalaHorizontal = celdas.indexOf(CABECERA_ESCALA_HORIZONTAL);
    const escalaMayorista = celdas.indexOf(CABECERA_ESCALA_MAYORISTA);
    const bonificaciones = celdas
      .map((c, idx) => (c === CABECERA_BONIFICACION ? idx : -1))
      .filter((idx) => idx !== -1);

    if (escalaHorizontal === -1 && escalaMayorista === -1 && bonificaciones.length === 0) {
      continue;
    }

    const inicioMayorista = escalaMayorista !== -1 ? escalaMayorista : Infinity;
    const bonifHorizontal = bonificaciones.find((idx) => idx < inicioMayorista);
    const bonifMayorista = bonificaciones.find((idx) => idx > inicioMayorista);

    return {
      headerRowNumber: i + 1,
      columns: {
        codigoProveedor,
        producto: producto === -1 ? codigoProveedor : producto,
        bloques: [
          {
            bloque: "HORIZONTALIDAD",
            escala:
              escalaHorizontal === -1
                ? null
                : [escalaHorizontal, escalaHorizontal + 1, escalaHorizontal + 2],
            bonificacion:
              bonifHorizontal === undefined
                ? null
                : [bonifHorizontal, bonifHorizontal + 2, bonifHorizontal + 3],
          },
          {
            bloque: "MAYORISTA",
            escala:
              escalaMayorista === -1
                ? null
                : [escalaMayorista, escalaMayorista + 1, escalaMayorista + 2],
            bonificacion:
              bonifMayorista === undefined
                ? null
                : [bonifMayorista, bonifMayorista + 2, bonifMayorista + 3],
          },
        ],
      },
    };
  }

  return null;
}

export function parsePromoRows(rows: RawRow[]): PromoParseResult {
  const cabeceras = encontrarCabeceras(rows);
  if (!cabeceras) {
    return {
      headerRowNumber: null,
      columns: null,
      promos: [],
      notas: [],
      errors: [
        {
          rowNumber: 1,
          code: "SIN_CABECERAS",
          message:
            'No se encontró la fila de cabeceras del archivo de Diphasac ("CÓDIGO DIPHASAC" y los bloques de escala/bonificación) en las primeras 20 filas.',
        },
      ],
    };
  }

  const { headerRowNumber, columns } = cabeceras;
  const promos: ParsedPromo[] = [];
  const notas: PromoNota[] = [];
  const errors: PromoIssue[] = [];

  for (let i = headerRowNumber; i < rows.length; i++) {
    const fila = rows[i] ?? [];
    const rowNumber = i + 1;
    const codigoProveedor = textoDeCelda(fila[columns.codigoProveedor]).toUpperCase();
    const producto = textoDeCelda(fila[columns.producto]);
    if (codigoProveedor === "") continue;

    for (const bloque of columns.bloques) {
      if (bloque.escala) {
        const [colTexto, colPorcentaje, colPrecio] = bloque.escala;
        const texto = textoDeCelda(fila[colTexto]);
        const porcentaje = porcentajeDeCelda(fila[colPorcentaje]);

        if (texto !== "") {
          const umbral = umbralDeTexto(texto);
          if (umbral === null) {
            // Prosa: el par Ibucalm + Mucoflux vive acá. Se muestra para
            // que una persona decida, no se interpreta.
            notas.push({
              rowNumber,
              codigoProveedor,
              producto,
              bloque: bloque.bloque,
              texto,
            });
          } else if (porcentaje === null) {
            errors.push({
              rowNumber,
              code: "ESCALA_SIN_PORCENTAJE",
              message: `${codigoProveedor}: la escala "${texto}" no tiene un % de descuento legible.`,
            });
          } else {
            promos.push({
              tipo: "ESCALA",
              rowNumber,
              codigoProveedor,
              producto,
              bloque: bloque.bloque,
              cantidadMinima: umbral,
              porcentajeDescuento: porcentaje,
              etiquetaOrigen: texto,
              precioDeclarado: parsearNumero(fila[colPrecio]),
            });
          }
        } else if (porcentaje !== null) {
          errors.push({
            rowNumber,
            code: "PORCENTAJE_SIN_ESCALA",
            message: `${codigoProveedor}: hay un ${porcentaje}% de descuento sin el texto de la escala que dice desde cuántas unidades aplica.`,
          });
        }
      }

      if (bloque.bonificacion) {
        const [colComprada, colGratis, colPrecio] = bloque.bonificacion;
        const comprada = parsearNumero(fila[colComprada]);
        const gratis = parsearNumero(fila[colGratis]);

        if (comprada === null && gratis === null) continue;

        if (comprada === null || gratis === null || comprada <= 0 || gratis <= 0) {
          errors.push({
            rowNumber,
            code: "BONIFICACION_INCOMPLETA",
            message: `${codigoProveedor}: la bonificación dice "${textoDeCelda(fila[colComprada])} + ${textoDeCelda(fila[colGratis])}" y no se entiende como "compra N, lleva M".`,
          });
          continue;
        }

        promos.push({
          tipo: "BONIFICACION",
          rowNumber,
          codigoProveedor,
          producto,
          bloque: bloque.bloque,
          cantidadComprada: comprada,
          cantidadGratis: gratis,
          precioDeclarado: parsearNumero(fila[colPrecio]),
        });
      }
    }
  }

  return { headerRowNumber, columns, promos, notas, errors };
}

// ---------------------------------------------------------------------
// Resolución contra el catálogo
// ---------------------------------------------------------------------

export type CatalogoProductoPromo = {
  id: string;
  codigo_interno: string;
  codigo_proveedor: string | null;
  descripcion: string;
  estado: string;
};

export type CatalogoCanal = { id: number; nombre: string };

export type PromoEscalaResuelta = {
  tipo: "ESCALA";
  rowNumber: number;
  codigoProveedor: string;
  codigoInterno: string;
  descripcion: string;
  productId: string;
  bloque: PromoBloque;
  canales: Array<{ id: number; nombre: string }>;
  cantidadMinima: number;
  porcentajeDescuento: number;
  etiquetaOrigen: string;
  /** Precio de lista del canal de referencia y lo que sale al aplicarle el %. */
  precioLista: number;
  precioCalculado: number;
  precioDeclarado: number | null;
  /** Qué va a pasar al publicar: no había promo vigente, o la reemplaza. */
  accion: "crear" | "reemplazar";
};

export type PromoBonificacionResuelta = {
  tipo: "BONIFICACION";
  rowNumber: number;
  codigoProveedor: string;
  codigoInterno: string;
  descripcion: string;
  productId: string;
  bloque: PromoBloque;
  canales: Array<{ id: number; nombre: string }>;
  cantidadComprada: number;
  cantidadGratis: number;
  precioLista: number;
  precioCalculado: number;
  precioDeclarado: number | null;
  accion: "crear" | "reemplazar";
};

export type PromoResuelta = PromoEscalaResuelta | PromoBonificacionResuelta;

export type PromoResolveResult = {
  promos: PromoResuelta[];
  errors: PromoIssue[];
  codigosSinProducto: string[];
};

/** Tolerancia entre el precio que calculamos y el que declara el archivo. */
export const TOLERANCIA_PRECIO = 0.01;

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/**
 * Cruza cada promoción con el catálogo y valida la lectura contra el
 * precio promocional que declara el archivo.
 *
 * Esa validación es la red que atrapa un cambio de estructura del Excel
 * antes de que llegue a un pedido: si Diphasac corre una columna, el
 * porcentaje se leería de otra celda y el precio calculado dejaría de
 * coincidir con el declarado. Una fila que no cuadra no se publica.
 */
export function resolverPromoImport(
  parsed: ParsedPromo[],
  catalogos: {
    productos: CatalogoProductoPromo[];
    canales: CatalogoCanal[];
    /** Precio de lista vigente, por `${productId}|${canalId}`. */
    precios: Map<string, number>;
    /** Promos vigentes hoy, por `${tipo}|${productId}|${canalId}`. */
    vigentes: Set<string>;
  },
): PromoResolveResult {
  const porCodigo = new Map<string, CatalogoProductoPromo>();
  for (const producto of catalogos.productos) {
    const codigo = (producto.codigo_proveedor ?? "").trim().toUpperCase();
    // Las bonificaciones (BO…) comparten el código de proveedor con su par
    // regular. La promoción es del producto que se vende, no de la
    // bonificación: si las dos entran al mapa, la que gane decide a cuál se
    // le carga la escala.
    if (codigo === "" || producto.codigo_interno.toUpperCase().startsWith("BO")) continue;
    if (!porCodigo.has(codigo)) porCodigo.set(codigo, producto);
  }

  const porCanal = new Map(catalogos.canales.map((c) => [c.nombre.toLowerCase(), c]));

  const promos: PromoResuelta[] = [];
  const errors: PromoIssue[] = [];
  const codigosSinProducto = new Set<string>();

  for (const fila of parsed) {
    const producto = porCodigo.get(fila.codigoProveedor);
    if (!producto) {
      codigosSinProducto.add(fila.codigoProveedor);
      errors.push({
        rowNumber: fila.rowNumber,
        code: "PRODUCTO_DESCONOCIDO",
        message: `${fila.codigoProveedor}: no existe ningún producto con ese código de proveedor.`,
      });
      continue;
    }

    if (producto.estado !== "activo") {
      errors.push({
        rowNumber: fila.rowNumber,
        code: "PRODUCTO_INACTIVO",
        message: `${fila.codigoProveedor} (${producto.codigo_interno}): el producto está ${producto.estado}. Una promoción sobre un producto que no se vende no se carga.`,
      });
      continue;
    }

    const canales = CANALES_POR_BLOQUE[fila.bloque]
      .map((nombre) => porCanal.get(nombre.toLowerCase()))
      .filter((c): c is CatalogoCanal => c !== undefined);

    if (canales.length === 0) {
      errors.push({
        rowNumber: fila.rowNumber,
        code: "CANAL_DESCONOCIDO",
        message: `${fila.codigoProveedor}: ninguno de los canales del bloque ${fila.bloque} existe en el catálogo.`,
      });
      continue;
    }

    const referencia = porCanal.get(CANAL_DE_REFERENCIA[fila.bloque].toLowerCase());
    const precioLista = referencia
      ? catalogos.precios.get(`${producto.id}|${referencia.id}`)
      : undefined;

    if (precioLista === undefined) {
      errors.push({
        rowNumber: fila.rowNumber,
        code: "SIN_PRECIO_DE_LISTA",
        message: `${fila.codigoProveedor} (${producto.codigo_interno}): no tiene precio vigente en ${CANAL_DE_REFERENCIA[fila.bloque]}, así que no hay contra qué validar el precio promocional.`,
      });
      continue;
    }

    // El precio que el archivo declara: para la escala, el PVF con el
    // descuento; para la bonificación, el unitario promedio del juego
    // completo (PVF × comprada / (comprada + gratis)).
    const precioCalculado =
      fila.tipo === "ESCALA"
        ? redondear(precioLista * (1 - fila.porcentajeDescuento / 100), 4)
        : redondear(
            (precioLista * fila.cantidadComprada) /
              (fila.cantidadComprada + fila.cantidadGratis),
            4,
          );

    if (
      fila.precioDeclarado !== null &&
      Math.abs(precioCalculado - fila.precioDeclarado) > TOLERANCIA_PRECIO
    ) {
      errors.push({
        rowNumber: fila.rowNumber,
        code: "PRECIO_NO_COINCIDE",
        message: `${fila.codigoProveedor}: el archivo declara S/ ${fila.precioDeclarado.toFixed(4)} y de esta lectura sale S/ ${precioCalculado.toFixed(4)}. La estructura del Excel puede haber cambiado: revisá la fila antes de publicar.`,
      });
      continue;
    }

    const clave = `${fila.tipo}|${producto.id}`;
    const accion = canales.some((c) => catalogos.vigentes.has(`${clave}|${c.id}`))
      ? "reemplazar"
      : "crear";

    const comun = {
      rowNumber: fila.rowNumber,
      codigoProveedor: fila.codigoProveedor,
      codigoInterno: producto.codigo_interno,
      descripcion: producto.descripcion,
      productId: producto.id,
      bloque: fila.bloque,
      canales: canales.map((c) => ({ id: c.id, nombre: c.nombre })),
      precioLista,
      precioCalculado,
      precioDeclarado: fila.precioDeclarado,
      accion,
    } as const;

    promos.push(
      fila.tipo === "ESCALA"
        ? {
            tipo: "ESCALA",
            ...comun,
            cantidadMinima: fila.cantidadMinima,
            porcentajeDescuento: fila.porcentajeDescuento,
            etiquetaOrigen: fila.etiquetaOrigen,
          }
        : {
            tipo: "BONIFICACION",
            ...comun,
            cantidadComprada: fila.cantidadComprada,
            cantidadGratis: fila.cantidadGratis,
          },
    );
  }

  return { promos, errors, codigosSinProducto: Array.from(codigosSinProducto) };
}

export type PromoImportResumen = {
  escalas: number;
  bonificaciones: number;
  /** Filas de tabla que se van a escribir: una por promoción y canal. */
  filasAEscribir: number;
  productos: number;
};

export function resumirPromoImport(promos: PromoResuelta[]): PromoImportResumen {
  const productos = new Set(promos.map((p) => p.productId));
  return {
    escalas: promos.filter((p) => p.tipo === "ESCALA").length,
    bonificaciones: promos.filter((p) => p.tipo === "BONIFICACION").length,
    filasAEscribir: promos.reduce((suma, p) => suma + p.canales.length, 0),
    productos: productos.size,
  };
}
