"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { DashboardOrder, DashboardVehicle, RealtimeOrderStatus } from "@/domain/types";
import { ALMACEN_CENTRAL, DeliveryZoneId } from "@/domain/ubigeos-coords";

const GEO_BOUNDS = {
  minLng: -77.24,
  maxLng: -76.88,
  minLat: -12.26,
  maxLat: -11.9,
};

function project(coords: { lat: number; lng: number }): { x: number; y: number } {
  const x = ((coords.lng - GEO_BOUNDS.minLng) / (GEO_BOUNDS.maxLng - GEO_BOUNDS.minLng)) * 1000;
  const y = ((GEO_BOUNDS.maxLat - coords.lat) / (GEO_BOUNDS.maxLat - GEO_BOUNDS.minLat)) * 850;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

interface MapCanvasProps {
  orders: DashboardOrder[];
  vehicles: DashboardVehicle[];
  selectedOrderId: string | null;
  onSelectOrder: (order: DashboardOrder) => void;
  selectedZone: DeliveryZoneId | "todas";
  statusFilter: RealtimeOrderStatus | "TODOS";
  isTvMode: boolean;
  highlightedOrderId?: string | null;
}

export function MapCanvas({
  orders,
  vehicles,
  selectedOrderId,
  onSelectOrder,
  selectedZone,
  statusFilter,
  isTvMode,
  highlightedOrderId,
}: MapCanvasProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredOrder, setHoveredOrder] = useState<DashboardOrder | null>(null);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);

  const hubPos = useMemo(() => project(ALMACEN_CENTRAL.coordenadas), []);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchZone = selectedZone === "todas" || o.direccion.zonaId === selectedZone;
      const matchStatus = statusFilter === "TODOS" || o.estado === statusFilter;
      return matchZone && matchStatus;
    });
  }, [orders, selectedZone, statusFilter]);

  const handleZoomIn = () => setZoom((z) => Math.min(3.2, z + 0.25));
  const handleZoomOut = () => setZoom((z) => Math.max(0.75, z - 0.25));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.min(3.5, Math.max(0.7, z * factor)));
  };

  // Centrar en pedido seleccionado
  useEffect(() => {
    const targetId = highlightedOrderId || selectedOrderId;
    if (!targetId) return;
    const target = orders.find((o) => o.id === targetId);
    if (target) {
      const pos = project(target.direccion.coordenadas);
      setPan({ x: 500 - pos.x * zoom, y: 425 - pos.y * zoom });
    }
  }, [highlightedOrderId, selectedOrderId, orders, zoom]);

  return (
    <div
      className={`relative h-full w-full select-none overflow-hidden rounded-2xl border transition-colors ${
        isTvMode ? "border-slate-800 bg-[#070b14]" : "border-slate-200 bg-[#f4f7f5]"
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
    >
      {/* Controles de Zoom Flotantes */}
      <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">
        <div
          className={`flex flex-col overflow-hidden rounded-xl border shadow-xl backdrop-blur-md ${
            isTvMode ? "border-slate-700 bg-slate-900/95 text-white" : "border-slate-200 bg-white/95 text-slate-800"
          }`}
        >
          <button
            type="button"
            onClick={handleZoomIn}
            className="flex h-10 w-10 items-center justify-center font-bold text-lg hover:bg-black/10 active:scale-95 transition"
            title="Acercar"
          >
            +
          </button>
          <div className="h-[1px] bg-slate-700/50" />
          <button
            type="button"
            onClick={handleZoomOut}
            className="flex h-10 w-10 items-center justify-center font-bold text-lg hover:bg-black/10 active:scale-95 transition"
            title="Alejar"
          >
            −
          </button>
          <div className="h-[1px] bg-slate-700/50" />
          <button
            type="button"
            onClick={handleReset}
            className="flex h-10 w-10 items-center justify-center text-xs font-semibold hover:bg-black/10 active:scale-95 transition"
            title="Centrar vista"
          >
            ⊙
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowHeatmap((h) => !h)}
          className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold shadow-md backdrop-blur-md transition ${
            showHeatmap
              ? "border-emerald-500 bg-emerald-500 text-white"
              : isTvMode
              ? "border-slate-700 bg-slate-900/90 text-slate-300"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          <span>🔥</span>
          <span className="hidden sm:inline">Calor</span>
        </button>
      </div>

      {/* Escala e info */}
      <div className="absolute left-4 bottom-4 z-10 pointer-events-none">
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-mono backdrop-blur-md ${
            isTvMode
              ? "border-slate-800 bg-slate-900/80 text-slate-400"
              : "border-slate-200 bg-white/80 text-slate-600"
          }`}
        >
          <span className="font-bold text-logisalud-green">LOGISALUD REALTIME</span>
          <span>•</span>
          <span>{filteredOrders.length} pedidos en mapa</span>
          <span>•</span>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Lienzo SVG */}
      <svg
        viewBox="0 0 1000 850"
        className="h-full w-full origin-center"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "50% 50%",
        }}
      >
        <defs>
          <linearGradient id="oceanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isTvMode ? "#040810" : "#d4e5ec"} />
            <stop offset="100%" stopColor={isTvMode ? "#071224" : "#c1dbe6"} />
          </linearGradient>

          <radialGradient id="hubPulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4BB168" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#4BB168" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#4BB168" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="heatGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.65" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 1. Tierra Continental */}
        <rect x="0" y="0" width="1000" height="850" fill={isTvMode ? "#0a111e" : "#f1f5f3"} />

        {/* 2. Océano Pacífico */}
        <path
          d="M 0,0 L 280,0 C 285,120 270,220 220,330 C 170,400 130,440 90,470 C 70,480 30,500 50,530 C 80,540 180,520 240,490 C 310,480 360,510 400,560 C 450,620 490,700 540,850 L 0,850 Z"
          fill="url(#oceanGrad)"
        />

        {/* 3. Zonas de Reparto */}
        <g opacity={isTvMode ? "0.2" : "0.3"}>
          <ellipse cx="450" cy="190" rx="140" ry="110" fill="#f59e0b" />
          <ellipse cx="440" cy="380" rx="90" ry="75" fill="#0284c7" />
          <ellipse cx="280" cy="360" rx="75" ry="65" fill="#06b6d4" />
          <ellipse cx="620" cy="360" rx="130" ry="100" fill="#8b5cf6" />
          <ellipse cx="520" cy="560" rx="120" ry="110" fill="#10b981" />
        </g>

        {/* Etiquetas de Zonas */}
        <g
          fontFamily="system-ui, sans-serif"
          fontWeight="bold"
          fontSize="13"
          letterSpacing="1.5"
          opacity={isTvMode ? "0.4" : "0.5"}
          fill={isTvMode ? "#94a3b8" : "#475569"}
        >
          <text x="410" y="140">LIMA NORTE</text>
          <text x="460" y="360">LIMA CENTRO</text>
          <text x="235" y="340">CALLAO</text>
          <text x="630" y="320">LIMA ESTE</text>
          <text x="540" y="560">LIMA SUR</text>
        </g>

        {/* 4. Corredores Viales */}
        <g
          stroke={isTvMode ? "#1e293b" : "#cbd5e1"}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M 430,30 Q 440,160 450,260 T 440,410 Q 480,520 540,660 T 600,840" />
          <path d="M 330,470 Q 460,460 590,465 T 740,450" />
          <path d="M 390,260 Q 470,330 520,380 T 560,480" />
          <path d="M 210,380 L 440,370" />
        </g>

        {/* 5. Heatmap si está activo */}
        {showHeatmap && (
          <g>
            {filteredOrders.map((o) => {
              const pos = project(o.direccion.coordenadas);
              return <circle key={`heat-${o.id}`} cx={pos.x} cy={pos.y} r="60" fill="url(#heatGradient)" />;
            })}
          </g>
        )}

        {/* 6. Almacén Central Hub */}
        <g transform={`translate(${hubPos.x}, ${hubPos.y})`}>
          <circle r="36" fill="url(#hubPulse)">
            <animate attributeName="r" values="18;45;18" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.2;0.8" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle r="14" fill="#4BB168" stroke="#ffffff" strokeWidth="2.5" />
          <path d="M -6,-4 L 0,-9 L 6,-4 L 6,6 L -6,6 Z" fill="#ffffff" />
          <text x="0" y="26" textAnchor="middle" fill={isTvMode ? "#4BB168" : "#1b4127"} fontSize="11" fontWeight="bold">
            HUB LOGISALUD
          </text>
        </g>

        {/* 7. Pedidos Reales en el Mapa */}
        <g>
          {filteredOrders.map((order) => {
            const pos = project(order.direccion.coordenadas);
            const isSelected = order.id === selectedOrderId;
            const isHighlighted = order.id === highlightedOrderId || order.isNew;

            let pinColor = "#f59e0b"; // default
            if (order.estado === "DELIVERED") pinColor = "#10b981";
            else if (order.estado === "READY_FOR_OPERATIONS") pinColor = "#06b6d4";
            else if (order.estado === "DISPATCHED" || order.estado === "IN_TRANSIT") pinColor = "#8b5cf6";
            else if (order.estado.includes("EXCEPTION")) pinColor = "#ef4444";
            else if (order.estado === "DRAFT") pinColor = "#64748b";

            return (
              <g
                key={order.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectOrder(order);
                }}
                onMouseEnter={() => setHoveredOrder(order)}
                onMouseLeave={() => setHoveredOrder(null)}
                className="cursor-pointer transition-transform duration-200 hover:scale-125"
                role="button"
                tabIndex={0}
              >
                {/* Radar animado si es nuevo o seleccionado */}
                {(isHighlighted || isSelected || order.estado === "READY_FOR_OPERATIONS") && (
                  <circle r={isSelected ? "22" : "18"} fill={pinColor} opacity="0.3">
                    <animate attributeName="r" values="10;24;10" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Sombra */}
                <ellipse cx="0" cy="8" rx="7" ry="3.5" fill="#000000" opacity="0.25" />

                {/* Pin */}
                <path d="M 0,6 C -7,-1 -9,-8 0,-16 C 9,-8 7,-1 0,6 Z" fill={pinColor} stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="0" cy="-7" r="3.5" fill="#ffffff" />

                {/* Etiqueta del Pedido */}
                {(isSelected || isTvMode) && (
                  <g transform="translate(0, -22)">
                    <rect
                      x="-34"
                      y="-14"
                      width="68"
                      height="15"
                      rx="4"
                      fill={isTvMode ? "#0f172a" : "#ffffff"}
                      stroke={pinColor}
                      strokeWidth="1.2"
                      opacity="0.95"
                    />
                    <text
                      x="0"
                      y="-3"
                      textAnchor="middle"
                      fill={isTvMode ? "#ffffff" : "#0f172a"}
                      fontSize="9"
                      fontWeight="bold"
                    >
                      {order.codigoDisplay}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* 8. Flota de Vehículos Móviles */}
        <g>
          {vehicles.map((v) => {
            const pos = project(v.coordenadas);
            return (
              <g key={v.id} transform={`translate(${pos.x}, ${pos.y})`}>
                <rect x="-12" y="-12" width="24" height="24" rx="6" fill="#1b4127" stroke="#4BB168" strokeWidth="2" />
                <path d="M -6,-2 L -6,4 L 6,4 L 6,0 L 2,-4 L -6,-4 Z" fill="#ffffff" />
                <circle cx="-3" cy="5" r="1.5" fill="#ffffff" />
                <circle cx="3" cy="5" r="1.5" fill="#ffffff" />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Popover al pasar el mouse */}
      {hoveredOrder && !isDragging && (
        <div
          className={`pointer-events-none absolute left-4 top-4 z-30 max-w-xs rounded-xl border p-3.5 shadow-2xl backdrop-blur-md transition-all ${
            isTvMode ? "border-slate-700 bg-slate-900/95 text-white" : "border-slate-200 bg-white/95 text-slate-800"
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-700/50 pb-2">
            <span className="font-heading font-bold text-base text-logisalud-green">{hoveredOrder.codigoDisplay}</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
              {hoveredOrder.estadoLabel}
            </span>
          </div>
          <div className="mt-2 text-xs font-semibold leading-snug">{hoveredOrder.cliente.razonSocial}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {hoveredOrder.direccion.distrito} ({hoveredOrder.direccion.zonaNombre})
          </div>
          <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-700/40 pt-2 text-xs">
            <span className="text-slate-400">Total:</span>
            <span className="font-heading font-bold text-sm text-logisalud-teal">
              S/ {hoveredOrder.montoTotal.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
