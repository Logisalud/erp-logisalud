"use client";

import React, { useMemo, useState } from "react";
import {
  DeliveryZoneId,
  RealtimeOrder,
  RealtimeOrderStatus,
} from "../../domain/dashboard-types";
import { ZONAS_CONFIG } from "../../domain/dashboard-dummy-data";

interface OrderFeedProps {
  orders: RealtimeOrder[];
  selectedOrderId: string | null;
  onSelectOrder: (order: RealtimeOrder) => void;
  selectedZone: DeliveryZoneId | "todas";
  onSelectZone: (zone: DeliveryZoneId | "todas") => void;
  statusFilter: RealtimeOrderStatus | "TODOS";
  onSelectStatus: (status: RealtimeOrderStatus | "TODOS") => void;
  isTvMode: boolean;
}

export function OrderFeed({
  orders,
  selectedOrderId,
  onSelectOrder,
  selectedZone,
  onSelectZone,
  statusFilter,
  onSelectStatus,
  isTvMode,
}: OrderFeedProps) {
  const [searchTerm, setSearchTerm] = useState<string>("");

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchZone = selectedZone === "todas" || o.destino.zonaId === selectedZone;
      const matchStatus = statusFilter === "TODOS" || o.estado === statusFilter;
      const matchSearch =
        searchTerm === "" ||
        o.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.cliente.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.destino.distrito.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.vendedor.toLowerCase().includes(searchTerm.toLowerCase());
      return matchZone && matchStatus && matchSearch;
    });
  }, [orders, selectedZone, statusFilter, searchTerm]);

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-2xl border transition-colors ${
        isTvMode
          ? "border-slate-800 bg-[#0f172a]/95 text-white"
          : "border-slate-200 bg-white text-slate-800 shadow-sm"
      }`}
    >
      {/* Encabezado del feed */}
      <div className="border-b border-slate-700/40 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <h3 className="font-heading font-bold text-lg tracking-tight">
              Flujo de Pedidos en Vivo
            </h3>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isTvMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"
            }`}
          >
            {filtered.length} visibles
          </span>
        </div>

        {/* Buscador de pedidos */}
        <div className="mt-3">
          <input
            type="text"
            placeholder="Buscar por cliente, distrito, # pedido o vendedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full rounded-xl border px-3.5 py-2 text-xs outline-none transition placeholder:text-slate-400 ${
              isTvMode
                ? "border-slate-700 bg-slate-900/90 text-white focus:border-logisalud-green focus:ring-1 focus:ring-logisalud-green"
                : "border-slate-200 bg-slate-50 text-slate-900 focus:border-logisalud-green focus:bg-white focus:ring-1 focus:ring-logisalud-green"
            }`}
          />
        </div>

        {/* Selector de Zonas */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => onSelectZone("todas")}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              selectedZone === "todas"
                ? "bg-logisalud-green text-white font-semibold shadow-sm"
                : isTvMode
                ? "bg-slate-800/80 text-slate-400 hover:text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todas
          </button>
          {Object.entries(ZONAS_CONFIG).map(([id, z]) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectZone(id as DeliveryZoneId)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                selectedZone === id
                  ? "bg-logisalud-green text-white font-semibold shadow-sm"
                  : isTvMode
                  ? "bg-slate-800/80 text-slate-400 hover:text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {z.nombre}
            </button>
          ))}
        </div>

        {/* Selector de Estado */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {(
            [
              ["TODOS", "Todos"],
              ["IN_TRANSIT", "En Ruta"],
              ["READY_FOR_OPERATIONS", "Listos Picking"],
              ["DELIVERED", "Entregados"],
              ["SUBMITTED", "Nuevos"],
              ["EXCEPTION", "Alertas"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectStatus(key as RealtimeOrderStatus | "TODOS")}
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                statusFilter === key
                  ? "border border-logisalud-teal bg-logisalud-teal/20 text-logisalud-teal font-semibold"
                  : isTvMode
                  ? "text-slate-400 hover:text-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista scrolleable de pedidos */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-700/30 p-2">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No hay pedidos que coincidan con los filtros actuales.
          </div>
        ) : (
          filtered.map((order) => {
            const isSelected = order.id === selectedOrderId;
            return (
              <div
                key={order.id}
                onClick={() => onSelectOrder(order)}
                className={`group relative cursor-pointer rounded-xl p-3 transition-all ${
                  isSelected
                    ? isTvMode
                      ? "border-l-4 border-l-logisalud-green bg-slate-800/90 shadow-md"
                      : "border-l-4 border-l-logisalud-green bg-emerald-50/70 shadow-sm"
                    : isTvMode
                    ? "hover:bg-slate-800/50"
                    : "hover:bg-slate-50"
                }`}
              >
                {/* Indicador de Nuevo Pedido en vivo */}
                {order.isNew && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                  </span>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-sm text-logisalud-green">
                        {order.codigo}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {order.actualizadoEn}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-1 font-medium text-xs">
                      {order.cliente.razonSocial}
                    </div>
                  </div>

                  {/* Badge de Estado */}
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      order.estado === "DELIVERED"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : order.estado === "IN_TRANSIT"
                        ? "bg-purple-500/20 text-purple-400"
                        : order.estado === "READY_FOR_OPERATIONS"
                        ? "bg-cyan-500/20 text-cyan-400"
                        : order.estado === "EXCEPTION"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {order.estadoLabel}
                  </span>
                </div>

                {/* Subinfo: Distrito, Monto y Vehículo */}
                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="truncate">📍 {order.destino.distrito}</span>
                    <span>•</span>
                    <span className="truncate">{order.destino.zonaNombre}</span>
                  </div>
                  <span className="cifra font-heading font-bold text-sm text-logisalud-teal">
                    S/ {order.montoTotal.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Conductor asignado si está en ruta */}
                {order.conductorAsignado && (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-purple-400">
                    <span>🚚 {order.conductorAsignado.nombre} ({order.conductorAsignado.placa})</span>
                    <span>ETA {order.ventanaEntrega}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
