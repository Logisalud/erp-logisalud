import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El vendedor tiene que poder cargar el celular que la regla le exige.
 *
 * Regresión de un error real (2026-09-23): un vendedor cargaba el celular
 * desde la pantalla del pedido, tocaba "Guardar celular" y no pasaba nada.
 * La única policy de UPDATE sobre `customers` es para admin y
 * control_pedidos, así que el update del vendedor **no fallaba**: RLS
 * esconde la fila en vez de rechazar la escritura, el update afectaba cero
 * filas y `error` venía en null. La pantalla daba por guardado un número
 * que nunca se escribió, y el pedido seguía trabado. Al administrador sí le
 * funcionaba, que es por lo que no se vio antes.
 *
 * Por eso ahora va por la RPC `set_customer_whatsapp` (migración 1042), que
 * es SECURITY DEFINER, toca una sola columna y lanza cuando algo está mal —
 * un error que sí llega a la pantalla.
 */

type Llamada = { fn: string; args: Record<string, unknown> };

const llamadas: Llamada[] = [];
let respuesta: { data: unknown; error: { message: string } | null } = {
  data: "987654321",
  error: null,
};

const updates: unknown[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      return respuesta;
    },
    // Si alguien vuelve a escribir la tabla directo, el test lo ve.
    from: () => ({
      update: (valores: unknown) => {
        updates.push(valores);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import { guardarCelularDeCliente } from "@/services/customers";

beforeEach(() => {
  llamadas.length = 0;
  updates.length = 0;
  respuesta = { data: "987654321", error: null };
});

describe("guardarCelularDeCliente", () => {
  it("guarda por la RPC y no escribiendo customers directo", async () => {
    const r = await guardarCelularDeCliente("cli-1", "987654321");

    expect(r).toEqual({ ok: true, celular: "987654321" });
    expect(llamadas).toEqual([
      {
        fn: "set_customer_whatsapp",
        args: { p_customer_id: "cli-1", p_celular: "987654321" },
      },
    ]);
    // Lo que rompía: el update directo que RLS convertía en cero filas.
    expect(updates).toEqual([]);
  });

  it("devuelve el número tal como lo dejó la base", async () => {
    respuesta = { data: "987654321", error: null };

    const r = await guardarCelularDeCliente("cli-1", "+51 987 654 321");

    expect(r).toEqual({ ok: true, celular: "987654321" });
  });

  it("cuando la base rechaza, el mensaje llega a la pantalla", async () => {
    respuesta = {
      data: null,
      error: { message: "No autorizado para cargar el celular de este cliente" },
    };

    const r = await guardarCelularDeCliente("cli-1", "987654321");

    expect(r).toEqual({
      ok: false,
      error: "No autorizado para cargar el celular de este cliente",
    });
  });

  it("un número que no es celular ni llega a la base", async () => {
    const r = await guardarCelularDeCliente("cli-1", "5555555555");

    expect(r.ok).toBe(false);
    expect(llamadas).toEqual([]);
  });
});
