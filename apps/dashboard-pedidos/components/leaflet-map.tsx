"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DashboardOrder, DashboardVehicle } from "@/domain/types";
import { ALMACEN_CENTRAL } from "@/domain/ubigeos-coords";

interface LeafletMapProps {
  orders: DashboardOrder[];
  vehicles: DashboardVehicle[];
  selectedOrderId: string | null;
  onSelectOrder: (order: DashboardOrder) => void;
  viewMode: "lima" | "peru";
  onToggleViewMode: (mode: "lima" | "peru") => void;
  isTvMode: boolean;
}

export default function LeafletMap({
  orders,
  vehicles,
  selectedOrderId,
  onSelectOrder,
  viewMode,
  onToggleViewMode,
  isTvMode,
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const vehiclesLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Estados de la animación del día (Timelapse)
  const [isTimelapsePlaying, setIsTimelapsePlaying] = useState<boolean>(false);
  const [timelapseHour, setTimelapseHour] = useState<number>(24); // 8 a 24 horas
  const [timelapseSpeed, setTimelapseSpeed] = useState<number>(1);

  // Inicializar Leaflet Map una sola vez
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] =
      viewMode === "peru" ? [-9.19, -75.01] : [-12.06, -77.04];
    const initialZoom = viewMode === "peru" ? 5.5 : 11;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: false,
    });

    // Añadir capas de marcadores
    const markersLayer = L.layerGroup().addTo(map);
    const vehiclesLayer = L.layerGroup().addTo(map);

    markersLayerRef.current = markersLayer;
    vehiclesLayerRef.current = vehiclesLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Estilo de mapa (100% libre sin API key)
  const [mapStyle, setMapStyle] = useState<"calles" | "gris" | "oscuro">("calles");

  // Si se activa Modo TV, pasar a oscuro
  useEffect(() => {
    if (isTvMode) setMapStyle("oscuro");
  }, [isTvMode]);

  // Actualizar Tiles sin API Key (ESRI World Street Map / Gray Canvas / Dark Gray)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    // Tiles 100% gratuitos y públicos, sin API Key, sin registros ni bloqueos
    let tileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
    if (mapStyle === "oscuro") {
      tileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
    } else if (mapStyle === "gris") {
      tileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
    }

    const newTileLayer = L.tileLayer(tileUrl, {
      maxZoom: 18,
      attribution: "Tiles &copy; Esri &mdash; OpenStreetMap contributors",
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
  }, [mapStyle]);

  // Cambiar Vista entre Perú y Lima con animación suave flyTo
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (viewMode === "peru") {
      map.flyTo([-9.19, -75.01], 5.5, { duration: 1.5 });
    } else {
      map.flyTo([-12.06, -77.04], 11, { duration: 1.5 });
    }
  }, [viewMode]);

  // Centrar en pedido seleccionado si existe
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedOrderId) return;

    const target = orders.find((o) => o.id === selectedOrderId);
    if (target) {
      map.flyTo([target.direccion.coordenadas.lat, target.direccion.coordenadas.lng], 14, {
        duration: 1.2,
      });
    }
  }, [selectedOrderId, orders]);

  // Filtrar pedidos según el timelapse de horas si está activo
  const visibleOrders = useMemo(() => {
    if (timelapseHour >= 24) return orders;

    return orders.filter((o) => {
      try {
        const date = new Date(o.fechaCreacion);
        // Obtener hora local de Lima (UTC-5)
        const hour = (date.getUTCHours() - 5 + 24) % 24 + date.getUTCMinutes() / 60;
        return hour <= timelapseHour;
      } catch {
        return true;
      }
    });
  }, [orders, timelapseHour]);

  // Renderizar Marcadores de Pedidos en Leaflet
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    // 1. Marcador del Almacén Central
    const hubIcon = L.divIcon({
      className: "custom-hub-icon",
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;">
          <div style="position: absolute; width: 36px; height: 36px; border-radius: 9999px; background: rgba(75, 177, 104, 0.3); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 24px; height: 24px; border-radius: 9999px; background: #4BB168; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            <span style="color: white; font-size: 11px; font-weight: bold;">🏢</span>
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    L.marker([ALMACEN_CENTRAL.coordenadas.lat, ALMACEN_CENTRAL.coordenadas.lng], {
      icon: hubIcon,
      zIndexOffset: 1000,
    })
      .bindTooltip("<b>Almacén Central LOGISALUD</b><br>Av. Elmer Faucett 1980, Callao", {
        direction: "top",
        offset: [0, -18],
      })
      .addTo(layer);

    // 2. Marcadores de Pedidos
    visibleOrders.forEach((order) => {
      const isSelected = order.id === selectedOrderId;

      let color = "#0284c7"; // default
      let bgPulse = "rgba(2, 132, 199, 0.4)";
      if (order.estado === "READY_FOR_OPERATIONS") {
        color = "#06b6d4";
        bgPulse = "rgba(6, 182, 212, 0.4)";
      } else if (order.estado === "DISPATCHED" || order.estado === "IN_TRANSIT") {
        color = "#8b5cf6";
        bgPulse = "rgba(139, 92, 246, 0.4)";
      } else if (order.estado.includes("EXCEPTION")) {
        color = "#ef4444";
        bgPulse = "rgba(239, 68, 68, 0.4)";
      } else if (order.estado === "DELIVERED") {
        color = "#10b981";
        bgPulse = "rgba(16, 185, 129, 0.4)";
      } else if (order.estado === "DRAFT") {
        color = "#64748b";
        bgPulse = "rgba(100, 116, 139, 0.3)";
      }

      const markerHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.2s;">
          ${
            order.estado === "READY_FOR_OPERATIONS" || isSelected
              ? `<div style="position: absolute; top: -2px; width: 28px; height: 28px; border-radius: 9999px; background: ${bgPulse}; animation: pulse 2s infinite;"></div>`
              : ""
          }
          <div style="
            width: ${isSelected ? "22px" : "16px"};
            height: ${isSelected ? "22px" : "16px"};
            border-radius: 9999px;
            background: ${color};
            border: 2px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          "></div>
          ${
            isSelected || viewMode === "lima"
              ? `<div style="
                  margin-top: 2px;
                  background: ${isTvMode ? "#0f172a" : "#ffffff"};
                  color: ${isTvMode ? "#ffffff" : "#0f172a"};
                  font-size: 10px;
                  font-weight: 700;
                  padding: 1px 5px;
                  border-radius: 4px;
                  border: 1px solid ${color};
                  white-space: nowrap;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                ">${order.codigoDisplay}</div>`
              : ""
          }
        </div>
      `;

      const icon = L.divIcon({
        className: "custom-order-pin",
        html: markerHtml,
        iconSize: [60, 40],
        iconAnchor: [30, 8],
      });

      const m = L.marker([order.direccion.coordenadas.lat, order.direccion.coordenadas.lng], {
        icon,
      });

      m.on("click", () => onSelectOrder(order));

      m.bindTooltip(
        `<b>${order.codigoDisplay}</b> - ${order.cliente.razonSocial}<br>${order.direccion.distrito} • S/ ${order.montoTotal.toFixed(2)}`,
        { direction: "top", offset: [0, -10] }
      );

      m.addTo(layer);
    });
  }, [visibleOrders, selectedOrderId, isTvMode, viewMode, onSelectOrder]);

  // Renderizar Vehículos de Reparto
  useEffect(() => {
    const layer = vehiclesLayerRef.current;
    if (!layer || viewMode === "peru") {
      if (layer) layer.clearLayers();
      return;
    }

    layer.clearLayers();

    vehicles.forEach((v) => {
      const vIcon = L.divIcon({
        className: "custom-vehicle-pin",
        html: `
          <div style="
            width: 24px;
            height: 24px;
            border-radius: 6px;
            background: #1b4127;
            border: 2px solid #4BB168;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.4);
          ">
            <span style="font-size: 11px;">🚚</span>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([v.coordenadas.lat, v.coordenadas.lng], { icon: vIcon })
        .bindTooltip(`<b>${v.conductor}</b> (${v.placa})<br>${v.modelo}`, { direction: "top" })
        .addTo(layer);
    });
  }, [vehicles, viewMode]);

  // Loop de Reproducción de Timelapse
  useEffect(() => {
    if (!isTimelapsePlaying) return;

    const interval = setInterval(() => {
      setTimelapseHour((prev) => {
        if (prev >= 22) {
          setIsTimelapsePlaying(false);
          return 24; // Mostrar todo al terminar
        }
        return Math.round((prev + 0.3 * timelapseSpeed) * 10) / 10;
      });
    }, 180);

    return () => clearInterval(interval);
  }, [isTimelapsePlaying, timelapseSpeed]);

  const startTimelapse = () => {
    setTimelapseHour(8); // Empezar 08:00 AM
    setIsTimelapsePlaying(true);
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-700/30">
      {/* Contenedor del Mapa Leaflet */}
      <div ref={mapContainerRef} className="h-full w-full z-0" />

      {/* 1. Selector Superior de Vista: [ 🇵🇪 Perú ] | [ 📍 Lima & Callao ] + Estilo de Mapa */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2">
        <div
          className={`flex items-center rounded-xl border p-1 shadow-xl backdrop-blur-md transition-colors ${
            isTvMode ? "border-slate-700 bg-slate-900/95" : "border-slate-200 bg-white/95"
          }`}
        >
          <button
            type="button"
            onClick={() => onToggleViewMode("lima")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              viewMode === "lima"
                ? "bg-logisalud-green text-white shadow-sm"
                : isTvMode
                ? "text-slate-400 hover:text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>📍</span>
            <span>Lima & Callao</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode("peru")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              viewMode === "peru"
                ? "bg-logisalud-green text-white shadow-sm"
                : isTvMode
                ? "text-slate-400 hover:text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🇵🇪</span>
            <span>Perú Completo</span>
          </button>
        </div>

        {/* Selector de Estilo (Calles / Gris / Oscuro) - 100% libre sin API Key */}
        <div
          className={`hidden sm:flex items-center rounded-xl border p-1 shadow-xl backdrop-blur-md transition-colors ${
            isTvMode ? "border-slate-700 bg-slate-900/95" : "border-slate-200 bg-white/95"
          }`}
        >
          <button
            type="button"
            onClick={() => setMapStyle("calles")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              mapStyle === "calles"
                ? "bg-logisalud-green text-white shadow-sm"
                : isTvMode
                ? "text-slate-400 hover:text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
            title="Mapa con nombres de calles y avenidas"
          >
            Calles
          </button>
          <button
            type="button"
            onClick={() => setMapStyle("gris")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              mapStyle === "gris"
                ? "bg-logisalud-green text-white shadow-sm"
                : isTvMode
                ? "text-slate-400 hover:text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
            title="Mapa gris minimalista"
          >
            Gris
          </button>
          <button
            type="button"
            onClick={() => setMapStyle("oscuro")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              mapStyle === "oscuro"
                ? "bg-logisalud-green text-white shadow-sm"
                : isTvMode
                ? "text-slate-400 hover:text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
            title="Mapa oscuro de operaciones"
          >
            Oscuro
          </button>
        </div>
      </div>

      {/* 2. Controles de Zoom Flotantes */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <div
          className={`flex flex-col overflow-hidden rounded-xl border shadow-xl backdrop-blur-md ${
            isTvMode ? "border-slate-700 bg-slate-900/95 text-white" : "border-slate-200 bg-white/95 text-slate-800"
          }`}
        >
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomIn()}
            className="flex h-9 w-9 items-center justify-center font-bold text-base hover:bg-black/10 transition"
            title="Acercar"
          >
            +
          </button>
          <div className="h-[1px] bg-slate-700/40" />
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomOut()}
            className="flex h-9 w-9 items-center justify-center font-bold text-base hover:bg-black/10 transition"
            title="Alejar"
          >
            −
          </button>
        </div>

        {/* Botón para Iniciar Timelapse del Día */}
        <button
          type="button"
          onClick={startTimelapse}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-xl backdrop-blur-md transition ${
            isTimelapsePlaying
              ? "border-emerald-500 bg-emerald-500 text-white animate-pulse"
              : isTvMode
              ? "border-slate-700 bg-slate-900/90 text-slate-200 hover:text-white"
              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
          }`}
          title="Reproducir cómo se desarrollaron los pedidos a lo largo del día"
        >
          <span>{isTimelapsePlaying ? "⏳" : "▶"}</span>
          <span className="hidden sm:inline">Evolución del Día</span>
        </button>
      </div>

      {/* 3. Barra Flotante de Reproducción de Timelapse (cuando está activo o pausado) */}
      {timelapseHour < 24 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-lg">
          <div
            className={`flex flex-col gap-2 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-xl ${
              isTvMode ? "border-slate-700 bg-slate-900/95 text-white" : "border-slate-200 bg-white/95 text-slate-800"
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold text-logisalud-green uppercase">
                  Timelapse del Día
                </span>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-logisalud-teal/20 text-logisalud-teal">
                  {Math.floor(timelapseHour).toString().padStart(2, "0")}:
                  {Math.floor((timelapseHour % 1) * 60).toString().padStart(2, "0")} hrs
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTimelapsePlaying((p) => !p)}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-bold text-white hover:bg-slate-700"
                >
                  {isTimelapsePlaying ? "⏸ Pausar" : "▶ Seguir"}
                </button>
                <button
                  type="button"
                  onClick={() => setTimelapseHour(24)}
                  className="text-xs text-slate-400 hover:text-white"
                  title="Cerrar reproductor"
                >
                  ✕
                </button>
              </div>
            </div>

            <input
              type="range"
              min="8"
              max="22"
              step="0.1"
              value={timelapseHour}
              onChange={(e) => {
                setIsTimelapsePlaying(false);
                setTimelapseHour(parseFloat(e.target.value));
              }}
              className="w-full accent-logisalud-green cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>08:00 AM (Apertura)</span>
              <span>13:00 PM</span>
              <span>18:00 PM</span>
              <span>22:00 PM (Cierre)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
