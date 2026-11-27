import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { esRebote, firmaValida, leerEvento } from "@/domain/resend-webhook";

/**
 * El webhook es la única forma de enterarse de que un correo aceptado por
 * Resend nunca llegó. Pasó con la vendedora SUSANA RAMOS: 66 correos en
 * dos meses registrados como "enviado", ninguno entregado, porque su
 * dirección había quedado en la lista de supresión. Lo que se cuida acá es
 * que un evento inventado no pueda marcar un correo como caído, y que un
 * rebote de verdad se lea completo.
 */

const SECRETO = "whsec_c2VjcmV0by1kZS1wcnVlYmEtbXV5LWxhcmdv";
const AHORA = new Date("2026-11-24T14:31:00Z");

function firmar(cuerpo: string, id = "msg_1", ts = String(Math.floor(AHORA.getTime() / 1000))) {
  const clave = Buffer.from(SECRETO.slice("whsec_".length), "base64");
  const firma = createHmac("sha256", clave).update(`${id}.${ts}.${cuerpo}`).digest("base64");
  return { svixId: id, svixTimestamp: ts, svixSignature: `v1,${firma}` };
}

const REBOTE = JSON.stringify({
  type: "email.bounced",
  created_at: "2026-11-24T14:31:06.000Z",
  data: {
    email_id: "01a20df7-afe0-7f00-8af3-df9da9a4be09",
    to: ["sramos@logisaludventas.com"],
    subject: "Nuevo pedido #572",
    bounce: {
      type: "Permanent",
      subType: "Suppressed",
      message: "The recipient's email address is on the suppression list",
    },
  },
});

describe("firma del webhook de Resend", () => {
  it("acepta la firma correcta", () => {
    expect(firmaValida({ cuerpo: REBOTE, ...firmar(REBOTE), secreto: SECRETO, ahora: AHORA })).toBe(
      true,
    );
  });

  it("rechaza una firma de otro cuerpo", () => {
    const otra = firmar("{}");
    expect(firmaValida({ cuerpo: REBOTE, ...otra, secreto: SECRETO, ahora: AHORA })).toBe(false);
  });

  it("rechaza una firma de otro secreto", () => {
    expect(
      firmaValida({
        cuerpo: REBOTE,
        ...firmar(REBOTE),
        secreto: "whsec_b3Ryby1zZWNyZXRv",
        ahora: AHORA,
      }),
    ).toBe(false);
  });

  it("falla cerrado sin secreto configurado", () => {
    // Un webhook abierto deja que cualquiera invente rebotes y marque como
    // caído un correo que sí llegó.
    expect(firmaValida({ cuerpo: REBOTE, ...firmar(REBOTE), secreto: "", ahora: AHORA })).toBe(
      false,
    );
  });

  it("falla cerrado sin los encabezados", () => {
    expect(
      firmaValida({
        cuerpo: REBOTE,
        svixId: null,
        svixTimestamp: null,
        svixSignature: null,
        secreto: SECRETO,
        ahora: AHORA,
      }),
    ).toBe(false);
  });

  it("rechaza un evento viejo, aunque la firma sea válida", () => {
    // Acota la repetición: un evento capturado hoy no sirve mañana.
    const viejo = firmar(REBOTE, "msg_1", String(Math.floor(AHORA.getTime() / 1000) - 3600));
    expect(firmaValida({ cuerpo: REBOTE, ...viejo, secreto: SECRETO, ahora: AHORA })).toBe(false);
  });

  it("acepta cuando el header trae varias firmas (rotación de secreto)", () => {
    const { svixId, svixTimestamp, svixSignature } = firmar(REBOTE);
    expect(
      firmaValida({
        cuerpo: REBOTE,
        svixId,
        svixTimestamp,
        svixSignature: `v1,otracosa ${svixSignature}`,
        secreto: SECRETO,
        ahora: AHORA,
      }),
    ).toBe(true);
  });
});

describe("lectura del evento", () => {
  it("lee el rebote con su motivo completo", () => {
    const e = leerEvento(REBOTE);
    expect(e).toEqual({
      tipo: "email.bounced",
      messageId: "01a20df7-afe0-7f00-8af3-df9da9a4be09",
      destinatarios: ["sramos@logisaludventas.com"],
      detalle: "Permanent · Suppressed · The recipient's email address is on the suppression list",
      ocurridoEn: "2026-11-24T14:31:06.000Z",
    });
  });

  it("un entregado no es un rebote", () => {
    const cuerpo = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "abc", to: ["aromero@logisalud.com"] },
    });
    const e = leerEvento(cuerpo);
    expect(e?.tipo).toBe("email.delivered");
    expect(esRebote(e!.tipo)).toBe(false);
  });

  it("el rebote y la queja sí lo son", () => {
    expect(esRebote("email.bounced")).toBe(true);
    expect(esRebote("email.complained")).toBe(true);
    expect(esRebote("email.opened")).toBe(false);
  });

  it("un cuerpo sin email_id no se entiende, y no rompe", () => {
    expect(leerEvento(JSON.stringify({ type: "email.bounced", data: {} }))).toBeNull();
    expect(leerEvento("esto no es json")).toBeNull();
    expect(leerEvento("null")).toBeNull();
  });
});
