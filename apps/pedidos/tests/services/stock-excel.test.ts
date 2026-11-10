import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildStockExcel, buildStockExcelFilename } from "@/services/stock-excel";
import type { StockLoteRow } from "@/services/stock";

function lote(overrides: Partial<StockLoteRow> = {}): StockLoteRow {
  return {
    id: "l-1",
    codigo: "DHP216",
    descripcion: "Dapha 10 mg x 30 tabletas",
    lote: "L-2026-04",
    fechaVencimiento: "2027-03-31",
    cantidad: 1240,
    fuente: "Almacén Lima",
    proveedor: "Diphasac",
    fechaActualizacion: "2026-11-03T15:08:48Z",
    ...overrides,
  };
}

async function abrir(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const filas: string[][] = [];
  ws.eachRow((fila) => {
    const celdas: string[] = [];
    fila.eachCell({ includeEmpty: true }, (c) => celdas.push(String(c.value ?? "")));
    filas.push(celdas);
  });
  return { ws, filas };
}

describe("buildStockExcel", () => {
  it("una fila por lote, con los datos de la pantalla", async () => {
    const buffer = await buildStockExcel([lote(), lote({ id: "l-2", lote: "L-2026-05", cantidad: 80 })], {
      ultimaCarga: "2026-11-03T15:08:48Z",
    });
    const { filas } = await abrir(buffer);

    const encabezado = filas.find((f) => f[0] === "Código");
    expect(encabezado).toEqual(["Código", "Producto", "Lote", "Vence", "Cantidad", "Fuente", "Proveedor"]);

    const datos = filas.filter((f) => f[0] === "DHP216");
    expect(datos).toHaveLength(2);
    expect(datos[0][2]).toBe("L-2026-04");
    expect(datos[0][3]).toBe("2027-03-31");
    expect(datos[0][4]).toBe("1240");
    expect(datos[1][2]).toBe("L-2026-05");
  });

  it("dice de cuándo es el stock: un archivo reenviado sin fecha no sirve", async () => {
    const buffer = await buildStockExcel([lote()], { ultimaCarga: "2026-11-03T15:08:48Z" });
    const { filas } = await abrir(buffer);
    expect(filas[0][0]).toContain("última carga");
  });

  it("deja dicho que está filtrado, para que nadie lo lea como todo el almacén", async () => {
    const buffer = await buildStockExcel([lote()], { busqueda: "dapha", ultimaCarga: null });
    const { filas } = await abrir(buffer);
    expect(filas[1][0]).toContain("dapha");
    expect(filas[1][0]).toContain("1 lote");
  });

  it("sin filtro lo dice igual, y cuenta los lotes", async () => {
    const buffer = await buildStockExcel([lote(), lote({ id: "l-2" })], { ultimaCarga: null });
    const { filas } = await abrir(buffer);
    expect(filas[1][0]).toContain("Todo el almacén");
    expect(filas[1][0]).toContain("2 lotes");
  });

  it("un lote sin vencimiento sale vacío, no como fecha inventada", async () => {
    const buffer = await buildStockExcel([lote({ fechaVencimiento: null, proveedor: null })], {
      ultimaCarga: null,
    });
    const { filas } = await abrir(buffer);
    const fila = filas.find((f) => f[0] === "DHP216")!;
    expect(fila[3]).toBe("");
    expect(fila[6]).toBe("");
  });

  it("el almacén vacío no rompe el archivo", async () => {
    const buffer = await buildStockExcel([], { ultimaCarga: null });
    const { ws, filas } = await abrir(buffer);
    expect(filas.find((f) => f[0] === "Código")).toBeTruthy();
    // Sin filas no se pone autofiltro: un rango de cero filas lo rechaza Excel.
    expect(ws.autoFilter).toBeFalsy();
  });

  it("el nombre del archivo lleva la fecha de Lima", () => {
    expect(buildStockExcelFilename(new Date("2026-11-04T02:00:00Z"))).toBe("stock-2026-11-03.xlsx");
  });
});
