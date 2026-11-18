import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El viaje de ida del puente: la dirección y el ubigeo de cobranzas,
 * copiados a pedidos.
 *
 * Lo que no puede pasar, en orden de gravedad:
 *  - pisar un dato que el vendedor corrigió a mano en pedidos;
 *  - meter un ubigeo que no existe, que después rompe la guía de remisión;
 *  - copiar "SIN DIRECCION" como si fuera una dirección;
 *  - crear clientes que en pedidos no existen.
 */

const db = {
  customers: [] as Array<Record<string, unknown>>,
  ubigeos: [] as Array<Record<string, string>>,
  updates: [] as Array<{ id: string; cambios: Record<string, unknown> }>,
};

function tabla(nombre: string): any {
  return {
    select: () => {
      const filas = nombre === "ubigeos" ? db.ubigeos : db.customers;
      return { then: (res: (r: unknown) => unknown) => res({ data: filas, error: null }) };
    },
    update: (cambios: Record<string, unknown>) => ({
      eq: async (_col: string, id: string) => {
        db.updates.push({ id, cambios });
        return { error: null };
      },
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: tabla }) }));
const auditoria: Array<Record<string, unknown>> = [];
vi.mock("@/services/audit-log", () => ({
  logAudit: async (e: Record<string, unknown>) => {
    auditoria.push(e);
  },
  ultimaCorrida: async () => null,
}));

import { sincronizarCarteraDesdeCobranzas } from "@/services/cartera-desde-cobranzas";

let respuestaDeCobranzas: Array<Record<string, unknown>> = [];

beforeEach(() => {
  db.customers = [];
  db.updates = [];
  db.ubigeos = [
    { departamento: "LIMA", provincia: "LIMA", distrito: "PUCUSANA" },
    { departamento: "CALLAO", provincia: "CALLAO", distrito: "CARMEN DE LA LEGUA-REYNOSO" },
  ];
  auditoria.length = 0;
  respuestaDeCobranzas = [];
  process.env.COBRANZAS_SUPABASE_URL = "https://cobranzas.example";
  process.env.COBRANZAS_SERVICE_ROLE_KEY = "clave-de-prueba";
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify(respuestaDeCobranzas), { status: 200 }),
  );
});

