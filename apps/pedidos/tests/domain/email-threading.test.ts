import { describe, expect, it } from "vitest";
import {
  asuntoDeRespuesta,
  cabecerasDeHilo,
  esMessageIdPropioViejo,
  esMessageIdValido,
  normalizarMessageId,
} from "@/domain/email-threading";

const A = "<010f0198-a@us-east-2.amazonses.com>";
const B = "<010f0198-b@us-east-2.amazonses.com>";

describe("normalizarMessageId", () => {
  it("agrega los ángulos si Resend los devuelve sin ellos", () => {
    expect(normalizarMessageId("010f0198-a@us-east-2.amazonses.com")).toBe(A);
  });

  it("respeta el valor si ya viene con ángulos", () => {
    expect(normalizarMessageId(A)).toBe(A);
    expect(normalizarMessageId(`  ${A}  `)).toBe(A);
  });

  it("descarta lo que no tiene forma de Message-ID", () => {
    // Mejor un hilo sin cadena que una cadena mentirosa.
    expect(normalizarMessageId("queued")).toBeNull();
    expect(normalizarMessageId("")).toBeNull();
    expect(normalizarMessageId(null)).toBeNull();
    expect(normalizarMessageId(undefined)).toBeNull();
  });
});

describe("esMessageIdPropioViejo", () => {
  it("reconoce los ids que fabricaba la implementación anterior", () => {
    // Resend los reescribía, así que esos correos nunca existieron con ese
    // id: referenciarlos no enlaza nada.
    expect(esMessageIdPropioViejo("<pedido-123.abc-uuid@logisalud.com>")).toBe(true);
    expect(esMessageIdPropioViejo("<pedido-1.x@logisalud.com>")).toBe(true);
  });

  it("no confunde uno real de Resend", () => {
    expect(esMessageIdPropioViejo(A)).toBe(false);
    expect(esMessageIdPropioViejo(null)).toBe(false);
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
    expect(asuntoDeRespuesta(asuntoDeRespuesta("Nuevo pedido #1"))).toBe("Re: Nuevo pedido #1");
  });
});

describe("cabecerasDeHilo", () => {
  it("el primer correo del hilo no lleva encabezados de threading", () => {
    // Tampoco Message-ID propio: Resend lo reescribe con el suyo.
    expect(cabecerasDeHilo({ referencias: [] })).toEqual({});
  });

  it("el segundo responde al primero y lo referencia", () => {
    expect(cabecerasDeHilo({ referencias: [A] })).toEqual({
      "In-Reply-To": A,
      References: A,
    });
  });

  it("el tercero responde al ÚLTIMO y acumula la cadena completa", () => {
    expect(cabecerasDeHilo({ referencias: [A, B] })).toEqual({
      "In-Reply-To": B,
      References: `${A} ${B}`,
    });
  });

  it("descarta ids inválidos en vez de meterlos en la cadena", () => {
    const headers = cabecerasDeHilo({ referencias: ["sin-angulos@x.com", "", A] });
    expect(headers.References).toBe(A);
    expect(headers["In-Reply-To"]).toBe(A);
  });

  it("no repite el mismo id dos veces", () => {
    expect(cabecerasDeHilo({ referencias: [A, A, B] }).References).toBe(`${A} ${B}`);
  });

  it("una cadena larguísima se recorta conservando el ancla y los últimos", () => {
    const cadena = Array.from({ length: 30 }, (_, i) => `<n${i}@us-east-2.amazonses.com>`);
    const headers = cabecerasDeHilo({ referencias: cadena });
    const refs = (headers.References ?? "").split(" ");
    expect(refs).toHaveLength(20);
    expect(refs[0]).toBe(cadena[0]);
    expect(refs.at(-1)).toBe(cadena.at(-1));
    expect(headers["In-Reply-To"]).toBe(cadena.at(-1));
  });
});

describe("esMessageIdValido", () => {
  it("exige ángulos y arroba", () => {
    expect(esMessageIdValido(A)).toBe(true);
    expect(esMessageIdValido("a@b.com")).toBe(false);
    expect(esMessageIdValido("<ab.com>")).toBe(false);
    expect(esMessageIdValido("<a b@c.com>")).toBe(false);
    expect(esMessageIdValido(null)).toBe(false);
  });
});
