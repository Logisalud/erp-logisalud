import { describe, expect, it } from "vitest";
import {
  NOTA_NO_COMPROBANTE,
  buildOrderEmailSubject,
  computeOrderTotals,
  escapeHtml,
  formatSoles,
  renderOrderEmailHtml,
  renderOrderEmailText,
  type OrderEmailData,
  precioEspecialLabel,
} from "@/domain/order-email";

function buildData(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  return {
    numero: 1042,
    fechaEnvio: "2026-08-05T14:30:00Z",
    estadoResultado: "READY_FOR_OPERATIONS",
    cliente: {
      razonSocial: "CLINICA EJEMPLO S.A.C.",
      rucODocumento: "20100000001",
      direccionEntrega: "Av. Ejemplo 123, Surco",
      canal: "Horizontal",
      zona: "ZONA 02",
    },
    vendedor: "LUIS VARGAS",
    condicionPago: "Crédito 30 días",
    items: [
      {
        codigo: "DAPHA10-EJ",
        descripcion: "Dapha 10 mg x 30 tabletas",
        cantidad: 10,
        precioUnitario: 25.5,
        igv: 45.9,
        subtotal: 255,
        total: 300.9,
      },
      {
        codigo: "OTRO-01",
        descripcion: "Producto inafecto",
        cantidad: 2,
        precioUnitario: 10,
        igv: 0,
        subtotal: 20,
        total: 20,
      },
    ],
    ...overrides,
  };
}

describe("computeOrderTotals", () => {
  it("suma las líneas ya calculadas por el servidor, sin recalcular IGV", () => {
    expect(computeOrderTotals(buildData().items)).toEqual({
      subtotal: 275,
      igv: 45.9,
      total: 320.9,
    });
  });

  it("un pedido sin líneas da totales en cero, no NaN", () => {
    expect(computeOrderTotals([])).toEqual({ subtotal: 0, igv: 0, total: 0 });
  });

  it("redondea a 2 decimales en vez de arrastrar error de punto flotante", () => {
    const totals = computeOrderTotals([
      { codigo: "A", descripcion: "A", cantidad: 1, precioUnitario: 0.1, igv: 0, subtotal: 0.1, total: 0.1 },
      { codigo: "B", descripcion: "B", cantidad: 1, precioUnitario: 0.2, igv: 0, subtotal: 0.2, total: 0.2 },
    ]);
    expect(totals.subtotal).toBe(0.3);
  });
});

describe("buildOrderEmailSubject", () => {
  it("incluye número de pedido y razón social", () => {
    expect(buildOrderEmailSubject(buildData())).toBe(
      "Nuevo pedido #1042 — CLINICA EJEMPLO S.A.C.",
    );
  });
});

describe("escapeHtml", () => {
  it("neutraliza HTML que venga en un dato de la BD", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapa el ampersand de una razón social real", () => {
    expect(escapeHtml("M & M PROMEFAR")).toBe("M &amp; M PROMEFAR");
  });
});

describe("renderOrderEmailHtml", () => {
  it("incluye los datos del cliente, del pedido y cada producto", () => {
    const html = renderOrderEmailHtml(buildData());

    expect(html).toContain("Nuevo pedido #1042");
    expect(html).toContain("CLINICA EJEMPLO S.A.C.");
    expect(html).toContain("20100000001");
    expect(html).toContain("Av. Ejemplo 123, Surco");
    expect(html).toContain("Horizontal");
    expect(html).toContain("ZONA 02");
    expect(html).toContain("LUIS VARGAS");
    expect(html).toContain("Crédito 30 días");
    expect(html).toContain("DAPHA10-EJ");
    expect(html).toContain("Dapha 10 mg x 30 tabletas");
    expect(html).toContain("OTRO-01");
  });

  it("muestra el total general con el IGV desglosado", () => {
    const html = renderOrderEmailHtml(buildData());
    expect(html).toContain(formatSoles(275));
    expect(html).toContain(formatSoles(45.9));
    expect(html).toContain(formatSoles(320.9));
  });

  it("incluye la nota de que no es comprobante de pago", () => {
    expect(renderOrderEmailHtml(buildData())).toContain(escapeHtml(NOTA_NO_COMPROBANTE));
  });

  it("usa los colores de marca LOGISALUD", () => {
    const html = renderOrderEmailHtml(buildData());
    expect(html).toContain("#4BB168");
    expect(html).toContain("#4ABCC2");
  });

  it("escapa el HTML de los datos en vez de interpolarlo crudo", () => {
    const html = renderOrderEmailHtml(
      buildData({
        cliente: {
          razonSocial: '<img src=x onerror="alert(1)">',
          rucODocumento: "20100000001",
          direccionEntrega: null,
          canal: null,
          zona: null,
        },
      }),
    );
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("muestra un guion en los campos que faltan, sin dejar 'null' a la vista", () => {
    const html = renderOrderEmailHtml(
      buildData({
        cliente: {
          razonSocial: "CLIENTE SIN DATOS",
          rucODocumento: "20100000001",
          direccionEntrega: null,
          canal: null,
          zona: null,
        },
        vendedor: null,
        condicionPago: null,
      }),
    );
    expect(html).not.toContain(">null<");
    expect(html).toContain("—");
  });

  it("no revienta con un pedido sin líneas", () => {
    const html = renderOrderEmailHtml(buildData({ items: [] }));
    expect(html).toContain("El pedido no tiene líneas.");
  });
});

describe("renderOrderEmailText", () => {
  it("da una versión en texto plano con los mismos datos clave", () => {
    const text = renderOrderEmailText(buildData());
    expect(text).toContain("Nuevo pedido #1042");
    expect(text).toContain("CLINICA EJEMPLO S.A.C.");
    expect(text).toContain("DAPHA10-EJ");
    expect(text).toContain(NOTA_NO_COMPROBANTE);
    expect(text).not.toContain("<");
  });
});

describe("precioEspecialLabel", () => {
  const base = {
    precioSolicitado: 2,
    porcentajeDescuento: null,
    estado: "PENDIENTE",
    decision: null,
    precioAprobado: null,
  };

  it("devuelve null cuando el ítem va a precio de lista", () => {
    expect(precioEspecialLabel(null)).toBeNull();
    expect(precioEspecialLabel(undefined)).toBeNull();
  });

  it("avisa que está pendiente y cuánto se pidió", () => {
    expect(precioEspecialLabel(base)).toBe("PENDIENTE — pide S/ 2.00");
  });

  it("soporta que el vendedor pida un porcentaje en vez de un precio", () => {
    expect(
      precioEspecialLabel({ ...base, precioSolicitado: null, porcentajeDescuento: 15 }),
    ).toBe("PENDIENTE — pide 15% dcto.");
  });

  it("contrasta el precio aprobado contra el pedido", () => {
    expect(
      precioEspecialLabel({
        ...base,
        estado: "RESUELTO",
        decision: "APROBAR_OTRO_PRECIO",
        precioAprobado: 60,
      }),
    ).toBe("Aprobado S/ 60.00 (pidió S/ 2.00)");
  });

  it("deja constancia del rechazo", () => {
    expect(
      precioEspecialLabel({ ...base, estado: "RESUELTO", decision: "RECHAZAR" }),
    ).toBe("Rechazado (pidió S/ 2.00)");
  });
});
