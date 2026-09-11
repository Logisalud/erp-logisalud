import { describe, expect, it } from "vitest";
import {
  buildCustomerEmailSubject,
  renderCustomerEmailHtml,
  renderCustomerEmailText,
  type CustomerEmailData,
} from "@/domain/customer-email";

/**
 * El correo que avisa en qué quedó un cliente nuevo.
 *
 * Lo que tiene que decir sí o sí: de qué cliente se trata, quién lo
 * registró, y —lo operativo— qué pasó con los pedidos que estaban
 * esperándolo. Aprobar un cliente no es un trámite aislado: destraba
 * pedidos ya armados, o los devuelve a borrador.
 */

const BASE: CustomerEmailData = {
  decision: "ACTIVO",
  razonSocial: "PORTOCARRERO GARCIA FLORISELDA",
  rucODocumento: "10435922304",
  vendedor: "LUPE CASTRO",
  zona: "ZONA 04",
  canal: "Farmacias",
  condicionPago: "Contado",
  direccion: "AV. LOS OLIVOS 123",
  fechaSolicitud: "2026-09-11T18:25:53Z",
  fechaValidacion: "2026-09-12T14:00:00Z",
  pedidosDestrabados: [],
};

describe("correo de cliente validado", () => {
  it("el asunto dice el desenlace y de qué cliente", () => {
    expect(buildCustomerEmailSubject(BASE)).toBe(
      "Cliente aprobado — PORTOCARRERO GARCIA FLORISELDA",
    );
    expect(buildCustomerEmailSubject({ ...BASE, decision: "RECHAZADO" })).toBe(
      "Cliente rechazado — PORTOCARRERO GARCIA FLORISELDA",
    );
  });

  it("nombra al vendedor que lo registró", () => {
    const html = renderCustomerEmailHtml(BASE);
    expect(html).toContain("LUPE CASTRO");
    expect(html).toContain("10435922304");
  });

  it("dice qué pedidos se destrabaron", () => {
    const html = renderCustomerEmailHtml({
      ...BASE,
      pedidosDestrabados: [{ id: "o1", numero: 12 }],
    });
    expect(html).toContain("Pedidos que estaban esperando");
    expect(html).toContain("#12");
  });

  it("al rechazar avisa que esos pedidos volvieron a borrador", () => {
    const texto = renderCustomerEmailText({
      ...BASE,
      decision: "RECHAZADO",
      pedidosDestrabados: [{ id: "o1", numero: 12 }],
    });
    expect(texto).toContain("volvieron a borrador");
    expect(texto).toContain("#12");
  });

  it("un pedido todavía sin número se nombra como borrador, no como #null", () => {
    // El correlativo se asigna al enviar (migración 1030): un pedido que
    // esperaba al cliente puede no tenerlo todavía.
    const texto = renderCustomerEmailText({
      ...BASE,
      pedidosDestrabados: [{ id: "o1", numero: null }],
    });
    expect(texto).toContain("un borrador");
    expect(texto).not.toContain("null");
  });

  it("escapa lo que viene de la base", () => {
    const html = renderCustomerEmailHtml({ ...BASE, razonSocial: 'BOTICA <script>"X"' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("los datos que falten no dejan una fila vacía", () => {
    const html = renderCustomerEmailHtml({
      ...BASE,
      vendedor: null,
      zona: null,
      canal: null,
      condicionPago: null,
      direccion: null,
      fechaSolicitud: null,
    });
    expect(html).not.toContain("Registrado por");
    expect(html).not.toContain("Zona");
    expect(html).toContain("10435922304");
  });
});
