"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DashboardKPIs,
  DeliveryVehicle,
  RealtimeEvent,
  RealtimeOrder,
  RealtimeOrderStatus,
} from "../../domain/dashboard-types";
import {
  ALMACEN_CENTRAL_LOGISALUD,
  CLIENTES_POOL,
  PEDIDOS_INICIALES,
  VEHICULOS_INICIALES,
  VENDEDORES_POOL,
  ZONAS_CONFIG,
} from "../../domain/dashboard-dummy-data";
import { soundFx } from "./sound-fx";

export function useRealtimePedidos() {
  const [orders, setOrders] = useState<RealtimeOrder[]>(PEDIDOS_INICIALES);
  const [vehicles, setVehicles] = useState<DeliveryVehicle[]>(VEHICULOS_INICIALES);
  const [events, setEvents] = useState<RealtimeEvent[]>([
    {
      id: "ev-0",
      timestamp: "Ahora",
      tipo: "NUEVO_PEDIDO",
      titulo: "Monitoreo en vivo iniciado",
      descripcion: "16 pedidos activos en ruta y almacén central",
    },
  ]);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [latestNewOrderId, setLatestNewOrderId] = useState<string | null>(null);

  // Toggle sonido
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      soundFx.setEnabled(next);
      return next;
    });
  }, []);

  // Agregar evento a la lista
  const addEvent = useCallback((event: Omit<RealtimeEvent, "id">) => {
    setEvents((prev) => [
      {
        ...event,
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      },
      ...prev.slice(0, 40), // Limitar a los últimos 40 eventos
    ]);
  }, []);

  // Simular manualmente un nuevo pedido
  const simulateNewOrder = useCallback(() => {
    const randomClient = CLIENTES_POOL[Math.floor(Math.random() * CLIENTES_POOL.length)];
    const randomVendedor = VENDEDORES_POOL[Math.floor(Math.random() * VENDEDORES_POOL.length)];
    const nextNum = Math.floor(4910 + Math.random() * 500);
    const monto = Math.round((800 + Math.random() * 4500) * 10) / 10;
    const orderId = `PED-${nextNum}`;

    const newOrder: RealtimeOrder = {
      id: orderId,
      numero: nextNum,
      codigo: `PED-${nextNum}`,
      cliente: {
        razonSocial: randomClient.razon,
        nombreComercial: randomClient.razon.split(" - ")[0],
        ruc: randomClient.ruc,
        telefono: "01-445-0000",
        contacto: "Farmacéutico de Turno",
      },
      destino: {
        direccion: `Av. Principal ${Math.floor(100 + Math.random() * 900)}`,
        distrito: randomClient.dist,
        zonaId: randomClient.zona,
        zonaNombre: ZONAS_CONFIG[randomClient.zona]?.nombre ?? "Lima",
        coordenadas: {
          lat: randomClient.lat + (Math.random() - 0.5) * 0.008,
          lng: randomClient.lng + (Math.random() - 0.5) * 0.008,
        },
      },
      estado: "SUBMITTED",
      estadoLabel: "Enviado / Nuevo",
      montoTotal: monto,
      condicionPago: "Crédito 30 días",
      vendedor: randomVendedor,
      ventanaEntrega: "15:00 - 17:00",
      prioridad: Math.random() > 0.7 ? "ALTA" : "NORMAL",
      creadoHaceMinutos: 0,
      actualizadoEn: "Hace un momento",
      isNew: true,
      items: [
        {
          id: `item-${Date.now()}-1`,
          codigo: "MED-NUEVO",
          descripcion: "Antibióticos y Material Descartable Urgente",
          laboratorio: "Genfar / LogiSalud",
          cantidad: 50,
          precioUnitario: Math.round(monto / 50),
          subtotal: monto,
        },
      ],
    };

    setOrders((prev) => [newOrder, ...prev]);
    setLatestNewOrderId(orderId);
    soundFx.playNewOrderChime();

    addEvent({
      timestamp: "Ahora",
      tipo: "NUEVO_PEDIDO",
      titulo: `Nuevo Pedido #${nextNum}`,
      descripcion: `${randomClient.razon} (${randomClient.dist}) por S/ ${monto.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`,
      pedidoId: orderId,
      monto,
    });

    // Desactivar el highlight después de 6 segundos
    setTimeout(() => {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, isNew: false } : o))
      );
    }, 6000);
  }, [addEvent]);

  // Actualizar posiciones de vehículos suavemente en el mapa
  const updateVehiclePositions = useCallback(() => {
    setVehicles((prev) =>
      prev.map((v) => {
        // Simular movimiento realista alrededor de sus rutas
        const deltaLat = (Math.sin(Date.now() / 4000 + Number(v.id.replace(/\D/g, ""))) * 0.0006);
        const deltaLng = (Math.cos(Date.now() / 4000 + Number(v.id.replace(/\D/g, ""))) * 0.0006);

        // Velocidad realista entre 20 y 55 km/h
        const jitterVelocidad = Math.min(
          60,
          Math.max(15, v.velocidadKmH + Math.round((Math.random() - 0.5) * 6))
        );

        return {
          ...v,
          coordenadas: {
            lat: v.coordenadas.lat + deltaLat * 0.15,
            lng: v.coordenadas.lng + deltaLng * 0.15,
          },
          velocidadKmH: jitterVelocidad,
        };
      })
    );
  }, []);

  // Tick de simulación periódica
  const tickSimulation = useCallback(() => {
    // 1. Mover vehículos
    updateVehiclePositions();

    // 2. Probabilidad de transición de estado en algún pedido activo
    const roll = Math.random();
    if (roll < 0.45) {
      setOrders((currentOrders) => {
        // Encontrar pedidos que puedan cambiar de estado
        const inTransit = currentOrders.filter((o) => o.estado === "IN_TRANSIT");
        const ready = currentOrders.filter((o) => o.estado === "READY_FOR_OPERATIONS");
        const submitted = currentOrders.filter((o) => o.estado === "SUBMITTED");

        // Caso A: Un pedido en ruta se entrega
        if (inTransit.length > 0 && Math.random() < 0.4) {
          const target = inTransit[Math.floor(Math.random() * inTransit.length)];
          soundFx.playDeliverySuccessChime();
          addEvent({
            timestamp: "Ahora",
            tipo: "ENTREGADO",
            titulo: `Pedido #${target.numero} Entregado`,
            descripcion: `Entregado con éxito en ${target.cliente.razonSocial} (${target.destino.distrito})`,
            pedidoId: target.id,
            monto: target.montoTotal,
          });

          return currentOrders.map((o) =>
            o.id === target.id
              ? {
                  ...o,
                  estado: "DELIVERED" as RealtimeOrderStatus,
                  estadoLabel: "Entregado",
                  actualizadoEn: "Hace un momento",
                }
              : o
          );
        }

        // Caso B: Un pedido listo para operaciones sale a reparto
        if (ready.length > 0 && Math.random() < 0.5) {
          const target = ready[Math.floor(Math.random() * ready.length)];
          const vehiculo = VEHICULOS_INICIALES[0];
          addEvent({
            timestamp: "Ahora",
            tipo: "DESPACHADO",
            titulo: `Pedido #${target.numero} en Ruta`,
            descripcion: `Despachado en ${vehiculo.modelo} (${vehiculo.placa}) hacia ${target.destino.distrito}`,
            pedidoId: target.id,
            monto: target.montoTotal,
          });

          return currentOrders.map((o) =>
            o.id === target.id
              ? {
                  ...o,
                  estado: "IN_TRANSIT" as RealtimeOrderStatus,
                  estadoLabel: "En Ruta",
                  conductorAsignado: {
                    id: vehiculo.id,
                    nombre: vehiculo.conductor,
                    vehiculo: vehiculo.modelo,
                    placa: vehiculo.placa,
                    telefono: "987-654-321",
                  },
                  actualizadoEn: "Hace un momento",
                }
              : o
          );
        }

        // Caso C: Un pedido nuevo es validado
        if (submitted.length > 0 && Math.random() < 0.6) {
          const target = submitted[Math.floor(Math.random() * submitted.length)];
          addEvent({
            timestamp: "Ahora",
            tipo: "CAMBIO_ESTADO",
            titulo: `Pedido #${target.numero} Aprobado`,
            descripcion: `Validado por Créditos. Listo para picking en almacén`,
            pedidoId: target.id,
            monto: target.montoTotal,
          });

          return currentOrders.map((o) =>
            o.id === target.id
              ? {
                  ...o,
                  estado: "READY_FOR_OPERATIONS" as RealtimeOrderStatus,
                  estadoLabel: "Listo para Operaciones",
                  actualizadoEn: "Hace un momento",
                }
              : o
          );
        }

        return currentOrders;
      });
    }

    // 3. Probabilidad de que ingrese un nuevo pedido espontáneo en tiempo real (cada ~15-20s)
    if (Math.random() < 0.18) {
      simulateNewOrder();
    }
  }, [addEvent, simulateNewOrder, updateVehiclePositions]);

  // Loop de simulación
  useEffect(() => {
    if (!isPlaying) return;
    const intervalTime = Math.max(800, 3200 / speedMultiplier);
    const interval = setInterval(tickSimulation, intervalTime);
    return () => clearInterval(interval);
  }, [isPlaying, speedMultiplier, tickSimulation]);

  // Cálculo de KPIs
  const kpis: DashboardKPIs = useMemo(() => {
    let totalMontoHoy = 0;
    let enTransito = 0;
    let entregadosHoy = 0;
    let pendientesDespacho = 0;
    let excepciones = 0;

    for (const o of orders) {
      totalMontoHoy += o.montoTotal;
      if (o.estado === "IN_TRANSIT") enTransito++;
      else if (o.estado === "DELIVERED") entregadosHoy++;
      else if (o.estado === "READY_FOR_OPERATIONS" || o.estado === "SUBMITTED")
        pendientesDespacho++;
      else if (o.estado === "EXCEPTION") excepciones++;
    }

    const totalPedidosHoy = orders.length;
    const totalCerrables = entregadosHoy + enTransito;
    const slaCumplimientoPct =
      totalCerrables > 0
        ? Math.min(99.4, Math.round((entregadosHoy / (entregadosHoy + excepciones * 0.5 + 0.1)) * 96 * 10) / 10)
        : 97.5;

    return {
      totalPedidosHoy,
      totalMontoHoy,
      enTransito,
      entregadosHoy,
      pendientesDespacho,
      excepciones,
      slaCumplimientoPct,
    };
  }, [orders]);

  return {
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
  };
}
