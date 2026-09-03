import { describe, expect, it, vi } from "vitest";

/**
 * Filas EXACTAS que devolvió la base para los pedidos #51 y #53, las dos
 * pruebas reales del motor de promociones.
 *
 * Lo que se prueba es el armado del correo y del Excel a partir de esas
 * filas: una promoción que no se explica en el correo obliga a quien
 * prepara el despacho a preguntar por qué esa línea no va a precio de
 * lista, y una línea gratis sin marcar parece un error de precio.
 */
const PEDIDOS: Record<string, { order: unknown; items: unknown[]; obs: unknown[] }> = {
  "51": {
    order: {
      numero: 51, fecha_envio: "2026-09-03T03:04:00Z", created_at: "2026-09-03T03:04:00Z",
      dias_credito_solicitados: null,
      razon_social_snapshot: "***** ALVINAGORTA BALTAZAR, NELLY NANCY", direccion_snapshot: "AV123",
      canal_snapshot: "Horizontal", zona_snapshot: "ZONA 16", vendedor_snapshot: "OFICINA LOGISSA",
      customer: { razon_social: "***** ALVINAGORTA BALTAZAR, NELLY NANCY", ruc_o_documento: "10412460389" },
      payment_terms: { nombre: "Contado" },
    },
    items: [
      { id: "6da4b46f", cantidad: 1, precio_unitario: 30.24, igv: 4.61, subtotal: 25.63, total: 30.24,
        precio_fijado_por_admin: false, precio_lista_original: 36, motivo_precio_especial: null,
        origen_precio: "PROMO_CONDICIONADA", promocion_ref: "condicionada:1", es_linea_gratis: false,
        product: { codigo_interno: "DHP211", descripcion: "IBUCALM 200 200 MG X 100 CAP. BDA." } },
      { id: "6fb864d8", cantidad: 2, precio_unitario: 36, igv: 10.98, subtotal: 61.02, total: 72,
        precio_fijado_por_admin: false, precio_lista_original: null, motivo_precio_especial: null,
        origen_precio: "LISTA", promocion_ref: null, es_linea_gratis: false,
        product: { codigo_interno: "DHP211", descripcion: "IBUCALM 200 200 MG X 100 CAP. BDA." } },
      { id: "b85f113f", cantidad: 1, precio_unitario: 19.755, igv: 3.01, subtotal: 16.75, total: 19.76,
        precio_fijado_por_admin: false, precio_lista_original: 21.95, motivo_precio_especial: null,
        origen_precio: "PROMO_ESCALA", promocion_ref: "escala:1", es_linea_gratis: false,
        product: { codigo_interno: "DHP020", descripcion: "MUCOFLUX 200 200MG CJA X 30 SOBRE." } },
    ],
    obs: [],
  },
  "56": {
    order: {
      numero: 56, fecha_envio: "2026-09-03T14:26:00Z", created_at: "2026-09-03T14:25:00Z",
      dias_credito_solicitados: null,
      razon_social_snapshot: "***** ALVINAGORTA BALTAZAR, NELLY NANCY", direccion_snapshot: "AV123",
      canal_snapshot: "Horizontal", zona_snapshot: "ZONA 16", vendedor_snapshot: "VENDEDOR DE PRUEBA ADMIN 1",
      customer: { razon_social: "***** ALVINAGORTA BALTAZAR, NELLY NANCY", ruc_o_documento: "10412460389" },
      payment_terms: { nombre: "Contado" },
    },
    items: [
      { id: "61f26d83", cantidad: 5, precio_unitario: 2.5, igv: 1.91, subtotal: 10.59, total: 12.5,
        precio_fijado_por_admin: false, precio_lista_original: null, motivo_precio_especial: null,
        origen_precio: "LISTA", promocion_ref: null, es_linea_gratis: false,
        product: { codigo_interno: "DHP014", descripcion: "A - FIEBRIN 1G/ 2ML CJA X 1 AMP." } },
      { id: "1c1f40f9", cantidad: 5, precio_unitario: 0, igv: 0, subtotal: 0, total: 0,
        precio_fijado_por_admin: false, precio_lista_original: 2.5,
        motivo_precio_especial: "acuerdo comercial - aplicado por administracion",
        origen_precio: "BONIFICACION_MANUAL", promocion_ref: null, es_linea_gratis: true,
        product: { codigo_interno: "DHP014", descripcion: "A - FIEBRIN 1G/ 2ML CJA X 1 AMP." } },
    ],
    obs: [],
  },
  "53": {
    order: {
      numero: 53, fecha_envio: "2026-09-03T03:09:34Z", created_at: "2026-09-03T03:08:17Z",
      dias_credito_solicitados: null,
      razon_social_snapshot: "***** ALVINAGORTA BALTAZAR, NELLY NANCY", direccion_snapshot: "AV123",
      canal_snapshot: "Horizontal", zona_snapshot: "ZONA 16", vendedor_snapshot: "OFICINA LOGISSA",
      customer: { razon_social: "***** ALVINAGORTA BALTAZAR, NELLY NANCY", ruc_o_documento: "10412460389" },
      payment_terms: { nombre: "Contado" },
    },
    items: [
      { id: "60e1d156", cantidad: 2, precio_unitario: 16, igv: 4.88, subtotal: 27.12, total: 32,
        precio_fijado_por_admin: false, precio_lista_original: null, motivo_precio_especial: null,
        origen_precio: "LISTA", promocion_ref: null, es_linea_gratis: false,
        product: { codigo_interno: "DHP200", descripcion: "VITAMINA E 400 UI CJA. X 30 CAP. BDA." } },
      { id: "4b820d08", cantidad: 2, precio_unitario: 0, igv: 0, subtotal: 0, total: 0,
        precio_fijado_por_admin: false, precio_lista_original: null, motivo_precio_especial: null,
        origen_precio: "PROMO_BONIFICACION", promocion_ref: "bonificacion:10", es_linea_gratis: true,
        product: { codigo_interno: "DHP200", descripcion: "VITAMINA E 400 UI CJA. X 30 CAP. BDA." } },
    ],
    obs: [{ comentario: "Prueba del motor de promociones: 2 Vitamina E con su bonificacion 1+1.",
            fecha: "2026-09-03T03:08:17Z", contexto: null, autor: "u1" }],
  },
};

