// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/pedidos/[id]/actions", () => ({
  agregarProducto: async () => {}, cambiarCantidad: async () => {}, enviarPedido: async () => ({}),
  fijarPrecioEspecial: async () => {}, quitarProducto: async () => {}, solicitarDescuento: async () => {},
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
