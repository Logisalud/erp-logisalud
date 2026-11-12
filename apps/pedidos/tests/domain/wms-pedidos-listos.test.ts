import { describe, expect, it } from "vitest";
import {
  armarRespuestaContrato,
  diaEnLima,
  ruteoDelPedido,
  type DatosRuteo,
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
        // sin datos de ruteo en este caso: nunca se inventa un valor
        zona_reparto: null,
        orden_distrito: null,
        dia_planificado: null,
        fecha_planificada: null,
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

describe("ruteo: zona de reparto, orden y día planificado", () => {
  const ruteo: DatosRuteo = {
    zonas: [
      { id: 1, codigo: "SUR", nombre: "Sur", orden_ruta: 1 },
      { id: 3, codigo: "CENTRO", nombre: "Centro", orden_ruta: 3 },
      { id: 9, codigo: "SINPLAN", nombre: "Sin plan", orden_ruta: 9 },
    ],
    ubigeoZona: {
      "150116": { zona_reparto_id: 3, orden_distrito: 6 },
      "150119": { zona_reparto_id: 1, orden_distrito: 6 },
      "150999": { zona_reparto_id: 9, orden_distrito: 1 },
    },
    plan: [
      { dia: 1, zonaIds: [3] },
      { dia: 2, zonaIds: [1] },
      { dia: 3, zonaIds: [3] },
    ],
  };
  const MARTES = new Date("2026-11-03T15:00:00Z"); // martes en Lima
  const MIERCOLES = new Date("2026-11-04T15:00:00Z");
  const SABADO = new Date("2026-11-07T15:00:00Z");

  it("zona con un solo día: toca ese día y esa fecha", () => {
    expect(ruteoDelPedido("150119", ruteo, SABADO)).toEqual({
      zona_reparto: { codigo: "SUR", nombre: "Sur", orden_ruta: 1 },
      orden_distrito: 6,
      dia_planificado: 2,
      fecha_planificada: "2026-11-10",
    });
  });

  it("hoy cuenta: si hoy toca la zona, es hoy", () => {
    const r = ruteoDelPedido("150119", ruteo, MARTES);
    expect(r.dia_planificado).toBe(2);
    expect(r.fecha_planificada).toBe("2026-11-03");
  });

  it("zona con dos días: elige el próximo a partir de hoy, dando la vuelta a la semana", () => {
    expect(ruteoDelPedido("150116", ruteo, MARTES)).toMatchObject({ dia_planificado: 3, fecha_planificada: "2026-11-04" });
    expect(ruteoDelPedido("150116", ruteo, MIERCOLES)).toMatchObject({ dia_planificado: 3, fecha_planificada: "2026-11-04" });
    // jueves: ya pasaron lunes y miércoles, le toca el lunes siguiente
    expect(ruteoDelPedido("150116", ruteo, new Date("2026-11-05T15:00:00Z"))).toMatchObject({
      dia_planificado: 1,
      fecha_planificada: "2026-11-09",
    });
  });

  it("fin de semana: sábado y domingo pasan al lunes", () => {
    for (const f of ["2026-11-07T15:00:00Z", "2026-11-08T15:00:00Z"]) {
      expect(ruteoDelPedido("150116", ruteo, new Date(f))).toMatchObject({
        dia_planificado: 1,
        fecha_planificada: "2026-11-09",
      });
    }
  });

  it("usa el día de Lima, no el de UTC (domingo 21:00 en Lima ya es lunes en UTC)", () => {
    const r = ruteoDelPedido("150116", ruteo, new Date("2026-11-09T02:00:00Z"));
    expect(r).toMatchObject({ dia_planificado: 1, fecha_planificada: "2026-11-09" });
  });

  it("pedido sin ubigeo, con ubigeo fuera de toda zona o sin datos de ruteo: todo null", () => {
    const nulos = { zona_reparto: null, orden_distrito: null, dia_planificado: null, fecha_planificada: null };
    expect(ruteoDelPedido(null, ruteo, SABADO)).toEqual(nulos);
    expect(ruteoDelPedido("040101", ruteo, SABADO)).toEqual(nulos);
    expect(ruteoDelPedido("150116", undefined, SABADO)).toEqual(nulos);
  });

  it("zona que no está en el plan: lleva zona y orden, pero sin día ni fecha", () => {
    expect(ruteoDelPedido("150999", ruteo, SABADO)).toEqual({
      zona_reparto: { codigo: "SINPLAN", nombre: "Sin plan", orden_ruta: 9 },
      orden_distrito: 1,
      dia_planificado: null,
      fecha_planificada: null,
    });
  });

  it("armarRespuestaContrato agrega los cuatro campos al pedido y no cambia lo demás", () => {
    const p = armarRespuestaContrato([base], { ...aux, ruteo }, SABADO).pedidos[0];
    expect(p).toMatchObject({
      numero: "123",
      zona_reparto: { codigo: "CENTRO", nombre: "Centro", orden_ruta: 3 },
      orden_distrito: 6,
      dia_planificado: 1,
      fecha_planificada: "2026-11-09",
    });
  });
});

describe("teléfono del cliente para la hoja del transportista", () => {
  it("sale el del contacto principal; sin teléfono, el pedido sale igual", () => {
    const con = armarRespuestaContrato([base], { ...aux, telefonos: { [base.customer!.id]: " 995021257 " } }, new Date("2026-10-14T12:00:00Z"));
    expect(con.pedidos[0].cliente.telefono).toBe("995021257");
    const sin = armarRespuestaContrato([base], aux, new Date("2026-10-14T12:00:00Z"));
    expect(sin.pedidos[0].cliente.telefono).toBeUndefined();
  });
});
