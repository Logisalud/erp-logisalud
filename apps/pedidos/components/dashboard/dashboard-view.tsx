"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  DeliveryZoneId,
  RealtimeOrder,
  RealtimeOrderStatus,
} from "../../domain/dashboard-types";
import { useRealtimePedidos } from "./use-realtime-pedidos";
import { MapCanvas } from "./map-canvas";
import { KpiBar } from "./kpi-bar";
import { OrderFeed } from "./order-feed";
import { OrderDetailModal } from "./order-detail-modal";
import { TvTicker } from "./tv-ticker";

export function DashboardView() {
  const {
    orders,
    vehicles,
    events,
    kpis,
    isPlaying,
    setIsPlaying,
    speedMultiplier,
    setSpeedMultiplier,
    soundEnabled,
    toggleSound,
    simulateNewOrder,
    latestNewOrderId,
  } = useRealtimePedidos();

  // Estados de interfaz
  const [selectedOrder, setSelectedOrder] = useState<RealtimeOrder | null>(null);
  const [selectedZone, setSelectedZone] = useState<DeliveryZoneId | "todas">("todas");
  const [statusFilter, setStatusFilter] = useState<RealtimeOrderStatus | "TODOS">("TODOS");
  const [isTvMode, setIsTvMode] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<"mapa" | "pedidos" | "kpis">("mapa");
  const [currentTime, setCurrentTime] = useState<string>("");

  // Reloj local en tiempo real (Lima)
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

  // Toggle Fullscreen para Pantallas TV
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
        isTvMode
          ? "bg-[#090d16] text-white"
          : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* 1. Barra de Control Superior */}
      <header
        className={`sticky top-0 z-30 border-b px-4 py-2.5 backdrop-blur-md transition-colors sm:px-6 ${
          isTvMode
            ? "border-slate-800 bg-[#090d16]/95 text-white"
            : "border-slate-200 bg-white/95 text-slate-800"
        }`}
      >
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-3">
          {/* Logo y Enlaces */}
          <div className="flex items-center gap-3">
            <Link
              href="/pedidos"
              className="group flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm font-semibold text-slate-500 hover:text-logisalud-green transition"
              title="Volver a Mis Pedidos"
            >
              <span>←</span>
              <span className="hidden sm:inline">Pedidos</span>
            </Link>

            <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700" />

            <div className="flex items-center gap-2">
              <span className="font-heading font-bold text-lg text-logisalud-green tracking-tight sm:text-xl">
                LOGISALUD
              </span>
              <span className="rounded-md bg-logisalud-teal/15 px-2 py-0.5 text-xs font-bold text-logisalud-teal">
                MAPA EN VIVO
              </span>
            </div>
          </div>

          {/* Reloj y Estado del Centro de Operaciones */}
          <div className="hidden md:flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-emerald-500">CONECTADO</span>
            </div>
            <div className={`rounded-lg border px-3 py-1 font-bold ${
              isTvMode ? "border-slate-800 bg-slate-900 text-slate-200" : "border-slate-200 bg-slate-100 text-slate-700"
            }`}>
              🕒 {currentTime || "12:00:00"} LIMA
            </div>
          </div>

          {/* Botones de Acción y Controles de Simulación */}
          <div className="flex items-center gap-2">
            {/* Botón Simular Nuevo Pedido */}
            <button
              type="button"
              onClick={simulateNewOrder}
              className="flex items-center gap-1.5 rounded-xl bg-logisalud-green px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-600 active:scale-95 transition"
              title="Generar un nuevo pedido simulado en tiempo real"
            >
              <span>+</span>
              <span className="hidden sm:inline">Simular Pedido</span>
            </button>

            {/* Play / Pausa Simulación */}
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border text-xs font-bold transition active:scale-95 ${
                isPlaying
                  ? isTvMode
                    ? "border-slate-700 bg-slate-800 text-emerald-400"
                    : "border-slate-200 bg-slate-100 text-emerald-600"
                  : "border-amber-400 bg-amber-50 text-amber-700"
              }`}
              title={isPlaying ? "Pausar simulación" : "Reanudar simulación"}
              aria-label={isPlaying ? "Pausar" : "Reanudar"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>

            {/* Multiplicador de Velocidad */}
            <button
              type="button"
              onClick={() =>
                setSpeedMultiplier((prev) => (prev === 1 ? 2 : prev === 2 ? 5 : 1))
              }
              className={`rounded-xl border px-2 py-1 text-xs font-mono font-bold transition active:scale-95 ${
                isTvMode
                  ? "border-slate-700 bg-slate-800 text-slate-300"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              }`}
              title="Velocidad de simulación"
            >
              {speedMultiplier}x
            </button>

            {/* Sonido On / Off */}
            <button
              type="button"
              onClick={toggleSound}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border text-xs transition active:scale-95 ${
                soundEnabled
                  ? isTvMode
                    ? "border-slate-700 bg-slate-800 text-white"
                    : "border-slate-200 bg-slate-100 text-slate-800"
                  : "border-red-400 bg-red-50 text-red-500"
              }`}
              title={soundEnabled ? "Silenciar notificaciones" : "Activar sonido"}
              aria-label="Alternar sonido"
            >
              {soundEnabled ? "🔔" : "🔕"}
            </button>

            {/* Toggle Modo TV / Fullscreen */}
            <button
              type="button"
              onClick={() => {
                setIsTvMode((t) => !t);
                toggleFullscreen();
              }}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-95 ${
                isTvMode
                  ? "border-purple-500 bg-purple-500/20 text-purple-300"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
              title="Modo Pantalla Gigante / TV de Operaciones"
            >
              <span>📺</span>
              <span className="hidden sm:inline">Modo TV</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Pestañas en Celular (Phone View Switcher) */}
      <div className="border-b border-slate-700/30 p-2 sm:hidden bg-inherit">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-800/10 dark:bg-slate-800/80 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMobileTab("mapa")}
            className={`rounded-lg py-2 transition ${
              mobileTab === "mapa"
                ? "bg-logisalud-green text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            🗺️ Mapa
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("pedidos")}
            className={`rounded-lg py-2 transition ${
              mobileTab === "pedidos"
                ? "bg-logisalud-green text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            📋 Pedidos ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("kpis")}
            className={`rounded-lg py-2 transition ${
              mobileTab === "kpis"
                ? "bg-logisalud-green text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            📊 Métricas
          </button>
        </div>
      </div>

      {/* 3. Área Principal */}
      <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-3 p-3 sm:p-4 lg:gap-4 lg:p-6">
        {/* Barra de KPIs: Visible en escritorio/TV o en tab de KPIs en móvil */}
        <div className={mobileTab === "kpis" ? "block sm:block" : "hidden sm:block"}>
          <KpiBar kpis={kpis} isTvMode={isTvMode} />
        </div>

        {/* Layout Split: Feed a la izquierda + Mapa al centro */}
        <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4 min-h-[550px] lg:min-h-[640px]">
          {/* Feed de Pedidos: 4 columnas en desktop */}
          <div
            className={`h-[600px] lg:col-span-4 lg:h-full ${
              mobileTab === "pedidos" ? "block" : "hidden lg:block"
            }`}
          >
            <OrderFeed
              orders={orders}
              selectedOrderId={selectedOrder?.id ?? null}
              onSelectOrder={(order) => setSelectedOrder(order)}
              selectedZone={selectedZone}
              onSelectZone={(zone) => setSelectedZone(zone)}
              statusFilter={statusFilter}
              onSelectStatus={(status) => setStatusFilter(status)}
              isTvMode={isTvMode}
            />
          </div>

          {/* Lienzo del Mapa: 8 columnas en desktop */}
          <div
            className={`h-[550px] sm:h-[600px] lg:col-span-8 lg:h-full ${
              mobileTab === "mapa" ? "block" : "hidden lg:block"
            }`}
          >
            <MapCanvas
              orders={orders}
              vehicles={vehicles}
              selectedOrderId={selectedOrder?.id ?? null}
              onSelectOrder={(order) => setSelectedOrder(order)}
              selectedZone={selectedZone}
              statusFilter={statusFilter}
              isTvMode={isTvMode}
              highlightedOrderId={latestNewOrderId}
            />
          </div>
        </div>
      </main>

      {/* 4. Marquesina / Ticker de TV en el pie */}
      <TvTicker events={events} isTvMode={isTvMode} />

      {/* 5. Modal de Detalle de Pedido */}
      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        isTvMode={isTvMode}
      />
    </div>
  );
}
