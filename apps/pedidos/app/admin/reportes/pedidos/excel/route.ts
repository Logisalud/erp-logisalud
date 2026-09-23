import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { leerRangoDeFechas, nombreArchivoReporte } from "@/domain/reporte-pedidos";
import { construirExcelPedidos } from "@/services/reportes";

/** Reporte de pedidos enviados, una fila por línea de producto. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No hay sesión." }, { status: 401 });
  if (!user.roles.includes("administrador")) {
    return NextResponse.json({ error: "Solo administración puede exportar el reporte." }, { status: 403 });
  }

  const rango = leerRangoDeFechas(new URL(request.url).searchParams);
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const { buffer } = await construirExcelPedidos(rango);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoReporte(rango, hoy)}"`,
      "Cache-Control": "no-store",
    },
  });
}
