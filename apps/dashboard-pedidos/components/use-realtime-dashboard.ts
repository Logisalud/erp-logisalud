"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DashboardOrder,
  DashboardStats,
  DashboardVehicle,
  LiveTickerEvent,
} from "@/domain/types";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { soundFx } from "./sound-fx";

const INITIAL_VEHICLES: DashboardVehicle[] = [
  {
    id: "FURG-01",
    conductor: "Eduardo Quispe",
    placa: "B6X-892",
    modelo: "Hyundai H100",
    tipo: "FURGON",
    zona: "lima-sur",
    coordenadas: { lat: -12.131, lng: -76.992 },
    velocidadKmH: 36,
    pedidosActivosIds: [],
    estado: "EN_RUTA",
  },
  {
    id: "CAM-02",
    conductor: "Raúl Mendoza",
    placa: "C4K-410",
    modelo: "Toyota Hilux",
    tipo: "CAMIONETA",
    zona: "lima-norte",
    coordenadas: { lat: -11.942, lng: -77.054 },
    velocidadKmH: 42,
    pedidosActivosIds: [],
    estado: "EN_RUTA",
  },
  {
    id: "MOTO-03",
    conductor: "Jorge Chávez",
    placa: "F9T-115",
    modelo: "Honda Cargo 150",
    tipo: "MOTO",
    zona: "lima-centro",
    coordenadas: { lat: -12.072, lng: -77.045 },
    velocidadKmH: 28,
    pedidosActivosIds: [],
    estado: "EN_CLIENTE",
  },
  {
    id: "FURG-04",
    conductor: "Manuel Benítez",
    placa: "A8M-723",
    modelo: "Kia K2500",
    tipo: "FURGON",
    zona: "callao",
    coordenadas: { lat: -12.056, lng: -77.108 },
    velocidadKmH: 30,
    pedidosActivosIds: [],
    estado: "EN_RUTA",
  },
];

export function useRealtimeDashboard() {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [vehicles, setVehicles] = useState<DashboardVehicle[]>(INITIAL_VEHICLES);
  const [events, setEvents] = useState<LiveTickerEvent[]>([
    {
      id: "ev-init",
      timestamp: "Ahora",
      tipo: "OPERACIONES",
      titulo: "Sistema en vivo conectado",
      descripcion: "Sincronizado con base de datos de Supabase",
    },
  ]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [latestNewOrderId, setLatestNewOrderId] = useState<string | null>(null);

  const prevOrdersRef = useRef<Map<string, DashboardOrder>>(new Map());

  // Agregar evento a la marquesina
  const addEvent = useCallback((event: Omit<LiveTickerEvent, "id">) => {
    setEvents((prev) => [
      {
        ...event,
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      },
      ...prev.slice(0, 30),
    ]);
  }, []);

  // Función principal para cargar datos frescos de la API
  const fetchPedidos = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const res = await fetch("/api/pedidos", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.orders)) {
        const newOrders: DashboardOrder[] = data.orders;
        const currentMap = new Map<string, DashboardOrder>();
        newOrders.forEach((o) => currentMap.set(o.id, o));

        // Detectar pedidos nuevos comparando con el estado anterior
        if (prevOrdersRef.current.size > 0) {
          const nuevos = newOrders.filter((o) => !prevOrdersRef.current.has(o.id));
          if (nuevos.length > 0) {
            const primero = nuevos[0];
            setLatestNewOrderId(primero.id);
            soundFx.playNewOrderChime();
            addEvent({
              timestamp: "Ahora",
              tipo: "NUEVO",
              titulo: `Nuevo Pedido ${primero.codigoDisplay}`,
              descripcion: `${primero.cliente.razonSocial} (${primero.direccion.distrito}) — S/ ${primero.montoTotal.toFixed(2)}`,
              monto: primero.montoTotal,
            });

            // Limpiar highlight después de 6s
            setTimeout(() => setLatestNewOrderId(null), 6000);
          }
        }

        prevOrdersRef.current = currentMap;
        setOrders(newOrders);
        setStats(data.stats);
        setLastUpdated(new Date());
        setIsConnected(true);
      }
    } catch (err) {
      console.error("Error al refrescar pedidos:", err);
      setIsConnected(false);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [addEvent]);

  // Animación suave de los vehículos en mapa
  useEffect(() => {
    const vTimer = setInterval(() => {
      setVehicles((prev) =>
        prev.map((v) => {
          const deltaLat = Math.sin(Date.now() / 4500 + Number(v.id.replace(/\D/g, "") || "1")) * 0.0003;
          const deltaLng = Math.cos(Date.now() / 4500 + Number(v.id.replace(/\D/g, "") || "1")) * 0.0003;
          return {
            ...v,
            coordenadas: {
              lat: v.coordenadas.lat + deltaLat,
              lng: v.coordenadas.lng + deltaLng,
            },
          };
        })
      );
    }, 2000);

    return () => clearInterval(vTimer);
  }, []);

  // Polling automático cada 8 segundos
  useEffect(() => {
    fetchPedidos(true);
    const interval = setInterval(() => fetchPedidos(false), 8000);
    return () => clearInterval(interval);
  }, [fetchPedidos]);

  // Suscripción Realtime por WebSockets con Supabase (para cambios instantáneos)
  useEffect(() => {
    try {
      const supabase = getSupabaseBrowserClient();
      const channel = supabase
        .channel("realtime-pedidos-dashboard")
        .on(
          "postgres_changes",
          { event: "*", schema: "pedidos", table: "orders" },
          (payload) => {
            console.log("Cambio en vivo detectado en Supabase:", payload.eventType);
            fetchPedidos(false);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn("Realtime WebSocket no inicializado, operando en modo polling", err);
    }
  }, [fetchPedidos]);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      soundFx.setEnabled(next);
      return next;
    });
  };

  return {
    orders,
    stats,
    vehicles,
    events,
    loading,
    isConnected,
    lastUpdated,
    soundEnabled,
    toggleSound,
    refetch: () => fetchPedidos(false),
    latestNewOrderId,
  };
}
