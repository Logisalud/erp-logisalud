"use client";

import React from "react";
import { DashboardOrder } from "@/domain/types";

interface OrderDetailModalProps {
  order: DashboardOrder | null;
  onClose: () => void;
  isTvMode: boolean;
}

export function OrderDetailModal({ order, onClose, isTvMode }: OrderDetailModalProps) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm">
      <div
        className={`relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl transition-all ${
          isTvMode ? "border-slate-800 bg-[#0f172a] text-white" : "border-slate-200 bg-white text-slate-800"
        }`}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-700/40 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="font-heading font-bold text-2xl text-logisalud-green">{order.codigoDisplay}</span>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300 uppercase">
              {order.estadoLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-700/30 text-lg hover:bg-slate-700/60 transition"
          >
            ✕
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-700/30 p-3 bg-slate-500/5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Cliente</span>
              <p className="mt-1 font-bold text-sm leading-tight">{order.cliente.razonSocial}</p>
              <p className="mt-0.5 text-xs text-slate-400">RUC: {order.cliente.ruc || "Sin RUC"}</p>
            </div>
            <div className="rounded-xl border border-slate-700/30 p-3 bg-slate-500/5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Destino</span>
              <p className="mt-1 font-bold text-sm leading-tight">{order.direccion.texto}</p>
              <p className="mt-0.5 text-xs text-logisalud-teal">
                {order.direccion.distrito} • {order.direccion.zonaNombre}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Productos ({order.items.length})
              </span>
              <span className="text-xs text-slate-400">Vendedor: {order.vendedor.nombre}</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-700/30">
              <table className="w-full text-left text-xs">
                <thead className={isTvMode ? "bg-slate-900 text-slate-400" : "bg-slate-50 text-slate-600"}>
                  <tr>
                    <th className="p-2.5">Código / Descripción</th>
                    <th className="p-2.5 text-center">Cant.</th>
                    <th className="p-2.5 text-right">P. Unit.</th>
                    <th className="p-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/20">
                  {order.items.map((it) => (
                    <tr key={it.id}>
                      <td className="p-2.5">
                        <div className="font-semibold">{it.producto.descripcion}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{it.producto.codigoInterno}</div>
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold">{it.cantidad}</td>
                      <td className="p-2.5 text-right font-mono">S/ {it.precioUnitario.toFixed(2)}</td>
                      <td className="p-2.5 text-right font-mono font-bold">S/ {it.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border p-4 bg-slate-500/5">
            <span className="text-xs text-slate-400">Total del Pedido (inc. IGV):</span>
            <span className="font-heading font-bold text-2xl text-logisalud-green">
              S/ {order.montoTotal.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-700/40 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-xs font-bold text-white hover:bg-slate-700 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
