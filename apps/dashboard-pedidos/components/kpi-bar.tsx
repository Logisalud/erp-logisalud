"use client";

import React from "react";
import { DashboardStats } from "@/domain/types";

interface KpiBarProps {
  stats: DashboardStats | null;
  isTvMode: boolean;
}

export function KpiBar({ stats, isTvMode }: KpiBarProps) {
  const s = stats || {
    totalPedidosBD: 685,
    pedidosHoy: 60,
    montoTotalHoy: 21299,
    listosOperaciones: 40,
    enRuta: 3,
    entregadosHoy: 28,
    excepciones: 7,
    slaEfectividadPct: 98.4,
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 transition-colors ${
        isTvMode
          ? "border-slate-800 bg-slate-900/90 text-white shadow-md"
          : "border-slate-200 bg-white text-slate-800 shadow-sm"
      }`}
    >
      <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs">
        {/* Total BD */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Total Pedidos:</span>
          <span className="font-heading font-bold text-base text-slate-100 dark:text-white tabular-nums">
            {s.totalPedidosBD}
          </span>
        </div>

        <div className="hidden sm:block h-3.5 w-[1px] bg-slate-300 dark:bg-slate-700" />

        {/* Monto Total */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Monto Hoy:</span>
          <span className="font-heading font-bold text-base text-logisalud-green tabular-nums">
            S/ {s.montoTotalHoy.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="hidden sm:block h-3.5 w-[1px] bg-slate-300 dark:bg-slate-700" />

        {/* Por Despachar */}
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-medium">Por Despachar:</span>
          <span className="font-heading font-bold text-base text-cyan-400 tabular-nums">
            {s.listosOperaciones}
          </span>
        </div>

        <div className="hidden sm:block h-3.5 w-[1px] bg-slate-300 dark:bg-slate-700" />

        {/* En Ruta */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-500"></span>
          </span>
          <span className="text-purple-400 font-medium">En Ruta:</span>
          <span className="font-heading font-bold text-base text-purple-400 tabular-nums">
            {s.enRuta}
          </span>
        </div>

        <div className="hidden sm:block h-3.5 w-[1px] bg-slate-300 dark:bg-slate-700" />

        {/* Excepciones */}
        {s.excepciones > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-medium">Excepciones:</span>
            <span className="font-heading font-bold text-base text-red-400 tabular-nums">
              {s.excepciones}
            </span>
          </div>
        )}
      </div>

      {/* SLA / Efectividad */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400 font-medium">Efectividad SLA:</span>
        <span className="font-heading font-bold text-sm text-emerald-400 tabular-nums">
          {s.slaEfectividadPct}%
        </span>
      </div>
    </div>
  );
}
