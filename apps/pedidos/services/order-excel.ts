import "server-only";
import ExcelJS from "exceljs";
import {
  COLOR_VERDE,
  NOTA_NO_COMPROBANTE,
  computeOrderTotals,
  formatFechaHora,
  precioEspecialLabel,
  type OrderEmailData,
} from "@/domain/order-email";

/**
 * Excel del pedido, para adjuntar al correo que sale al enviarse.
 *
 * Vive en services/ y no en domain/ porque depende de exceljs (que ya está
 * en el stack, se usa para importar listas de precios). Los importes NO se
 * recalculan acá: se suman las líneas que ya grabó submit_order, igual que
 * el cuerpo del correo, para que el adjunto no pueda contradecir a la BD.
 */

const VERDE = COLOR_VERDE.replace("#", "");

/** pedido-1042-2026-08-06.xlsx */
export function buildOrderExcelFilename(data: OrderEmailData): string {
  const d = new Date(data.fechaEnvio);
  const fecha = Number.isNaN(d.getTime())
    ? "sin-fecha"
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
  return `pedido-${data.numero}-${fecha}.xlsx`;
}

export async function buildOrderExcel(data: OrderEmailData): Promise<Buffer> {
  const totals = computeOrderTotals(data.items);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LOGISALUD Pedidos";
  const sheet = workbook.addWorksheet(`Pedido ${data.numero}`);

  sheet.columns = [
    { width: 18 },
    { width: 44 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 34 },
  ];

  const titulo = sheet.addRow([`LOGISALUD — Pedido #${data.numero}`]);
  titulo.font = { bold: true, size: 14, color: { argb: `FF${VERDE}` } };
  sheet.mergeCells(titulo.number, 1, titulo.number, 8);

  sheet.addRow([`Enviado el ${formatFechaHora(data.fechaEnvio)}`]);
  sheet.addRow([]);

  function dato(label: string, value: string | null) {
    const row = sheet.addRow([label, value && value.trim() !== "" ? value : "—"]);
    row.getCell(1).font = { bold: true };
    sheet.mergeCells(row.number, 2, row.number, 8);
  }

  dato("Cliente", data.cliente.razonSocial);
  dato("RUC / documento", data.cliente.rucODocumento);
  dato("Dirección de entrega", data.cliente.direccionEntrega);
  dato("Canal", data.cliente.canal);
  dato("Zona", data.cliente.zona);
  dato("Vendedor", data.vendedor);
  dato("Condición de pago", data.condicionPago);
  sheet.addRow([]);

  const header = sheet.addRow([
    "Código",
    "Descripción",
    "Cantidad",
    "P. unitario",
    "IGV",
    "Subtotal",
    "Total",
    "Precio especial",
  ]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${VERDE}` } };
    cell.alignment = { vertical: "middle" };
  });

  for (const item of data.items) {
    const especial = precioEspecialLabel(item.precioEspecial);
    const row = sheet.addRow([
      item.codigo,
      item.descripcion,
      item.cantidad,
      item.precioUnitario,
      item.igv,
      item.subtotal,
      item.total,
      especial ?? "",
    ]);
    for (const col of [4, 5, 6, 7]) {
      row.getCell(col).numFmt = '"S/ "#,##0.00';
    }

    // Una línea negociada no puede pasar desapercibida entre veinte a precio
    // de lista: se pinta la fila entera, no sólo la celda de la nota. El
    // ámbar es el mismo que usan los estados de excepción en pantalla.
    if (especial) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      });
      row.getCell(8).font = { bold: true, color: { argb: "FF92400E" } };
    }
  }

  sheet.addRow([]);

  function totalRow(label: string, value: number, bold = false) {
    const row = sheet.addRow(["", "", "", "", "", label, value]);
    row.getCell(6).font = { bold: true };
    row.getCell(7).numFmt = '"S/ "#,##0.00';
    if (bold) {
      row.getCell(7).font = { bold: true, color: { argb: `FF${VERDE}` } };
    }
  }

  totalRow("Subtotal", totals.subtotal);
  totalRow("IGV", totals.igv);
  totalRow("Total", totals.total, true);

  sheet.addRow([]);
  const nota = sheet.addRow([NOTA_NO_COMPROBANTE]);
  nota.font = { italic: true, size: 9 };
  sheet.mergeCells(nota.number, 1, nota.number, 8);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
