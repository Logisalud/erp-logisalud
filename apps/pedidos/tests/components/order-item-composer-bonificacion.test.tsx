// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/pedidos/[id]/actions", () => ({
  agregarProducto: async () => {}, cambiarCantidad: async () => {}, enviarPedido: async () => ({}),
  fijarPrecioEspecial: async () => {}, quitarProducto: async () => {}, solicitarDescuento: async () => {},
  marcarComoBonificacion: async () => {}, quitarBonificacion: async () => {},
}));

import { OrderItemComposer } from "@/app/pedidos/[id]/order-item-composer";

const items = [
  {
    id: "60e1d156-547b-4e2d-8612-fd32e1abc038",
    product_id: "a0079993-8510-4bbc-bee4-d143556a40d3",
    cantidad: 2, precio_unitario: 16, subtotal: 27.12, igv: 4.88, total: 32,
    precio_fijado_por_admin: false, precio_lista_original: null, motivo_precio_especial: null,
    origen_precio: "LISTA", es_linea_gratis: false,
    product: { descripcion: "VITAMINA E 400 UI CJA. X 30 CAP. BDA.", codigo_interno: "DHP200" },
  },
  {
    id: "d809b2b1-69cc-456b-aadc-5f0d9a2033f1",
    product_id: "a0079993-8510-4bbc-bee4-d143556a40d3",
    cantidad: 2, precio_unitario: 0, subtotal: 0, igv: 0, total: 0,
    precio_fijado_por_admin: false, precio_lista_original: null, motivo_precio_especial: null,
    origen_precio: "PROMO_BONIFICACION", es_linea_gratis: true,
    product: { descripcion: "VITAMINA E 400 UI CJA. X 30 CAP. BDA.", codigo_interno: "DHP200" },
  },
];

/**
 * La bonificación tiene que VERSE. El motor puede estar perfecto en SQL y
 * el vendedor igual no enterarse: la línea gratis es el MISMO producto que
 * la pagada, así que sin el aviso son dos líneas iguales y una a S/ 0.00 —
 * que parece un error de precio, no un regalo.
 */
describe("la línea bonificada en la pantalla del pedido", () => {
  it("se anuncia como bonificación automática y no se puede editar", () => {
    const html = renderToStaticMarkup(
      <OrderItemComposer
        orderId="73982bd9-bc6f-431c-aae8-0bed45a2c929"
        customerId="d0eef330-9812-4ccc-bace-291f0e290a5f"
        items={items}
        products={[]}
        esAdmin={false}
      />,
    );
    expect(html).toContain("Bonificación automática");
    expect(html).toContain("va sin costo");

    // Sin control de cantidad ni de borrado para la línea gratis: la
    // maneja el motor, y tocarla a mano no haría más que confundir — la
    // próxima corrida la regenera igual.
    expect(html).toContain('id="cant-60e1d156-547b-4e2d-8612-fd32e1abc038"');
    expect(html).not.toContain('id="cant-d809b2b1-69cc-456b-aadc-5f0d9a2033f1"');
  });
});

/**
 * La bonificación MANUAL es otra cosa que la automática: la marcó una
 * persona, tiene un motivo escrito, se puede quitar, y si la pidió un
 * vendedor el pedido va a esperar aprobación. La pantalla tiene que
 * decir las cuatro cosas — es un descuento del 100%.
 */
const manuales = [
  { ...items[0] },
  {
    ...items[1],
    id: "manual-1",
    origen_precio: "BONIFICACION_MANUAL",
    precio_lista_original: 16,
    motivo_precio_especial: "acuerdo comercial con el cliente",
  },
];

function renderConItems(items: typeof manuales, esAdmin: boolean) {
  return renderToStaticMarkup(
    <OrderItemComposer
      orderId="73982bd9-bc6f-431c-aae8-0bed45a2c929"
      customerId="d0eef330-9812-4ccc-bace-291f0e290a5f"
      items={items}
      products={[]}
      esAdmin={esAdmin}
    />,
  );
}

describe("la bonificación marcada a mano", () => {
  it("se distingue de la automática y muestra el motivo", () => {
    const html = renderConItems(manuales, false);
    expect(html).toContain("Bonificación marcada a mano");
    expect(html).toContain("lista S/ 16.00 c/u");
    expect(html).toContain("acuerdo comercial con el cliente");
    expect(html).toContain("Quitar la bonificación");
    // Y no se anuncia como la que calcula el sistema.
    expect(html).not.toContain("Bonificación automática");
  });

  it("al vendedor le avisa que va a esperar aprobación", () => {
    // Regalar unidades es un descuento del 100%: enterarse al enviar el
    // pedido, y no antes, es la peor forma de descubrirlo.
    expect(renderConItems(manuales, false)).toContain("esperar aprobación comercial");
  });

  it("al administrador no le promete una aprobación que no va a existir", () => {
    expect(renderConItems(manuales, true)).not.toContain("esperar aprobación comercial");
  });

  it("la línea que se paga ofrece marcar unidades como bonificación", () => {
    expect(renderConItems(manuales, false)).toContain("Bonificar");
  });
});
