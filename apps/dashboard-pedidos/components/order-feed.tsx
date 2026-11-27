"use client";

import React, { useMemo, useState } from "react";
import { DashboardOrder, RealtimeOrderStatus } from "@/domain/types";

interface OrderFeedProps {
  orders: DashboardOrder[];
  selectedOrderId: string | null;
  onSelectOrder: (order: DashboardOrder) => void;
  statusFilter: RealtimeOrderStatus | "TODOS";
  onSelectStatus: (status: RealtimeOrderStatus | "TODOS") => void;
  isTvMode: boolean;
}

export function OrderFeed({
  orders,
  selectedOrderId,
  onSelectOrder,
  statusFilter,
  onSelectStatus,
  isTvMode,
}: OrderFeedProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = statusFilter === "TODOS" || o.estado === statusFilter;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        !term ||
        o.codigoDisplay.toLowerCase().includes(term) ||
        o.cliente.razonSocial.toLowerCase().includes(term) ||
        o.cliente.ruc.includes(term) ||
        o.direccion.distrito.toLowerCase().includes(term) ||
        o.vendedor.nombre.toLowerCase().includes(term);

      return matchStatus && matchSearch;
    });
  }, [orders, statusFilter, searchTerm]);

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-2xl border transition-colors ${
        isTvMode ? "border-slate-800 bg-[#0f172a]/95 text-white" : "border-slate-200 bg-white text-slate-800 shadow-sm"
      }`}
    >
      {/* Cabecera Limpia */}
      <div className="border-b border-slate-700/40 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <h3 className="font-heading font-bold text-base tracking-tight">Stream de Pedidos</h3>
          </div>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-400">
            {filtered.length} pedidos
          </span>
        </div>

        {/* Buscador Simple */}
        <input
          type="text"
          placeholder="Buscar cliente, RUC, distrito o vendedor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`w-full rounded-lg border px-3 py-1.5 text-xs outline-none transition placeholder:text-slate-500 ${
            isTvMode
              ? "border-slate-700 bg-slate-900 text-white focus:border-logisalud-green"
              : "border-slate-200 bg-slate-50 text-slate-900 focus:border-logisalud-green focus:bg-white"
          }`}
        />

        {/* Filtros de Estado en una Sola Fila */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
          {[
            ["TODOS", "Todos"],
            ["READY_FOR_OPERATIONS", "Listos"],
            ["DISPATCHED", "En Ruta"],
            ["ADMINISTRATIVE_EXCEPTION", "Excepciones"],
            ["DRAFT", "Borradores"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectStatus(key as RealtimeOrderStatus | "TODOS")}
              className={`shrink-0 rounded-lg px-2.5 py-1 font-medium transition ${
                statusFilter === key
                  ? "bg-logisalud-green text-white font-semibold shadow-sm"
                  : isTvMode
                  ? "bg-slate-800 text-slate-400 hover:text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista del Stream de Pedidos */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-700/20 p-1.5">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No hay pedidos con el filtro actual.
          </div>
        ) : (
          filtered.map((order) => {
            const isSelected = order.id === selectedOrderId;
            return (
              <div
                key={order.id}
                onClick={() => onSelectOrder(order)}
                className={`group cursor-pointer rounded-xl p-2.5 transition-all ${
                  isSelected
                    ? isTvMode
                      ? "border-l-4 border-l-logisalud-green bg-slate-800 shadow-md"
                      : "border-l-4 border-l-logisalud-green bg-emerald-50 shadow-sm"
                    : isTvMode
                    ? "hover:bg-slate-800/40"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-sm text-logisalud-green">
                        {order.codigoDisplay}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(order.fechaCreacion).toLocaleTimeString("es-PE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-1 font-semibold text-xs leading-snug">
                      {order.cliente.razonSocial}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      order.estado === "READY_FOR_OPERATIONS"
                        ? "bg-cyan-500/20 text-cyan-400"
                        : order.estado === "DISPATCHED"
                        ? "bg-purple-500/20 text-purple-400"
                        : order.estado.includes("EXCEPTION")
                        ? "bg-red-500/20 text-red-400"
                        : order.estado === "DRAFT"
                        ? "bg-slate-700 text-slate-300"
                        : "bg-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {order.estadoLabel}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1 truncate">
                    <span>📍 {order.direccion.distrito}</span>
                    <span>•</span>
                    <span className="truncate">{order.vendedor.nombre}</span>
                  </div>
                  <span className="font-heading font-bold text-xs text-logisalud-teal tabular-nums">
                    S/ {order.montoTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
