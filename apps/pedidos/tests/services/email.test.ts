import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailFromAddress, fetchResendMessageId, sendEmail } from "@/services/email";

/**
 * Lo que importa acá es lo que sale por el cable. El threading de correo es
 * fácil de "implementar" sin que llegue nada: los encabezados tienen que
 * estar en el payload que recibe Resend, con esos nombres exactos, o los
 * clientes no agrupan nada.
 */

const ORIGINAL_ENV = { ...process.env };

function stubFetch(respuesta: { ok: boolean; body?: unknown; status?: number }) {
  const spy = vi.fn(async () =>
    respuesta.ok
      ? new Response(JSON.stringify(respuesta.body ?? { id: "resend-uuid" }), { status: 200 })
      : new Response("nope", { status: respuesta.status ?? 422 }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

function cuerpoEnviado(spy: ReturnType<typeof stubFetch>) {
  const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "pedidos@logisalud.com";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("sendEmail", () => {
  it("manda los encabezados de threading tal cual, en el campo headers", async () => {
    const spy = stubFetch({ ok: true });
    const headers = {
      "In-Reply-To": "<010f0198-b@us-east-2.amazonses.com>",
      References: "<010f0198-a@us-east-2.amazonses.com> <010f0198-b@us-east-2.amazonses.com>",
    };

    const r = await sendEmail({
      to: ["a@logisalud.com"],
      subject: "Re: Nuevo pedido #1 — CLIENTE",
      html: "<p>x</p>",
      text: "x",
      headers,
    });

    expect(r.ok).toBe(true);
    expect(cuerpoEnviado(spy).headers).toEqual(headers);
    expect(cuerpoEnviado(spy).subject).toBe("Re: Nuevo pedido #1 — CLIENTE");
  });

  it("sin encabezados no manda el campo vacío", async () => {
    const spy = stubFetch({ ok: true });
    await sendEmail({ to: ["a@logisalud.com"], subject: "s", html: "h", text: "t" });
    expect("headers" in cuerpoEnviado(spy)).toBe(false);
  });

  it("el messageId que devuelve es el id INTERNO de Resend, no el Message-ID", async () => {
    // Este UUID no sirve como In-Reply-To: para eso hay que ir a buscar el
    // Message-ID real con fetchResendMessageId.
    stubFetch({ ok: true, body: { id: "b7f9-uuid-de-resend" } });
    const r = await sendEmail({ to: ["a@logisalud.com"], subject: "s", html: "h", text: "t" });
    expect(r.ok && r.messageId).toBe("b7f9-uuid-de-resend");
  });

  it("un rechazo del proveedor no lanza: devuelve el fallo con el detalle", async () => {
    stubFetch({ ok: false, status: 422 });
    const r = await sendEmail({ to: ["a@logisalud.com"], subject: "s", html: "h", text: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("422");
  });

  it("sin configuración no intenta el envío", async () => {
    delete process.env.RESEND_API_KEY;
    const spy = stubFetch({ ok: true });
    const r = await sendEmail({ to: ["a@logisalud.com"], subject: "s", html: "h", text: "t" });
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("fetchResendMessageId", () => {
  it("devuelve el Message-ID real, con ángulos, desde GET /emails/{id}", async () => {
    const spy = stubFetch({
      ok: true,
      body: { id: "abc", message_id: "010f0198-a@us-east-2.amazonses.com", last_event: "sent" },
    });
    const id = await fetchResendMessageId("abc");
    expect(id).toBe("<010f0198-a@us-east-2.amazonses.com>");
    expect(String(spy.mock.calls[0][0])).toBe("https://api.resend.com/emails/abc");
  });

  it("null mientras el correo sigue en cola y no tiene Message-ID", async () => {
    // Ese es el caso que resuelve el reintento del aviso siguiente.
    stubFetch({ ok: true, body: { id: "abc", message_id: null, last_event: "queued" } });
    expect(await fetchResendMessageId("abc")).toBeNull();
  });

  it("un error del proveedor no lanza", async () => {
    stubFetch({ ok: false, status: 404 });
    expect(await fetchResendMessageId("abc")).toBeNull();
  });

  it("sin api key no llama a la API", async () => {
    delete process.env.RESEND_API_KEY;
    const spy = stubFetch({ ok: true });
    expect(await fetchResendMessageId("abc")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("emailFromAddress", () => {
  it("expone el remitente para colgar el Message-ID de un dominio nuestro", () => {
    expect(emailFromAddress()).toBe("pedidos@logisalud.com");
  });
});
