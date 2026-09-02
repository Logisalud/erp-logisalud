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
  etiquetaObservacion,
  precioEspecialLabel,
  precioEspecialVigente,
  descuentoAplicado,
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
    precioOriginal: null,
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

  it("muestra los dos precios y el descuento cuando se conoce el de lista", () => {
    expect(
      precioEspecialLabel({
        ...base,
        precioOriginal: 100,
        precioSolicitado: 80,
        estado: "RESUELTO",
        decision: "APROBAR",
        precioAprobado: 80,
      }),
    ).toBe("lista S/ 100.00 → aprobado S/ 80.00 (−S/ 20.00, −20.0%)");
  });

  it("con el de lista conocido, el rechazo dice a qué precio queda la línea", () => {
    expect(
      precioEspecialLabel({
        ...base,
        precioOriginal: 100,
        estado: "RESUELTO",
        decision: "RECHAZAR",
      }),
    ).toBe("Rechazado, queda en lista S/ 100.00 (pidió S/ 2.00)");
  });

  it("un precio fijado por el administrador no dice 'aprobado': no lo aprobó nadie", () => {
    expect(
      precioEspecialLabel({
        ...base,
        precioOriginal: 2.5,
        precioSolicitado: 1,
        estado: "RESUELTO",
        decision: "FIJADO_POR_ADMIN",
        precioAprobado: 1,
      }),
    ).toBe("lista S/ 2.50 → fijado por administración S/ 1.00 (−S/ 1.50, −60.0%)");
  });

  it("el precio fijado por administración arrastra su motivo cuando hay uno", () => {
    expect(
      precioEspecialLabel({
        ...base,
        precioOriginal: 2.5,
        estado: "RESUELTO",
        decision: "FIJADO_POR_ADMIN",
        precioAprobado: 1,
        motivo: "Cierre de campaña",
      }),
    ).toContain("· Cierre de campaña");
  });

  it("pendiente también contrasta contra el precio de lista", () => {
    expect(precioEspecialLabel({ ...base, precioOriginal: 100 })).toBe(
      "PENDIENTE — lista S/ 100.00, pide S/ 2.00",
    );
  });
});

describe("precioEspecialVigente", () => {
  const base = {
    precioOriginal: 100,
    precioSolicitado: 80,
    porcentajeDescuento: null,
    estado: "RESUELTO",
    decision: "APROBAR",
    precioAprobado: 80,
  };

  it("es el precio aprobado cuando la solicitud se resolvió a favor", () => {
    expect(precioEspecialVigente(base)).toBe(80);
    expect(precioEspecialVigente({ ...base, decision: "APROBAR_OTRO_PRECIO", precioAprobado: 85 })).toBe(85);
  });

  it("no hay precio especial vigente mientras la solicitud está pendiente", () => {
    expect(precioEspecialVigente({ ...base, estado: "PENDIENTE", decision: null, precioAprobado: null })).toBeNull();
  });

  it("un rechazo deja la línea al precio de lista", () => {
    expect(precioEspecialVigente({ ...base, decision: "RECHAZAR" })).toBeNull();
    expect(precioEspecialVigente({ ...base, decision: "SOLICITAR_INFO" })).toBeNull();
  });

  it("un precio fijado por el administrador también es precio vigente", () => {
    expect(precioEspecialVigente({ ...base, decision: "FIJADO_POR_ADMIN" })).toBe(80);
  });

  it("sin solicitud no hay nada que mostrar", () => {
    expect(precioEspecialVigente(null)).toBeNull();
    expect(precioEspecialVigente(undefined)).toBeNull();
  });
});

describe("descuentoAplicado", () => {
  const base = {
    precioOriginal: 100,
    precioSolicitado: 75,
    porcentajeDescuento: null,
    estado: "RESUELTO",
    decision: "APROBAR",
    precioAprobado: 75,
  };

  it("calcula monto y porcentaje contra el precio de lista", () => {
    expect(descuentoAplicado(base)).toEqual({ monto: 25, porcentaje: 25 });
  });

  it("sin precio de lista capturado no se puede calcular", () => {
    expect(descuentoAplicado({ ...base, precioOriginal: null })).toBeNull();
  });

  it("no divide por cero si el precio de lista era cero", () => {
    expect(descuentoAplicado({ ...base, precioOriginal: 0 })).toBeNull();
  });

  it("sin precio especial vigente no hay descuento aplicado", () => {
    expect(descuentoAplicado({ ...base, decision: "RECHAZAR" })).toBeNull();
  });
});

