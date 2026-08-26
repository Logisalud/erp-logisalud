/**
 * Lectura de .xlsx a filas planas (RawRow[]). Deliberadamente sin
 * dependencias de Next.js/Supabase — solo exceljs — para que se pueda
 * importar y ejecutar fuera del runtime de Next (ej. scripts de
 * verificación puntuales) sin arrastrar `next/headers`.
 */
import ExcelJS from "exceljs";
import type { RawRow } from "@/domain/price-list-import";

const PRICE_SHEET_NAMES = [/PRECIOS X CANALES/i, /FORMATO LGS/i];

function cellPlainValue(value: ExcelJS.CellValue): RawRow[number] {
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

function pickWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  for (const pattern of PRICE_SHEET_NAMES) {
    const match = workbook.worksheets.find((ws) => pattern.test(ws.name));
    if (match) return match;
  }
  return workbook.worksheets[0];
}

function worksheetToRows(worksheet: ExcelJS.Worksheet): RawRow[] {
  const rows: RawRow[] = Array.from({ length: worksheet.rowCount }, () => []);
  const maxCol = worksheet.columnCount;

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const arr: RawRow = [];
    for (let c = 1; c <= maxCol; c++) {
      arr.push(cellPlainValue(row.getCell(c).value));
    }
    rows[rowNumber - 1] = arr;
  });

  return rows;
}

export async function parseWorkbookToRows(buffer: ArrayBuffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = pickWorksheet(workbook);
  return worksheetToRows(worksheet);
}
