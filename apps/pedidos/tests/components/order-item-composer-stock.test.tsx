// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/pedidos/[id]/actions", () => ({
  agregarProducto: async () => ({ ok: true }),
  cambiarCantidad: async () => ({ ok: true }),
  enviarPedido: async () => ({ ok: true }),
  fijarPrecioEspecial: async () => ({ ok: true }),
  quitarProducto: async () => ({ ok: true }),
  solicitarDescuento: async () => ({ ok: true }),
  marcarComoBonificacion: async () => ({ ok: true }),
  quitarBonificacion: async () => ({ ok: true }),
}));

import { OrderItemComposer } from "@/app/pedidos/[id]/order-item-composer";

const PRODUCTO = "a0079993-8510-4bbc-bee4-d143556a40d3";

const items = [
  {
    id: "60e1d156-547b-4e2d-8612-fd32e1abc038",
    product_id: PRODUCTO,
    cantidad: 2,
    precio_unitario: 16,
    subtotal: 27.12,
    igv: 4.88,
    total: 32,
    precio_fijado_por_admin: false,
    precio_lista_original: null,
    motivo_precio_especial: null,
    origen_precio: "LISTA",
    es_linea_gratis: false,
    product: { descripcion: "VITAMINA E 400 UI CJA. X 30 CAP. BDA.", codigo_interno: "DHP200" },
  },
];

function pintar(stock: number) {
  render(
    <OrderItemComposer
      orderId="2d2f8f0c-6a5a-4a7a-9a1e-1a2b3c4d5e6f"
      customerId="3d2f8f0c-6a5a-4a7a-9a1e-1a2b3c4d5e6f"
      items={items}
      products={[]}
      sinPrecio={[]}
      stockPorProducto={{ [PRODUCTO]: stock }}
      observaciones={[]}
      esAdmin={false}
      celularOk
    />,
  );
}

/**
 * El vendedor tiene que ver cuánto hay ANTES de prometerle algo al
 * cliente. Hasta ahora la pantalla no mostraba el stock en ningún lado:
 * ofrecía, el pedido entraba, y el faltante aparecía en el despacho.
 */
describe("el stock en la pantalla del pedido", () => {
  it("muestra las unidades disponibles de cada línea", () => {
    pintar(12);
    expect(screen.getByText("Stock: 12")).toBeTruthy();
    expect(screen.getByRole("button", { name: /enviar pedido/i }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("con stock cero avisa y no deja enviar el pedido", () => {
    pintar(0);

    // Dos avisos distintos y los dos hacen falta: el de la línea dice qué
    // pasa con ESE producto, y el del pie dice por qué no sale el pedido.
    expect(screen.getByText(/el almacén no tiene unidades/i)).toBeTruthy();
    expect(screen.getByText(/hay una línea sin stock: DHP200/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /enviar pedido/i }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("pedir más de lo que hay avisa, pero deja enviar", () => {
    // El archivo de stock es la foto del día: puede estar atrasado
    // respecto de lo que entró hoy a almacén, y Operaciones ajusta la
    // cantidad real al despachar.
    pintar(1);

    expect(screen.getByText(/estás pidiendo 2/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /enviar pedido/i }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});
