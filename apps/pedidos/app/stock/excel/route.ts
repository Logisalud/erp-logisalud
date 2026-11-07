import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getStockResumen, listStockLotesCompleto, type StockOrden } from "@/services/stock";
import { buildStockExcel, buildStockExcelFilename } from "@/services/stock-excel";

export const dynamic = "force-dynamic";

/**
 * Descarga del stock en Excel, para cualquier rol con sesión.
 *
 * El archivo que carga Administración no se guarda —el importador lo lee y
 * escribe los lotes—, así que esto no devuelve aquel archivo sino el stock
 * como está ahora, con las mismas filas que la pantalla: el filtro y el
 * orden viajan por la URL, igual que en `/stock`. Si saliera de otro
 * criterio que la tabla, el vendedor tendría dos verdades del mismo stock.
 *
 * La sesión se exige acá y no se delega al layout: una ruta de API no pasa
 * por el layout, y sin sesión las consultas saldrían como `anon`, que no
 * tiene permiso sobre `stock_lotes`.
 *
 * Si algo falla al armar el archivo, la respuesta NO es un error sino un
 * redirect de vuelta a /stock con el aviso: un 500 acá lo guarda el
 * navegador como archivo igual, y el usuario termina con un .xlsx corrupto
 * sin saber que falló. Mismo criterio que la descarga del pedido.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const busqueda = (url.searchParams.get("q") ?? "").trim();
  const orden: StockOrden = url.searchParams.get("orden") === "vencimiento" ? "vencimiento" : "producto";

  const volver = (motivo: string) => {
    const destino = new URL("/stock", request.url);
    if (busqueda) destino.searchParams.set("q", busqueda);
    if (orden !== "producto") destino.searchParams.set("orden", orden);
    destino.searchParams.set("excel", motivo);
    return NextResponse.redirect(destino, 303);
  };

  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

    const [filas, resumen] = await Promise.all([
      listStockLotesCompleto({ busqueda, orden }),
      getStockResumen(),
    ]);

    const excel = await buildStockExcel(filas, {
      busqueda,
      orden,
      ultimaCarga: resumen.ultimaActualizacion,
    });

    return new NextResponse(new Uint8Array(excel), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${buildStockExcelFilename()}"`,
        // El stock cambia con cada carga: el archivo se rearma siempre en
        // vez de servir una copia vieja.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("No se pudo generar el Excel de stock:", error);
    return volver("error");
  }
}
