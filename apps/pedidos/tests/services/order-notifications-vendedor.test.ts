import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El vendedor responsable del pedido tiene que recibir los TRES avisos,
 * además de la lista fija de la oficina.
 *
 * Se ejercita el servicio de verdad (el que lee la lista, resuelve el
 * vendedor y arma el hilo); lo único falso es la base y el proveedor de
 * correo. Lo que se cuida acá es que el vendedor entre desde el correo 1
 * —si entrara recién en el segundo, vería el hilo cortado— y que no le
 * llegue dos veces cuando además está en la lista fija.
 */

type Log = {
  id: number;
  order_id: string;
  tipo: string;
  estado: string;
  destinatarios: string[];
  message_id: string | null;
  proveedor_message_id: string | null;
  created_at: string;
};

const db = {
  /** La lista fija de la oficina, como está hoy en producción. */
  fijos: [
    { email: "aromero@logisalud.com" },
    { email: "sgonzales@logisalud.com" },
    { email: "a.aguilar@logisalud.com" },
  ],
  /** El pedido, a nombre de SUSANA RAMOS (seller_id), armado por quien sea. */
  seller: {
    nombre_completo: "SUSANA RAMOS",
    user_id: "u-susana" as string | null,
  } as { nombre_completo: string; user_id: string | null } | null,
  perfiles: { "u-susana": "sramos@logisaludventas.com" } as Record<string, string | null>,
  logs: [] as Log[],
  reloj: 0,
};

const order = {
  id: "o1",
  numero: 58,
  email_thread_message_id: null as string | null,
  fecha_envio: "2026-09-07T15:00:00Z",
  created_at: "2026-09-07T15:00:00Z",
  razon_social_snapshot: "FARMACIA QUEEN",
  direccion_snapshot: "AV. X 1",
  canal_snapshot: "Horizontal",
  zona_snapshot: "ZONA 01",
  vendedor_snapshot: "SUSANA RAMOS",
  dias_credito_solicitados: null,
  customer: { razon_social: "FARMACIA QUEEN", ruc_o_documento: "20517006514" },
  payment_terms: { nombre: "Contado" },
};

function tabla(nombre: string) {
  if (nombre === "order_notification_recipients") {
    return { select: () => ({ eq: async () => ({ data: db.fijos, error: null }) }) };
  }

  if (nombre === "orders") {
    return {
      // Dos consultas distintas caen acá: la del correo (snapshots) y la
      // del vendedor (`seller:sellers(...)`). Se responde con la unión,
      // que es lo que haría PostgREST columna por columna.
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { ...order, seller: db.seller }, error: null }),
        }),
      }),
      update: (valores: { email_thread_message_id?: string }) => ({
        eq: async () => {
          if (valores.email_thread_message_id !== undefined) {
            order.email_thread_message_id = valores.email_thread_message_id;
          }
          return { error: null };
        },
      }),
    };
  }

  if (nombre === "profiles") {
    return {
      select: () => ({
        // La del vendedor (por id) y la de los autores de observaciones (in).
        eq: () => ({
          maybeSingle: async () => ({
            data: db.seller?.user_id
              ? { email: db.perfiles[db.seller.user_id] ?? null }
              : null,
            error: null,
          }),
        }),
        in: async () => ({ data: [], error: null }),
      }),
    };
  }

  if (nombre === "order_items") {
    return {
      select: () => ({
        eq: async () => ({
          data: [
            {
              id: "i1",
              cantidad: 2,
              precio_unitario: 2.5,
              igv: 0.76,
              subtotal: 4.24,
              total: 5,
              precio_fijado_por_admin: false,
              precio_lista_original: null,
              motivo_precio_especial: null,
              origen_precio: "LISTA",
              promocion_ref: null,
              es_linea_gratis: false,
              product: { codigo_interno: "DHP014", descripcion: "A - FIEBRIN" },
            },
          ],
          error: null,
        }),
      }),
    };
  }

  if (nombre === "approval_requests") {
    return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
  }

  if (nombre === "order_observations") {
    return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
  }

  if (nombre === "notification_logs") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({
              data: [...db.logs].sort((a, b) => a.created_at.localeCompare(b.created_at)),
              error: null,
            }),
          }),
        }),
      }),
      insert: (fila: Omit<Log, "id" | "created_at" | "message_id">) => {
        db.reloj += 1;
        const log: Log = {
          ...fila,
          id: db.reloj,
          message_id: null,
          created_at: `2026-09-07T15:0${db.reloj}:00Z`,
        };
        db.logs.push(log);
        return {
          select: () => ({ maybeSingle: async () => ({ data: { id: log.id }, error: null }) }),
        };
      },
      update: (valores: { message_id?: string }) => ({
        eq: async (_col: string, id: number) => {
          const log = db.logs.find((l) => l.id === id);
          if (log && valores.message_id !== undefined) log.message_id = valores.message_id;
          return { error: null };
        },
      }),
    };
  }

  throw new Error(`tabla no simulada en el test: ${nombre}`);
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (nombre: string) => tabla(nombre) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: (nombre: string) => tabla(nombre) }),
}));
vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));

