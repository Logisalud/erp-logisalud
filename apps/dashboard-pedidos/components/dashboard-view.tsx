"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DashboardOrder, RealtimeOrderStatus } from "@/domain/types";
import { useRealtimeDashboard } from "./use-realtime-dashboard";
import { logoutDashboard } from "./auth-gate";
import { KpiBar } from "./kpi-bar";
import { OrderFeed } from "./order-feed";
import { OrderDetailModal } from "./order-detail-modal";
import { TvTicker } from "./tv-ticker";

// Importación dinámica de Leaflet para ejecución exclusiva en el cliente (sin SSR)
const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-700/30 bg-[#090d16] text-slate-400">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-logisalud-green border-t-transparent" />
        <span className="text-xs font-mono">Cargando mapa interactivo...</span>
      </div>
    </div>
  ),
});

export function DashboardView() {
  const {
    orders,
    stats,
    vehicles,
    events,
    isConnected,
    soundEnabled,
    toggleSound,
    refetch,
  } = useRealtimeDashboard();

  const [selectedOrder, setSelectedOrder] = useState<DashboardOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<RealtimeOrderStatus | "TODOS">("TODOS");
  const [viewMode, setViewMode] = useState<"lima" | "peru">("lima");
  const [isTvMode, setIsTvMode] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<"mapa" | "pedidos">("mapa");
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("es-PE", {
          timeZone: "America/Lima",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsTvMode(true);
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div
      className={`flex min-h-screen flex-col transition-colors duration-300 ${
        isTvMode ? "bg-[#090d16] text-white" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* 1. Header Limpio y Compacto */}
      <header
        className={`sticky top-0 z-30 border-b px-4 py-2 backdrop-blur-md transition-colors sm:px-6 ${
          isTvMode ? "border-slate-800 bg-[#090d16]/95 text-white" : "border-slate-200 bg-white/95 text-slate-800"
        }`}
      >
        <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-3">
          {/* Logo y Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-heading font-bold text-lg text-logisalud-green tracking-tight sm:text-xl">
                LOGISALUD
              </span>
              <span className="rounded-md bg-logisalud-teal/15 px-2 py-0.5 text-[11px] font-bold text-logisalud-teal">
                MAPA REALTIME
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[11px] font-mono border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span>{isConnected ? "EN VIVO" : "CONECTANDO..."}</span>
            </div>
          </div>

          {/* Reloj Lima */}
          <div className="hidden md:flex items-center text-xs font-mono text-slate-400">
            🕒 {currentTime || "12:00:00"} LIMA (UTC-5)
          </div>

          {/* Controles de Acción Rápidos */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-700 active:scale-95 transition"
              title="Refrescar datos de Supabase"
            >
              <span>↻</span>
              <span className="hidden sm:inline">Refrescar</span>
            </button>

            <button
              type="button"
              onClick={toggleSound}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border text-xs transition active:scale-95 ${
                soundEnabled ? "border-slate-700 bg-slate-800 text-white" : "border-red-400 bg-red-50 text-red-500"
              }`}
              title={soundEnabled ? "Silenciar" : "Activar sonido"}
            >
              {soundEnabled ? "🔔" : "🔕"}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsTvMode((t) => !t);
                toggleFullscreen();
              }}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-bold shadow-sm transition active:scale-95 ${
                isTvMode
                  ? "border-purple-500 bg-purple-500/20 text-purple-300"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
              title="Modo Pantalla Completa / TV"
            >
              <span>📺</span>
              <span className="hidden sm:inline">Modo TV</span>
            </button>

            {/* Botón Salir / Bloquear */}
            <button
              type="button"
              onClick={logoutDashboard}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border text-xs transition active:scale-95 ${
                isTvMode
                  ? "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:text-slate-800"
              }`}
              title="Cerrar sesión / Bloquear acceso"
            >
              🔒
            </button>
          </div>
        </div>
      </header>

      {/* 2. Pestañas solo en Celulares */}
      <div className="border-b border-slate-700/30 p-2 sm:hidden bg-inherit">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-800/20 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMobileTab("mapa")}
            className={`rounded-lg py-1.5 transition ${
              mobileTab === "mapa" ? "bg-logisalud-green text-white shadow-sm" : "text-slate-400"
            }`}
          >
            🗺️ Mapa ({viewMode === "lima" ? "Lima" : "Perú"})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("pedidos")}
            className={`rounded-lg py-1.5 transition ${
              mobileTab === "pedidos" ? "bg-logisalud-green text-white shadow-sm" : "text-slate-400"
            }`}
          >
            📋 Pedidos ({orders.length})
          </button>
        </div>
      </div>

      {/* 3. Área Principal */}
      <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-3 p-3 sm:p-4">
        {/* Cinta de KPIs Compacta y Limpia */}
        <KpiBar stats={stats} isTvMode={isTvMode} />

        {/* Layout Split: Stream Izquierda + Mapa Derecha */}
        <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-12 min-h-[580px] lg:min-h-[640px]">
          {/* Stream de Pedidos (4 columnas en Desktop) */}
          <div
            className={`h-[600px] lg:col-span-4 lg:h-full ${
              mobileTab === "pedidos" ? "block" : "hidden lg:block"
            }`}
          >
            <OrderFeed
              orders={orders}
              selectedOrderId={selectedOrder?.id ?? null}
              onSelectOrder={(order) => setSelectedOrder(order)}
              statusFilter={statusFilter}
              onSelectStatus={(status) => setStatusFilter(status)}
              isTvMode={isTvMode}
            />
          </div>

          {/* Mapa Leaflet Mejorado (8 columnas en Desktop) */}
          <div
            className={`h-[550px] sm:h-[600px] lg:col-span-8 lg:h-full ${
              mobileTab === "mapa" ? "block" : "hidden lg:block"
            }`}
          >
            <LeafletMap
              orders={orders}
              vehicles={vehicles}
              selectedOrderId={selectedOrder?.id ?? null}
              onSelectOrder={(order) => setSelectedOrder(order)}
              viewMode={viewMode}
              onToggleViewMode={(mode) => setViewMode(mode)}
              isTvMode={isTvMode}
            />
          </div>
        </div>
      </main>

      {/* 4. Marquesina Ticker en el Pie */}
      <TvTicker events={events} isTvMode={isTvMode} />

      {/* 5. Modal de Detalle */}
      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        isTvMode={isTvMode}
      />
    </div>
  );
}
