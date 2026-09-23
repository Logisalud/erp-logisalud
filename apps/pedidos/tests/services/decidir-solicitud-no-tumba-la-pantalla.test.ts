import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Una solicitud problemática no puede llevarse puesta la pantalla entera.
 *
 * Regresión de un error real (2026-09-23): `decidirSolicitud` lanzaba, el
 * error subía hasta el error boundary de /aprobador-comercial y la pantalla
 * se reemplazaba por "No se pudo cargar esta pantalla". Con ella desaparecían
 * las OTRAS solicitudes pendientes, que no tenían nada que ver.
 *
 * El caso que lo disparó: un pedido que seguía en DRAFT, porque el celular
 * obligatorio (migración 1040) lo dejó sin enviar con su solicitud ya creada.
 */

const llamadas: string[] = [];
let falla: Error | null = null;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", () => ({ requireUserId: async () => "usuario-1" }));
vi.mock("@/services/approvals", () => ({
  decideApprovalRequest: async (input: { decision: string }) => {
    llamadas.push(input.decision);
    if (falla) throw falla;
  },
}));

import { decidirSolicitud } from "@/app/aprobador-comercial/actions";

beforeEach(() => {
  llamadas.length = 0;
  falla = null;
});

describe("decidirSolicitud", () => {
  it("cuando sale bien, devuelve ok", async () => {
    const r = await decidirSolicitud("req-1", "APROBAR", undefined, undefined);

    expect(r).toEqual({ ok: true });
    expect(llamadas).toEqual(["APROBAR"]);
  });

  it("devuelve el error en vez de lanzarlo", async () => {
    falla = new Error("Transición DRAFT -> READY_FOR_OPERATIONS no permitida para este usuario/estado");

    const r = await decidirSolicitud("req-1", "APROBAR", undefined, undefined);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      // El mensaje de la base llega tal cual: es lo único que le dice al
      // aprobador qué pasó.
      expect(r.mensaje).toContain("DRAFT -> READY_FOR_OPERATIONS");
    }
  });
});
