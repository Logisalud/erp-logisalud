import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { cleanEnv } from "@/lib/env";
import { sincronizarContactosACobranzas } from "@/services/contactos-cobranzas";

export const dynamic = "force-dynamic";

/**
 * Completa cada cierto rato los contactos que faltan en la cartera de
 * cobranzas, con los celulares y direcciones que tiene pedidos.
 *
 * Tres puertas, y ninguna más: el cron de Vercel (que manda
 * `Authorization: Bearer <CRON_SECRET>`), un programador externo (que
 * manda `x-cron-secret`) o un administrador con sesión, para poder
 * dispararlo a mano sin esperar a la hora.
 *
 * Sin `CRON_SECRET` configurado las dos puertas del cron quedan cerradas:
 * comparar contra una cadena vacía dejaría pasar a cualquiera que mandara
 * la cabecera vacía.
 */
async function ejecutar(req: NextRequest) {
  const secreto = cleanEnv(process.env.CRON_SECRET ?? "");
  const bearer = req.headers.get("authorization") ?? "";
  const cabecera = req.headers.get("x-cron-secret") ?? "";
  const esCron = secreto !== "" && (bearer === `Bearer ${secreto}` || cabecera === secreto);

  let actor = "cron";
  if (!esCron) {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("administrador")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    actor = user.userId;
  }

  try {
    const r = await sincronizarContactosACobranzas(actor);
    return NextResponse.json({ ok: true, ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

/** El cron de Vercel dispara con GET. */
export async function GET(req: NextRequest) {
  return ejecutar(req);
}

/** Un programador externo o el disparo a mano usan POST. */
export async function POST(req: NextRequest) {
  return ejecutar(req);
}