let actual = "51";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      const d = PEDIDOS[actual];
      if (tabla === "orders") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: d.order, error: null }) }) }) };
      if (tabla === "order_items") return { select: () => ({ eq: async () => ({ data: d.items, error: null }) }) };
      if (tabla === "approval_requests") return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      if (tabla === "order_observations") return { select: () => ({ eq: () => ({ order: async () => ({ data: d.obs, error: null }) }) }) };
      if (tabla === "profiles") return { select: () => ({ in: async () => ({ data: [{ id: "u1", full_name: "OFICINA LOGISSA" }], error: null }) }) };
      throw new Error(`tabla no simulada: ${tabla}`);
    },
  }),
}));

import ExcelJS from "exceljs";
import { renderOrderEmailHtml, renderOrderEmailText } from "@/domain/order-email";
import { buildOrderExcel } from "@/services/order-excel";
import { loadOrderEmailData } from "@/services/order-notifications";

describe("las promociones se explican en el correo y en el Excel", () => {
  it("#51: la escala y la condicionada se ven como lista → promoción", async () => {
    actual = "51";
    const data = await loadOrderEmailData("x", "READY_FOR_OPERATIONS");
    const mail = { html: renderOrderEmailHtml(data!), text: renderOrderEmailText(data!) };
    expect(mail.html).toContain("lista S/ 36.00 → promoción S/ 30.24");
    expect(mail.html).toContain("lista S/ 21.95 → promoción S/ 19.75");

    // El Excel es el mismo dato por otra puerta: quien prepara el despacho
    // suele mirar sólo el adjunto.
    const celdas = await celdasDelExcel(data!);
    expect(celdas).toContain(
      "lista S/ 36.00 → promoción S/ 30.24 (−S/ 5.76, −16.0%) · Promoción por combinación de productos",
    );
    expect(celdas).toContain(
      "lista S/ 21.95 → promoción S/ 19.75 (−S/ 2.20, −10.0%) · Escala por cantidad",
    );
  });

  it("#53: la línea gratis se marca como BONIFICACIÓN en las dos salidas", async () => {
    actual = "53";
    const data = await loadOrderEmailData("x", "READY_FOR_OPERATIONS");
    const mail = { html: renderOrderEmailHtml(data!), text: renderOrderEmailText(data!) };
    expect(mail.html).toContain("BONIFICACIÓN (S/ 0.00)");
    expect(mail.text).toContain("BONIFICACIÓN (S/ 0.00)");

    // El código de la línea gratis lleva el prefijo BO: es como Operaciones
    // separa el bonificado del que se cobra, y en el papel las dos líneas
    // son el mismo producto.
    expect(mail.html).toContain("BODHP200");
    expect(mail.text).toContain("BODHP200");

    const celdas = await celdasDelExcel(data!);
    expect(celdas).toContain("VITAMINA E 400 UI CJA. X 30 CAP. BDA. — BONIFICACIÓN (S/ 0.00)");
    expect(celdas).toContain("BODHP200");
    // Y la línea pagada sigue con el suyo, sin prefijo.
    expect(celdas).toContain("DHP200");
  });

  it("#56: la bonificación marcada a mano dice por qué va sin costo", async () => {
    // Es la que más falta hace explicar: no hay promoción detrás, sólo el
    // motivo que escribió quien la marcó. Y como la aplicó un
    // administrador, no hay solicitud de aprobación que lo cuente.
    actual = "56";
    const data = await loadOrderEmailData("x", "READY_FOR_OPERATIONS");
    const mail = { html: renderOrderEmailHtml(data!), text: renderOrderEmailText(data!) };

    expect(mail.html).toContain("Bonificación manual · lista S/ 2.50 c/u, va sin costo");
    expect(mail.html).toContain("acuerdo comercial - aplicado por administracion");
    expect(mail.html).toContain("BODHP014");
    expect(mail.text).toContain("BONIFICACIÓN (S/ 0.00)");

    const celdas = await celdasDelExcel(data!);
    expect(celdas).toContain("BODHP014");
    expect(
      celdas.some((c) => c.includes("Bonificación manual") && c.includes("acuerdo comercial")),
    ).toBe(true);
  });
});

/** Todo el texto del Excel, para poder buscar sin depender de la fila. */
async function celdasDelExcel(data: Parameters<typeof buildOrderExcel>[0]): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  const buffer = (await buildOrderExcel(data)) as unknown as Parameters<typeof wb.xlsx.load>[0];
  await wb.xlsx.load(buffer);
  const textos: string[] = [];
  wb.worksheets[0].eachRow((row) => {
    row.eachCell((cell) => {
      if (typeof cell.value === "string") textos.push(cell.value);
    });
  });
  return textos;
}
