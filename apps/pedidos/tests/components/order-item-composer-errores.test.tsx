// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const enviarPedido = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/pedidos/[id]/actions", () => ({
  agregarProducto: async () => ({ ok: true }),
  cambiarCantidad: async () => ({ ok: true }),
  enviarPedido: (...args: unknown[]) => enviarPedido(...args),
  fijarPrecioEspecial: async () => ({ ok: true }),
  quitarProducto: async () => ({ ok: true }),
  solicitarDescuento: async () => ({ ok: true }),
  marcarComoBonificacion: async () => ({ ok: true }),
  quitarBonificacion: async () => ({ ok: true }),
}));

import { OrderItemComposer } from "@/app/pedidos/[id]/order-item-composer";

/**
 * Stock de sobra para cualquier producto: estos tests son sobre otra cosa
 * (bonificaciones y mensajes de error), y sin stock el composer bloquea el
 * envío y tapa justo lo que se está probando.
 */
const stockDeSobra: Record<string, number> = new Proxy(
  {},
  { get: () => 999 },
) as Record<string, number>;


const items = [
  {
    id: "60e1d156-547b-4e2d-8612-fd32e1abc038",
    product_id: "a0079993-8510-4bbc-bee4-d143556a40d3",
    cantidad: 2, precio_unitario: 16, subtotal: 27.12, igv: 4.88, total: 32,
    precio_fijado_por_admin: false, precio_lista_original: null, motivo_precio_especial: null,
    origen_precio: "LISTA", es_linea_gratis: false,
    product: { descripcion: "VITAMINA E 400 UI CJA. X 30 CAP. BDA.", codigo_interno: "DHP200" },
  },
];

/**
 * Lo que frena un envío casi siempre es una regla de negocio con un
 * mensaje escrito para el vendedor, y la base lo manda en castellano. Si
 * la Server Action lo LANZA, Next lo reemplaza en producción por "An error
 * occurred in the Server Components render…" y el vendedor se queda sin
 * saber qué le falta — le pasó a uno el 2026-10-16, con el cliente
 * adelante. Por eso el desenlace viaja como valor de retorno.
 */
describe("cuando el envío del pedido se frena", () => {
  it("muestra el motivo que manda el servidor, no un error genérico", async () => {
    enviarPedido.mockResolvedValue({
      ok: false,
      mensaje: "El cliente no tiene celular registrado. Agregalo en el pedido para poder enviarlo.",
    });
    const user = userEvent.setup();

    render(
      <OrderItemComposer
        orderId="2d2f8f0c-6a5a-4a7a-9a1e-1a2b3c4d5e6f"
        customerId="3d2f8f0c-6a5a-4a7a-9a1e-1a2b3c4d5e6f"
        items={items}
        products={[]}
        sinPrecio={[]}
        stockPorProducto={stockDeSobra}
        observaciones={[]}
        esAdmin={false}
        celularOk
      />,
    );

    await user.click(screen.getByRole("button", { name: /enviar pedido/i }));

    expect(
      await screen.findByText(/no tiene celular registrado/i),
    ).toBeDefined();
  });
});
