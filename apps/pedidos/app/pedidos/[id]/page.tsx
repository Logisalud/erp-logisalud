import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrderDetail } from "@/services/orders";
import { getFulfillmentForOrder } from "@/services/fulfillments";
import { getCurrentUser } from "@/lib/auth/session";
import { listProducts } from "@/services/products";
import { listPaymentTerms } from "@/services/catalog";
import { formatSoles } from "@/domain/order-email";
import { displayRazonSocial } from "@/domain/customer-search";
import { OrderItemComposer } from "./order-item-composer";
import { OrderHeader } from "./order-header";
import { ObservationForm } from "./observation-form";
import { displayNombreProducto, esOfrecibleEnPedido } from "@/domain/products";
import { IconDownload } from "@/components/icons";
import { estadoEstilo, estadoLabel } from "@/domain/order-status";
import { etiquetaCondicionPago } from "@/domain/payment-terms";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { excel?: string };
}) {
  const order = await getOrderDetail(params.id);
  if (!order) notFound();

  // Solo lectura para el vendedor: ve que su pedido salió y con qué, sin
  // poder editar nada (no hay policy de escritura para él en fulfillments).
  const fulfillment = order.estado === "DISPATCHED" ? await getFulfillmentForOrder(order.id) : null;

  const currentUser = await getCurrentUser();
  // Los borradores se generan al despachar, así que antes de DISPATCHED no
  // hay nada que enlazar. Los leen administrador y control_pedidos.
  const puedeVerBorradores =
    order.estado === "DISPATCHED" &&
    (currentUser?.roles.includes("administrador") ||
      currentUser?.roles.includes("control_pedidos")) === true;

  const isDraft = order.estado === "DRAFT";

  const [products, paymentTerms] = await Promise.all([
    isDraft ? listProducts() : Promise.resolve([]),
    listPaymentTerms(),
  ]);

  // La regla vive en domain/products.ts para poder probarla; acá solo se
  // aplica. Los productos desactivados por no estar en NubeFact (0052) caen
  // por esta misma condición.
  const activeProducts = products
    .filter(esOfrecibleEnPedido)
    .map((p) => ({ id: p.id, descripcion: p.descripcion, codigo_interno: p.codigo_interno }));

  const total = order.items.reduce((acc, item) => acc + item.total, 0);

  return (
    // En borrador la barra de "Total del pedido / Enviar pedido" va fija al
    // pie: sin este espacio reservado tapa lo último de la página (las
    // Observaciones y su campo de texto), y en móvil no hay scroll que las
    // rescate porque el documento termina ahí.
    <div className={`flex flex-col gap-4${isDraft ? " reserva-barra-pie" : ""}`}>
      {isDraft ? (
        <>
          <OrderHeader
            orderId={order.id}
            customer={{
              id: order.customer_id,
              razonSocial: order.customer?.razon_social ?? "—",
              rucODocumento: order.customer?.ruc_o_documento ?? "—",
            }}
            address={{ id: order.customer_address_id, direccion: order.address?.direccion ?? "—" }}
            paymentTerms={paymentTerms.map((p) => ({
              id: p.id,
              nombre: p.nombre,
              permite_dias_libres: p.permite_dias_libres,
            }))}
            currentPaymentTermsId={order.payment_terms_id}
            currentDiasCredito={order.dias_credito_solicitados}
            tieneLineas={order.items.length > 0}
          />

          <OrderItemComposer
            orderId={order.id}
            customerId={order.customer_id}
            items={order.items}
            products={activeProducts}
            esAdmin={currentUser?.roles.includes("administrador") ?? false}
          />
        </>
      ) : (
        <>
          <section className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl text-slate-900">
                  {displayRazonSocial(order.customer?.razon_social ?? "Pedido")}
                </h2>
                <p className="cifra mt-0.5 text-sm text-slate-600">
                  {order.customer?.ruc_o_documento ?? "—"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${estadoEstilo(
                  order.estado,
                )}`}
              >
                {estadoLabel(order.estado)}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="shrink-0 text-slate-600">Entrega:</dt>
                <dd className="min-w-0 text-slate-900">{order.address?.direccion ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-slate-600">Pago:</dt>
                <dd className="text-slate-900">
                  {etiquetaCondicionPago(order.payment_terms?.nombre, order.dias_credito_solicitados)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-slate-600">Vendedor:</dt>
                <dd className="text-slate-900">{order.seller?.nombre_completo ?? "—"}</dd>
              </div>
            </dl>

            {/*
              Ancla simple, no un botón con JS: el navegador maneja la descarga
              por el Content-Disposition y funciona igual sin JavaScript.
              La descarga NO depende de que el correo se haya enviado.

              Sin atributo `download` a propósito: el Content-Disposition de la
              ruta ya fuerza la descarga, y `download` hacía que un fallo del
              servidor se guardara como archivo (un "excel.txt" con la página de
              error adentro) en vez de dejar navegar al aviso de error.
            */}
            <a href={`/pedidos/${order.id}/excel`} className="btn-secondary mt-4 inline-flex text-sm">
              <IconDownload className="h-4 w-4" />
              Descargar Excel
            </a>

            {searchParams?.excel === "error" && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                No se pudo generar el Excel, intenta de nuevo o contacta soporte.
              </p>
            )}
          </section>

          <section className="panel" aria-labelledby="productos-titulo">
            <h3 id="productos-titulo" className="px-4 pt-4 text-lg text-slate-900">
              Productos
            </h3>
            <ul className="mt-3 divide-y divide-slate-200 border-t border-slate-200">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug text-slate-900">
                      {item.product
                        ? displayNombreProducto(item.product.descripcion, item.product.codigo_interno)
                        : "—"}
                    </p>
                    <p className="cifra mt-0.5 text-sm text-slate-600">
                      {item.cantidad} × {formatSoles(item.precio_unitario)} · IGV{" "}
                      {formatSoles(item.igv)}
                    </p>
                  </div>
                  <p className="cifra shrink-0 font-semibold text-slate-900">
                    {formatSoles(item.total)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <p className="font-medium text-slate-700">Total</p>
              <p className="cifra text-xl font-semibold text-slate-900">{formatSoles(total)}</p>
            </div>
          </section>
        </>
      )}

      {fulfillment && (
        <section className="panel p-4">
          <h3 className="text-lg text-slate-900">Despacho</h3>
          <p className="mt-2 text-sm text-slate-600">
            Despachado el{" "}
            {fulfillment.fecha_despacho
              ? new Date(fulfillment.fecha_despacho).toLocaleString("es-PE", {
                  timeZone: "America/Lima",
                })
              : "—"}
            {fulfillment.inventory_source && ` · ${fulfillment.inventory_source.nombre}`}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Transporte:{" "}
            {fulfillment.transporter?.nombre ??
              [fulfillment.vehicle?.nombre, fulfillment.driver?.nombre].filter(Boolean).join(" · ") ??
              "—"}
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {fulfillment.fulfillment_items.map((fi, idx) => {
              const pedida = Number(fi.order_item?.cantidad ?? 0);
              const preparada = Number(fi.cantidad_preparada);
              return (
                <li key={idx} className={preparada !== pedida ? "text-amber-900" : "text-slate-700"}>
                  <span className="cifra">
                    {fi.order_item?.product?.codigo_interno ?? "—"} · pedido {pedida} · despachado{" "}
                    {preparada}
                  </span>
                  {fi.motivo_diferencia && ` — ${fi.motivo_diferencia}`}
                  {fi.pendiente_de_stock && " — pendiente de stock"}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {puedeVerBorradores && (
        <section className="panel p-4">
          <h3 className="text-lg text-slate-900">Documentación electrónica</h3>
          <p className="mt-1 text-sm text-slate-600">
            Borradores generados al despachar, para revisar contra el manual de la facturadora. No se
            han enviado a ningún servicio. Ahí se pueden ver, copiar y descargar como .json.
          </p>
          {/*
            Link a la sección de documentos, no una copia de la generación:
            los borradores se arman una sola vez al despachar y viven en
            electronic_document_drafts. Duplicar la lógica acá sería tener dos
            fuentes del mismo JSON.
          */}
          <Link
            href={`/control-pedidos/documentos/${order.id}`}
            className="btn-secondary mt-3 inline-flex text-sm"
          >
            Ver y descargar comprobante y guía
          </Link>
        </section>
      )}

      {!isDraft && (
        <section className="panel p-4">
          <h3 className="text-lg text-slate-900">Historial de estados</h3>
          {order.history.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Sin cambios de estado todavía.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2 text-sm">
              {order.history.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-slate-100 pb-2 last:border-0"
                >
                  <span className="text-slate-900">
                    {estadoLabel(h.estado_nuevo)}
                    {h.motivo ? ` — ${h.motivo}` : ""}
                  </span>
                  <span className="cifra text-slate-600">
                    {new Date(h.fecha).toLocaleString("es-PE", { timeZone: "America/Lima" })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="panel p-4">
        <h3 className="text-lg text-slate-900">Observaciones</h3>
        {order.observations.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Sin observaciones.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {order.observations.map((o) => (
              <div key={o.id} className="border-b border-slate-100 pb-2 last:border-0">
                <p className="text-slate-900">{o.comentario}</p>
                <p className="cifra mt-0.5 text-slate-600">
                  {new Date(o.fecha).toLocaleString("es-PE", { timeZone: "America/Lima" })}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <ObservationForm orderId={order.id} />
        </div>
      </section>
    </div>
  );
}
