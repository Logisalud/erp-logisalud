import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La copia de la deuda es un espejo de otro ERP, y lo peligroso de un
 * espejo es romperlo a medias.
 *
 * Si cobranzas no responde —o responde cualquier cosa—, lo que NO puede
 * pasar es que la copia quede vacía: con la copia vacía la regla deja de
 * frenar a todo el mundo y nadie se entera, que es el peor desenlace
 * posible para un control de crédito.
 */

const db = {
  escrituras: [] as Array<{ tabla: string; filas: unknown }>,
  actualizaciones: [] as Array<{ tabla: string; cambios: unknown; rucs: string[] }>,
  conSaldo: [] as Array<{ ruc: string }>,
  filasCredito: [] as Array<Record<string, unknown>>,
};

function tabla(nombre: string): any {
  return {
    upsert: async (filas: unknown) => {
      db.escrituras.push({ tabla: nombre, filas });
      return { error: null };
    },
    // Thenable y no async: `await select()` tiene que devolver las filas, y
    // `select().gt(...)` tiene que seguir siendo encadenable. Un `async`
    // devuelve una Promise y se pierde el encadenado.
    select: () => ({
      gt: async () => ({ data: db.conSaldo, error: null }),
      eq: () => ({
        maybeSingle: async () => ({ data: { activo: false, dias_tolerancia: 30 }, error: null }),
      }),
      then: (resolver: (r: unknown) => unknown) => resolver({ data: db.filasCredito, error: null }),
    }),
    update: (cambios: unknown) => ({
      in: async (_col: string, rucs: string[]) => {
        db.actualizaciones.push({ tabla: nombre, cambios, rucs });
        return { error: null };
      },
      eq: async () => ({ error: null }),
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: tabla }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: tabla }) }));
const auditoria: Array<Record<string, unknown>> = [];
vi.mock("@/services/audit-log", () => ({
  logAudit: async (entry: Record<string, unknown>) => {
    auditoria.push(entry);
  },
  // La pantalla pregunta cuándo corrió por última vez; acá nunca corrió.
  ultimaCorrida: async () => null,
}));

import { sincronizarCredito } from "@/services/credito";

const DEUDA = [
  { ruc: "20100047218", razon_social: "BOTICA A", saldo: "1200.50", vencido: "800.00", dias_atraso: 45, documentos_vencidos: 2 },
  { ruc: "20515774182", razon_social: "BOTICA B", saldo: "300.00", vencido: "0", dias_atraso: 0, documentos_vencidos: 0 },
];

beforeEach(() => {
  db.escrituras = [];
  db.actualizaciones = [];
  db.conSaldo = [];
  process.env.COBRANZAS_SUPABASE_URL = "https://cobranzas.example";
  process.env.COBRANZAS_SERVICE_ROLE_KEY = "clave-de-prueba";
  vi.unstubAllGlobals();
});

describe("sincronizarCredito", () => {
  it("copia la deuda tal cual viene, con los números convertidos", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => DEUDA }));

    const r = await sincronizarCredito("u-1");

    expect(r.clientes).toBe(2);
    expect(r.vencido).toBe(800);
    const filas = db.escrituras[0].filas as Array<Record<string, unknown>>;
    expect(filas[0]).toMatchObject({ ruc: "20100047218", saldo: 1200.5, vencido: 800, dias_atraso: 45 });
  });

  it("pone en cero al que ya no figura, en vez de dejarlo debiendo para siempre", async () => {
    // Pagó todo: cobranzas ya no lo devuelve. Si su fila vieja quedara, el
    // cliente seguiría bloqueado después de haber pagado.
    db.conSaldo = [{ ruc: "20100047218" }, { ruc: "99999999999" }];
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => DEUDA }));

    await sincronizarCredito("u-1");

    expect(db.actualizaciones).toHaveLength(1);
    expect(db.actualizaciones[0].rucs).toEqual(["99999999999"]);
    expect(db.actualizaciones[0].cambios).toMatchObject({ saldo: 0, vencido: 0, dias_atraso: 0 });
  });

  it("si cobranzas falla, no toca la copia anterior", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 503, json: async () => ({}) }));

    await expect(sincronizarCredito("u-1")).rejects.toThrow(/503/);
    expect(db.escrituras).toHaveLength(0);
    expect(db.actualizaciones).toHaveLength(0);
  });

  it("si cobranzas devuelve algo que no es una lista, tampoco la toca", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ message: "qué raro" }) }));

    await expect(sincronizarCredito("u-1")).rejects.toThrow(/inesperado/i);
    expect(db.escrituras).toHaveLength(0);
  });

  it("sin las variables de cobranzas avisa qué falta, y no escribe nada", async () => {
    process.env.COBRANZAS_SUPABASE_URL = "";
    process.env.COBRANZAS_SERVICE_ROLE_KEY = "";

    await expect(sincronizarCredito("u-1")).rejects.toThrow(/COBRANZAS_SUPABASE_URL/);
    expect(db.escrituras).toHaveLength(0);
  });
});

describe("el contador de la pantalla", () => {
  it("no cuenta como deudor al que ya terminó de pagar", async () => {
    // La sincronización deja en cero al que pagó en vez de borrarlo, para
    // no perder la fecha de actualización. Si esas filas se contaran, el
    // número de deudores crecería con cada cliente que se pone al día.
    const { getEstadoDelCredito } = await import("@/services/credito");

    db.filasCredito = [
      { saldo: "1000", vencido: "800", dias_atraso: 45, actualizado_en: "2026-10-28T12:00:00Z" },
      { saldo: "500", vencido: "0", dias_atraso: 0, actualizado_en: "2026-10-28T12:00:00Z" },
      { saldo: "0", vencido: "0", dias_atraso: 0, actualizado_en: "2026-10-28T12:00:00Z" },
    ];

    const estado = await getEstadoDelCredito();

    expect(estado.clientes).toBe(2);
    expect(estado.conVencido).toBe(1);
    expect(estado.bloqueados).toBe(1);
    expect(estado.vencidoBloqueado).toBe(800);
  });
});

describe("quién disparó la sincronización", () => {
  /**
   * `audit_logs.actor` es uuid y apunta a una persona. Cuando corre el cron
   * no hay ninguna, y durante días las rutas pasaron el texto "cron": el
   * insert reventaba DESPUÉS de haber hecho todo el trabajo, así que el job
   * quedaba sin registro y parecía no haber corrido nunca. Se descubrió el
   * 2026-11-03, con el sync de contactos sin una sola corrida en la
   * auditoría.
   */
  it("el cron no se anota como persona: el actor va vacío", async () => {
    auditoria.length = 0;
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => DEUDA }));

    await sincronizarCredito(null);

    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].actor).toBeNull();
    expect(auditoria[0].datosDespues).toMatchObject({ origen: "cron" });
  });

  it("una persona sí queda anotada, con su id", async () => {
    auditoria.length = 0;
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => DEUDA }));

    await sincronizarCredito("3f1d1d2e-0000-4000-8000-000000000001");

    expect(auditoria[0].actor).toBe("3f1d1d2e-0000-4000-8000-000000000001");
    expect(auditoria[0].datosDespues).toMatchObject({ origen: "persona" });
  });
});
