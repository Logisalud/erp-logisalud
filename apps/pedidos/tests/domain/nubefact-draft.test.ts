import { describe, expect, it } from "vitest";
import {
  AVISO_BORRADOR,
  TIPO_DE_COMPROBANTE,
  TIPO_DE_DOCUMENTO_CLIENTE,
  buildComprobanteBorrador,
  buildGuiaRemisionBorrador,
  descripcionConLoteYVencimiento,
  formatFechaVencimiento,
  resolverTipoComprobante,
  type DraftEmisorData,
  type DraftFulfillmentData,
  type DraftItem,
  type DraftOrderData,
} from "@/domain/nubefact-draft";

function item(overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    codigo: "DAPHA10-EJ",
    descripcion: "Dapha 10 mg x 30 tabletas",
    unidadMedida: "UND",
    cantidad: 10,
    precioUnitario: 25.5,
    igv: 45.9,
    subtotal: 255,
    total: 300.9,
    afectacionTributaria: "GRAVADO",
    tasaIgv: 18,
    pesoUnitario: 0.25,
    ...overrides,
  };
}

function data(overrides: Partial<DraftOrderData> = {}): DraftOrderData {
  return {
    numero: 1042,
    fechaEmision: "2026-08-06T14:30:00Z",
    cliente: {
      razonSocial: "CLINICA EJEMPLO S.A.C.",
      rucODocumento: "20100000001",
      direccion: "Av. Ejemplo 123, Surco",
      ubigeoCodigo: "150140",
    },
    vendedor: "LUIS VARGAS",
    condicionPago: "Crédito 30 días",
    tipoComprobantePermitido: "FACTURA",
    items: [item()],
    ...overrides,
  };
}

function fulfillment(overrides: Partial<DraftFulfillmentData> = {}): DraftFulfillmentData {
  return {
    fuenteStock: "Almacén Central Lima",
    almacen: "Almacén Central Lima",
    direccionPartida: "CAR. PANAMERICANA SUR KM.29.5 INT.A-08",
    ubigeoPartida: "150119",
    vehiculo: null,
    chofer: null,
    transportista: "Transporte propio",
    fechaDespacho: "2026-08-06T18:00:00Z",
    lineasDespachadas: [],
    ...overrides,
  };
}

const EMISOR: DraftEmisorData = {
  razonSocial: "LOGISSA SOCIEDAD ANONIMA CERRADA",
  ruc: "20610284508",
  direccion: "CAR. PANAMERICANA SUR KM.29.5 INT.A-08, LURIN - LIMA - LIMA",
  ubigeoCodigo: "150119",
  telefono: "950242412",
  email: "hola@logisalud.com",
};

describe("resolverTipoComprobante", () => {
  it("respeta al cliente que solo admite factura o solo boleta", () => {
    expect(resolverTipoComprobante("FACTURA")).toEqual({ tipo: "FACTURA", sinDefinir: false });
    expect(resolverTipoComprobante("BOLETA")).toEqual({ tipo: "BOLETA", sinDefinir: false });
  });

  // Hueco real: orders no guarda qué eligió el vendedor. No se adivina en
  // silencio — se marca sinDefinir para que el borrador lo advierta.
  it("marca sinDefinir cuando el cliente admite ambos", () => {
    expect(resolverTipoComprobante("FACTURA_O_BOLETA")).toEqual({
      tipo: "FACTURA",
      sinDefinir: true,
    });
  });
});

