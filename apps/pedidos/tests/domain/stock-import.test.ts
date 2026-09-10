import { describe, expect, it } from "vitest";
import {
  encontrarCabeceras,
  parsearCantidad,
  parsearFechaVencimiento,
  parseStockRows,
  resolverStockImport,
  resumirStockImport,
  type CatalogoFuente,
  type RawRow,
} from "@/domain/stock-import";

/**
 * El importador de stock lee el archivo REAL del almacén, que trae una
 * fila por lote: el mismo producto aparece varias veces, cada vez con su
 * lote, su vencimiento y su cantidad. Lo que se prueba acá es lo que
 * distingue este importador del anterior —lotes, fechas, la fuente por
 * defecto y los lotes repetidos— porque es donde se pierde stock real sin
 * que nadie se entere.
 */

const CENTRAL: CatalogoFuente = { id: 1, nombre: "Almacén Central Lima", estado: "activo" };
const TRUJILLO: CatalogoFuente = { id: 2, nombre: "Almacén Regional Trujillo", estado: "inactivo" };

const PRODUCTOS = [
  { id: "p1", codigo_interno: "DHP414", descripcion: "ACIDO TRANEXAMICO", controla_lote: true },
  { id: "p2", codigo_interno: "BSA301", descripcion: "ALLERGY-BIO", controla_lote: false },
];

function resolver(filas: RawRow[], existentes = new Map<string, number>()) {
  const parsed = parseStockRows(filas);
  return {
    parsed,
    resuelto: resolverStockImport(parsed.rows, {
      productos: PRODUCTOS,
      fuentes: [CENTRAL, TRUJILLO],
      fuentePorDefecto: CENTRAL,
      existentes,
    }),
  };
}

/** Las cabeceras exactas del archivo real, incluido "CANTIDA" sin la D. */
const CABECERA_REAL: RawRow = [
  "CODIGO",
  "FUENTE",
  "DESCRIPCION",
  "LOTE",
  "FV",
  "CANTIDA",
  "PROVEEDOR",
];

describe("encontrarCabeceras", () => {
  it("reconoce las cabeceras del archivo real, con CANTIDA y FV", () => {
    const encontrado = encontrarCabeceras([["STOCK AL 09/09"], [], CABECERA_REAL]);
    expect(encontrado).toEqual({
      headerRowNumber: 3,
      columns: {
        codigoProducto: 0,
        fuente: 1,
        lote: 3,
        fechaVencimiento: 4,
        cantidad: 5,
        proveedor: 6,
      },
    });
  });

  it("acepta un archivo sin fuente, vencimiento ni proveedor: lo mínimo es código, lote y cantidad", () => {
    const encontrado = encontrarCabeceras([["CODIGO", "LOTE", "CANTIDAD"]]);
    expect(encontrado?.columns).toMatchObject({ fuente: -1, fechaVencimiento: -1, proveedor: -1 });
  });

  it("sin lote no hay cabecera reconocible: el stock se lleva por lote", () => {
    expect(encontrarCabeceras([["CODIGO", "FUENTE", "CANTIDAD"]])).toBeNull();
  });
});

describe("parsearFechaVencimiento", () => {
  it("de una fecha de Excel toma el día local y descarta la hora", () => {
    // La celda real trae "2027-10-30 16:47:55": la hora es basura del
    // formato. Y con toISOString(), en hora de Perú, esto retrocedía un día.
    expect(parsearFechaVencimiento(new Date(2027, 9, 30, 16, 47, 55))).toBe("2027-10-30");
    expect(parsearFechaVencimiento(new Date(2028, 0, 1, 0, 0, 0))).toBe("2028-01-01");
  });

  it("acepta dd/mm/yyyy, que es como se escribe a mano acá", () => {
    expect(parsearFechaVencimiento("31/12/2027")).toBe("2027-12-31");
    expect(parsearFechaVencimiento("1-5-27")).toBe("2027-05-01");
  });

  it("acepta ISO y rechaza lo que no es una fecha", () => {
    expect(parsearFechaVencimiento("2027-12-31")).toBe("2027-12-31");
    expect(parsearFechaVencimiento("s/f")).toBeNull();
    expect(parsearFechaVencimiento("")).toBeNull();
    expect(parsearFechaVencimiento(null)).toBeNull();
  });
});

describe("parsearCantidad", () => {
  it("lee números de Excel y los escritos a mano", () => {
    expect(parsearCantidad(180)).toBe(180);
    expect(parsearCantidad("1 200")).toBe(1200);
    expect(parsearCantidad("1,5")).toBe(1.5);
    expect(parsearCantidad("1.200,50")).toBe(1200.5);
  });

  it("rechaza lo que no se entiende en vez de adivinarlo", () => {
    expect(parsearCantidad("varios")).toBeNull();
    expect(parsearCantidad("")).toBeNull();
    expect(parsearCantidad(null)).toBeNull();
  });
});

describe("parseStockRows", () => {
  it("lee las filas del archivo real, con la fuente en blanco", () => {
    const { parsed } = resolver([
      CABECERA_REAL,
      ["DHP414", null, "ACIDO TRANEXAMICO", "PT12412", new Date(2027, 9, 30, 16, 47, 55), 180, "DIPHASAC"],
    ]);
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        codigoProducto: "DHP414",
        fuente: "",
        lote: "PT12412",
        fechaVencimiento: "2027-10-30",
        cantidad: 180,
        proveedor: "DIPHASAC",
      },
    ]);
  });

  it("una fila sin lote no se puede cargar y se dice por qué", () => {
    const { parsed } = resolver([CABECERA_REAL, ["DHP414", null, "X", "", new Date(), 10, "P"]]);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0].code).toBe("SIN_LOTE");
  });

  it("ignora las filas vacías del final sin ensuciar los errores", () => {
    const { parsed } = resolver([CABECERA_REAL, [null, null, null, null, null, null, null], []]);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors).toHaveLength(0);
  });

  it("rechaza cantidad no numérica y negativa", () => {
    const { parsed } = resolver([
      CABECERA_REAL,
      ["DHP414", null, "X", "L1", null, "varios", "P"],
      ["DHP414", null, "X", "L2", null, -3, "P"],
    ]);
    expect(parsed.errors.map((e) => e.code)).toEqual(["CANTIDAD_INVALIDA", "CANTIDAD_NEGATIVA"]);
  });
});

