import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { cleanEnv } from "@/lib/env";
import { sincronizarCredito } from "@/services/credito";
import { sincronizarContactosACobranzas } from "@/services/contactos-cobranzas";

export const dynamic = "force-dynamic";

/**
 * Las dos mitades del puente con cobranzas, una vez por día.
 *
 * Van juntas en una sola ruta y no en dos crons porque el plan de Vercel
 * limita cuántos cron jobs admite un proyecto, y porque el orden importa:
 * primero se trae la deuda y recién después se completan los contactos. La
 * deuda es la que decide si un pedido sale o no, así que es la que no puede
 * quedar vieja.
 *
 * El orden también evita una trampa fea: desde que existe el freno de 60
 * días, un cliente que pagó ayer y no se refrescó queda sin poder comprar
 * hoy. La copia que manda es la de la mañana, antes de que el vendedor
 * abra el primer pedido.
 *
 * Si la primera falla se sigue con la segunda: son independientes, y perder
 * las dos porque cobranzas no respondió para una es peor que perder una.
 * El desenlace de cada mitad viaja en la respuesta, y el 502 se levanta
 * recién al final, para que el log del cron muestre qué anduvo y qué no.
 */
type Mitad = { ok: true; detalle: unknown } | { ok: false; error: string };

async function correr(tarea: () => Promise<unknown>): Promise<Mitad> {
  try {
    return { ok: true, detalle: await tarea() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Tres puertas, y ninguna más: el cron de Vercel (que manda
 * `Authorization: Bearer <CRON_SECRET>`), un programador externo (que manda
 * `x-cron-secret`) o un administrador con sesión, para dispararlo a mano
 * sin esperar a la hora.
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

  const credito = await correr(() => sincronizarCredito(actor));
  const contactos = await correr(() => sincronizarContactosACobranzas(actor));
  const ok = credito.ok && contactos.ok;

  return NextResponse.json(
    { ok, credito, contactos },
    { status: ok ? 200 : 502, headers: { "Cache-Control": "no-store" } },
  );
}

/** El cron de Vercel dispara con GET. */
export async function GET(req: NextRequest) {
  return ejecutar(req);
}

/** Un programador externo o el disparo a mano usan POST. */
export async function POST(req: NextRequest) {
  return ejecutar(req);
}