const enviados: Array<{ to: string[]; subject: string; headers?: Record<string, string> }> = [];

vi.mock("@/services/email", () => ({
  isEmailConfigured: () => true,
  sendEmail: async (input: {
    to: string[];
    subject: string;
    headers?: Record<string, string>;
  }) => {
    enviados.push({ to: input.to, subject: input.subject, headers: input.headers });
    return {
      ok: true as const,
      proveedor: "resend" as const,
      messageId: `resend-${enviados.length}`,
    };
  },
  fetchResendMessageId: async (resendId: string) =>
    `<010f-${resendId.split("-")[1]}@us-east-2.amazonses.com>`,
}));

import {
  notifyDiscountRequested,
  notifyDiscountResolved,
  notifyOrderSubmitted,
} from "@/services/order-notifications";

const OFICINA = ["aromero@logisalud.com", "sgonzales@logisalud.com", "a.aguilar@logisalud.com"];

beforeEach(() => {
  db.fijos = OFICINA.map((email) => ({ email }));
  db.seller = { nombre_completo: "SUSANA RAMOS", user_id: "u-susana" };
  db.perfiles = { "u-susana": "sramos@logisaludventas.com" };
  db.logs = [];
  db.reloj = 0;
  order.email_thread_message_id = null;
  enviados.length = 0;
});

describe("el vendedor del pedido recibe los avisos", () => {
  it("entra en los tres correos, además de la oficina, y desde el primero", async () => {
    const r1 = await notifyOrderSubmitted("o1", "COMMERCIAL_EXCEPTION", "u-susana");
    const r2 = await notifyDiscountRequested("o1", "COMMERCIAL_EXCEPTION", "u-susana");
    const r3 = await notifyDiscountResolved("o1", "READY_FOR_OPERATIONS", "u-admin", "APROBAR");

    const esperado = [...OFICINA, "sramos@logisaludventas.com"];
    expect(enviados.map((e) => e.to)).toEqual([esperado, esperado, esperado]);
    expect([r1.destinatarios, r2.destinatarios, r3.destinatarios]).toEqual([
      esperado,
      esperado,
      esperado,
    ]);

    // Y los tres son el MISMO hilo: si el vendedor entrara recién en el
    // segundo, vería una conversación empezada a mitad.
    expect(enviados[0].headers).toEqual({});
    expect(enviados[1].headers).toEqual({
      "In-Reply-To": "<010f-1@us-east-2.amazonses.com>",
      References: "<010f-1@us-east-2.amazonses.com>",
    });
    expect(enviados[2].headers).toEqual({
      "In-Reply-To": "<010f-2@us-east-2.amazonses.com>",
      References: "<010f-1@us-east-2.amazonses.com> <010f-2@us-east-2.amazonses.com>",
    });

    // Queda registrado a quién se le mandó, para poder reclamar después.
    expect(db.logs.map((l) => l.destinatarios)).toEqual([esperado, esperado, esperado]);
  });

  it("es el vendedor del seller_id, no quien armó el pedido", async () => {
    // Un administrador manda el aviso (actor = u-admin) de un pedido que
    // quedó a nombre de Susana: el correo va a Susana.
    await notifyOrderSubmitted("o1", "READY_FOR_OPERATIONS", "u-admin");
    expect(enviados[0].to).toContain("sramos@logisaludventas.com");
  });

  it("no le llega dos veces si además está en la lista fija", async () => {
    db.fijos = [...OFICINA, "SRamos@logisaludventas.com"].map((email) => ({ email }));
    await notifyOrderSubmitted("o1", "READY_FOR_OPERATIONS", "u-susana");

    expect(enviados[0].to).toEqual([...OFICINA, "sramos@logisaludventas.com"]);
    expect(enviados[0].to.filter((e) => e.startsWith("sramos"))).toHaveLength(1);
  });

  it("un vendedor sin cuenta vinculada no frena el aviso a la oficina", async () => {
    db.seller = { nombre_completo: "CRISTIAN BARREDA", user_id: null };
    await notifyOrderSubmitted("o1", "READY_FOR_OPERATIONS", "u-admin");
    expect(enviados[0].to).toEqual(OFICINA);
  });

  it("sin lista fija, el aviso sale igual al vendedor", async () => {
    // Antes, con la lista vacía el pedido quedaba 'sin_destinatarios' y
    // nadie se enteraba, ni el propio vendedor.
    db.fijos = [];
    const r = await notifyOrderSubmitted("o1", "READY_FOR_OPERATIONS", "u-susana");
    expect(r.estado).toBe("enviado");
    expect(r.destinatarios).toEqual(["sramos@logisaludventas.com"]);
  });

  it("sin nadie —ni lista fija ni vendedor— queda registrado como sin destinatarios", async () => {
    db.fijos = [];
    db.seller = null;
    const r = await notifyOrderSubmitted("o1", "READY_FOR_OPERATIONS", "u-admin");
    expect(r.estado).toBe("sin_destinatarios");
    expect(enviados).toHaveLength(0);
  });
});
