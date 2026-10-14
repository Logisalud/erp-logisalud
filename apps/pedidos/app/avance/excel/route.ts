import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth/session";
import { cargaVigente, detalleDeVenta } from "@/services/avance";

/**
 * El detalle de venta del mes, en Excel.
 *
 * No recibe ningún parámetro de vendedor a propósito: lo que se baja es lo
 * que la RLS deja ver a quien está pidiendo. Un vendedor baja lo suyo; un
 * administrador, todo. Así no hay forma de bajarse el detalle de otro
 * cambiando un número en la URL.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No hay sesión." }, { status: 401 });

  const carga = await cargaVigente();
  if (!carga) {
    return NextResponse.json({ error: "Todavía no hay un avance publicado." }, { status: 404 });
  }

  const filas = await detalleDeVenta(carga.id, { limite: 50000 });

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Detalle de venta");
  hoja.columns = [
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Tipo documento", key: "tipo", width: 18 },
    { header: "N° documento", key: "nro", width: 16 },
    { header: "RUC", key: "ruc", width: 13 },
    { header: "Cliente", key: "cliente", width: 42 },
    { header: "Código", key: "cod", width: 12 },
    { header: "Producto", key: "producto", width: 42 },
    { header: "Familia", key: "familia", width: 12 },
    { header: "Línea", key: "linea", width: 20 },
    { header: "Cantidad", key: "cantidad", width: 11 },
    { header: "Neto", key: "neto", width: 14 },
    { header: "Vendedor", key: "vendedor", width: 24 },
    { header: "Cód. vendedor", key: "codigo", width: 14 },
  ];
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];

  for (const f of filas) {
    hoja.addRow({
      fecha: f.fecha ? new Date(`${f.fecha}T00:00:00`) : null,
      tipo: f.tipoDocumento,
      nro: f.nroDocumento,
      ruc: f.ruc,
      cliente: f.razonSocial,
      cod: f.codProducto,
      producto: f.producto,
      familia: f.familia,
      linea: f.linea,
      cantidad: f.cantidad,
      neto: f.neto,
      vendedor: f.vendedor,
      codigo: f.codigo,
    });
  }
  hoja.getColumn("fecha").numFmt = "dd/mm/yyyy";
  hoja.getColumn("neto").numFmt = "#,##0.00";
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnCount } };

  const buffer = Buffer.from(await libro.xlsx.writeBuffer());
  const nombre = `detalle-venta-${carga.periodo}-al-${carga.fechaCorte}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