describe("sincronizar la cartera desde cobranzas", () => {
  it("completa la dirección y el ubigeo que faltan", async () => {
    db.customers = [
      {
        id: "c1",
        ruc_o_documento: "10078960359",
        direccion_fiscal: null,
        distrito: null,
        provincia: null,
        departamento: null,
      },
    ];
    respuestaDeCobranzas = [
      {
        ruc: "10078960359",
        direccion: "AV. LIMA N°604",
        distrito: "PUCUSANA",
        provincia: "LIMA",
        departamento: "LIMA",
      },
    ];

    const r = await sincronizarCarteraDesdeCobranzas(null);

    expect(db.updates).toEqual([
      {
        id: "c1",
        cambios: {
          direccion_fiscal: "AV. LIMA N°604",
          departamento: "LIMA",
          provincia: "LIMA",
          distrito: "PUCUSANA",
        },
      },
    ]);
    expect(r.direcciones).toBe(1);
    expect(r.ubicaciones).toBe(1);
  });

  it("no pisa lo que el vendedor ya corrigió en pedidos", async () => {
    db.customers = [
      {
        id: "c1",
        ruc_o_documento: "10078960359",
        direccion_fiscal: "LA DE LA PUERTA, CORREGIDA POR EL VENDEDOR",
        distrito: "PUCUSANA",
        provincia: "LIMA",
        departamento: "LIMA",
      },
    ];
    respuestaDeCobranzas = [
      {
        ruc: "10078960359",
        direccion: "LA VIEJA DEL PADRON",
        distrito: "PUCUSANA",
        provincia: "LIMA",
        departamento: "LIMA",
      },
    ];

    const r = await sincronizarCarteraDesdeCobranzas(null);

    expect(db.updates).toEqual([]);
    expect(r.direcciones).toBe(0);
  });

  it("rechaza un ubigeo que no existe en el catálogo y lo cuenta aparte", async () => {
    db.customers = [
      {
        id: "c1",
        ruc_o_documento: "10078960359",
        direccion_fiscal: null,
        distrito: null,
        provincia: null,
        departamento: null,
      },
    ];
    // Un distrito de Huánuco colgado de una provincia de Junín: existe en
    // cobranzas, no existe en la realidad.
    respuestaDeCobranzas = [
      {
        ruc: "10078960359",
        direccion: "JR. REAL 100",
        distrito: "PUERTO INCA",
        provincia: "HUANCAYO",
        departamento: "JUNIN",
      },
    ];

    const r = await sincronizarCarteraDesdeCobranzas(null);

    expect(r.ubigeosDesconocidos).toBe(1);
    expect(r.ubicaciones).toBe(0);
    // La dirección sí entra: el ubigeo malo no la contamina.
    expect(db.updates).toEqual([{ id: "c1", cambios: { direccion_fiscal: "JR. REAL 100" } }]);
  });

  it("no copia una dirección basura", async () => {
    db.customers = [
      {
        id: "c1",
        ruc_o_documento: "10078960359",
        direccion_fiscal: null,
        distrito: "PUCUSANA",
        provincia: "LIMA",
        departamento: "LIMA",
      },
    ];
    respuestaDeCobranzas = [
      { ruc: "10078960359", direccion: "SIN DIRECION", distrito: null, provincia: null, departamento: null },
    ];

    const r = await sincronizarCarteraDesdeCobranzas(null);

    expect(db.updates).toEqual([]);
    expect(r.direcciones).toBe(0);
  });

  it("cuenta los clientes que están solo en cobranzas, pero no los crea", async () => {
    db.customers = [];
    respuestaDeCobranzas = [
      { ruc: "10078960359", direccion: "AV. LIMA 604", distrito: null, provincia: null, departamento: null },
      { ruc: "20100047218", direccion: "AV. OTRA 100", distrito: null, provincia: null, departamento: null },
    ];

    const r = await sincronizarCarteraDesdeCobranzas(null);

    expect(r.soloEnCobranzas).toBe(2);
    expect(db.updates).toEqual([]);
  });

  it("cruza al cliente con DNI, que en cobranzas va relleno con ceros", async () => {
    db.customers = [
      {
        id: "c1",
        // En pedidos el DNI va pelado, 8 dígitos.
        ruc_o_documento: "03695392",
        direccion_fiscal: null,
        distrito: null,
        provincia: null,
        departamento: null,
      },
    ];
    respuestaDeCobranzas = [
      // En cobranzas el mismo documento va relleno a 11.
      { ruc: "00003695392", direccion: "SANTIAGO ROSALES 511", distrito: null, provincia: null, departamento: null },
    ];

    const r = await sincronizarCarteraDesdeCobranzas(null);

    expect(db.updates).toEqual([
      { id: "c1", cambios: { direccion_fiscal: "SANTIAGO ROSALES 511" } },
    ]);
    expect(r.soloEnCobranzas).toBe(0);
  });

  it("si cobranzas no responde no escribe nada", async () => {
    db.customers = [
      {
        id: "c1",
        ruc_o_documento: "10078960359",
        direccion_fiscal: null,
        distrito: null,
        provincia: null,
        departamento: null,
      },
    ];
    vi.stubGlobal("fetch", async () => new Response("no", { status: 500 }));

    await expect(sincronizarCarteraDesdeCobranzas(null)).rejects.toThrow(/500/);
    expect(db.updates).toEqual([]);
  });

  it("sin credenciales del puente no intenta nada", async () => {
    process.env.COBRANZAS_SUPABASE_URL = "";
    process.env.COBRANZAS_SERVICE_ROLE_KEY = "";

    await expect(sincronizarCarteraDesdeCobranzas(null)).rejects.toThrow(/COBRANZAS_SUPABASE_URL/);
    expect(db.updates).toEqual([]);
  });
});
