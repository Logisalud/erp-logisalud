import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Los tres avisos de un pedido tienen que salir como UN hilo.
 *
 * Esto ejercita el servicio de verdad —el que arma los encabezados y
 * guarda el ancla—, no una reimplementación: la base y el proveedor de
 * correo son lo único falso. Es la parte que "parece funcionar" con más
 * facilidad, porque un In-Reply-To mal armado no rompe nada visible: el
 * correo llega igual, sólo que como conversación nueva.
 */

// ---------------------------------------------------------------------
// Base de datos falsa, con el mínimo de la API de PostgREST que se usa
// ---------------------------------------------------------------------

type Log = {
  order_id: string;
  tipo: string;
  estado: string;
  message_id: string | null;
  proveedor_message_id: string | null;
  created_at: string;
};

const db = {
  order: {
    id: "o1",
    numero: 123,
    email_thread_message_id: null as string | null,
    fecha_envio: "2026-09-02T15:00:00Z",
    created_at: "2026-09-02T15:00:00Z",
    razon_social_snapshot: "FARMACIA QUEEN",
    direccion_snapshot: "AV. X 1",
    canal_snapshot: "Horizontal",
    zona_snapshot: "ZONA 1",
    vendedor_snapshot: "LUIS VARGAS",
    dias_credito_solicitados: null,
    customer: { razon_social: "FARMACIA QUEEN", ruc_o_documento: "20517006514" },
    payment_terms: { nombre: "Contado" },
  },
  logs: [] as Log[],
  reloj: 0,
};

