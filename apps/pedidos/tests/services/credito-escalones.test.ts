import { describe, expect, it, vi } from "vitest";

/**
 * Los dos escalones del crédito, que no son el mismo control con distinto
 * número: el de abajo frena el pedido y lo manda a que alguien decida, y el
 * de arriba le dice al vendedor que no hay nada que decidir.
 *
 * Esta función tiene que contestar exactamente lo mismo que
 * `pedidos.credito_nivel` en la base: la pantalla del vendedor anticipa lo
 * que va a hacer el envío, y si las dos no coinciden la pantalla miente.
 */

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({}) }));
vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));

import { nivelDeCredito } from "@/services/credito";

const REGLA = { activo: true, diasTolerancia: 30, diasBloqueo: 60 };

describe("nivelDeCredito", () => {
  it("sin nada vencido no pasa nada, por más saldo que haya", () => {
    expect(nivelDeCredito({ vencido: 0, diasAtraso: 0 }, REGLA)).toBe("ninguno");
  });

  it("dentro de la tolerancia el pedido sale derecho", () => {
    expect(nivelDeCredito({ vencido: 500, diasAtraso: 29 }, REGLA)).toBe("ninguno");
  });

  it("justo en la tolerancia todavía pasa: el umbral es pasarla, no alcanzarla", () => {
    // Es la regla que ya existía y que nadie pidió mover. Cambiarla de `>`
    // a `>=` acá frenaría clientes que hoy pasan, sin que figure en ningún
    // lado más que este commit.
    expect(nivelDeCredito({ vencido: 500, diasAtraso: 30 }, REGLA)).toBe("ninguno");
  });

  it("pasada la tolerancia avisa, pero deja pasar el pedido a aprobación", () => {
    expect(nivelDeCredito({ vencido: 500, diasAtraso: 31 }, REGLA)).toBe("alerta");
    expect(nivelDeCredito({ vencido: 500, diasAtraso: 59 }, REGLA)).toBe("alerta");
  });

  it("a los 60 bloquea: Administración lo pidió como 'a partir de 60 días'", () => {
    expect(nivelDeCredito({ vencido: 500, diasAtraso: 60 }, REGLA)).toBe("bloqueo");
    expect(nivelDeCredito({ vencido: 719.99, diasAtraso: 78 }, REGLA)).toBe("bloqueo");
  });

  it("con la regla apagada no frena nada, ni siquiera el escalón de arriba", () => {
    const apagada = { ...REGLA, activo: false };
    expect(nivelDeCredito({ vencido: 719.99, diasAtraso: 78 }, apagada)).toBe("ninguno");
  });

  it("un atraso viejo sin nada vencido no bloquea", () => {
    // La copia deja el día de atraso del último cálculo aunque el cliente
    // haya pagado; lo que manda es que quede algo vencido.
    expect(nivelDeCredito({ vencido: 0, diasAtraso: 120 }, REGLA)).toBe("ninguno");
  });

  it("con los dos umbrales iguales no queda franja de alerta", () => {
    const duro = { activo: true, diasTolerancia: 30, diasBloqueo: 30 };
    expect(nivelDeCredito({ vencido: 500, diasAtraso: 30 }, duro)).toBe("bloqueo");
    expect(nivelDeCredito({ vencido: 500, diasAtraso: 29 }, duro)).toBe("ninguno");
  });
});
