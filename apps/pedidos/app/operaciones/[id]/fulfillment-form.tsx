"use client";

import { useMemo, useState, useTransition } from "react";
import { faltaStockRegistrado, type LineaPreparada } from "@/domain/fulfillment";
import type { DispatchCatalogs, OrderForFulfillment } from "@/services/fulfillments";
import { confirmarDespacho, stockDeLaFuente } from "./actions";

type LineaEstado = {
  cantidadPreparada: string;
  lote: string;
  fechaVencimiento: string;
  motivoDiferencia: string;
  pendienteDeStock: boolean;
  comentarioStock: string;
};

export function FulfillmentForm({
  order,
  catalogs,
}: {
  order: OrderForFulfillment;
  catalogs: DispatchCatalogs;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const [inventorySourceId, setInventorySourceId] = useState("");
  const [warehouseId, setWarehouseId] = useState(
    catalogs.warehouses.length === 1 ? String(catalogs.warehouses[0].id) : "",
  );
  const [modoTransporte, setModoTransporte] = useState<"propio" | "externo">("propio");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [stock, setStock] = useState<Record<string, number | null>>({});

  const [lineas, setLineas] = useState<Record<string, LineaEstado>>(() =>
    Object.fromEntries(
      order.items.map((i) => [
        i.order_item_id,
        {
          cantidadPreparada: String(i.cantidad_pedida),
          lote: "",
          fechaVencimiento: "",
          motivoDiferencia: "",
          pendienteDeStock: false,
          comentarioStock: "",
        },
      ]),
    ),
  );

  function actualizarLinea(id: string, campo: keyof LineaEstado, valor: string | boolean) {
    setLineas((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  function handleFuente(value: string) {
    setInventorySourceId(value);
    setStock({});
    if (!value) return;
    startTransition(async () => {
      try {
        setStock(await stockDeLaFuente(order.id, Number(value)));
      } catch {
        // El stock es informativo: si no se puede leer, no se bloquea nada.
        setStock({});
      }
    });
  }

  const lineasParaEnviar: LineaPreparada[] = useMemo(
    () =>
      order.items.map((i) => {
        const l = lineas[i.order_item_id];
        return {
          orderItemId: i.order_item_id,
          codigo: i.codigo,
          cantidadPedida: i.cantidad_pedida,
          cantidadPreparada: Number(l.cantidadPreparada === "" ? NaN : l.cantidadPreparada),
          controlaLote: i.controla_lote,
          controlaVencimiento: i.controla_vencimiento,
          lote: l.lote.trim() || null,
          fechaVencimiento: l.fechaVencimiento || null,
          motivoDiferencia: l.motivoDiferencia.trim() || null,
          pendienteDeStock: l.pendienteDeStock,
          comentarioStock: l.comentarioStock.trim() || null,
        };
      }),
    [order.items, lineas],
  );

  function handleConfirmar() {
    setError(null);
    startTransition(async () => {
      try {
        await confirmarDespacho({
          orderId: order.id,
          inventorySourceId: Number(inventorySourceId),
          warehouseId: Number(warehouseId),
          vehicleId: modoTransporte === "propio" && vehicleId ? Number(vehicleId) : null,
          driverId: modoTransporte === "propio" && driverId ? Number(driverId) : null,
          transporterId: modoTransporte === "externo" && transporterId ? Number(transporterId) : null,
          lineas: lineasParaEnviar,
          motivo: motivo.trim() || null,
        });
        setListo(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo confirmar el despacho.");
      }
    });
  }

  if (listo) {
    return (
      <div className="card-highlight p-5">
        <p className="font-heading text-lg text-logisalud-green">Despacho confirmado</p>
        <p className="mt-1 text-sm text-gray-600">
          El pedido #{order.numero} quedó despachado. Recarga la página para ver el detalle.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="card flex flex-col gap-4 p-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Fuente de stock <span className="text-red-600">*</span>
          </label>
          <select
            value={inventorySourceId}
            onChange={(e) => handleFuente(e.target.value)}
            className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">Selecciona la fuente de stock</option>
            {catalogs.inventorySources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} ({s.tipo})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            El stock de fuentes distintas no se mezcla. Esta decisión es de Operaciones, no del
            vendedor.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Almacén <span className="text-red-600">*</span>
          </label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">Selecciona el almacén</option>
            {catalogs.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">Transporte</span>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="modoTransporte"
                checked={modoTransporte === "propio"}
                onChange={() => setModoTransporte("propio")}
              />
              Propio (vehículo + chofer)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="modoTransporte"
                checked={modoTransporte === "externo"}
                onChange={() => setModoTransporte("externo")}
              />
              Transportista externo
            </label>
          </div>

          {modoTransporte === "propio" ? (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="min-h-12 flex-1 rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">Vehículo</option>
                {catalogs.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="min-h-12 flex-1 rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">Chofer</option>
                {catalogs.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <select
              value={transporterId}
              onChange={(e) => setTransporterId(e.target.value)}
              className="mt-2 min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">Transportista</option>
              {catalogs.transporters.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          )}

          {modoTransporte === "propio" && catalogs.vehicles.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              No hay vehículos registrados. Un administrador puede agregarlos en Maestros, o usa un
              transportista externo.
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-heading text-lg">Líneas preparadas</h3>
        <ul className="mt-3 flex flex-col gap-3">
          {order.items.map((i) => {
            const l = lineas[i.order_item_id];
            const preparada = Number(l.cantidadPreparada === "" ? NaN : l.cantidadPreparada);
            const hayDiferencia = Number.isFinite(preparada) && preparada !== i.cantidad_pedida;
            const disponible = stock[i.order_item_id];
            const avisoStock =
              inventorySourceId !== "" &&
              Number.isFinite(preparada) &&
              faltaStockRegistrado({
                cantidadPreparada: preparada,
                cantidadDisponible: disponible === undefined ? null : disponible,
              });

            return (
              <li key={i.order_item_id} className="card flex flex-col gap-3 p-4">
                <div>
                  <p className="font-medium text-gray-900">
                    {i.codigo} · {i.descripcion}
                  </p>
                  <p className="text-sm text-gray-600">
                    Pedido: {i.cantidad_pedida} {i.unidad_medida}
                    {inventorySourceId !== "" && (
                      <>
                        {" · "}
                        Stock registrado:{" "}
                        {disponible === undefined || disponible === null ? "sin registro" : disponible}
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex-1">
                    <span className="mb-1 block text-xs text-gray-600">Cantidad preparada</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.cantidadPreparada}
                      onChange={(e) => actualizarLinea(i.order_item_id, "cantidadPreparada", e.target.value)}
                      className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </label>

                  {i.controla_lote && (
                    <label className="flex-1">
                      <span className="mb-1 block text-xs text-gray-600">
                        Lote <span className="text-red-600">*</span>
                      </span>
                      <input
                        type="text"
                        value={l.lote}
                        onChange={(e) => actualizarLinea(i.order_item_id, "lote", e.target.value)}
                        className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                  )}

                  {i.controla_vencimiento && (
                    <label className="flex-1">
                      <span className="mb-1 block text-xs text-gray-600">
                        Vencimiento <span className="text-red-600">*</span>
                      </span>
                      <input
                        type="date"
                        value={l.fechaVencimiento}
                        onChange={(e) =>
                          actualizarLinea(i.order_item_id, "fechaVencimiento", e.target.value)
                        }
                        className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                  )}
                </div>

                {hayDiferencia && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-amber-800">
                      Motivo de la diferencia <span className="text-red-600">*</span>
                    </span>
                    <input
                      type="text"
                      value={l.motivoDiferencia}
                      onChange={(e) =>
                        actualizarLinea(i.order_item_id, "motivoDiferencia", e.target.value)
                      }
                      placeholder="Ej. rotura en almacén, stock parcial"
                      className="min-h-12 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2"
                    />
                  </label>
                )}

                {avisoStock && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    El stock registrado no alcanza para esta cantidad. El registro es manual y puede
                    estar desfasado, así que no bloquea el despacho — si de verdad falta, márcala como
                    pendiente de stock.
                  </p>
                )}

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={l.pendienteDeStock}
                    onChange={(e) =>
                      actualizarLinea(i.order_item_id, "pendienteDeStock", e.target.checked)
                    }
                  />
                  Pendiente de stock
                </label>

                {l.pendienteDeStock && (
                  <input
                    type="text"
                    value={l.comentarioStock}
                    onChange={(e) => actualizarLinea(i.order_item_id, "comentarioStock", e.target.value)}
                    placeholder="Comentario (requerido)"
                    className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Observación del despacho (opcional)
        </label>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </div>

      <button type="button" onClick={handleConfirmar} className="btn-primary" disabled={isPending}>
        Confirmar despacho
      </button>
    </div>
  );
}
