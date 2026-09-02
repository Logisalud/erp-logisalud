import { describe, expect, it } from "vitest";
import {
  asuntoDeRespuesta,
  cabecerasDeHilo,
  esMessageIdValido,
  normalizarDominio,
  nuevoMessageId,
} from "@/domain/email-threading";

describe("nuevoMessageId", () => {
  it("arma un Message-ID válido, con ángulos y dominio nuestro", () => {
    const id = nuevoMessageId({ numero: 123, dominio: "logisalud.com", unico: "abc-123" });
    expect(id).toBe("<pedido-123.abc-123@logisalud.com>");
    expect(esMessageIdValido(id)).toBe(true);
  });

  it("no deja pasar caracteres que romperían el encabezado", () => {
    const id = nuevoMessageId({
      numero: 7,
      dominio: "logisalud.com",
      unico: "a b<c>@d\ne",
    });
    expect(esMessageIdValido(id)).toBe(true);
    expect(id).toBe("<pedido-7.abcde@logisalud.com>");
  });

  it("dos correos del mismo pedido no comparten id", () => {
    const a = nuevoMessageId({ numero: 1, dominio: "x.com", unico: "u1" });
    const b = nuevoMessageId({ numero: 1, dominio: "x.com", unico: "u2" });
    expect(a).not.toBe(b);
  });
});

describe("normalizarDominio", () => {
  it("saca el dominio de un remitente simple o con nombre", () => {
    expect(normalizarDominio("pedidos@logisalud.com")).toBe("logisalud.com");
    expect(normalizarDominio("LOGISALUD Pedidos <pedidos@logisalud.com>")).toBe("logisalud.com");
    expect(normalizarDominio("  Pedidos@LOGISALUD.com ")).toBe("logisalud.com");
  });

  it("sin remitente utilizable devuelve algo sintácticamente válido", () => {
    // Un Message-ID roto invalida el correo entero: peor que un dominio feo.
    expect(normalizarDominio("")).toBe("pedidos.invalid");
    expect(esMessageIdValido(nuevoMessageId({ numero: 1, dominio: "", unico: "u" }))).toBe(true);
  });
});

describe("asuntoDeRespuesta", () => {
  it("prefija Re: sobre el asunto base", () => {
    expect(asuntoDeRespuesta("Nuevo pedido #123 — FARMACIA QUEEN")).toBe(
      "Re: Nuevo pedido #123 — FARMACIA QUEEN",
    );
  });

  it("es idempotente: nunca deja 'Re: Re:'", () => {
    // Un "Re: Re:" es justamente lo que hace que Outlook abra otra
    // conversación en vez de agrupar.
    expect(asuntoDeRespuesta("Re: Nuevo pedido #123")).toBe("Re: Nuevo pedido #123");
    expect(asuntoDeRespuesta("RE : Nuevo pedido #123")).toBe("RE : Nuevo pedido #123");
    expect(asuntoDeRespuesta(asuntoDeRespuesta("Nuevo pedido #1"))).toBe("Re: Nuevo pedido #1");
  });
});

describe("cabecerasDeHilo", () => {
  const mio = "<pedido-1.c@logisalud.com>";
  const ancla = "<pedido-1.a@logisalud.com>";
  const segundo = "<pedido-1.b@logisalud.com>";

  it("el primer correo del hilo sólo lleva su Message-ID", () => {
    // In-Reply-To vacío es peor que no mandarlo.
    expect(cabecerasDeHilo({ messageId: mio, referencias: [] })).toEqual({ "Message-ID": mio });
  });

  it("el segundo responde al ancla y la referencia", () => {
    expect(cabecerasDeHilo({ messageId: segundo, referencias: [ancla] })).toEqual({
      "Message-ID": segundo,
      "In-Reply-To": ancla,
      References: ancla,
    });
  });

  it("el tercero responde al ÚLTIMO y acumula la cadena completa", () => {
    expect(cabecerasDeHilo({ messageId: mio, referencias: [ancla, segundo] })).toEqual({
      "Message-ID": mio,
      "In-Reply-To": segundo,
      References: `${ancla} ${segundo}`,
    });
  });

  it("descarta ids inválidos en vez de meterlos en la cadena", () => {
    const headers = cabecerasDeHilo({
      messageId: mio,
      referencias: ["sin-angulos@x.com", "", ancla],
    });
    expect(headers.References).toBe(ancla);
    expect(headers["In-Reply-To"]).toBe(ancla);
  });

  it("no repite el mismo id dos veces", () => {
    const headers = cabecerasDeHilo({ messageId: mio, referencias: [ancla, ancla, segundo] });
    expect(headers.References).toBe(`${ancla} ${segundo}`);
  });

  it("una cadena larguísima se recorta conservando el ancla y los últimos", () => {
    const cadena = Array.from({ length: 30 }, (_, i) => `<pedido-1.n${i}@logisalud.com>`);
    const headers = cabecerasDeHilo({ messageId: mio, referencias: cadena });
    const refs = (headers.References ?? "").split(" ");
    expect(refs).toHaveLength(20);
    expect(refs[0]).toBe(cadena[0]);
    expect(refs.at(-1)).toBe(cadena.at(-1));
    expect(headers["In-Reply-To"]).toBe(cadena.at(-1));
  });
});

describe("esMessageIdValido", () => {
  it("exige ángulos y arroba", () => {
    expect(esMessageIdValido("<a@b.com>")).toBe(true);
    expect(esMessageIdValido("a@b.com")).toBe(false);
    expect(esMessageIdValido("<ab.com>")).toBe(false);
    expect(esMessageIdValido("<a b@c.com>")).toBe(false);
    expect(esMessageIdValido(null)).toBe(false);
    expect(esMessageIdValido(undefined)).toBe(false);
  });
});
