import { describe, expect, it } from "vitest";
import {
  encontrarCabeceras,
  parsearCantidad,
  parseStockRows,
  resolverStockImport,
  resumirStockImport,
  type RawRow,
} from "@/domain/stock-import";

const PRODUCTOS = [
  { id: "p1", codigo_interno: "DHP014", descripcion: "A - FIEBRIN 1G/ 2ML CJA X 1 AMP." },
  { id: "p2", codigo_interno: "BSA301", descripcion: "ALLERGY-BIO 5 MG CJA X 60 TAB REC" },
];

const FUENTES = [
  { id: 1, nombre: "Almacén Central Lima", estado: "activo" },
  { id: 2, nombre: "Almacén Arequipa", estado: "activo" },
  { id: 3, nombre: "Almacén Regional Trujillo", estado: "inactivo" },
];

function catalogos(existentes: Array<[string, number]> = []) {
  return { productos: PRODUCTOS, fuentes: FUENTES, existentes: new Map(existentes) };
}

describe("encontrarCabeceras", () => {
  it("encuentra las columnas por el nombre canónico", () => {
    const rows: RawRow[] = [["codigo_producto", "inventory_source", "cantidad_disponible"]];
    expect(encontrarCabeceras(rows)).toEqual({
      headerRowNumber: 1,
      columns: { codigoProducto: 0, fuente: 1, cantidad: 2 },
    });
  });

  it("acepta variantes, tildes y mayúsculas", () => {
    const rows: RawRow[] = [["Código", "Fuente de stock", "Cantidad"]];
    expect(encontrarCabeceras(rows)?.columns).toEqual({
      codigoProducto: 0,
      fuente: 1,
      cantidad: 2,
    });
  });

  it("no exige que la cabecera sea la primera fila", () => {
    const rows: RawRow[] = [
      ["STOCK AL 02/09/2026"],
      [],
      ["codigo", "almacen", "stock"],
    ];
    expect(encontrarCabeceras(rows)?.headerRowNumber).toBe(3);
  });

  it("devuelve null si falta una de las tres columnas", () => {
    expect(encontrarCabeceras([["codigo_producto", "cantidad_disponible"]])).toBeNull();
  });
});

describe("parsearCantidad", () => {
  it("lee celdas numéricas y texto simple", () => {
    expect(parsearCantidad(12)).toBe(12);
    expect(parsearCantidad("12")).toBe(12);
    expect(parsearCantidad("0")).toBe(0);
  });

  it("tolera coma decimal y espacios", () => {
    expect(parsearCantidad("1,5")).toBe(1.5);
    expect(parsearCantidad(" 1 200 ")).toBe(1200);
  });

  it("con los dos separadores, la coma es el decimal", () => {
    expect(parsearCantidad("1.200,50")).toBe(1200.5);
  });

  it("rechaza lo que no es un número en vez de adivinar", () => {
    expect(parsearCantidad("s/d")).toBeNull();
    expect(parsearCantidad("")).toBeNull();
    expect(parsearCantidad(null)).toBeNull();
    expect(parsearCantidad("12 cajas")).toBeNull();
  });
});

describe("parseStockRows", () => {
  it("lee las filas y numera como el Excel que ve el usuario", () => {
    const rows: RawRow[] = [
      ["codigo_producto", "inventory_source", "cantidad_disponible"],
      ["DHP014", "Almacén Central Lima", 120],
      ["bsa301", "Almacén Arequipa", "45"],
    ];
    const r = parseStockRows(rows);
    expect(r.headerRowNumber).toBe(1);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { rowNumber: 2, codigoProducto: "DHP014", fuente: "Almacén Central Lima", cantidad: 120 },
      { rowNumber: 3, codigoProducto: "BSA301", fuente: "Almacén Arequipa", cantidad: 45 },
    ]);
  });

  it("saltea las filas vacías del final sin llenar la pantalla de errores", () => {
    const rows: RawRow[] = [
      ["codigo_producto", "inventory_source", "cantidad_disponible"],
      ["DHP014", "Almacén Central Lima", 10],
      [],
      [null, null, null],
      ["", "", ""],
    ];
    const r = parseStockRows(rows);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("reporta la fila incompleta y sigue con el resto", () => {
    const rows: RawRow[] = [
      ["codigo_producto", "inventory_source", "cantidad_disponible"],
      ["", "Almacén Central Lima", 10],
      ["DHP014", "", 10],
      ["DHP014", "Almacén Central Lima", "s/d"],
      ["DHP014", "Almacén Central Lima", -5],
      ["BSA301", "Almacén Arequipa", 7],
    ];
    const r = parseStockRows(rows);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.code)).toEqual([
      "SIN_CODIGO",
      "SIN_FUENTE",
      "CANTIDAD_INVALIDA",
      "CANTIDAD_NEGATIVA",
    ]);
  });

  it("sin cabeceras reconocibles no inventa columnas", () => {
    const r = parseStockRows([["cosa", "otra"], ["x", "y"]]);
    expect(r.headerRowNumber).toBeNull();
    expect(r.rows).toEqual([]);
    expect(r.errors[0].code).toBe("SIN_CABECERAS");
  });
});