describe("buildComprobanteBorrador", () => {
  it("lleva el bloque _borrador con el aviso y la marca de quitarlo", () => {
    const { payload } = buildComprobanteBorrador(data(), EMISOR);
    const borrador = payload._borrador as Record<string, unknown>;
    expect(borrador.aviso).toBe(AVISO_BORRADOR);
    expect(borrador.quitar_este_bloque_antes_de_enviar).toBe(true);
  });

  it("mapea factura y RUC a los códigos de NubeFact", () => {
    const { payload } = buildComprobanteBorrador(data(), EMISOR);
    expect(payload.tipo_de_comprobante).toBe(TIPO_DE_COMPROBANTE.FACTURA);
    expect(payload.cliente_tipo_de_documento).toBe(TIPO_DE_DOCUMENTO_CLIENTE.RUC);
    expect(payload.operacion).toBe("generar_comprobante");
  });

  it("un documento que no es RUC va como DNI y boleta", () => {
    const { payload } = buildComprobanteBorrador(
      data({
        tipoComprobantePermitido: "BOLETA",
        cliente: { razonSocial: "PEREZ JUAN", rucODocumento: "00000000003", direccion: "Calle 1", ubigeoCodigo: "150119" },
      }), EMISOR,
    );
    expect(payload.tipo_de_comprobante).toBe(TIPO_DE_COMPROBANTE.BOLETA);
    expect(payload.cliente_tipo_de_documento).toBe(TIPO_DE_DOCUMENTO_CLIENTE.DNI);
  });

  it("advierte cuando el cliente admite ambos y nadie eligió", () => {
    const { advertencias } = buildComprobanteBorrador(
      data({ tipoComprobantePermitido: "FACTURA_O_BOLETA" }), EMISOR,
    );
    expect(advertencias.some((a) => a.includes("no registra cuál eligió el vendedor"))).toBe(true);
  });

  it("advierte si resolvió factura pero el documento no es RUC válido", () => {
    const { advertencias } = buildComprobanteBorrador(
      data({
        tipoComprobantePermitido: "FACTURA",
        cliente: { razonSocial: "X", rucODocumento: "12345678", direccion: "Calle 1", ubigeoCodigo: "150119" },
      }), EMISOR,
    );
    expect(advertencias.some((a) => a.includes("no es un RUC de contribuyente válido"))).toBe(true);
  });

  it("advierte siempre que serie y número son placeholder", () => {
    const { advertencias } = buildComprobanteBorrador(data(), EMISOR);
    expect(advertencias.some((a) => a.includes("PLACEHOLDER"))).toBe(true);
  });

  it("suma gravada, inafecta, IGV y total sin recalcular las líneas", () => {
    const { payload } = buildComprobanteBorrador(
      data({
        items: [
          item(),
          item({
            codigo: "INAF-01",
            afectacionTributaria: "INAFECTO",
            igv: 0,
            subtotal: 20,
            total: 20,
            tasaIgv: 0,
          }),
        ],
      }), EMISOR,
    );
    expect(payload.total_gravada).toBe(255);
    expect(payload.total_inafecta).toBe(20);
    expect(payload.total_igv).toBe(45.9);
    expect(payload.total).toBe(320.9);
  });

  it("marca el tipo_de_igv distinto para gravado e inafecto", () => {
    const { payload } = buildComprobanteBorrador(
      data({ items: [item(), item({ afectacionTributaria: "INAFECTO", igv: 0, tasaIgv: 0 })] }), EMISOR,
    );
    const items = payload.items as Array<Record<string, unknown>>;
    expect(items[0].tipo_de_igv).toBe(1);
    expect(items[1].tipo_de_igv).toBe(8);
  });

  it("usa fecha dd-mm-yyyy en hora de Perú", () => {
    const { payload } = buildComprobanteBorrador(data({ fechaEmision: "2026-08-06T02:00:00Z" }), EMISOR);
    // 02:00 UTC del 6 es 21:00 del 5 en Lima.
    expect(payload.fecha_de_emision).toBe("05-08-2026");
  });
});

describe("buildGuiaRemisionBorrador", () => {
  it("transporte con transportista es público; con vehículo y chofer es privado", () => {
    const externo = buildGuiaRemisionBorrador(data(), fulfillment({ transportista: "Transportes X" }), EMISOR);
    expect(externo.payload.tipo_de_transporte).toBe("01");

    const propio = buildGuiaRemisionBorrador(
      data(),
      fulfillment({ transportista: null, vehiculo: "ABC-123", chofer: "Juan Perez" }), EMISOR,
    );
    expect(propio.payload.tipo_de_transporte).toBe("02");
    expect(propio.payload.transportista_placa_numero).toBe("ABC-123");
    expect(propio.payload.conductor_denominacion).toBe("Juan Perez");
  });

  it("advierte si el transporte propio no tiene vehículo o chofer completos", () => {
    const { advertencias } = buildGuiaRemisionBorrador(
      data(),
      fulfillment({ transportista: null, vehiculo: "ABC-123", chofer: null }), EMISOR,
    );
    expect(advertencias.some((a) => a.includes("placa y datos del conductor"))).toBe(true);
  });

  it("calcula el peso con lo que hay y advierte de los productos sin peso", () => {
    const { payload, advertencias } = buildGuiaRemisionBorrador(
      data({ items: [item({ pesoUnitario: 0.25 }), item({ codigo: "SIN-PESO", pesoUnitario: null })] }),
      fulfillment(), EMISOR,
    );
    expect(payload.peso_bruto_total).toBe(2.5);
    expect(advertencias.some((a) => a.includes("SIN-PESO"))).toBe(true);
  });

  it("con el almacén central resuelto, NO advierte por dirección ni ubigeo de partida", () => {
    const { payload, advertencias } = buildGuiaRemisionBorrador(data(), fulfillment(), EMISOR);
    expect(payload.punto_de_partida_direccion).toBe("CAR. PANAMERICANA SUR KM.29.5 INT.A-08");
    expect(payload.punto_de_partida_ubigeo).toBe("150119");
    expect(advertencias.some((a) => a.includes("no tiene dirección registrada"))).toBe(false);
    expect(advertencias.some((a) => a.includes("no tiene ubigeo registrado"))).toBe(false);
  });

  it("sí advierte cuando el almacén no tiene dirección ni ubigeo", () => {
    const { advertencias } = buildGuiaRemisionBorrador(
      data(),
      fulfillment({ almacen: "Almacén Regional Trujillo", direccionPartida: null, ubigeoPartida: null }),
      EMISOR,
    );
    expect(advertencias.some((a) => a.includes("no tiene dirección registrada"))).toBe(true);
    expect(advertencias.some((a) => a.includes("no tiene ubigeo registrado"))).toBe(true);
  });

  it("usa el emisor de company_settings", () => {
    const { payload } = buildGuiaRemisionBorrador(data(), fulfillment(), EMISOR);
    expect(payload.emisor).toEqual({
      ruc: "20610284508",
      razon_social: "LOGISSA SOCIEDAD ANONIMA CERRADA",
      direccion: "CAR. PANAMERICANA SUR KM.29.5 INT.A-08, LURIN - LIMA - LIMA",
      ubigeo: "150119",
      telefono: "950242412",
      email: "hola@logisalud.com",
    });
  });

  it("usa la dirección y el ubigeo del cliente como punto de llegada", () => {
    const { payload } = buildGuiaRemisionBorrador(data(), fulfillment(), EMISOR);
    expect(payload.punto_de_llegada_direccion).toBe("Av. Ejemplo 123, Surco");
    expect(payload.punto_de_llegada_ubigeo).toBe("150140");
  });

  it("motivo de traslado es venta y lleva el bloque _borrador", () => {
    const { payload } = buildGuiaRemisionBorrador(data(), fulfillment(), EMISOR);
    expect(payload.motivo_de_traslado).toBe("01");
    expect((payload._borrador as Record<string, unknown>).quitar_este_bloque_antes_de_enviar).toBe(
      true,
    );
  });
});

