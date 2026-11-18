import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { cleanEnv } from "@/lib/env";
import { sincronizarCarteraDesdeCobranzas } from "@/services/cartera-desde-cobranzas";

export const dynamic = "force-dynamic";

/**
 * Completa cada día en pedidos la dirección fiscal y el ubigeo que faltan,
 * con los que tiene la cartera de cobranzas.
 *
 * El cron diario ya la dispara: la corre `/api/cron/diario`, después de la
 * deuda y de los contactos. Esta ruta queda para el disparo a mano, cuando
 * hace falta completar la cartera sin esperar a la hora.
 *
 * Tres puertas, y ninguna más: el cron de Vercel (que manda
 * `Authorization: Bearer <CRON_SECRET>`), un programador externo (que
 * manda `x-cron-secret`) o un administrador con sesión.
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

  // `audit_logs.actor` es uuid y referencia a una persona: cuando corre
  // el cron no hay ninguna, y el texto "cron" reventaba el insert. Queda
  // null, y quién lo disparó se guarda aparte, en los datos del registro.
  let actor: string | null = null;
  if (!esCron) {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("administrador")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    actor = user.userId;
  }

  try {
    const r = await sincronizarCarteraDesdeCobranzas(actor);
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
