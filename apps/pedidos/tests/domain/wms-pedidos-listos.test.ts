import { describe, expect, it } from "vitest";
import {
  armarRespuestaContrato,
  diaEnLima,
  type DatosAuxiliares,
  type FilaPedido,
} from "@/domain/wms-pedidos-listos";

const base: FilaPedido = {
  id: "11111111-1111-1111-1111-111111111111",
  numero: 123,
  estado: "READY_FOR_OPERATIONS",
  fecha_envio: "2026-10-14T03:30:00Z", // 22:30 del 13-oct en Lima
  fecha_creacion: "2026-10-13T15:00:00Z",
  updated_at: "2026-10-14T09:12:00Z",
  ubigeo_snapshot: "150116",
  direccion_snapshot: "Av. Arequipa 1450, Lince",
  razon_social_snapshot: "Botica Salud Total SAC (snapshot)",
  vendedor_snapshot: "Rosa Paredes",
  customer: { id: "cccccccc-0000-0000-0000-000000000001", razon_social: "Botica Salud Total SAC", ruc_o_documento: "20512345671" },
  payment_term: { nombre: "Contado" },
  items: [
    { id: "bbbb", cantidad: "5.00", product: { codigo_interno: "ZZZ-1", descripcion: "Otro", presentacion: null } },
    { id: "aaaa", cantidad: 20, product: { codigo_interno: "LIZI-10", descripcion: "Lizinopril 10 mg", presentacion: "Caja" } },
  ],
};

const aux: DatosAuxiliares = {
  historial: [
    { order_id: base.id, estado_nuevo: "SUBMITTED", motivo: null, fecha: "2026-10-13T15:00:00Z" },
    { order_id: base.id, estado_nuevo: "READY_FOR_OPERATIONS", motivo: null, fecha: "2026-10-14T09:12:00Z" },
  ],
  observaciones: [
    { order_id: base.id, comentario: "Entrega con cadena de frío.", fecha: "2026-10-13T16:00:00Z" },
    { order_id: "otro", comentario: "no es de este pedido", fecha: "2026-10-13T16:00:00Z" },
  ],
  facturas: [{ pedido_id: base.id, serie: "F001", numero: 45 }],
  distritos: { "150116": "Lince" },
};

const AHORA = new Date("2026-11-07T15:00:00Z");

describe("armarRespuestaContrato", () => {
  it("entrega la forma exacta del contrato para un pedido listo", () => {
    const r = armarRespuestaContrato([base], aux, AHORA);
    expect(r.generado_en).toBe("2026-11-07T15:00:00.000Z");
    expect(r.pedidos).toEqual([
      {
        pedidoId: base.id,
        numero: "123",
        version: 1,
        estado: "READY_FOR_OPERATIONS",
        fecha: "2026-10-13",
        modificadoEn: "2026-10-14T09:12:00Z",
        cliente: {
          id: "cccccccc-0000-0000-0000-000000000001",
          nombre: "Botica Salud Total SAC",
          ruc: "20512345671",
          direccion: "Av. Arequipa 1450, Lince",
          distrito: "Lince",
        },
        vendedor: "Rosa Paredes",
        condicionPago: "Contado",
        factura: "F001-00045",
        observaciones: "Entrega con cadena de frío.",
        lineas: [
          { lineaId: "aaaa", productoCodigo: "LIZI-10", descripcion: "Lizinopril 10 mg", cantidad: 20 },
          { lineaId: "bbbb", productoCodigo: "ZZZ-1", descripcion: "Otro", cantidad: 5 },
        ],
      },
    ]);
  });

  it("tipos: version entera >= 1, cantidad numérica, estado del contrato, sin precios", () => {
    const p = armarRespuestaContrato([base], aux, AHORA).pedidos[0];
    expect(Number.isInteger(p.version) && p.version >= 1).toBe(true);
    for (const l of p.lineas) {
      expect(typeof l.cantidad).toBe("number");
      expect(Object.keys(l).sort()).toEqual(["cantidad", "descripcion", "lineaId", "productoCodigo"]);
    }
    expect(JSON.stringify(Object.keys(p))).not.toMatch(/precio|subtotal|igv|importe|total/i);
  });

  it("solo entrega estados 'listo para operaciones' o 'cancelado'; el resto se omite", () => {
    const r = armarRespuestaContrato(
      [base, { ...base, id: "x1", estado: "DRAFT" }, { ...base, id: "x2", estado: "DISPATCHED" }, { ...base, id: "x3", estado: "SUBMITTED" }],
      aux,
      AHORA,
    );
    expect(r.pedidos.map((p) => p.pedidoId)).toEqual([base.id]);
  });

  it("pedido cancelado: versión nueva con estado CANCELLED, motivo y sus líneas como estaban", () => {
    const cancelado: FilaPedido = { ...base, estado: "CANCELLED", updated_at: "2026-10-15T09:00:00Z" };
    const auxC: DatosAuxiliares = {
      ...aux,
      historial: [
        ...aux.historial,
        { order_id: base.id, estado_nuevo: "CANCELLED", motivo: "El cliente prefiere esperar al próximo mes", fecha: "2026-10-15T09:00:00Z" },
      ],
    };
    const p = armarRespuestaContrato([cancelado], auxC, AHORA).pedidos[0];
    expect(p.estado).toBe("CANCELLED");
    expect(p.version).toBe(2);
    expect(p.motivoCancelacion).toBe("El cliente prefiere esperar al próximo mes");
    expect(p.modificadoEn).toBe("2026-10-15T09:00:00Z");
    expect(p.lineas).toHaveLength(2);
  });

  it("un pedido listo no lleva motivoCancelacion; un cancelado sin motivo no lo inventa", () => {
    expect(armarRespuestaContrato([base], aux, AHORA).pedidos[0]).not.toHaveProperty("motivoCancelacion");
    const sinMotivo = armarRespuestaContrato([{ ...base, estado: "CANCELLED" }], { ...aux, historial: [] }, AHORA).pedidos[0];
    expect(sinMotivo).not.toHaveProperty("motivoCancelacion");
    expect(sinMotivo.version).toBe(1);
  });

  it("los campos opcionales ausentes no aparecen (sin factura, sin observaciones, sin distrito)", () => {
    const p = armarRespuestaContrato(
      [{ ...base, ubigeo_snapshot: null }],
      { historial: [], observaciones: [], facturas: [], distritos: {} },
      AHORA,
    ).pedidos[0];
    expect(p).not.toHaveProperty("factura");
    expect(p).not.toHaveProperty("observaciones");
    expect(p.cliente).not.toHaveProperty("distrito");
  });

  it("la fecha es el día de Lima", () => {
    expect(diaEnLima("2026-10-14T03:30:00Z")).toBe("2026-10-13");
    expect(diaEnLima("2026-10-14T05:00:00Z")).toBe("2026-10-14");
  });
});
