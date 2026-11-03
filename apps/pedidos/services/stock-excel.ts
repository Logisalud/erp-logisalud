import "server-only";
import ExcelJS from "exceljs";
import { COLOR_VERDE } from "@/domain/order-email";
import { displayNombreProducto } from "@/domain/products";
import type { StockLoteRow, StockOrden } from "./stock";

/**
 * El stock del almacén, en Excel.
 *
 * El archivo diario que carga Administración no se guarda: el importador lo
 * lee y escribe los lotes. Así que esto no devuelve *aquel* archivo, sino el
 * stock como está en este momento —que es lo que el vendedor necesita— y con
 * las mismas filas que la pantalla: mismo filtro, mismo orden.
 *
 * Una fila por LOTE y no por producto, igual que la pantalla y que el
 * archivo original: el mismo código aparece varias veces, cada vez con su
 * lote y su vencimiento, y ese detalle es justamente el que sirve para saber
 * qué sale primero.
 */

const VERDE = COLOR_VERDE.replace("#", "");

const FECHA_LIMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** stock-2026-11-03.xlsx */
export function buildStockExcelFilename(ahora: Date = new Date()): string {
  const fecha = Number.isNaN(ahora.getTime()) ? "sin-fecha" : FECHA_LIMA.format(ahora);
  return `stock-${fecha}.xlsx`;
}

export async function buildStockExcel(
  filas: StockLoteRow[],
  contexto: { busqueda?: string; orden?: StockOrden; ultimaCarga?: string | null },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LOGISALUD Pedidos";
  wb.created = new Date();

  const ws = wb.addWorksheet("Stock");

  // Una línea de contexto arriba: de cuándo es el stock y si está filtrado.
  // Sin esto, un archivo reenviado por WhatsApp no dice de qué día es, y
  // alguien termina ofreciendo mercadería de la semana pasada.
  const cargado = contexto.ultimaCarga
    ? new Date(contexto.ultimaCarga).toLocaleString("es-PE", { timeZone: "America/Lima" })
    : "sin registro";
  const filtro = (contexto.busqueda ?? "").trim();

  const titulo = ws.addRow([`Stock disponible — última carga: ${cargado}`]);
  titulo.font = { bold: true, size: 12 };
  ws.mergeCells(titulo.number, 1, titulo.number, 7);

  const subtitulo = ws.addRow([
    filtro
      ? `Filtrado por “${filtro}” · ${filas.length} lote${filas.length === 1 ? "" : "s"}`
      : `Todo el almacén · ${filas.length} lote${filas.length === 1 ? "" : "s"}`,
  ]);
  subtitulo.font = { size: 10, color: { argb: "FF666666" } };
  ws.mergeCells(subtitulo.number, 1, subtitulo.number, 7);

  ws.addRow([]);

  const encabezado = ws.addRow([
    "Código",
    "Producto",
    "Lote",
    "Vence",
    "Cantidad",
    "Fuente",
    "Proveedor",
  ]);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${VERDE}` } };
    celda.alignment = { vertical: "middle" };
  });

  for (const f of filas) {
    const fila = ws.addRow([
      f.codigo,
      displayNombreProducto(f.descripcion, f.codigo),
      f.lote,
      // Texto y no Date: la fecha ya viene como `YYYY-MM-DD` y convertirla
      // la correría un día al pasar por UTC, que es el mismo tropiezo que
      // documenta `domain/fechas.ts`.
      f.fechaVencimiento ?? "",
      f.cantidad,
      f.fuente,
      f.proveedor ?? "",
    ]);
    fila.getCell(5).numFmt = "#,##0";
  }

  ws.columns = [
    { width: 14 },
    { width: 46 },
    { width: 16 },
    { width: 12 },
    { width: 11 },
    { width: 18 },
    { width: 18 },
  ];

  // El filtro de Excel sobre la tabla, para que cada uno la ordene como
  // necesite sin pedirle nada a nadie.
  if (filas.length > 0) {
    ws.autoFilter = {
      from: { row: encabezado.number, column: 1 },
      to: { row: encabezado.number + filas.length, column: 7 },
    };
  }
  ws.views = [{ state: "frozen", ySplit: encabezado.number }];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