describe("formatFechaVencimiento", () => {
  it("convierte ISO a dd/mm/aaaa", () => {
    expect(formatFechaVencimiento("2029-03-31")).toBe("31/03/2029");
    expect(formatFechaVencimiento("2029-03-31T00:00:00Z")).toBe("31/03/2029");
  });

  it("deja el valor tal cual si no es una fecha ISO reconocible", () => {
    expect(formatFechaVencimiento("31/03/2029")).toBe("31/03/2029");
  });
});

describe("descripcionConLoteYVencimiento", () => {
  // Formato tomado de una GRE real ya emitida.
  it("replica el formato real: nombre + LT: lote + FV: dd/mm/aaaa", () => {
    expect(
      descripcionConLoteYVencimiento({
        descripcion: "VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML",
        lote: "2030056",
        fechaVencimiento: "2029-03-31",
      }),
    ).toBe("VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML LT: 2030056 FV: 31/03/2029");
  });

  it("sin lote ni vencimiento deja la descripción sola, sin sufijo", () => {
    expect(
      descripcionConLoteYVencimiento({
        descripcion: "PRODUCTO SIMPLE",
        lote: null,
        fechaVencimiento: null,
      }),
    ).toBe("PRODUCTO SIMPLE");
  });

  it("con solo uno de los dos agrega solo ese, sin inventar el que falta", () => {
    expect(
      descripcionConLoteYVencimiento({ descripcion: "X", lote: "L1", fechaVencimiento: null }),
    ).toBe("X LT: L1");
    expect(
      descripcionConLoteYVencimiento({ descripcion: "X", lote: null, fechaVencimiento: "2029-03-31" }),
    ).toBe("X FV: 31/03/2029");
  });

  it("ignora cadenas en blanco y recorta espacios", () => {
    expect(
      descripcionConLoteYVencimiento({ descripcion: "  X  ", lote: "   ", fechaVencimiento: "" }),
    ).toBe("X");
  });
});

describe("buildGuiaRemisionBorrador — líneas despachadas", () => {
  const despachada = {
    codigo: "VITACAPIL",
    descripcion: "VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML",
    unidadMedida: "UND",
    cantidadPreparada: 3,
    lote: "2030056",
    fechaVencimiento: "2029-03-31",
    pesoUnitario: 0.4,
  };

  it("usa las líneas del despacho y concatena lote y vencimiento en la descripción", () => {
    const { payload } = buildGuiaRemisionBorrador(
      data(),
      fulfillment({ lineasDespachadas: [despachada] }),
      EMISOR,
    );
    const items = payload.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].descripcion).toBe(
      "VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML LT: 2030056 FV: 31/03/2029",
    );
    // Cantidad despachada, no la pedida.
    expect(items[0].cantidad).toBe(3);
    expect(payload.peso_bruto_total).toBe(1.2);
  });

  it("sin líneas de despacho cae a las del pedido y lo advierte", () => {
    const { payload, advertencias } = buildGuiaRemisionBorrador(
      data(),
      fulfillment({ lineasDespachadas: [] }),
      EMISOR,
    );
    const items = payload.items as Array<Record<string, unknown>>;
    expect(items[0].descripcion).toBe("Dapha 10 mg x 30 tabletas");
    expect(advertencias.some((a) => a.includes("No se encontraron líneas de despacho"))).toBe(true);
  });

  it("una línea despachada sin lote va sin sufijo", () => {
    const { payload } = buildGuiaRemisionBorrador(
      data(),
      fulfillment({
        lineasDespachadas: [{ ...despachada, lote: null, fechaVencimiento: null }],
      }),
      EMISOR,
    );
    const items = payload.items as Array<Record<string, unknown>>;
    expect(items[0].descripcion).toBe("VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML");
  });
});
