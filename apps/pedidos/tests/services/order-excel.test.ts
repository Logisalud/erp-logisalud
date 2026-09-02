import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildOrderExcel, buildOrderExcelFilename } from "@/services/order-excel";
import type { OrderEmailData } from "@/domain/order-email";

function data(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  return {
    numero: 1042,
    fechaEnvio: "2026-08-06T14:30:00Z",
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

async function leer(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  const textos: string[] = [];
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value !== null && cell.value !== undefined) textos.push(String(cell.value));
    });
  });
  return { sheet, textos };
}

describe("buildOrderExcelFilename", () => {
  it("usa pedido-[numero]-[fecha].xlsx en hora de Perú", () => {
    expect(buildOrderExcelFilename(data())).toBe("pedido-1042-2026-08-06.xlsx");
    // 02:00 UTC del 6 es el 5 en Lima.
    expect(buildOrderExcelFilename(data({ fechaEnvio: "2026-08-06T02:00:00Z" }))).toBe(
      "pedido-1042-2026-08-05.xlsx",
    );
  });

  it("no revienta con una fecha inválida", () => {
    expect(buildOrderExcelFilename(data({ fechaEnvio: "no-es-fecha" }))).toBe(
      "pedido-1042-sin-fecha.xlsx",
    );
  });
});

describe("buildOrderExcel", () => {
  it("genera un xlsx legible con el encabezado del pedido", async () => {
    const { textos } = await leer(await buildOrderExcel(data()));

    expect(textos.some((t) => t.includes("Pedido #1042"))).toBe(true);
    expect(textos).toContain("CLINICA EJEMPLO S.A.C.");
    expect(textos).toContain("20100000001");
    expect(textos).toContain("Av. Ejemplo 123, Surco");
    expect(textos).toContain("LUIS VARGAS");
    expect(textos).toContain("Crédito 30 días");
  });

  it("incluye la tabla de productos con cada línea", async () => {
    const { textos } = await leer(await buildOrderExcel(data()));

    for (const header of ["Código", "Descripción", "Cantidad", "P. unitario", "IGV", "Subtotal", "Total"]) {
      expect(textos).toContain(header);
    }
    expect(textos).toContain("DAPHA10-EJ");
    expect(textos).toContain("Dapha 10 mg x 30 tabletas");
    expect(textos).toContain("OTRO-01");
  });

  it("cierra con los totales sumando las líneas, sin recalcular", async () => {
    const { textos } = await leer(await buildOrderExcel(data()));

    expect(textos).toContain("Subtotal");
    expect(textos).toContain("Total");
    // 255 + 20 = 275 subtotal, 45.9 IGV, 320.9 total
    expect(textos).toContain("275");
    expect(textos).toContain("45.9");
    expect(textos).toContain("320.9");
  });

  it("incluye la nota de que no es comprobante de pago", async () => {
    const { textos } = await leer(await buildOrderExcel(data()));
    expect(textos.some((t) => t.includes("no válido como comprobante de pago"))).toBe(true);
  });

  it("no revienta con un pedido sin líneas", async () => {
    const buffer = await buildOrderExcel(data({ items: [] }));
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("muestra un guion en los campos que faltan, no 'null'", async () => {
    const { textos } = await leer(
      await buildOrderExcel(
        data({
          cliente: {
            razonSocial: "SIN DATOS",
            rucODocumento: "20100000001",
            direccionEntrega: null,
            canal: null,
            zona: null,
          },
          vendedor: null,
          condicionPago: null,
        }),
      ),
    );
    expect(textos).not.toContain("null");
    expect(textos).toContain("—");
  });
});

describe("columna de precio especial", () => {
  it("queda vacía cuando todos los ítems van a precio de lista", async () => {
    const { textos } = await leer(await buildOrderExcel(data()));
    expect(textos).toContain("Precio especial");
    expect(textos.some((t) => t.includes("PENDIENTE") || t.includes("Aprobado"))).toBe(false);
  });

  it("marca el ítem con solicitud pendiente y deja ver cuánto pidió", async () => {
    const conPendiente = data({
      items: [
        {
          ...data().items[0],
          precioEspecial: {
            precioOriginal: null,
            precioSolicitado: 2,
            porcentajeDescuento: null,
            estado: "PENDIENTE",
            decision: null,
            precioAprobado: null,
          },
        },
        data().items[1],
      ],
    });
    const { textos } = await leer(await buildOrderExcel(conPendiente));
    expect(textos).toContain("PENDIENTE — pide S/ 2.00");
  });

  it("muestra el precio de lista y el especial aprobado, con el descuento", async () => {
    const aprobado = data({
      items: [
        {
          ...data().items[0],
          precioUnitario: 2,
          precioEspecial: {
            precioOriginal: 3.5,
            precioSolicitado: 2,
            porcentajeDescuento: null,
            estado: "RESUELTO",
            decision: "APROBAR",
            precioAprobado: 2,
          },
        },
      ],
    });
    const { textos } = await leer(await buildOrderExcel(aprobado));
    expect(textos).toContain("lista S/ 3.50 → aprobado S/ 2.00 (−S/ 1.50, −42.9%)");
  });

  it("sin precio de lista capturado igual deja ver el aprobado", async () => {
    const aprobado = data({
      items: [
        {
          ...data().items[0],
          precioUnitario: 2,
          precioEspecial: {
            precioOriginal: null,
            precioSolicitado: 2,
            porcentajeDescuento: null,
            estado: "RESUELTO",
            decision: "APROBAR",
            precioAprobado: 2,
          },
        },
      ],
    });
    const { textos } = await leer(await buildOrderExcel(aprobado));
    expect(textos).toContain("Aprobado S/ 2.00 (pidió S/ 2.00)");
  });

  it("resalta la fila negociada para que no pase desapercibida", async () => {
    const conPendiente = data({
      items: [
        {
          ...data().items[0],
          precioEspecial: {
            precioOriginal: null,
            precioSolicitado: 2,
            porcentajeDescuento: null,
            estado: "PENDIENTE",
            decision: null,
            precioAprobado: null,
          },
        },
      ],
    });
    const { sheet } = await leer(await buildOrderExcel(conPendiente));
    let pintada = false;
    sheet.eachRow((row) => {
      if (String(row.getCell(1).value) === "DAPHA10-EJ") {
        const fill = row.getCell(1).fill as { fgColor?: { argb?: string } };
        pintada = fill?.fgColor?.argb === "FFFEF3C7";
      }
    });
    expect(pintada).toBe(true);
  });
});
