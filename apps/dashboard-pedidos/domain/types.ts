import { DeliveryZoneId } from "./ubigeos-coords";

export type RealtimeOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "READY_FOR_OPERATIONS"
  | "IN_TRANSIT"
  | "DISPATCHED"
  | "DELIVERED"
  | "ADMINISTRATIVE_EXCEPTION"
  | "COMMERCIAL_EXCEPTION";

export interface DashboardOrderItem {
  id: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  igv: number;
  total: number;
  producto: {
    codigoInterno: string;
    descripcion: string;
  };
}

export interface DashboardOrder {
  id: string;
  numero: number | null;
  codigoDisplay: string;
  estado: RealtimeOrderStatus;
  estadoLabel: string;
  fechaCreacion: string;
  fechaEnvio: string | null;
  montoTotal: number;
  cliente: {
    id: string;
    razonSocial: string;
    ruc: string;
  };
  vendedor: {
    id?: string;
    nombre: string;
  };
  direccion: {
    texto: string;
    ubigeo: string;
    distrito: string;
    zonaId: DeliveryZoneId;
    zonaNombre: string;
    coordenadas: {
      lat: number;
      lng: number;
    };
  };
  items: DashboardOrderItem[];
  isNew?: boolean;
}

export interface DashboardVehicle {
  id: string;
  conductor: string;
  placa: string;
  modelo: string;
  tipo: "FURGON" | "MOTO" | "CAMIONETA";
  zona: DeliveryZoneId;
  coordenadas: { lat: number; lng: number };
  velocidadKmH: number;
  pedidosActivosIds: string[];
  estado: "EN_RUTA" | "EN_CLIENTE" | "DISPONIBLE";
}

export interface DashboardStats {
  totalPedidosBD: number;
  pedidosHoy: number;
  montoTotalHoy: number;
  listosOperaciones: number;
  enRuta: number;
  entregadosHoy: number;
  excepciones: number;
  slaEfectividadPct: number;
}

export interface LiveTickerEvent {
  id: string;
  timestamp: string;
  tipo: "NUEVO" | "OPERACIONES" | "DESPACHADO" | "ENTREGADO" | "ALERTA";
  titulo: string;
  descripcion: string;
  monto?: number;
}
