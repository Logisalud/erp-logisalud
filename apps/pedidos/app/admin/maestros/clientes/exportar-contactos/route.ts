import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { construirExcelContactos } from "@/services/reportes";

/**
 * Descarga de los clientes con celular, para campañas y WhatsApp.
 *
 * El guard va acá y no alcanza con el layout de /admin: un route handler no
 * pasa por el layout, así que sin esto la URL sería pública para cualquiera
 * con sesión.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No hay sesión." }, { status: 401 });
  if (!user.roles.includes("administrador")) {
    return NextResponse.json({ error: "Solo administración puede exportar contactos." }, { status: 403 });
  }

  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const { buffer } = await construirExcelContactos();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="contactos-clientes-${hoy}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
