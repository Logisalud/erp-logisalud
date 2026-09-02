import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Los tres avisos de un pedido tienen que salir como UN hilo.
 *
 * Esto ejercita el servicio de verdad —el que arma los encabezados, lee el
 * Message-ID real de Resend y guarda el ancla—, no una reimplementación:
 * la base y el proveedor de correo son lo único falso. Es la parte que
 * "parece funcionar" con más facilidad, porque un In-Reply-To mal armado no
 * rompe nada visible: el correo llega igual, sólo que como conversación
 * nueva.
 */

// ---------------------------------------------------------------------
// Base de datos falsa, con el mínimo de la API de PostgREST que se usa
// ---------------------------------------------------------------------

type Log = {
  id: number;
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

/** Message-ID que "asigna Resend", por cada id interno. */
const messageIdsDeResend = new Map<string, string | null>();

function tabla(nombre: string) {
  if (nombre === "order_notification_recipients") {
    return {
      select: () => ({
        eq: async () => ({ data: [{ email: "aromero@logisalud.com" }], error: null }),
      }),
    };
  }

  if (nombre === "orders") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.order, error: null }) }),
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
          created_at: `2026-09-02T15:0${db.reloj}:00Z`,
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

const enviados: Array<{ subject: string; headers?: Record<string, string> }> = [];

vi.mock("@/services/email", () => ({
  isEmailConfigured: () => true,
  sendEmail: async (input: { subject: string; headers?: Record<string, string> }) => {
    enviados.push({ subject: input.subject, headers: input.headers });
    const resendId = `resend-${enviados.length}`;
    // Resend le asigna SU Message-ID, ignorando el que le mandemos.
    if (!messageIdsDeResend.has(resendId)) {
      messageIdsDeResend.set(resendId, `<010f-${enviados.length}@us-east-2.amazonses.com>`);
    }
    return { ok: true as const, proveedor: "resend" as const, messageId: resendId };
  },
  fetchResendMessageId: async (resendId: string) => messageIdsDeResend.get(resendId) ?? null,
}));

import {
  notifyDiscountRequested,
  notifyDiscountResolved,
  notifyOrderSubmitted,
} from "@/services/order-notifications";

beforeEach(() => {
  db.order.email_thread_message_id = null;
  db.logs = [];
  db.reloj = 0;
  enviados.length = 0;
  messageIdsDeResend.clear();
});

describe("los tres avisos de un pedido forman un solo hilo", () => {
  it("el hilo se arma con los Message-ID REALES de Resend", async () => {
    const r1 = await notifyOrderSubmitted("o1", "COMMERCIAL_EXCEPTION", "u1");
    const r2 = await notifyDiscountRequested("o1", "COMMERCIAL_EXCEPTION", "u1");
    const r3 = await notifyDiscountResolved("o1", "READY_FOR_OPERATIONS", "u1", "APROBAR");

    expect([r1.estado, r2.estado, r3.estado]).toEqual(["enviado", "enviado", "enviado"]);
    const [uno, dos, tres] = enviados;

    const idReal1 = "<010f-1@us-east-2.amazonses.com>";
    const idReal2 = "<010f-2@us-east-2.amazonses.com>";

    // 1) El primero: asunto base y NINGÚN encabezado de threading (no se
    //    manda Message-ID propio porque Resend lo reescribe).
    expect(uno.subject).toBe("Nuevo pedido #123 — FARMACIA QUEEN");
    expect(uno.headers).toEqual({});

    // Y el ancla guardada es el Message-ID real, no uno inventado.
    expect(db.order.email_thread_message_id).toBe(idReal1);
    expect(db.logs[0].message_id).toBe(idReal1);

    // 2) Responde al primero, con el id real.
    expect(dos.subject).toBe("Re: Nuevo pedido #123 — FARMACIA QUEEN");
    expect(dos.headers).toEqual({ "In-Reply-To": idReal1, References: idReal1 });

    // 3) Responde al SEGUNDO y acumula la cadena real completa.
    expect(tres.subject).toBe("Re: Nuevo pedido #123 — FARMACIA QUEEN");
    expect(tres.headers).toEqual({
      "In-Reply-To": idReal2,
      References: `${idReal1} ${idReal2}`,
    });

    // El ancla no se reescribe con cada aviso.
    expect(db.order.email_thread_message_id).toBe(idReal1);
  });

  it("si el correo quedó en cola, el aviso siguiente resuelve el hueco", async () => {
    // Resend todavía no le asignó Message-ID al primero cuando se envía.
    messageIdsDeResend.set("resend-1", null);
    await notifyOrderSubmitted("o1", "SUBMITTED", "u1");
    expect(db.logs[0].message_id).toBeNull();
    expect(db.order.email_thread_message_id).toBeNull();

    // Ya salió: ahora sí tiene id. El aviso siguiente lo busca antes de
    // armar su cadena, así que el hilo se recupera en vez de quedar partido.
    messageIdsDeResend.set("resend-1", "<010f-tarde@us-east-2.amazonses.com>");
    await notifyDiscountRequested("o1", "COMMERCIAL_EXCEPTION", "u1");

    expect(db.logs[0].message_id).toBe("<010f-tarde@us-east-2.amazonses.com>");
    expect(db.order.email_thread_message_id).toBe("<010f-tarde@us-east-2.amazonses.com>");
    expect(enviados[1].headers).toEqual({
      "In-Reply-To": "<010f-tarde@us-east-2.amazonses.com>",
      References: "<010f-tarde@us-east-2.amazonses.com>",
    });
    expect(enviados[1].subject).toBe("Re: Nuevo pedido #123 — FARMACIA QUEEN");
  });

  it("un id fabricado por la implementación anterior se ignora y se corrige", async () => {
    // Estado real de los pedidos que ya salieron con el intento anterior:
    // un ancla que Resend nunca usó. Referenciarla no enlaza nada.
    db.order.email_thread_message_id = "<pedido-123.viejo-uuid@logisalud.com>";
    db.logs.push({
      id: 99,
      order_id: "o1",
      tipo: "pedido_enviado",
      estado: "enviado",
      message_id: "<pedido-123.viejo-uuid@logisalud.com>",
      proveedor_message_id: "resend-viejo",
      created_at: "2026-09-01T10:00:00Z",
    });
    messageIdsDeResend.set("resend-viejo", "<010f-viejo-real@us-east-2.amazonses.com>");
    db.reloj = 99;

    await notifyDiscountRequested("o1", "COMMERCIAL_EXCEPTION", "u1");

    // El id fabricado se reemplaza por el real, que sí existe en la bandeja.
    expect(db.logs[0].message_id).toBe("<010f-viejo-real@us-east-2.amazonses.com>");
    expect(db.order.email_thread_message_id).toBe("<010f-viejo-real@us-east-2.amazonses.com>");
    expect(enviados[0].headers).toEqual({
      "In-Reply-To": "<010f-viejo-real@us-east-2.amazonses.com>",
      References: "<010f-viejo-real@us-east-2.amazonses.com>",
    });
  });

  it("un envío fallido no entra en la cadena", async () => {
    const email = await import("@/services/email");
    const spy = vi.spyOn(email, "sendEmail");

    await notifyOrderSubmitted("o1", "SUBMITTED", "u1");
    const idReal1 = "<010f-1@us-east-2.amazonses.com>";

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
    expect(enviados.at(-1)?.headers).toEqual({ "In-Reply-To": idReal1, References: idReal1 });
    spy.mockRestore();
  });
});
