import { describe, expect, it } from "vitest";
import { leerCsv } from "@/services/stock-import";
import { parseStockRows, resolverStockImport } from "@/domain/stock-import";

/**
 * El parser de CSV vive en services/ porque es lectura de archivo, pero es
 * puro y se prueba directo: el separador que traiga el archivo es la clase
 * de detalle que rompe un importador en producción y en ningún test.
 */
describe("leerCsv", () => {
  it("lee un CSV con comas", () => {
    const rows = leerCsv("CODIGO,FUENTE,LOTE,CANTIDA\nDHP014,Lima,PT1,120\n");
    expect(rows).toEqual([
      ["CODIGO", "FUENTE", "LOTE", "CANTIDA"],
      ["DHP014", "Lima", "PT1", "120"],
    ]);
  });

  it("lee un CSV con punto y coma, como exporta Excel en español", () => {
    const rows = leerCsv("CODIGO;FUENTE;LOTE;CANTIDA\nDHP014;Lima;PT1;120\n");
    expect(rows[1]).toEqual(["DHP014", "Lima", "PT1", "120"]);
  });

  it("respeta las comas dentro de un campo entrecomillado", () => {
    const rows = leerCsv(
      'CODIGO,FUENTE,LOTE,CANTIDA\nDHP014,"Almacén Central, Lima",PT1,120\n',
    );
    expect(rows[1]).toEqual(["DHP014", "Almacén Central, Lima", "PT1", "120"]);
  });

  it("no pierde la última fila si el archivo no termina en salto de línea", () => {
    const rows = leerCsv("CODIGO,FUENTE,LOTE,CANTIDA\nDHP014,Lima,PT1,1");
    expect(rows).toHaveLength(2);
  });

  it("descarta el BOM que mete Excel al guardar como CSV UTF-8", () => {
    const rows = leerCsv("﻿CODIGO,FUENTE,LOTE,CANTIDA\nDHP014,Lima,PT1,1");
    expect(rows[0][0]).toBe("CODIGO");
  });
});

describe("CSV completo, de archivo a decisión", () => {
  it("un archivo con la forma del stock diario real termina en lotes resueltos", () => {
    // Mismas columnas que el archivo real: CANTIDA sin la D, FV, y la
    // FUENTE en blanco en la mayoría de las filas.
    const csv = [
      "STOCK AL 09/09/2026",
      "",
      "CODIGO;FUENTE;DESCRIPCION;LOTE;FV;CANTIDA;PROVEEDOR",
      "DHP414;;ACIDO TRANEXAMICO;PT12502;31/12/2027;1;DIPHASAC - GENERICO",
      "DHP414;;ACIDO TRANEXAMICO;PT12412;30/10/2027;180;DIPHASAC - GENERICO",
      "DHP414;;ACIDO TRANEXAMICO;PT12502;31/12/2027;21;DIPHASAC - GENERICO",
      "BSA301;Almacen Central Lima;ALLERGY-BIO;2050415;31/05/2028;11;BIOSANA - FARMA",
      "NOEXISTE;;LO QUE SEA;X1;31/05/2028;3;OTRO",
      "",
    ].join("\n");

    const parsed = parseStockRows(leerCsv(csv));
    expect(parsed.headerRowNumber).toBe(3);
    expect(parsed.rows).toHaveLength(5);

    const central = { id: 1, nombre: "Almacén Central Lima", estado: "activo" };
    const resuelto = resolverStockImport(parsed.rows, {
      productos: [
        { id: "p1", codigo_interno: "DHP414", descripcion: "ACIDO TRANEXAMICO", controla_lote: true },
        { id: "p2", codigo_interno: "BSA301", descripcion: "ALLERGY-BIO", controla_lote: true },
      ],
      fuentes: [central],
      fuentePorDefecto: central,
      existentes: new Map([["p1|1|PT12412", 100]]),
    });

    expect(
      resuelto.lotes.map((l) => [l.codigoProducto, l.lote, l.cantidad, l.fechaVencimiento, l.accion]),
    ).toEqual([
      // Las dos filas del lote PT12502 se SUMAN: 1 + 21.
      ["DHP414", "PT12502", 22, "2027-12-31", "crear"],
      ["DHP414", "PT12412", 180, "2027-10-30", "actualizar"],
      ["BSA301", "2050415", 11, "2028-05-31", "crear"],
    ]);
    expect(resuelto.codigosSinProducto).toEqual(["NOEXISTE"]);
    // Todas van al almacén por defecto, tengan o no la columna llena.
    expect(new Set(resuelto.lotes.map((l) => l.inventorySourceId))).toEqual(new Set([1]));
    expect(resuelto.warnings.some((w) => w.code === "LOTE_REPETIDO_EN_ARCHIVO")).toBe(true);
  });
});