describe("resolverStockImport", () => {
  it("sin FUENTE, el lote va al almacén por defecto", () => {
    const { resuelto } = resolver([
      CABECERA_REAL,
      ["DHP414", null, "X", "PT1", new Date(2027, 11, 31), 5, "DIPHASAC"],
    ]);
    expect(resuelto.lotes[0]).toMatchObject({
      inventorySourceId: 1,
      fuenteNombre: "Almacén Central Lima",
      lote: "PT1",
      cantidad: 5,
      accion: "crear",
    });
  });

  it("el mismo lote en varias filas SUMA las cantidades", () => {
    // Caso real: DHP414 lote PT12502 viene en dos filas, 1 y 21. Quedarse
    // con la última perdería 1 unidad sin que nadie se entere.
    const { resuelto } = resolver([
      CABECERA_REAL,
      ["DHP414", null, "X", "PT12502", new Date(2027, 11, 31), 1, "DIPHASAC"],
      ["DHP414", null, "X", "PT12502", new Date(2027, 11, 31), 21, "DIPHASAC"],
    ]);
    expect(resuelto.lotes).toHaveLength(1);
    expect(resuelto.lotes[0].cantidad).toBe(22);
    expect(resuelto.lotes[0].rowNumbers).toEqual([2, 3]);
    const aviso = resuelto.warnings.find((w) => w.code === "LOTE_REPETIDO_EN_ARCHIVO");
    expect(aviso?.message).toContain("SUMAN: 22");
  });

  it("si dos filas del mismo lote discrepan en el vencimiento, gana el más temprano", () => {
    const { resuelto } = resolver([
      CABECERA_REAL,
      ["DHP414", null, "X", "PT1", new Date(2028, 0, 31), 5, "P"],
      ["DHP414", null, "X", "PT1", new Date(2027, 5, 30), 5, "P"],
    ]);
    expect(resuelto.lotes[0].fechaVencimiento).toBe("2027-06-30");
  });

  it("distingue crear de actualizar por lote, no por producto", () => {
    const { resuelto } = resolver(
      [
        CABECERA_REAL,
        ["DHP414", null, "X", "PT1", null, 10, "P"],
        ["DHP414", null, "X", "PT2", null, 7, "P"],
      ],
      new Map([["p1|1|PT1", 4]]),
    );
    expect(resuelto.lotes.map((l) => [l.lote, l.accion, l.cantidadActual])).toEqual([
      ["PT1", "actualizar", 4],
      ["PT2", "crear", null],
    ]);
  });

  it("un código que no está en el catálogo se reporta y no se carga", () => {
    const { resuelto } = resolver([CABECERA_REAL, ["NOEXISTE", null, "X", "L1", null, 3, "P"]]);
    expect(resuelto.lotes).toHaveLength(0);
    expect(resuelto.codigosSinProducto).toEqual(["NOEXISTE"]);
    expect(resuelto.errors[0].code).toBe("PRODUCTO_DESCONOCIDO");
  });

  it("una fuente inactiva no se confunde con una que no existe", () => {
    const { resuelto } = resolver([
      CABECERA_REAL,
      ["DHP414", "Almacén Regional Trujillo", "X", "L1", null, 3, "P"],
      ["DHP414", "Almacén Fantasma", "X", "L2", null, 3, "P"],
    ]);
    expect(resuelto.fuentesInactivas).toEqual(["Almacén Regional Trujillo"]);
    expect(resuelto.fuentesDesconocidas).toEqual(["Almacén Fantasma"]);
    expect(resuelto.lotes).toHaveLength(0);
  });

  it("avisa —sin bloquear— cuando el catálogo dice que el producto no controla lote", () => {
    const { resuelto } = resolver([
      CABECERA_REAL,
      ["BSA301", null, "ALLERGY-BIO", "2050415", null, 11, "BIOSANA"],
    ]);
    // Se carga igual: el archivo es la realidad del almacén.
    expect(resuelto.lotes).toHaveLength(1);
    expect(resuelto.productosSinControlDeLote).toEqual(["BSA301"]);
    const aviso = resuelto.warnings.find((w) => w.code === "PRODUCTO_SIN_CONTROL_DE_LOTE");
    expect(aviso?.message).toContain("BSA301");
    expect(resuelto.errors).toHaveLength(0);
  });
});

describe("resumirStockImport", () => {
  it("cuenta lotes, productos y unidades", () => {
    const { resuelto } = resolver(
      [
        CABECERA_REAL,
        ["DHP414", null, "X", "PT1", null, 10, "P"],
        ["DHP414", null, "X", "PT2", null, 7, "P"],
        ["BSA301", null, "Y", "L9", null, 3, "P"],
      ],
      new Map([
        ["p1|1|PT1", 4],
        ["p1|1|PT2", 7],
      ]),
    );
    expect(resumirStockImport(resuelto.lotes)).toEqual({
      crear: 1,
      actualizar: 1,
      sinCambio: 1,
      productos: 2,
      unidades: 20,
    });
  });
});
