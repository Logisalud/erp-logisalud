"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DeliveryVehicle,
  DeliveryZoneId,
  GeoCoordinate,
  RealtimeOrder,
  RealtimeOrderStatus,
} from "../../domain/dashboard-types";
import {
  ALMACEN_CENTRAL_LOGISALUD,
  ZONAS_CONFIG,
} from "../../domain/dashboard-dummy-data";

// Límites geográficos de Lima Metropolitana & Callao
const GEO_BOUNDS = {
  minLng: -77.24,
  maxLng: -76.88,
  minLat: -12.26,
  maxLat: -11.9,
};

// Conversión de coordenadas lat/lng a espacio SVG (1000 x 850)
function project(coords: GeoCoordinate): { x: number; y: number } {
  const x = ((coords.lng - GEO_BOUNDS.minLng) / (GEO_BOUNDS.maxLng - GEO_BOUNDS.minLng)) * 1000;
  // Latitud es invertida en SVG (norte es menor Y)
  const y = ((GEO_BOUNDS.maxLat - coords.lat) / (GEO_BOUNDS.maxLat - GEO_BOUNDS.minLat)) * 850;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

interface MapCanvasProps {
  orders: RealtimeOrder[];
  vehicles: DeliveryVehicle[];
  selectedOrderId: string | null;
  onSelectOrder: (order: RealtimeOrder) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Estados de Pan y Zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredOrder, setHoveredOrder] = useState<RealtimeOrder | null>(null);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [autoSpotlight, setAutoSpotlight] = useState<boolean>(isTvMode);

  // Almacén central proyectado
  const hubPos = useMemo(() => project(ALMACEN_CENTRAL_LOGISALUD.coordenadas), []);

  // Filtrar pedidos según zona y estado
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchZone = selectedZone === "todas" || o.destino.zonaId === selectedZone;
      const matchStatus = statusFilter === "TODOS" || o.estado === statusFilter;
      return matchZone && matchStatus;
    });
  }, [orders, selectedZone, statusFilter]);

  // Controles de zoom
  const handleZoomIn = () => setZoom((z) => Math.min(3.0, Math.round((z + 0.25) * 100) / 100));
  const handleZoomOut = () => setZoom((z) => Math.max(0.75, Math.round((z - 0.25) * 100) / 100));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Manejo de mouse drag para panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Sólo botón izquierdo
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Soporte táctil en celulares y tablets
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => setIsDragging(false);

  // Manejo de rueda de mouse para zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.min(3.2, Math.max(0.7, z * factor)));
  };

  // Enfocar pedido seleccionado o resaltado
  useEffect(() => {
    const targetId = highlightedOrderId || selectedOrderId;
    if (!targetId) return;
    const target = orders.find((o) => o.id === targetId);
    if (target) {
      const pos = project(target.destino.coordenadas);
      // Centrar suavemente en el visor
      setPan({
        x: 500 - pos.x * zoom,
        y: 425 - pos.y * zoom,
      });
    }
  }, [highlightedOrderId, selectedOrderId, orders, zoom]);

  // Auto-spotlight en Modo TV: cicla cada 10s destacando pedidos activos
  useEffect(() => {
    if (!autoSpotlight || !isTvMode) return;
    const activeOrders = orders.filter((o) => o.estado === "IN_TRANSIT" || o.estado === "READY_FOR_OPERATIONS");
    if (activeOrders.length === 0) return;

    let idx = 0;
    const timer = setInterval(() => {
      const nextOrder = activeOrders[idx % activeOrders.length];
      idx++;
      setHoveredOrder(nextOrder);
    }, 9000);

    return () => clearInterval(timer);
  }, [autoSpotlight, isTvMode, orders]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full select-none overflow-hidden rounded-2xl border transition-colors ${
        isTvMode
          ? "border-slate-800 bg-[#090d16]"
          : "border-slate-200 bg-[#f4f7f5]"
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
    >
      {/* HUD de controles flotantes */}
      <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">
        <div
          className={`flex flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur-md ${
            isTvMode
              ? "border-slate-700 bg-slate-900/90 text-white"
              : "border-slate-200 bg-white/95 text-slate-800"
          }`}
        >
          <button
            type="button"
            onClick={handleZoomIn}
            className="flex h-10 w-10 items-center justify-center font-bold text-lg hover:bg-black/10 active:scale-95 transition"
            title="Acercar mapa"
            aria-label="Acercar mapa"
          >
            +
          </button>
          <div className={`h-[1px] ${isTvMode ? "bg-slate-700" : "bg-slate-200"}`} />
          <button
            type="button"
            onClick={handleZoomOut}
            className="flex h-10 w-10 items-center justify-center font-bold text-lg hover:bg-black/10 active:scale-95 transition"
            title="Alejar mapa"
            aria-label="Alejar mapa"
          >
            −
          </button>
          <div className={`h-[1px] ${isTvMode ? "bg-slate-700" : "bg-slate-200"}`} />
          <button
            type="button"
            onClick={handleResetView}
            className="flex h-10 w-10 items-center justify-center text-xs font-semibold hover:bg-black/10 active:scale-95 transition"
            title="Restablecer vista centrada"
            aria-label="Centrar mapa"
          >
            ⊙
          </button>
        </div>

        {/* Toggle Heatmap */}
        <button
          type="button"
          onClick={() => setShowHeatmap((prev) => !prev)}
          className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium shadow-md backdrop-blur-md transition ${
            showHeatmap
              ? "border-emerald-500 bg-emerald-500 text-white"
              : isTvMode
              ? "border-slate-700 bg-slate-900/90 text-slate-300 hover:text-white"
              : "border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-100"
          }`}
          title="Alternar mapa de calor"
        >
          <span>🔥</span>
          <span className="hidden sm:inline">Calor</span>
        </button>

        {isTvMode && (
          <button
            type="button"
            onClick={() => setAutoSpotlight((prev) => !prev)}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium shadow-md backdrop-blur-md transition ${
              autoSpotlight
                ? "border-logisalud-green bg-logisalud-green/20 text-logisalud-green"
                : "border-slate-700 bg-slate-900/90 text-slate-400"
            }`}
            title="Ciclo automático de pedidos en pantalla"
          >
            <span>📡</span>
            <span className="hidden sm:inline">Auto-Pan</span>
          </button>
        )}
      </div>

      {/* Brújula e indicador de escala */}
      <div className="absolute left-4 bottom-4 z-10 flex items-center gap-3 pointer-events-none">
        <div
          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px] font-mono shadow-sm backdrop-blur-md ${
            isTvMode
              ? "border-slate-800 bg-slate-900/80 text-slate-400"
              : "border-slate-200 bg-white/80 text-slate-600"
          }`}
        >
          <span className="font-bold text-logisalud-green">LOGISALUD</span>
          <span>•</span>
          <span>Lima Metropolitana & Callao</span>
          <span>•</span>
          <span className="font-semibold">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Lienzo SVG interactivo */}
      <svg
        viewBox="0 0 1000 850"
        className="h-full w-full origin-center transition-transform duration-75"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "50% 50%",
        }}
      >
        <defs>
          {/* Gradiente Océano Pacífico */}
          <linearGradient id="oceanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isTvMode ? "#040810" : "#d8e7ed"} />
            <stop offset="100%" stopColor={isTvMode ? "#071224" : "#c6dee8"} />
          </linearGradient>

          {/* Gradiente Brillo Almacén Central */}
          <radialGradient id="hubPulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4BB168" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#4BB168" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#4BB168" stopOpacity="0" />
          </radialGradient>

          {/* Gradiente Heatmap */}
          <radialGradient id="heatGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.65" />
            <stop offset="45%" stopColor="#f59e0b" stopOpacity="0.4" />
            <stop offset="80%" stopColor="#10b981" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>

          {/* Filtro Glow para TV Mode */}
          <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Fondo de Tierra Continental */}
        <rect
          x="0"
          y="0"
          width="1000"
          height="850"
          fill={isTvMode ? "#0b121e" : "#f1f5f3"}
        />

        {/* 2. Océano Pacífico y Línea Costera de Lima y Callao */}
        <path
          d="M 0,0 
             L 280,0 
             C 285,120 270,220 220,330 
             C 170,400 130,440 90,470 
             C 70,480 30,500 50,530 
             C 80,540 180,520 240,490 
             C 310,480 360,510 400,560 
             C 450,620 490,700 540,850 
             L 0,850 Z"
          fill="url(#oceanGrad)"
        />

        {/* Etiqueta Océano Pacífico */}
        <text
          x="80"
          y="700"
          fill={isTvMode ? "#1e293b" : "#94a3b8"}
          fontSize="20"
          fontFamily="monospace"
          fontWeight="700"
          letterSpacing="6"
          opacity="0.6"
          transform="rotate(-40, 80, 700)"
        >
          OCÉANO PACÍFICO
        </text>

        {/* 3. Manchas y Límites de Zonas de Reparto */}
        <g opacity={isTvMode ? "0.22" : "0.35"}>
          {/* Lima Norte */}
          <ellipse cx="450" cy="190" rx="140" ry="110" fill={ZONAS_CONFIG["lima-norte"].color} />
          {/* Lima Centro */}
          <ellipse cx="440" cy="380" rx="90" ry="75" fill={ZONAS_CONFIG["lima-centro"].color} />
          {/* Callao */}
          <ellipse cx="280" cy="360" rx="75" ry="65" fill={ZONAS_CONFIG.callao.color} />
          {/* Lima Este */}
          <ellipse cx="620" cy="360" rx="130" ry="100" fill={ZONAS_CONFIG["lima-este"].color} />
          {/* Lima Sur */}
          <ellipse cx="520" cy="560" rx="120" ry="110" fill={ZONAS_CONFIG["lima-sur"].color} />
        </g>

        {/* Nombres de Zonas en el mapa */}
        <g
          fontFamily="system-ui, sans-serif"
          fontWeight="bold"
          fontSize="13"
          letterSpacing="1.5"
          opacity={isTvMode ? "0.45" : "0.55"}
          fill={isTvMode ? "#94a3b8" : "#475569"}
        >
          <text x="410" y="140">LIMA NORTE</text>
          <text x="460" y="360">LIMA CENTRO</text>
          <text x="235" y="340">CALLAO</text>
          <text x="630" y="320">LIMA ESTE</text>
          <text x="540" y="560">LIMA SUR</text>
        </g>

        {/* 4. Corredores Viales Principales de Lima */}
        <g
          stroke={isTvMode ? "#1e293b" : "#cbd5e1"}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          {/* Panamericana Norte & Sur */}
          <path d="M 430,30 Q 440,160 450,260 T 440,410 Q 480,520 540,660 T 600,840" />
          {/* Av. Javier Prado Este - Oeste */}
          <path d="M 330,470 Q 460,460 590,465 T 740,450" />
          {/* Vía de Evitamiento / Línea Amarilla */}
          <path d="M 390,260 Q 470,330 520,380 T 560,480" />
          {/* Av. Universitaria / Av. Colonial hacia Callao */}
          <path d="M 210,380 L 440,370" />
          <path d="M 390,140 Q 380,260 360,400" />
          {/* Vía Expresa Paseo de la República */}
          <path
            d="M 450,380 Q 470,440 480,510"
            stroke={isTvMode ? "#334155" : "#94a3b8"}
            strokeWidth="4"
          />
        </g>

        {/* 5. Capa Heatmap (Opcional) */}
        {showHeatmap && (
          <g>
            {filteredOrders.map((o) => {
              const pos = project(o.destino.coordenadas);
              return (
                <circle
                  key={`heat-${o.id}`}
                  cx={pos.x}
                  cy={pos.y}
                  r="65"
                  fill="url(#heatGradient)"
                />
              );
            })}
          </g>
        )}

        {/* 6. Rutas de conexión animadas entre vehículos y pedidos asignados */}
        <g>
          {vehicles.map((v) => {
            const vPos = project(v.coordenadas);
            return v.pedidosActivosIds.map((pId) => {
              const order = orders.find((o) => o.id === pId);
              if (!order || order.estado === "DELIVERED") return null;
              const oPos = project(order.destino.coordenadas);
              return (
                <path
                  key={`route-${v.id}-${pId}`}
                  d={`M ${vPos.x},${vPos.y} Q ${(vPos.x + oPos.x) / 2 + 10},${(vPos.y + oPos.y) / 2 - 10} ${oPos.x},${oPos.y}`}
                  stroke={isTvMode ? "#4ABCC2" : "#0284c7"}
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  strokeOpacity={isTvMode ? "0.6" : "0.45"}
                  fill="none"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="16"
                    to="0"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </path>
              );
            });
          })}
        </g>

        {/* 7. Almacén Central LOGISALUD (Hub Principal) */}
        <g transform={`translate(${hubPos.x}, ${hubPos.y})`}>
          {/* Ondas radar del Almacén */}
          <circle r="36" fill="url(#hubPulse)">
            <animate attributeName="r" values="18;45;18" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.2;0.8" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle r="14" fill="#4BB168" stroke="#ffffff" strokeWidth="2.5" />
          {/* Ícono de Almacén / Edificio */}
          <path
            d="M -6,-4 L 0,-9 L 6,-4 L 6,6 L -6,6 Z"
            fill="#ffffff"
          />
          <text
            x="0"
            y="26"
            textAnchor="middle"
            fill={isTvMode ? "#4BB168" : "#1b4127"}
            fontSize="11"
            fontWeight="bold"
            filter={isTvMode ? "url(#neonGlow)" : undefined}
          >
            HUB LOGISALUD
          </text>
        </g>

        {/* 8. Marcadores de Pedidos */}
        <g>
          {filteredOrders.map((order) => {
            const pos = project(order.destino.coordenadas);
            const isSelected = order.id === selectedOrderId;
            const isHighlighted = order.id === highlightedOrderId || order.isNew;

            // Determinar color según estado
            let pinColor = "#f59e0b"; // default amber
            if (order.estado === "DELIVERED") pinColor = "#10b981"; // emerald
            else if (order.estado === "IN_TRANSIT") pinColor = "#8b5cf6"; // purple
            else if (order.estado === "READY_FOR_OPERATIONS") pinColor = "#06b6d4"; // cyan
            else if (order.estado === "EXCEPTION") pinColor = "#ef4444"; // red

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
                aria-label={`Pedido ${order.codigo} en ${order.cliente.razonSocial}`}
              >
                {/* Halo de radar animado para nuevos pedidos o seleccionados */}
                {(isHighlighted || isSelected || order.estado === "IN_TRANSIT") && (
                  <circle
                    r={isSelected ? "22" : "18"}
                    fill={pinColor}
                    opacity="0.3"
                  >
                    <animate
                      attributeName="r"
                      values="10;24;10"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.6;0.1;0.6"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Sombra del pin */}
                <ellipse cx="0" cy="8" rx="7" ry="3.5" fill="#000000" opacity="0.25" />

                {/* Cuerpo del Pin de Entrega */}
                <path
                  d="M 0,6 C -7,-1 -9,-8 0,-16 C 9,-8 7,-1 0,6 Z"
                  fill={pinColor}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  filter={isSelected ? "url(#neonGlow)" : undefined}
                />

                {/* Centro del pin */}
                <circle cx="0" cy="-7" r="3.5" fill="#ffffff" />

                {/* Etiqueta flotante permanente para pedidos de alta prioridad o seleccionados */}
                {(isSelected || isTvMode) && (
                  <g transform="translate(0, -22)">
                    <rect
                      x="-38"
                      y="-14"
                      width="76"
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
                      fontFamily="system-ui, sans-serif"
                    >
                      {order.codigo}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* 9. Marcadores de Vehículos en Reparto Activo */}
        <g>
          {vehicles.map((v) => {
            const pos = project(v.coordenadas);
            return (
              <g
                key={v.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="cursor-pointer"
              >
                {/* Sombra */}
                <ellipse cx="0" cy="5" rx="10" ry="5" fill="#000000" opacity="0.3" />

                {/* Vehículo - Cápsula con color de flota */}
                <rect
                  x="-12"
                  y="-12"
                  width="24"
                  height="24"
                  rx="6"
                  fill="#1b4127"
                  stroke="#4BB168"
                  strokeWidth="2"
                />

                {/* Icono de Furgón / Camioneta */}
                <path
                  d="M -6,-2 L -6,4 L 6,4 L 6,0 L 2,-4 L -6,-4 Z"
                  fill="#ffffff"
                />
                <circle cx="-3" cy="5" r="1.5" fill="#ffffff" />
                <circle cx="3" cy="5" r="1.5" fill="#ffffff" />

                {/* Indicador de velocidad y placa en TV Mode */}
                {isTvMode && (
                  <g transform="translate(0, 19)">
                    <rect
                      x="-30"
                      y="-2"
                      width="60"
                      height="12"
                      rx="3"
                      fill="#0f172a"
                      stroke="#334155"
                      strokeWidth="0.8"
                    />
                    <text
                      x="0"
                      y="7"
                      textAnchor="middle"
                      fill="#38bdf8"
                      fontSize="8"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {v.placa} • {v.velocidadKmH}k/h
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Popover flotante al pasar el mouse por un pedido */}
      {hoveredOrder && !isDragging && (
        <div
          className={`pointer-events-none absolute left-4 top-4 z-30 max-w-xs rounded-xl border p-3.5 shadow-2xl backdrop-blur-md transition-all ${
            isTvMode
              ? "border-slate-700 bg-slate-900/95 text-white"
              : "border-slate-200 bg-white/95 text-slate-800"
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-700/50 pb-2">
            <span className="font-heading font-bold text-base text-logisalud-green">
              {hoveredOrder.codigo}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                hoveredOrder.estado === "DELIVERED"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : hoveredOrder.estado === "IN_TRANSIT"
                  ? "bg-purple-500/20 text-purple-400"
                  : hoveredOrder.estado === "READY_FOR_OPERATIONS"
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {hoveredOrder.estadoLabel}
            </span>
          </div>
          <div className="mt-2 text-xs font-semibold leading-snug">
            {hoveredOrder.cliente.razonSocial}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {hoveredOrder.destino.distrito} • {hoveredOrder.destino.zonaNombre}
          </div>
          <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-700/40 pt-2 text-xs">
            <span className="text-slate-400">Total Soles:</span>
            <span className="cifra font-heading font-bold text-sm text-logisalud-teal">
              S/ {hoveredOrder.montoTotal.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
