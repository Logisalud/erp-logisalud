export type DeliveryZoneId =
  | "lima-centro"
  | "lima-norte"
  | "lima-sur"
  | "lima-este"
  | "callao"
  | "provincias";

export type RealtimeOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "READY_FOR_OPERATIONS"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "EXCEPTION";

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

export interface OrderItemSummary {
  id: string;
  codigo: string;
  descripcion: string;
  laboratorio: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface RealtimeOrder {
  id: string;
  numero: number;
  codigo: string;
  cliente: {
    razonSocial: string;
    nombreComercial: string;
    ruc: string;
    telefono: string;
    contacto: string;
  };
  destino: {
    direccion: string;
    distrito: string;
    zonaId: DeliveryZoneId;
    zonaNombre: string;
    coordenadas: GeoCoordinate;
    referencia?: string;
  };
  estado: RealtimeOrderStatus;
  estadoLabel: string;
  montoTotal: number;
  condicionPago: string;
  vendedor: string;
  conductorAsignado?: {
    id: string;
    nombre: string;
    vehiculo: string;
    placa: string;
    telefono: string;
  };
  items: OrderItemSummary[];
  ventanaEntrega: string;
  prioridad: "NORMAL" | "ALTA" | "URGENTE";
  creadoHaceMinutos: number;
  actualizadoEn: string;
  isNew?: boolean; // For pulse animation
}

export interface DeliveryVehicle {
  id: string;
  conductor: string;
  placa: string;
  modelo: string;
  tipo: "FURGON" | "MOTO" | "CAMIONETA";
  zonaAsignada: DeliveryZoneId;
  coordenadas: GeoCoordinate;
  rumboGrados: number;
  velocidadKmH: number;
  pedidosActivosIds: string[];
  capacidadUtilizadaPct: number;
  estado: "EN_RUTA" | "EN_CLIENTE" | "RETORNANDO" | "EN_ALMACEN";
}

export interface DashboardKPIs {
  totalPedidosHoy: number;
  totalMontoHoy: number;
  enTransito: number;
  entregadosHoy: number;
  pendientesDespacho: number;
  excepciones: number;
  slaCumplimientoPct: number;
}

export interface RealtimeEvent {
  id: string;
  timestamp: string;
  tipo: "NUEVO_PEDIDO" | "CAMBIO_ESTADO" | "DESPACHADO" | "ENTREGADO" | "ALERTA";
  titulo: string;
  descripcion: string;
  pedidoId?: string;
  monto?: number;
}
