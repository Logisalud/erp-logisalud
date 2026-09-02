import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailFromAddress, sendEmail } from "@/services/email";

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
  const init = spy.mock.calls[0][1] as RequestInit;
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
      "Message-ID": "<pedido-1.c@logisalud.com>",
      "In-Reply-To": "<pedido-1.a@logisalud.com>",
      References: "<pedido-1.a@logisalud.com> <pedido-1.b@logisalud.com>",
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
    // De ahí que el del hilo lo generemos nosotros: este UUID no sirve como
    // In-Reply-To de nada.
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

describe("emailFromAddress", () => {
  it("expone el remitente para colgar el Message-ID de un dominio nuestro", () => {
    expect(emailFromAddress()).toBe("pedidos@logisalud.com");
  });
});
