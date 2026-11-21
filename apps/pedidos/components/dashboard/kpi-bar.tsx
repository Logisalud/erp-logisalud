"use client";

import React from "react";
import { DashboardKPIs } from "../../domain/dashboard-types";

interface KpiBarProps {
  kpis: DashboardKPIs;
  isTvMode: boolean;
}

export function KpiBar({ kpis, isTvMode }: KpiBarProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
      {/* 1. Total Pedidos */}
      <div
        className={`flex flex-col justify-between rounded-xl border p-3 transition-colors ${
          isTvMode
            ? "border-slate-800 bg-slate-900/90 text-white"
            : "border-slate-200 bg-white text-slate-800 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Pedidos Hoy
          </span>
          <span className="text-base">📦</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={`font-heading font-bold tabular-nums ${
              isTvMode ? "text-3xl text-white" : "text-2xl text-slate-900"
            }`}
          >
            {kpis.totalPedidosHoy}
          </span>
          <span className="text-[11px] font-semibold text-emerald-500">
            +18% hoy
          </span>
        </div>
      </div>

      {/* 2. Total Facturado S/. */}
      <div
        className={`flex flex-col justify-between rounded-xl border p-3 transition-colors ${
          isTvMode
            ? "border-slate-800 bg-slate-900/90 text-white"
            : "border-slate-200 bg-white text-slate-800 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Total S/.
          </span>
          <span className="text-base text-logisalud-green font-bold">S/</span>
        </div>
        <div className="mt-2">
          <span
            className={`font-heading font-bold tabular-nums text-logisalud-green ${
              isTvMode ? "text-3xl" : "text-2xl"
            }`}
          >
            S/ {kpis.totalMontoHoy.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* 3. En Tránsito / En Ruta */}
      <div
        className={`flex flex-col justify-between rounded-xl border p-3 transition-colors ${
          isTvMode
            ? "border-purple-900/50 bg-purple-950/20 text-white"
            : "border-purple-200 bg-purple-50/50 text-slate-800 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-purple-400">
            En Ruta
          </span>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-purple-500"></span>
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={`font-heading font-bold tabular-nums text-purple-400 ${
              isTvMode ? "text-3xl" : "text-2xl"
            }`}
          >
            {kpis.enTransito}
          </span>
          <span className="text-[11px] text-purple-400">pedidos</span>
        </div>
      </div>

      {/* 4. Entregados Hoy */}
      <div
        className={`flex flex-col justify-between rounded-xl border p-3 transition-colors ${
          isTvMode
            ? "border-emerald-900/50 bg-emerald-950/20 text-white"
            : "border-emerald-200 bg-emerald-50/50 text-slate-800 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-emerald-400">
            Entregados
          </span>
          <span className="text-base text-emerald-500">✓</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={`font-heading font-bold tabular-nums text-emerald-400 ${
              isTvMode ? "text-3xl" : "text-2xl"
            }`}
          >
            {kpis.entregadosHoy}
          </span>
          <span className="text-[11px] text-emerald-500 font-semibold">
            {kpis.totalPedidosHoy > 0
              ? `${Math.round((kpis.entregadosHoy / kpis.totalPedidosHoy) * 100)}%`
              : "0%"}
          </span>
        </div>
      </div>

      {/* 5. Pendientes en Almacén / Despacho */}
      <div
        className={`flex flex-col justify-between rounded-xl border p-3 transition-colors ${
          isTvMode
            ? "border-cyan-900/50 bg-cyan-950/20 text-white"
            : "border-cyan-200 bg-cyan-50/50 text-slate-800 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-cyan-400">
            Por Despachar
          </span>
          <span className="text-base">🏭</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={`font-heading font-bold tabular-nums text-cyan-400 ${
              isTvMode ? "text-3xl" : "text-2xl"
            }`}
          >
            {kpis.pendientesDespacho}
          </span>
          <span className="text-[11px] text-slate-400">en picking</span>
        </div>
      </div>

      {/* 6. Cumplimiento SLA / Tiempo */}
      <div
        className={`flex flex-col justify-between rounded-xl border p-3 transition-colors ${
          isTvMode
            ? "border-slate-800 bg-slate-900/90 text-white"
            : "border-slate-200 bg-white text-slate-800 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            SLA Entrega
          </span>
          <span className="text-base">⏱️</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={`font-heading font-bold tabular-nums ${
              kpis.slaCumplimientoPct >= 95
                ? "text-emerald-400"
                : "text-amber-400"
            } ${isTvMode ? "text-3xl" : "text-2xl"}`}
          >
            {kpis.slaCumplimientoPct}%
          </span>
          <span className="text-[11px] text-slate-400">a tiempo</span>
        </div>
      </div>
    </div>
  );
}