function tabla(nombre: string) {
  const api: Record<string, unknown> = {};
  const chain = () => api as never;

  Object.assign(api, {
    select: chain,
    eq: chain,
    not: chain,
    order: chain,
    limit: chain,
    then: undefined,
  });

  if (nombre === "order_notification_recipients") {
    return {
      select: () => ({ eq: async () => ({ data: [{ email: "aromero@logisalud.com" }], error: null }) }),
    };
  }

  if (nombre === "orders") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.order, error: null }),
        }),
      }),
      update: (valores: { email_thread_message_id?: string }) => ({
        eq: async () => {
          if (valores.email_thread_message_id !== undefined) {
            db.order.email_thread_message_id = valores.email_thread_message_id;
          }
          return { error: null };
        },
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

  if (nombre === "notification_logs") {
    return {
      select: () => ({
        eq: () => ({
          not: () => ({
            order: async () => ({
              data: db.logs
                .filter((l) => l.message_id !== null)
                .sort((a, b) => a.created_at.localeCompare(b.created_at)),
              error: null,
            }),
          }),
        }),
      }),
      insert: async (fila: Omit<Log, "created_at">) => {
        db.reloj += 1;
        db.logs.push({ ...fila, created_at: `2026-09-02T15:0${db.reloj}:00Z` });
        return { error: null };
      },
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

vi.mock("./audit-log", () => ({ logAudit: async () => {} }));
vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));

const enviados: Array<{ subject: string; headers?: Record<string, string> }> = [];

vi.mock("@/services/email", () => ({
  emailFromAddress: () => "pedidos@logisalud.com",
  isEmailConfigured: () => true,
  sendEmail: async (input: { subject: string; headers?: Record<string, string> }) => {
    enviados.push({ subject: input.subject, headers: input.headers });
    return { ok: true as const, proveedor: "resend" as const, messageId: `resend-${enviados.length}` };
  },
}));

const {
  notifyOrderSubmitted,
  notifyDiscountRequested,
  notifyDiscountResolved,
} = await import("@/services/order-notifications");

beforeEach(() => {
  db.order.email_thread_message_id = null;
  db.logs = [];
  db.reloj = 0;
  enviados.length = 0;
});

describe("los tres avisos de un pedido forman un solo hilo", () => {
  it("el primero abre el hilo; los siguientes responden dentro", async () => {
    const r1 = await notifyOrderSubmitted("o1", "COMMERCIAL_EXCEPTION", "u1");
    const r2 = await notifyDiscountRequested("o1", "COMMERCIAL_EXCEPTION", "u1");
    const r3 = await notifyDiscountResolved("o1", "READY_FOR_OPERATIONS", "u1", "APROBAR");

    expect([r1.estado, r2.estado, r3.estado]).toEqual(["enviado", "enviado", "enviado"]);
    expect(enviados).toHaveLength(3);

    const [uno, dos, tres] = enviados;

    // 1) El primero lleva sólo su Message-ID y el asunto base.
    expect(uno.subject).toBe("Nuevo pedido #123 — FARMACIA QUEEN");
    expect(uno.headers?.["Message-ID"]).toMatch(/^<pedido-123\..+@logisalud\.com>$/);
    expect(uno.headers?.["In-Reply-To"]).toBeUndefined();
    expect(uno.headers?.References).toBeUndefined();

    const ancla = uno.headers?.["Message-ID"] as string;

    // Y queda guardado como ancla del hilo.
    expect(db.order.email_thread_message_id).toBe(ancla);

    // 2) El segundo responde al primero y lo referencia.
    expect(dos.subject).toBe("Re: Nuevo pedido #123 — FARMACIA QUEEN");
    expect(dos.headers?.["In-Reply-To"]).toBe(ancla);
    expect(dos.headers?.References).toBe(ancla);

    // 3) El tercero responde al SEGUNDO y acumula la cadena completa.
    const segundo = dos.headers?.["Message-ID"] as string;
    expect(tres.subject).toBe("Re: Nuevo pedido #123 — FARMACIA QUEEN");
    expect(tres.headers?.["In-Reply-To"]).toBe(segundo);
    expect(tres.headers?.References).toBe(`${ancla} ${segundo}`);

    // Los tres Message-ID son distintos: dos correos con el mismo id es
    // otra forma de romper el hilo.
    const ids = enviados.map((e) => e.headers?.["Message-ID"]);
    expect(new Set(ids).size).toBe(3);

    // El ancla no se reescribe con cada aviso.
    expect(db.order.email_thread_message_id).toBe(ancla);
  });

  it("un envío que falla no entra en la cadena", async () => {
    const email = await import("@/services/email");
    const spy = vi.spyOn(email, "sendEmail");

    await notifyOrderSubmitted("o1", "SUBMITTED", "u1");
    const ancla = enviados[0].headers?.["Message-ID"] as string;

    spy.mockResolvedValueOnce({
      ok: false,
      proveedor: "resend",
      error: "Resend respondió 422",
    } as never);
    const fallido = await notifyDiscountRequested("o1", "COMMERCIAL_EXCEPTION", "u1");
    expect(fallido.estado).toBe("fallido");

    const tercero = await notifyDiscountResolved("o1", "READY_FOR_OPERATIONS", "u1", "APROBAR");
    expect(tercero.estado).toBe("enviado");

    // El correo que no salió no existe en ninguna bandeja: referenciarlo
    // rompería el emparentado del que sí salió.
    const ultimo = enviados.at(-1);
    expect(ultimo?.headers?.References).toBe(ancla);
    expect(ultimo?.headers?.["In-Reply-To"]).toBe(ancla);
    spy.mockRestore();
  });

  it("si el primer correo falla, el siguiente abre el hilo", async () => {
    const email = await import("@/services/email");
    const spy = vi.spyOn(email, "sendEmail");
    spy.mockResolvedValueOnce({
      ok: false,
      proveedor: "resend",
      error: "Resend respondió 500",
    } as never);

    const primero = await notifyOrderSubmitted("o1", "SUBMITTED", "u1");
    expect(primero.estado).toBe("fallido");
    expect(db.order.email_thread_message_id).toBeNull();

    const segundo = await notifyDiscountRequested("o1", "COMMERCIAL_EXCEPTION", "u1");
    expect(segundo.estado).toBe("enviado");
    const ultimo = enviados.at(-1);
    // Sin hilo previo: asunto base, sin Re:, y queda como ancla.
    expect(ultimo?.subject).toBe("Nuevo pedido #123 — FARMACIA QUEEN");
    expect(ultimo?.headers?.["In-Reply-To"]).toBeUndefined();
    expect(db.order.email_thread_message_id).toBe(ultimo?.headers?.["Message-ID"]);
    spy.mockRestore();
  });
});
