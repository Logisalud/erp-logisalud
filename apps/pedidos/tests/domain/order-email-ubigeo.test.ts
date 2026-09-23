import { describe, expect, it } from "vitest";
import {
  renderOrderEmailHtml,
  renderOrderEmailText,
  type OrderEmailData,
} from "@/domain/order-email";

/**
 * El correo del pedido dice DÓNDE se entrega, no sólo la calle.
 *
 * Lo pidió Operaciones: con "CAL. MAXIMO ABRIL N° 397" no alcanza para armar
 * la guía de remisión ni para saber a qué ruta va el pedido. Hacen falta el
 * distrito, la provincia, el departamento y el código INEI — este último es
 * el que pide la guía.
 */

const BASE: OrderEmailData = {
  numero: 36,
  fechaEnvio: "2026-09-16T17:00:00Z",
  estadoResultado: "READY_FOR_OPERATIONS",
  cliente: {
    razonSocial: "WANKAFARMA PLUS E.I.R.L.",
    rucODocumento: "20611975121",
    celular: "987654321",
    direccionEntrega: "CAL. MAXIMO ABRIL N° 397 CIUDAD DE DIOS",
    ubigeo: {
      codigo: "150133",
      departamento: "LIMA",
      provincia: "LIMA",
      distrito: "SAN JUAN DE MIRAFLORES",
    },
    canal: "Horizontal",
    zona: "ZONA 08",
  },
  vendedor: "ROMINA CHAMOCHUMBI",
  vendedorCodigo: "CRP1013",
  vendedorZonaCodigo: "LIMH08",
  condicionPago: "Contado",
  items: [],
};

describe("ubigeo de la entrega en el correo", () => {
  it("muestra distrito, provincia, departamento y el código", () => {
    const html = renderOrderEmailHtml(BASE);

    expect(html).toContain("SAN JUAN DE MIRAFLORES");
    expect(html).toContain("LIMA / LIMA");
    expect(html).toContain("150133");
    expect(html).toContain("Ubigeo (INEI)");
  });

  it("lo mismo en la versión de texto", () => {
    const texto = renderOrderEmailText(BASE);

    expect(texto).toContain("Distrito: SAN JUAN DE MIRAFLORES");
    expect(texto).toContain("Provincia / Departamento: LIMA / LIMA");
    expect(texto).toContain("Ubigeo (INEI): 150133");
  });

  it("sin ubigeo no deja filas vacías ni inventa un distrito", () => {
    // Los pedidos viejos, anteriores al selector de ubigeo, no lo tienen.
    const sinUbigeo = { ...BASE, cliente: { ...BASE.cliente, ubigeo: null } };

    const html = renderOrderEmailHtml(sinUbigeo);
    const texto = renderOrderEmailText(sinUbigeo);

    expect(html).not.toContain("Ubigeo (INEI)");
    expect(html).not.toContain("Distrito");
    expect(texto).not.toContain("Distrito:");
    // La dirección sí sigue saliendo.
    expect(html).toContain("CAL. MAXIMO ABRIL");
  });

  it("escapa lo que viene de la base", () => {
    const html = renderOrderEmailHtml({
      ...BASE,
      cliente: { ...BASE.cliente, ubigeo: { ...BASE.cliente.ubigeo!, distrito: '<script>"x"' } },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
