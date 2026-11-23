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
  zones: [] as Array<{ id: number; codigo_zona: string }>,
  sellers: [] as Array<{ id: string; codigo_representante: string }>,
  canal: null as { id: number } | null,
  updates: [] as Array<{ id: string; cambios: Record<string, unknown> }>,
  insertados: [] as Array<Record<string, unknown>>,
};

function tabla(nombre: string): any {
  if (nombre === "zones") {
    return {
      select: () => ({ then: (res: (r: unknown) => unknown) => res({ data: db.zones, error: null }) }),
    };
  }
  if (nombre === "sellers") {
    return {
      select: () => ({
        eq: () => ({ then: (res: (r: unknown) => unknown) => res({ data: db.sellers, error: null }) }),
      }),
    };
  }
  if (nombre === "sales_channels") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.canal, error: null }) }),
      }),
    };
  }
  if (nombre === "ubigeos") {
    // Paginado igual que en producción: `select().order().range()`. El stub
    // corta por rango a propósito —si devolviera la tabla entera no se
    // notaría un catálogo recortado, que es justo el bug que se cuida acá—.
    return {
      select: () => ({
        order: () => ({
          range: async (desde: number, hasta: number) => ({
            data: db.ubigeos.slice(desde, hasta + 1),
            error: null,
          }),
        }),
      }),
    };
  }
  return {
    select: () => ({
      // `customers` se lee paginado: `select().order().range()`.
      order: () => ({
        range: async (desde: number, hasta: number) => ({
          data: db.customers.slice(desde, hasta + 1),
          error: null,
        }),
      }),
    }),
    insert: async (filas: Array<Record<string, unknown>>) => {
      db.insertados.push(...filas);
      return { error: null };
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
let vendedoresDeCobranzas: Array<Record<string, unknown>> = [];

beforeEach(() => {
  db.customers = [];
  db.updates = [];
  db.ubigeos = [
    { departamento: "LIMA", provincia: "LIMA", distrito: "PUCUSANA" },
    { departamento: "CALLAO", provincia: "CALLAO", distrito: "CARMEN DE LA LEGUA-REYNOSO" },
  ];
  db.insertados = [];
  db.zones = [{ id: 7, codigo_zona: "LIMH08" }];
  db.sellers = [{ id: "v-romina", codigo_representante: "CRP1013" }];
  db.canal = { id: 3 };
  auditoria.length = 0;
  respuestaDeCobranzas = [];
  vendedoresDeCobranzas = [{ id: "vc-1", codigo: "CRP1013" }];
  process.env.COBRANZAS_SUPABASE_URL = "https://cobranzas.example";
  process.env.COBRANZAS_SERVICE_ROLE_KEY = "clave-de-prueba";
  // El REST de cobranzas pagina con limit/offset, y el stub tiene que
  // respetarlo: si devolviera la lista entera en cada página, el lector
  // nunca vería una página corta y no cortaría nunca.
  vi.stubGlobal("fetch", async (url: string) => {
    const u = new URL(url);
    const limit = Number(u.searchParams.get("limit") ?? 1000);
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const fuente = u.pathname.includes("vendedores") ? vendedoresDeCobranzas : respuestaDeCobranzas;
    return new Response(JSON.stringify(fuente.slice(offset, offset + limit)), { status: 200 });
  });
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

  it("lee el catálogo de ubigeos COMPLETO, más allá del tope de 1.000", async () => {
    /**
     * Pasó en producción el 2026-11-20: el catálogo se leía sin paginar,
     * PostgREST cortaba en 1.000 de las 1.884 filas y, por código INEI,
     * Lima entra recién en la 1.001. A todo cliente limeño se le descartó
     * el ubigeo y se guardó vacío: 2.022 clientes sin distrito, con el dato
     * bueno ahí al lado en cobranzas.
     */
    db.ubigeos = Array.from({ length: 1200 }, (_, i) => ({
      departamento: "RELLENO",
      provincia: "RELLENO",
      distrito: `DISTRITO ${i}`,
    }));
    // El que hace falta vive DESPUÉS del tope.
    db.ubigeos[1100] = { departamento: "LIMA", provincia: "LIMA", distrito: "SANTA ANITA" };

    respuestaDeCobranzas = [
      {
        ruc: "20600000001",
        razon_social: "BOTICA SAN GABRIEL",
        direccion: "AV. SANTA ANA S/N",
        departamento: "LIMA",
        provincia: "LIMA",
        distrito: "SANTA ANITA",
        codigo_zona: "LIMH08",
        vendedor_actual_id: "vc-1",
      },
    ];

    const r = await sincronizarCarteraDesdeCobranzas("cron");

    expect(r.creados).toBe(1);
    expect(db.insertados[0]).toMatchObject({
      departamento: "LIMA",
      provincia: "LIMA",
      distrito: "SANTA ANITA",
    });
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

  /**
   * La cartera es a quién se le PUEDE vender, no a quién ya compró: un
   * cliente registrado que no compra hace dos años sigue siendo visitable,
   * y si no está en pedidos el vendedor no le puede tomar el pedido.
   */
  it("da de alta en pedidos a los clientes que solo están en cobranzas", async () => {
    db.customers = [];
    respuestaDeCobranzas = [
      {
        ruc: "20100047218",
        razon_social: "BOTICA LA ESPERANZA S.A.C.",
        direccion: "AV. LIMA 604",
        distrito: "PUCUSANA",
        provincia: "LIMA",
        departamento: "LIMA",
        codigo_zona: "LIMH08",
        vendedor_actual_id: "vc-1",
      },
    ];

    const r = await sincronizarCarteraDesdeCobranzas(null);

    expect(r.soloEnCobranzas).toBe(1);
    expect(r.creados).toBe(1);
    expect(db.insertados).toHaveLength(1);
    expect(db.insertados[0]).toMatchObject({
      ruc_o_documento: "20100047218",
      razon_social: "BOTICA LA ESPERANZA S.A.C.",
      direccion_fiscal: "AV. LIMA 604",
      // El canal por defecto: sin canal no hay precio y el cliente no se
      // puede atender.
      canal_id: 3,
      zona_id: 7,
      vendedor_id: "v-romina",
      // RUC válido: ya opera, entra activo.
      estado: "ACTIVO",
      tipo_comprobante_permitido: "FACTURA",
      distrito: "PUCUSANA",
    });
  });

  /**
   * Un cliente que no le cuelga a nadie es un cliente que nadie visita.
   * Entre crearlo huérfano y no crearlo, no crearlo se ve.
   */
  it("no crea al cliente si no puede ubicar su zona o su vendedor", async () => {
    db.customers = [];
    respuestaDeCobranzas = [
      {
        ruc: "20100047218",
        razon_social: "BOTICA SIN ZONA",
        direccion: "AV. LIMA 604",
        distrito: null,
        provincia: null,
        departamento: null,
        codigo_zona: "ZONA_QUE_NO_EXISTE",
        vendedor_actual_id: "vc-1",
      },
      {
        ruc: "20100047219",
        razon_social: "BOTICA SIN VENDEDOR",
        direccion: "AV. LIMA 605",
        distrito: null,
        provincia: null,
        departamento: null,
        codigo_zona: "LIMH08",
        vendedor_actual_id: "vc-desconocido",
      },
    ];

    const r = await sincronizarCarteraDesdeCobranzas(null);

    expect(r.creados).toBe(0);
    expect(r.sinUbicar).toBe(2);
    expect(db.insertados).toEqual([]);
  });

  /**
   * El DNI cargado en el campo de RUC entra a validar y solo con boleta:
   * el CHECK de la tabla rechaza FACTURA sin RUC de contribuyente.
   */
  it("el cliente con DNI entra como boleta y a validar", async () => {
    db.customers = [];
    respuestaDeCobranzas = [
      {
        ruc: "00003695392",
        razon_social: "GOYES SAAVEDRA JUAN MANUEL",
        direccion: "SANTIAGO ROSALES 511",
        distrito: null,
        provincia: null,
        departamento: null,
        codigo_zona: "LIMH08",
        vendedor_actual_id: "vc-1",
      },
    ];

    await sincronizarCarteraDesdeCobranzas(null);

    expect(db.insertados[0]).toMatchObject({
      estado: "PENDIENTE_DE_VALIDACION",
      tipo_comprobante_permitido: "BOLETA",
    });
  });

  it("si falta el canal por defecto no crea ningún cliente", async () => {
    db.canal = null;
    db.customers = [];
    respuestaDeCobranzas = [
      {
        ruc: "20100047218",
        razon_social: "BOTICA LA ESPERANZA S.A.C.",
        direccion: null,
        distrito: null,
        provincia: null,
        departamento: null,
        codigo_zona: "LIMH08",
        vendedor_actual_id: "vc-1",
      },
    ];

    await expect(sincronizarCarteraDesdeCobranzas(null)).rejects.toThrow(/Horizontal/);
    expect(db.insertados).toEqual([]);
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

  /**
   * PostgREST corta en 1.000 filas. La primera versión de esto leía
   * `customers` con un `select()` pelado: comparaba los primeros mil
   * clientes contra toda la cartera de cobranzas y los otros 2.568 no se
   * completaban nunca. Nadie se enteraba, porque el proceso terminaba bien.
   */
  it("lee la cartera entera, no solo las primeras mil filas", async () => {
    db.customers = Array.from({ length: 1200 }, (_, i) => ({
      id: `c${i}`,
      // RUC de 11 dígitos, distinto para cada uno.
      ruc_o_documento: String(20000000000 + i),
      direccion_fiscal: null,
      distrito: null,
      provincia: null,
      departamento: null,
    }));
    respuestaDeCobranzas = db.customers.map((c) => ({
      ruc: c.ruc_o_documento,
      direccion: "AV. SIEMPRE VIVA 123",
      distrito: null,
      provincia: null,
      departamento: null,
    }));

    const r = await sincronizarCarteraDesdeCobranzas(null);

    expect(db.updates).toHaveLength(1200);
    expect(r.direcciones).toBe(1200);
    // Y ninguno queda contado como "solo en cobranzas".
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
