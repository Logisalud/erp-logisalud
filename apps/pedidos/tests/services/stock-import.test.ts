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
    const rows = leerCsv("codigo_producto,inventory_source,cantidad_disponible\nDHP014,Lima,120\n");
    expect(rows).toEqual([
      ["codigo_producto", "inventory_source", "cantidad_disponible"],
      ["DHP014", "Lima", "120"],
    ]);
  });

  it("lee un CSV con punto y coma, como exporta Excel en español", () => {
    const rows = leerCsv("codigo_producto;inventory_source;cantidad_disponible\nDHP014;Lima;120\n");
    expect(rows[1]).toEqual(["DHP014", "Lima", "120"]);
  });

  it("respeta las comas dentro de un campo entrecomillado", () => {
    const rows = leerCsv(
      'codigo_producto,inventory_source,cantidad_disponible\nDHP014,"Almacén Central, Lima",120\n',
    );
    expect(rows[1]).toEqual(["DHP014", "Almacén Central, Lima", "120"]);
  });

  it("no pierde la última fila si el archivo no termina en salto de línea", () => {
    const rows = leerCsv("codigo,fuente,cantidad\nDHP014,Lima,1");
    expect(rows).toHaveLength(2);
  });

  it("descarta el BOM que mete Excel al guardar como CSV UTF-8", () => {
    const rows = leerCsv("﻿codigo,fuente,cantidad\nDHP014,Lima,1");
    expect(rows[0][0]).toBe("codigo");
  });
});

describe("CSV completo, de archivo a decisión", () => {
  it("un archivo con punto y coma y coma decimal termina en items resueltos", () => {
    const csv = [
      "STOCK AL 02/09/2026",
      "",
      "codigo;fuente;cantidad",
      "DHP014;Almacen Central Lima;120",
      "BSA301;Almacen Central Lima;1.200,50",
      "NOEXISTE;Almacen Central Lima;3",
      "",
    ].join("\n");

    const parsed = parseStockRows(leerCsv(csv));
    expect(parsed.headerRowNumber).toBe(3);
    expect(parsed.rows).toHaveLength(3);

    const resuelto = resolverStockImport(parsed.rows, {
      productos: [
        { id: "p1", codigo_interno: "DHP014", descripcion: "A - FIEBRIN" },
        { id: "p2", codigo_interno: "BSA301", descripcion: "ALLERGY-BIO" },
      ],
      fuentes: [{ id: 1, nombre: "Almacén Central Lima" }],
      existentes: new Map([["p1|1", 80]]),
    });

    expect(resuelto.items.map((i) => [i.codigoProducto, i.cantidad, i.accion])).toEqual([
      ["DHP014", 120, "actualizar"],
      ["BSA301", 1200.5, "crear"],
    ]);
    expect(resuelto.codigosSinProducto).toEqual(["NOEXISTE"]);
  });
});
