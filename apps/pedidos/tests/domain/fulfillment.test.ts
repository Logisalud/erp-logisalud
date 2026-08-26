import { describe, expect, it } from "vitest";
import {
  MENSAJE_SIN_DIRECCION_DESPACHO,
  faltaStockRegistrado,
  puedePrepararDespacho,
  resumirDiferencias,
  validarLineasPreparadas,
  validarTransporte,
  type LineaPreparada,
} from "@/domain/fulfillment";

function linea(overrides: Partial<LineaPreparada> = {}): LineaPreparada {
  return {
    orderItemId: "item-1",
    codigo: "DAPHA10-EJ",
    cantidadPedida: 10,
    cantidadPreparada: 10,
    controlaLote: false,
    controlaVencimiento: false,
    lote: null,
    fechaVencimiento: null,
    motivoDiferencia: null,
    pendienteDeStock: false,
    comentarioStock: null,
    ...overrides,
  };
}

describe("puedePrepararDespacho", () => {
  it("un pedido listo para operaciones con dirección activa se puede preparar", () => {
    expect(
      puedePrepararDespacho({ estado: "READY_FOR_OPERATIONS", direccionEntregaActiva: true }),
    ).toEqual({ ok: true });
  });

  // Caso legacy: desde Fase 4 un pedido no puede enviarse sin dirección,
  // así que esto no debería pasar — pero si un pedido viejo se cuela, se
  // bloquea con un mensaje que dice qué hacer, no en silencio.
  it("bloquea la preparación si el cliente no tiene dirección de entrega activa", () => {
    expect(
      puedePrepararDespacho({ estado: "READY_FOR_OPERATIONS", direccionEntregaActiva: false }),
    ).toEqual({ ok: false, motivo: MENSAJE_SIN_DIRECCION_DESPACHO });
  });

  it("no se prepara un pedido que todavía no está listo para operaciones", () => {
    for (const estado of ["DRAFT", "SUBMITTED", "COMMERCIAL_EXCEPTION"] as const) {
      const r = puedePrepararDespacho({ estado, direccionEntregaActiva: true });
      expect(r.ok).toBe(false);
    }
  });

  it("no se vuelve a despachar un pedido ya despachado", () => {
    const r = puedePrepararDespacho({ estado: "DISPATCHED", direccionEntregaActiva: true });
    expect(r).toEqual({ ok: false, motivo: "Este pedido ya fue despachado." });
  });
});

describe("validarLineasPreparadas", () => {
  it("despacho normal: cantidad preparada igual a la pedida, sin issues", () => {
    expect(validarLineasPreparadas([linea()])).toEqual([]);
  });

  it("diferencia de cantidad sin motivo es un issue", () => {
    const issues = validarLineasPreparadas([linea({ cantidadPreparada: 7 })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].mensaje).toContain("difiere de la pedida");
  });

  it("diferencia de cantidad CON motivo pasa", () => {
    expect(
      validarLineasPreparadas([
        linea({ cantidadPreparada: 7, motivoDiferencia: "rotura en almacén" }),
      ]),
    ).toEqual([]);
  });

  it("un motivo en blanco no cuenta como motivo", () => {
    const issues = validarLineasPreparadas([
      linea({ cantidadPreparada: 7, motivoDiferencia: "   " }),
    ]);
    expect(issues).toHaveLength(1);
  });

  it("producto que controla lote exige lote antes de despachar", () => {
    const issues = validarLineasPreparadas([linea({ controlaLote: true })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].mensaje).toContain("controla lote");

    expect(validarLineasPreparadas([linea({ controlaLote: true, lote: "L-2026-01" })])).toEqual([]);
  });

  it("producto que controla vencimiento exige la fecha", () => {
    const issues = validarLineasPreparadas([linea({ controlaVencimiento: true })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].mensaje).toContain("controla vencimiento");

    expect(
      validarLineasPreparadas([linea({ controlaVencimiento: true, fechaVencimiento: "2027-12-31" })]),
    ).toEqual([]);
  });

  it("una línea pendiente de stock necesita comentario", () => {
    const issues = validarLineasPreparadas([
      linea({ cantidadPreparada: 0, motivoDiferencia: "sin stock", pendienteDeStock: true }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].mensaje).toContain("comentario");

    expect(
      validarLineasPreparadas([
        linea({
          cantidadPreparada: 0,
          motivoDiferencia: "sin stock",
          pendienteDeStock: true,
          comentarioStock: "llega el lunes",
        }),
      ]),
    ).toEqual([]);
  });

  it("rechaza cantidades negativas o no numéricas", () => {
    expect(validarLineasPreparadas([linea({ cantidadPreparada: -1 })])).toHaveLength(1);
    expect(validarLineasPreparadas([linea({ cantidadPreparada: NaN })])).toHaveLength(1);
  });

  it("reporta todas las líneas problemáticas, no solo la primera", () => {
    const issues = validarLineasPreparadas([
      linea({ orderItemId: "a", codigo: "A", controlaLote: true }),
      linea({ orderItemId: "b", codigo: "B", cantidadPreparada: 3 }),
      linea({ orderItemId: "c", codigo: "C" }),
    ]);
    expect(issues.map((i) => i.codigo)).toEqual(["A", "B"]);
  });
});

describe("validarTransporte", () => {
  it("vehículo con chofer es válido", () => {
    expect(validarTransporte({ vehicleId: 1, driverId: 2, transporterId: null })).toBeNull();
  });

  it("transportista externo es válido", () => {
    expect(validarTransporte({ vehicleId: null, driverId: null, transporterId: 5 })).toBeNull();
  });

  it("un vehículo sin chofer no alcanza", () => {
    expect(validarTransporte({ vehicleId: 1, driverId: null, transporterId: null })).toContain(
      "vehículo y chofer",
    );
  });

  it("un chofer sin vehículo tampoco", () => {
    expect(validarTransporte({ vehicleId: null, driverId: 2, transporterId: null })).toContain(
      "vehículo y chofer",
    );
  });

  it("sin nada asignado es error", () => {
    expect(validarTransporte({ vehicleId: null, driverId: null, transporterId: null })).toContain(
      "Asigna el transporte",
    );
  });
});

describe("resumirDiferencias", () => {
  it("solo lista las líneas con diferencia, con su motivo, para auditoría", () => {
    const diferencias = resumirDiferencias([
      linea({ orderItemId: "a", codigo: "A" }),
      linea({ orderItemId: "b", codigo: "B", cantidadPreparada: 4, motivoDiferencia: "faltó stock" }),
    ]);
    expect(diferencias).toEqual([
      {
        orderItemId: "b",
        codigo: "B",
        cantidadPedida: 10,
        cantidadPreparada: 4,
        motivo: "faltó stock",
      },
    ]);
  });
});

describe("faltaStockRegistrado", () => {
  // Informativo, nunca bloqueante: stock_levels es un registro manual que
  // puede estar desfasado del almacén físico.
  it("avisa si lo preparado supera el disponible registrado", () => {
    expect(faltaStockRegistrado({ cantidadPreparada: 10, cantidadDisponible: 4 })).toBe(true);
  });

  it("no avisa si alcanza", () => {
    expect(faltaStockRegistrado({ cantidadPreparada: 10, cantidadDisponible: 10 })).toBe(false);
  });

  it("un producto sin registro de stock cuenta como sin stock conocido", () => {
    expect(faltaStockRegistrado({ cantidadPreparada: 1, cantidadDisponible: null })).toBe(true);
  });
});