describe("resolverStockImport", () => {
  const filas = [
    { rowNumber: 2, codigoProducto: "DHP014", fuente: "Almacén Central Lima", cantidad: 120 },
    { rowNumber: 3, codigoProducto: "BSA301", fuente: "Almacén Arequipa", cantidad: 45 },
  ];

  it("distingue crear de actualizar según lo que ya está cargado", () => {
    const r = resolverStockImport(filas, catalogos([["p1|1", 80]]));
    expect(r.items.map((i) => [i.codigoProducto, i.accion, i.cantidadActual])).toEqual([
      ["DHP014", "actualizar", 80],
      ["BSA301", "crear", null],
    ]);
  });

  it("cruza la fuente sin importar tildes ni mayúsculas", () => {
    const r = resolverStockImport(
      [{ rowNumber: 2, codigoProducto: "DHP014", fuente: "almacen central lima", cantidad: 5 }],
      catalogos(),
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].inventorySourceId).toBe(1);
  });

  it("reporta los códigos que no existen y no los descarta en silencio", () => {
    const r = resolverStockImport(
      [{ rowNumber: 2, codigoProducto: "NOEXISTE", fuente: "Almacén Central Lima", cantidad: 5 }],
      catalogos(),
    );
    expect(r.items).toEqual([]);
    expect(r.codigosSinProducto).toEqual(["NOEXISTE"]);
    expect(r.errors[0].code).toBe("PRODUCTO_DESCONOCIDO");
  });

  it("una fuente inactiva no es una fuente inexistente, y se dice distinto", () => {
    const r = resolverStockImport(
      [
        {
          rowNumber: 2,
          codigoProducto: "DHP014",
          fuente: "Almacén Regional Trujillo",
          cantidad: 5,
        },
      ],
      catalogos(),
    );
    expect(r.items).toEqual([]);
    expect(r.fuentesDesconocidas).toEqual([]);
    expect(r.fuentesInactivas).toEqual(["Almacén Regional Trujillo"]);
    expect(r.errors[0].code).toBe("FUENTE_INACTIVA");
  });

  it("reporta las fuentes desconocidas", () => {
    const r = resolverStockImport(
      [{ rowNumber: 2, codigoProducto: "DHP014", fuente: "Depósito Piura", cantidad: 5 }],
      catalogos(),
    );
    expect(r.items).toEqual([]);
    expect(r.fuentesDesconocidas).toEqual(["Depósito Piura"]);
    expect(r.errors[0].code).toBe("FUENTE_DESCONOCIDA");
  });

  it("con el mismo producto+fuente repetido gana el último valor, y se avisa", () => {
    const r = resolverStockImport(
      [
        { rowNumber: 2, codigoProducto: "DHP014", fuente: "Almacén Central Lima", cantidad: 10 },
        { rowNumber: 5, codigoProducto: "DHP014", fuente: "Almacén Central Lima", cantidad: 99 },
      ],
      catalogos(),
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].cantidad).toBe(99);
    expect(r.errors[0].code).toBe("DUPLICADO_EN_ARCHIVO");
    expect(r.errors[0].message).toContain("fila 2");
  });
});

describe("resumirStockImport", () => {
  it("cuenta creados, actualizados y los que quedan igual", () => {
    const r = resolverStockImport(
      [
        { rowNumber: 2, codigoProducto: "DHP014", fuente: "Almacén Central Lima", cantidad: 120 },
        { rowNumber: 3, codigoProducto: "BSA301", fuente: "Almacén Arequipa", cantidad: 45 },
      ],
      catalogos([
        ["p1|1", 80],
        ["p2|2", 45],
      ]),
    );
    expect(resumirStockImport(r.items)).toEqual({ crear: 0, actualizar: 1, sinCambio: 1 });
  });
});
