import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";
import {
  getFulfillmentForOrder,
  getOrderForFulfillment,
  listDispatchCatalogs,
} from "@/services/fulfillments";
import { puedePrepararDespacho, type OrderEstadoParaDespacho } from "@/domain/fulfillment";
import { FulfillmentForm } from "./fulfillment-form";
import { displayNombreProducto } from "@/domain/products";
import { estadoLabel } from "@/domain/order-status";

function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima" });
}

function Dato({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{value && value.trim() !== "" ? value : "—"}</dd>
    </>
  );
}

export default async function DespachoPage({ params }: { params: { id: string } }) {
  const order = await getOrderForFulfillment(params.id);
  if (!order) notFound();

  const permiso = puedePrepararDespacho({
    estado: order.estado as OrderEstadoParaDespacho,
    direccionEntregaActiva: order.direccionEntregaActiva,
  });

  const [catalogs, fulfillment] = await Promise.all([
    permiso.ok ? listDispatchCatalogs() : Promise.resolve(null),
    order.estado === "DISPATCHED" ? getFulfillmentForOrder(order.id) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[{ label: "Despachos", href: "/operaciones" }, { label: `Pedido #${order.numero}` }]}
        />
        <h2 className="text-xl font-semibold">Pedido #{order.numero}</h2>
        <p className="mt-1 text-sm text-gray-600">
          Estado: {estadoLabel(order.estado)} · Enviado {fechaHora(order.fecha_envio)}
        </p>
        {/*
          Esta pantalla es la del despacho. El pedido completo —con el Excel
          y, una vez despachado, los borradores de comprobante y guía— está
          en /pedidos/[id], que hasta ahora no se enlazaba desde ningún lado
          después de que el pedido dejaba de ser borrador.
        */}
        <Link
          href={`/pedidos/${order.id}`}
          className="mt-2 inline-block text-sm font-medium text-logisalud-green hover:underline"
        >
          Ver pedido y descargar Excel →
        </Link>
      </div>

      <section className="card p-5">
        <h3 className="font-heading text-base uppercase tracking-wide text-gray-900">Entrega</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <Dato label="Cliente" value={order.razonSocial} />
          <Dato label="RUC / documento" value={order.rucODocumento} />
          <Dato label="Dirección" value={order.direccionEntrega} />
          <Dato label="Canal" value={order.canal} />
          <Dato label="Zona" value={order.zona} />
          <Dato label="Vendedor" value={order.vendedor} />
          <Dato label="Condición de pago" value={order.condicionPago} />
        </dl>
      </section>

      {!permiso.ok && order.estado !== "DISPATCHED" && (
        <p className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-900">
          ⚠ {permiso.motivo}
        </p>
      )}

      {permiso.ok && catalogs && <FulfillmentForm order={order} catalogs={catalogs} />}

      {order.estado === "DISPATCHED" && (
        <section>
          <h3 className="font-heading text-lg">Despacho</h3>
          {!fulfillment ? (
            <p className="mt-3 text-sm text-gray-500">
              El pedido está despachado pero no se encontró el detalle del despacho.
            </p>
          ) : (
            <div className="card-highlight mt-3 flex flex-col gap-4 p-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Dato label="Despachado" value={fechaHora(fulfillment.fecha_despacho)} />
                <Dato
                  label="Fuente de stock"
                  value={
                    fulfillment.inventory_source
                      ? `${fulfillment.inventory_source.nombre} (${fulfillment.inventory_source.tipo})`
                      : null
                  }
                />
                <Dato label="Almacén" value={fulfillment.warehouse?.nombre ?? null} />
                <Dato
                  label="Transporte"
                  value={
                    fulfillment.transporter?.nombre ??
                    [fulfillment.vehicle?.nombre, fulfillment.driver?.nombre]
                      .filter(Boolean)
                      .join(" · ") ??
                    null
                  }
                />
              </dl>

              <ul className="flex flex-col gap-2">
                {fulfillment.fulfillment_items.map((fi, idx) => {
                  const pedida = Number(fi.order_item?.cantidad ?? 0);
                  const preparada = Number(fi.cantidad_preparada);
                  const dif = preparada !== pedida;
                  return (
                    <li key={idx} className="rounded-lg border border-gray-200 p-3 text-sm">
                      <p className="font-medium text-gray-900">
                        {fi.order_item?.product?.codigo_interno ?? "—"} ·{" "}
                        {fi.order_item?.product
                          ? displayNombreProducto(
                              fi.order_item.product.descripcion,
                              fi.order_item.product.codigo_interno,
                            )
                          : "—"}
                      </p>
                      <p className={dif ? "text-amber-800" : "text-gray-600"}>
                        Pedido {pedida} · Preparado {preparada}
                        {fi.lote && ` · Lote ${fi.lote}`}
                        {fi.fecha_vencimiento && ` · Vence ${fi.fecha_vencimiento}`}
                      </p>
                      {fi.motivo_diferencia && (
                        <p className="text-amber-800">Motivo: {fi.motivo_diferencia}</p>
                      )}
                      {fi.pendiente_de_stock && (
                        <p className="text-amber-800">
                          Pendiente de stock: {fi.comentario_stock ?? "—"}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
