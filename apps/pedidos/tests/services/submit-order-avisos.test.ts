import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cada freno pide su propia aprobación por correo.
 *
 * Los tres estados que frenan un pedido tienen que avisar distinto, porque
 * los lee gente distinta y cada uno tiene que decir qué hay que decidir:
 *
 *   - excepción comercial  -> "Descuento por aprobar"
 *   - excepción administrativa -> "Plazo por aprobar", con los días concretos
 *   - cliente sin validar  -> el correo de pedido enviado, que ya saca su
 *     propio recuadro "CLIENTE NUEVO — hay que revisarlo y aprobarlo"
 *
 * El caso administrativo es una regresión: mandaba el correo genérico de
 * "pedido enviado" con el estado en letra chica, así que Administración
 * tenía que darse cuenta sola mirando la bandeja.
 */

const enviados: Array<{ aviso: string; estado: string; motivo?: string | null }> = [];
let respuestaRpc: Record<string, unknown> = {};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ rpc: async () => ({ data: respuestaRpc, error: null }) }),
}));
vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));
vi.mock("@/services/order-notifications", () => ({
  notifyOrderSubmitted: async (_id: string, estado: string) => {
    enviados.push({ aviso: "pedido_enviado", estado });
    return { estado: "enviado", destinatarios: ["ops@logisalud.com"] };
  },
  notifyDiscountRequested: async (_id: string, estado: string) => {
    enviados.push({ aviso: "descuento_solicitado", estado });
    return { estado: "enviado", destinatarios: ["ops@logisalud.com"] };
  },
  notifyPaymentTermsApprovalRequested: async (
    _id: string,
    estado: string,
    _actor: string,
    motivo?: string | null,
  ) => {
    enviados.push({ aviso: "aprobacion_plazo_solicitada", estado, motivo });
    return { estado: "enviado", destinatarios: ["ops@logisalud.com"] };
  },
}));

import { submitOrder } from "@/services/orders";

beforeEach(() => {
  enviados.length = 0;
});

describe("submitOrder — qué correo sale según el estado", () => {
  it("excepción administrativa pide aprobar el plazo, con los días concretos", async () => {
    respuestaRpc = {
      estadoResultado: "ADMINISTRATIVE_EXCEPTION",
      motivo: "Pide 60 días de plazo y el cliente tiene 30 aprobados",
      priceDrift: [],
    };

    const r = await submitOrder("pedido-1", "vendedor-1");

    expect(enviados).toEqual([
      {
        aviso: "aprobacion_plazo_solicitada",
        estado: "ADMINISTRATIVE_EXCEPTION",
        motivo: "Pide 60 días de plazo y el cliente tiene 30 aprobados",
      },
    ]);
    expect(r.motivo).toBe("Pide 60 días de plazo y el cliente tiene 30 aprobados");
  });

  it("el motivo lo pone submit_order, no se recalcula acá", async () => {
    // Si la base no lo devuelve, el correo sale igual pero sin el detalle:
    // preferimos un aviso sin números a no avisar.
    respuestaRpc = { estadoResultado: "ADMINISTRATIVE_EXCEPTION", priceDrift: [] };

    await submitOrder("pedido-1", "vendedor-1");

    expect(enviados[0]).toEqual({
      aviso: "aprobacion_plazo_solicitada",
      estado: "ADMINISTRATIVE_EXCEPTION",
      motivo: null,
    });
  });

  it("excepción comercial sigue pidiendo aprobar el descuento", async () => {
    respuestaRpc = {
      estadoResultado: "COMMERCIAL_EXCEPTION",
      motivo: "Queda un descuento por aprobar",
      priceDrift: [],
    };

    await submitOrder("pedido-1", "vendedor-1");

    expect(enviados.map((e) => e.aviso)).toEqual(["descuento_solicitado"]);
  });

  it("un cliente sin validar sigue usando el correo de pedido enviado", async () => {
    respuestaRpc = { estadoResultado: "NEW_CUSTOMER_VALIDATION", motivo: null, priceDrift: [] };

    await submitOrder("pedido-1", "vendedor-1");

    expect(enviados.map((e) => e.aviso)).toEqual(["pedido_enviado"]);
  });

  it("un pedido que pasa derecho manda el correo de pedido enviado", async () => {
    respuestaRpc = { estadoResultado: "READY_FOR_OPERATIONS", motivo: null, priceDrift: [] };

    await submitOrder("pedido-1", "vendedor-1");

    expect(enviados.map((e) => e.aviso)).toEqual(["pedido_enviado"]);
  });
});
