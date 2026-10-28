import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { cleanEnv } from "@/lib/env";
import { sincronizarCredito } from "@/services/credito";

export const dynamic = "force-dynamic";

/**
 * La sincronización diaria de la deuda, para un programador externo.
 *
 * Dos formas de entrar, y ninguna más: un administrador con sesión (el
 * botón "Actualizar ahora" no usa esta ruta, pero sirve para probarla a
 * mano), o un cron que mande el secreto en la cabecera.
 *
 * Sin `CRON_SECRET` configurado la puerta del cron queda cerrada: una
 * comparación contra una cadena vacía dejaría pasar a cualquiera que
 * mandara la cabecera vacía.
 */
export async function POST(req: NextRequest) {
  const secreto = cleanEnv(process.env.CRON_SECRET ?? "");
  const enviado = req.headers.get("x-cron-secret") ?? "";
  const esCron = secreto !== "" && enviado === secreto;

  let actor = "cron";
  if (!esCron) {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("administrador")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    actor = user.userId;
  }

  try {
    const r = await sincronizarCredito(actor);
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