describe("precio comparado en el cuerpo del correo", () => {
  const conDescuento = buildData({
    estadoResultado: "COMMERCIAL_EXCEPTION",
    evento: {
      titulo: "Descuento aprobado — pedido #1042",
      lead: "El precio especial quedó aplicado.",
      asunto: "Descuento aprobado — pedido",
    },
    items: [
      {
        codigo: "DAPHA10-EJ",
        descripcion: "DAPHA 10 x 30 TAB",
        cantidad: 10,
        precioUnitario: 80,
        igv: 0,
        subtotal: 800,
        total: 800,
        precioEspecial: {
          precioOriginal: 100,
          precioSolicitado: 80,
          porcentajeDescuento: null,
          estado: "RESUELTO",
          decision: "APROBAR",
          precioAprobado: 80,
        },
      },
      {
        codigo: "SIN-DCTO",
        descripcion: "PRODUCTO A PRECIO DE LISTA",
        cantidad: 2,
        precioUnitario: 50,
        igv: 18,
        subtotal: 100,
        total: 118,
      },
    ],
  });

  it("muestra precio de lista, precio especial y descuento en el HTML", () => {
    const html = renderOrderEmailHtml(conDescuento);
    expect(html).toContain("lista S/ 100.00 → aprobado S/ 80.00 (−S/ 20.00, −20.0%)");
  });

  it("muestra la comparación también en la versión de texto", () => {
    const text = renderOrderEmailText(conDescuento);
    expect(text).toContain("Precio especial · lista S/ 100.00 → aprobado S/ 80.00");
  });

  it("la línea sin descuento no gana ninguna nota de precio especial", () => {
    const html = renderOrderEmailHtml(conDescuento);
    const desdeLaLinea = html.slice(html.indexOf("PRODUCTO A PRECIO DE LISTA"));
    expect(desdeLaLinea).not.toContain("Precio especial ·");
  });

  it("el asunto refleja el evento cuando hay uno", () => {
    expect(buildOrderEmailSubject(conDescuento)).toContain("Descuento aprobado");
  });
});

describe("observaciones del pedido", () => {
  const conObservaciones = buildData({
    observaciones: [
      {
        comentario: "Entregar antes del viernes, coordinar con Rosa.",
        fecha: "2026-09-02T15:00:00Z",
        autor: "LUIS VARGAS",
        contexto: null,
      },
      {
        comentario: "Plazo aprobado por Administración.",
        fecha: "2026-09-02T16:30:00Z",
        autor: "ANA ROMERO",
        contexto: "ADMINISTRATIVE_EXCEPTION",
      },
    ],
  });

  it("el HTML muestra TODAS las observaciones, no sólo la última", () => {
    // Son una conversación: quedarse con la última esconde el pedido
    // original ("mandar 20 cajas" seguido de "confirmado con Rosa").
    const html = renderOrderEmailHtml(conObservaciones);
    expect(html).toContain("Observaciones del pedido");
    expect(html).toContain("Entregar antes del viernes, coordinar con Rosa.");
    expect(html).toContain("Plazo aprobado por Administración.");
  });

  it("cada una dice cuándo y de quién viene", () => {
    const html = renderOrderEmailHtml(conObservaciones);
    expect(html).toContain("LUIS VARGAS");
    expect(html).toContain("excepción administrativa");
  });

  it("la versión de texto también las lleva", () => {
    const text = renderOrderEmailText(conObservaciones);
    expect(text).toContain("OBSERVACIONES DEL PEDIDO");
    expect(text).toContain("Entregar antes del viernes, coordinar con Rosa.");
    expect(text).toContain("Plazo aprobado por Administración.");
  });

  it("un pedido sin observaciones no muestra la sección vacía", () => {
    const html = renderOrderEmailHtml(buildData({ observaciones: [] }));
    expect(html).not.toContain("Observaciones del pedido");
    expect(renderOrderEmailText(buildData())).not.toContain("OBSERVACIONES DEL PEDIDO");
  });

  it("escapa el HTML de lo que escribió el vendedor", () => {
    const html = renderOrderEmailHtml(
      buildData({
        observaciones: [
          { comentario: "<script>alert(1)</script>", fecha: "2026-09-02T15:00:00Z", autor: null, contexto: null },
        ],
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("etiquetaObservacion", () => {
  it("junta fecha, autor y contexto", () => {
    const etiqueta = etiquetaObservacion({
      comentario: "x",
      fecha: "2026-09-02T15:00:00Z",
      autor: "LUIS VARGAS",
      contexto: "COMMERCIAL_EXCEPTION",
    });
    expect(etiqueta).toContain("LUIS VARGAS");
    expect(etiqueta).toContain("excepción comercial");
  });

  it("sin autor no deja un separador colgando", () => {
    const etiqueta = etiquetaObservacion({
      comentario: "x",
      fecha: "2026-09-02T15:00:00Z",
      autor: null,
      contexto: null,
    });
    expect(etiqueta.endsWith("·")).toBe(false);
    expect(etiqueta).not.toContain("· ·");
  });
});
