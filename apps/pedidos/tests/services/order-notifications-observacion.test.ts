import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Una observación escrita DESPUÉS de enviar el pedido tiene que llegar a la
 * oficina.
 *
 * El correo del pedido sale al enviarlo, así que "entregar el lunes a las
 * 2" escrito diez minutos más tarde no aparecía en ninguna bandeja: se
 * quedaba en la pantalla del pedido. Ahora sale como respuesta dentro del
 * mismo hilo, con el detalle completo del pedido.
 */

const db = {
  observaciones: [] as Array<{ comentario: string; fecha: string; contexto: string | null; autor: string | null }>,
  logs: [] as Array<{ id: number; tipo: string; destinatarios: string[]; message_id: string | null; proveedor_message_id: string | null; estado: string; created_at: string }>,
  reloj: 0,
};

const order = {
  numero: 83,
  fecha_envio: "2026-09-09T00:24:03Z",
  created_at: "2026-09-09T00:23:46Z",
  dias_credito_solicitados: null,
  razon_social_snapshot: "INVERSIONES BIOFAR S.A.C.",
  direccion_snapshot: "Abc",
  canal_snapshot: "Horizontal",
  zona_snapshot: "ZONA 02",
  vendedor_snapshot: "LUIS VARGAS",
  email_thread_message_id: null as string | null,
  customer: { razon_social: "INVERSIONES BIOFAR S.A.C.", ruc_o_documento: "20517006514" },
  payment_terms: { nombre: "Crédito 30 días" },
  seller: { nombre_completo: "LUIS VARGAS", user_id: "u-luis" },
};

function tabla(nombre: string): any {
  if (nombre === "order_notification_recipients") {
    return {
      select: () => ({
        eq: async () => ({ data: [{ email: "aromero@logisalud.com" }], error: null }),
      }),
    };
  }
  if (nombre === "orders") {
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: order, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    };
  }
  if (nombre === "profiles") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { email: "lvargas@logisaludventas.com" }, error: null }) }),
        in: async () => ({ data: [{ id: "u-luis", full_name: "LUIS VARGAS" }], error: null }),
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
              product: { codigo_interno: "DHP014", descripcion: "A - FIEBRIN 1G/ 2ML CJA X 1 AMP." },
            },
          ],
          error: null,
        }),
      }),
    };
  }
  if (nombre === "approval_requests") return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
  if (nombre === "order_observations") {
    return {
      select: () => ({ eq: () => ({ order: async () => ({ data: db.observaciones, error: null }) }) }),
    };
  }
  if (nombre === "notification_logs") {
    return {
      select: () => ({
        eq: () => ({ eq: () => ({ order: async () => ({ data: [...db.logs], error: null }) }) }),
      }),
      insert: (fila: { tipo: string; destinatarios: string[]; estado: string; proveedor_message_id: string | null }) => {
        db.reloj += 1;
        const log = { ...fila, id: db.reloj, message_id: null, created_at: `2026-09-09T00:3${db.reloj}:00Z` };
        db.logs.push(log);
        return { select: () => ({ maybeSingle: async () => ({ data: { id: log.id }, error: null }) }) };
      },
      update: (v: { message_id?: string }) => ({
        eq: async (_c: string, id: number) => {
          const l = db.logs.find((x) => x.id === id);
          if (l && v.message_id) l.message_id = v.message_id;
          return { error: null };
        },
      }),
    };
  }
  throw new Error(`tabla no simulada: ${nombre}`);
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: tabla }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: tabla }) }));
vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));

const enviados: Array<{ to: string[]; subject: string; html: string; text: string; headers?: Record<string, string> }> = [];
vi.mock("@/services/email", () => ({
  isEmailConfigured: () => true,
  sendEmail: async (i: { to: string[]; subject: string; html: string; text: string; headers?: Record<string, string> }) => {
    enviados.push(i);
    return { ok: true as const, proveedor: "resend" as const, messageId: `resend-${enviados.length}` };
  },
  fetchResendMessageId: async (id: string) => `<010f-${id.split("-")[1]}@sa-east-1.amazonses.com>`,
}));

import { notifyObservationAdded, notifyOrderSubmitted } from "@/services/order-notifications";

beforeEach(() => {
  db.observaciones = [];
  db.logs = [];
  db.reloj = 0;
  order.email_thread_message_id = null;
  enviados.length = 0;
});

describe("observación agregada a un pedido ya enviado", () => {
  it("sale por correo, con el texto de la observación y dentro del mismo hilo", async () => {
    // 1) El pedido se envía sin observaciones: es el caso real del #83.
    await notifyOrderSubmitted("o83", "READY_FOR_OPERATIONS", "u-luis");
    expect(enviados[0].html).not.toContain("Observaciones del pedido");

    // 2) Después alguien escribe la observación.
    db.observaciones = [
      { comentario: "Entregar el lunes a las 2", fecha: "2026-09-09T00:40:00Z", contexto: null, autor: "u-luis" },
    ];
    const r = await notifyObservationAdded("o83", "READY_FOR_OPERATIONS", "u-luis", "Entregar el lunes a las 2");

    expect(r.estado).toBe("enviado");
    const aviso = enviados[1];
    // El texto va en el encabezado del aviso y en el bloque de observaciones.
    expect(aviso.html).toContain("Observación agregada — pedido #83");
    expect(aviso.html).toContain("Entregar el lunes a las 2");
    expect(aviso.html).toContain("Observaciones del pedido");
    expect(aviso.text).toContain("Entregar el lunes a las 2");

    // Mismo hilo que el correo del pedido, no una conversación nueva.
    expect(aviso.subject).toBe("Re: Nuevo pedido #83 — INVERSIONES BIOFAR S.A.C.");
    expect(aviso.headers?.["In-Reply-To"]).toBe("<010f-1@sa-east-1.amazonses.com>");

    // Y va a la oficina + al vendedor del pedido, como los demás avisos.
    expect(aviso.to).toEqual(["aromero@logisalud.com", "lvargas@logisaludventas.com"]);
    expect(db.logs[1].tipo).toBe("observacion_agregada");
  });

  it("una observación escrita antes de enviar sale en el correo del pedido", async () => {
    db.observaciones = [
      { comentario: "Entregar el lunes a las 2", fecha: "2026-09-09T00:20:00Z", contexto: null, autor: "u-luis" },
    ];
    await notifyOrderSubmitted("o83", "READY_FOR_OPERATIONS", "u-luis");

    expect(enviados[0].html).toContain("Observaciones del pedido");
    expect(enviados[0].html).toContain("Entregar el lunes a las 2");
    // Sin correo extra: ya salió en el del pedido.
    expect(enviados).toHaveLength(1);
  });
});
