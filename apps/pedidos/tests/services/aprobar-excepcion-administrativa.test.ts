import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aprobar una excepción administrativa tiene que APROBAR.
 *
 * Regresión de un error real (2026-09-21): el botón "Aprobar" llamaba a
 * `reevaluate_order`, que recalcula el estado con la misma regla que frenó
 * el pedido. Como aprobar no cambia la condición de pago del pedido ni la
 * habitual del cliente, la regla volvía a dar ADMINISTRATIVE_EXCEPTION y el
 * pedido regresaba a la bandeja. El pedido #68 acumuló TRES aprobaciones
 * registradas en el historial sin que ninguna surtiera efecto, y como nunca
 * llegó a operaciones, tampoco salió ningún correo.
 *
 * Lo que se mira acá es a qué RPC se llama y qué correo sale, que es donde
 * el bug vivía: ambas cosas eran invisibles desde la pantalla.
 */

const llamadas = {
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  notificados: [] as Array<{ orderId: string; estado: string }>,
};

let estadoQueDevuelveElRpc = "READY_FOR_OPERATIONS";

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      llamadas.rpc.push({ fn, args });
      return { data: estadoQueDevuelveElRpc, error: null };
    },
  }),
}));
vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));
vi.mock("@/services/order-notifications", () => ({
  notifyAdministrativeExceptionResolved: async (orderId: string, estado: string) => {
    llamadas.notificados.push({ orderId, estado });
    return { estado: "enviado", destinatarios: ["operaciones@logisalud.com"] };
  },
}));

import { resolveAdministrativeException } from "@/services/order-exceptions";

const PEDIDO = "824c3bc3-57d0-411c-a6e0-f7528187e15d";

beforeEach(() => {
  llamadas.rpc = [];
  llamadas.notificados = [];
  estadoQueDevuelveElRpc = "READY_FOR_OPERATIONS";
});

describe("resolveAdministrativeException — aprobar", () => {
  it("NO llama a reevaluate_order: eso era el bucle que se comía la aprobación", async () => {
    await resolveAdministrativeException({
      orderId: PEDIDO,
      decision: "APROBAR",
      motivo: "Excepción administrativa aprobada",
      actor: "admin-1",
    });

    expect(llamadas.rpc.map((l) => l.fn)).toEqual(["approve_administrative_exception"]);
    expect(llamadas.rpc.map((l) => l.fn)).not.toContain("reevaluate_order");
  });

  it("avisa por correo que el pedido se liberó", async () => {
    const { estado, notificacion } = await resolveAdministrativeException({
      orderId: PEDIDO,
      decision: "APROBAR",
      motivo: "Excepción administrativa aprobada",
      actor: "admin-1",
    });

    expect(estado).toBe("READY_FOR_OPERATIONS");
    expect(llamadas.notificados).toEqual([{ orderId: PEDIDO, estado: "READY_FOR_OPERATIONS" }]);
    expect(notificacion?.estado).toBe("enviado");
  });

  it("si la aprobación lo deja en otra cola, igual avisa y con ese estado", async () => {
    // Aprobar el plazo no aprueba un descuento pendiente ni valida al
    // cliente: el correo tiene que decir que el pedido sigue frenado.
    estadoQueDevuelveElRpc = "COMMERCIAL_EXCEPTION";

    const { estado } = await resolveAdministrativeException({
      orderId: PEDIDO,
      decision: "APROBAR",
      motivo: "Excepción administrativa aprobada",
      actor: "admin-1",
    });

    expect(estado).toBe("COMMERCIAL_EXCEPTION");
    expect(llamadas.notificados).toEqual([{ orderId: PEDIDO, estado: "COMMERCIAL_EXCEPTION" }]);
  });
});

describe("resolveAdministrativeException — devolver a borrador", () => {
  it("devuelve el pedido a DRAFT y no manda el correo de liberado", async () => {
    const { estado, notificacion } = await resolveAdministrativeException({
      orderId: PEDIDO,
      decision: "DEVOLVER",
      motivo: "Falta la orden de compra",
      actor: "admin-1",
    });

    expect(llamadas.rpc[0].fn).toBe("apply_order_transition");
    expect(llamadas.rpc[0].args.p_estado_nuevo).toBe("DRAFT");
    expect(estado).toBe("DRAFT");
    expect(llamadas.notificados).toEqual([]);
    expect(notificacion).toBeNull();
  });
});
