export type DeliveryZoneId =
  | "lima-centro"
  | "lima-norte"
  | "lima-sur"
  | "lima-este"
  | "callao"
  | "provincias";

export interface GeoLocation {
  lat: number;
  lng: number;
  distrito: string;
  zonaId: DeliveryZoneId;
  zonaNombre: string;
  isProvincia?: boolean;
}

// Coordenadas exactas por código ubigeo INEI (6 dígitos)
export const UBIGEO_MAP: Record<string, GeoLocation> = {
  // Callao (0701xx)
  "070101": { lat: -12.061, lng: -77.147, distrito: "Callao", zonaId: "callao", zonaNombre: "Callao" },
  "070102": { lat: -12.056, lng: -77.108, distrito: "Bellavista", zonaId: "callao", zonaNombre: "Callao" },
  "070103": { lat: -12.049, lng: -77.094, distrito: "Carmen de la Legua", zonaId: "callao", zonaNombre: "Callao" },
  "070104": { lat: -12.068, lng: -77.124, distrito: "La Perla", zonaId: "callao", zonaNombre: "Callao" },
  "070105": { lat: -12.072, lng: -77.162, distrito: "La Punta", zonaId: "callao", zonaNombre: "Callao" },
  "070106": { lat: -11.878, lng: -77.128, distrito: "Ventanilla", zonaId: "callao", zonaNombre: "Callao" },

  // Lima Centro
  "150101": { lat: -12.046, lng: -77.032, distrito: "Cercado de Lima", zonaId: "lima-centro", zonaNombre: "Lima Centro" },
  "150104": { lat: -12.058, lng: -77.051, distrito: "Breña", zonaId: "lima-centro", zonaNombre: "Lima Centro" },
  "150113": { lat: -12.072, lng: -77.045, distrito: "Jesús María", zonaId: "lima-centro", zonaNombre: "Lima Centro" },
  "150116": { lat: -12.084, lng: -77.035, distrito: "Lince", zonaId: "lima-centro", zonaNombre: "Lima Centro" },
  "150120": { lat: -12.091, lng: -77.065, distrito: "Magdalena del Mar", zonaId: "lima-centro", zonaNombre: "Lima Centro" },
  "150121": { lat: -12.074, lng: -77.062, distrito: "Pueblo Libre", zonaId: "lima-centro", zonaNombre: "Lima Centro" },
  "150136": { lat: -12.078, lng: -77.089, distrito: "San Miguel", zonaId: "lima-centro", zonaNombre: "Lima Centro" },
  "150118": { lat: -12.122, lng: -77.031, distrito: "Miraflores", zonaId: "lima-sur", zonaNombre: "Lima Sur" },

  // Lima Norte
  "150106": { lat: -11.912, lng: -77.034, distrito: "Carabayllo", zonaId: "lima-norte", zonaNombre: "Lima Norte" },
  "150110": { lat: -11.942, lng: -77.054, distrito: "Comas", zonaId: "lima-norte", zonaNombre: "Lima Norte" },
  "150112": { lat: -11.989, lng: -77.052, distrito: "Independencia", zonaId: "lima-norte", zonaNombre: "Lima Norte" },
  "150117": { lat: -11.992, lng: -77.075, distrito: "Los Olivos", zonaId: "lima-norte", zonaNombre: "Lima Norte" },
  "150125": { lat: -11.868, lng: -77.072, distrito: "Puente Piedra", zonaId: "lima-norte", zonaNombre: "Lima Norte" },
  "150135": { lat: -12.012, lng: -77.078, distrito: "San Martín de Porres", zonaId: "lima-norte", zonaNombre: "Lima Norte" },

  // Lima Sur
  "150103": { lat: -12.145, lng: -77.021, distrito: "Barranco", zonaId: "lima-sur", zonaNombre: "Lima Sur" },
  "150108": { lat: -12.175, lng: -77.018, distrito: "Chorrillos", zonaId: "lima-sur", zonaNombre: "Lima Sur" },
  "150130": { lat: -12.098, lng: -77.001, distrito: "San Borja", zonaId: "lima-sur", zonaNombre: "Lima Sur" },
  "150131": { lat: -12.102, lng: -77.039, distrito: "San Isidro", zonaId: "lima-sur", zonaNombre: "Lima Sur" },
  "150132": { lat: -12.158, lng: -76.974, distrito: "San Juan de Miraflores", zonaId: "lima-sur", zonaNombre: "Lima Sur" },
  "150140": { lat: -12.131, lng: -76.992, distrito: "Santiago de Surco", zonaId: "lima-sur", zonaNombre: "Lima Sur" },
  "150141": { lat: -12.115, lng: -77.012, distrito: "Surquillo", zonaId: "lima-sur", zonaNombre: "Lima Sur" },
  "150142": { lat: -12.208, lng: -76.942, distrito: "Villa El Salvador", zonaId: "lima-sur", zonaNombre: "Lima Sur" },
  "150143": { lat: -12.172, lng: -76.928, distrito: "Villa María del Triunfo", zonaId: "lima-sur", zonaNombre: "Lima Sur" },

  // Lima Este
  "150102": { lat: -12.046, lng: -76.968, distrito: "Ate Vitarte", zonaId: "lima-este", zonaNombre: "Lima Este" },
  "150107": { lat: -12.048, lng: -77.008, distrito: "El Agustino", zonaId: "lima-este", zonaNombre: "Lima Este" },
  "150114": { lat: -12.083, lng: -76.938, distrito: "La Molina", zonaId: "lima-este", zonaNombre: "Lima Este" },
  "150133": { lat: -12.008, lng: -77.001, distrito: "San Juan de Lurigancho", zonaId: "lima-este", zonaNombre: "Lima Este" },
  "150137": { lat: -12.045, lng: -76.972, distrito: "Santa Anita", zonaId: "lima-este", zonaNombre: "Lima Este" },

  // Provincias del Perú (Ciudades Principales)
  "130101": { lat: -8.111, lng: -79.028, distrito: "Trujillo", zonaId: "provincias", zonaNombre: "Trujillo (La Libertad)", isProvincia: true },
  "130104": { lat: -8.083, lng: -79.071, distrito: "Huanchaco / Trujillo", zonaId: "provincias", zonaNombre: "Trujillo (La Libertad)", isProvincia: true },
  "040101": { lat: -16.409, lng: -71.537, distrito: "Arequipa", zonaId: "provincias", zonaNombre: "Arequipa", isProvincia: true },
  "140101": { lat: -6.771, lng: -79.844, distrito: "Chiclayo", zonaId: "provincias", zonaNombre: "Chiclayo (Lambayeque)", isProvincia: true },
  "110101": { lat: -14.067, lng: -75.728, distrito: "Ica", zonaId: "provincias", zonaNombre: "Ica", isProvincia: true },
  "200101": { lat: -5.194, lng: -80.632, distrito: "Piura", zonaId: "provincias", zonaNombre: "Piura", isProvincia: true },
  "080101": { lat: -13.531, lng: -71.967, distrito: "Cusco", zonaId: "provincias", zonaNombre: "Cusco", isProvincia: true },
  "120101": { lat: -12.065, lng: -75.204, distrito: "Huancayo", zonaId: "provincias", zonaNombre: "Huancayo (Junín)", isProvincia: true },
  "021801": { lat: -9.074, lng: -78.593, distrito: "Chimbote", zonaId: "provincias", zonaNombre: "Chimbote (Áncash)", isProvincia: true },
  "230101": { lat: -18.013, lng: -70.253, distrito: "Tacna", zonaId: "provincias", zonaNombre: "Tacna", isProvincia: true },
  "160101": { lat: -3.749, lng: -73.253, distrito: "Iquitos", zonaId: "provincias", zonaNombre: "Iquitos (Loreto)", isProvincia: true },
};

export const ALMACEN_CENTRAL = {
  nombre: "Almacén Central LOGISALUD",
  direccion: "Av. Elmer Faucett 1980, Callao",
  coordenadas: { lat: -12.0435, lng: -77.1025 },
};

export function resolveLocation(ubigeo?: string | null, direccion?: string | null): GeoLocation {
  if (ubigeo && UBIGEO_MAP[ubigeo]) {
    const base = UBIGEO_MAP[ubigeo];
    // Pequeño jitter aleatorio para no amontonar en un solo punto exacto
    return {
      ...base,
      lat: base.lat + (Math.random() - 0.5) * 0.005,
      lng: base.lng + (Math.random() - 0.5) * 0.005,
    };
  }

  const dir = (direccion || "").toUpperCase();

  // Búsqueda en provincias
  if (dir.includes("TRUJILLO") || dir.includes("CHAN CHAN") || dir.includes("LA LIBERTAD")) {
    return UBIGEO_MAP["130101"];
  }
  if (dir.includes("AREQUIPA")) return UBIGEO_MAP["040101"];
  if (dir.includes("CHICLAYO")) return UBIGEO_MAP["140101"];
  if (dir.includes("PIURA")) return UBIGEO_MAP["200101"];
  if (dir.includes("CUSCO")) return UBIGEO_MAP["080101"];
  if (dir.includes("HUANCAYO")) return UBIGEO_MAP["120101"];
  if (dir.includes("ICA")) return UBIGEO_MAP["110101"];

  // Búsqueda en distritos de Lima
  if (dir.includes("SURCO") || dir.includes("HIGUERETA")) return UBIGEO_MAP["150140"];
  if (dir.includes("COMAS")) return UBIGEO_MAP["150110"];
  if (dir.includes("CARABAYLLO")) return UBIGEO_MAP["150106"];
  if (dir.includes("CALLAO") || dir.includes("PACASMAYO") || dir.includes("FAUCETT")) return UBIGEO_MAP["070101"];
  if (dir.includes("LOS OLIVOS")) return UBIGEO_MAP["150117"];
  if (dir.includes("MIRAFLORES") || dir.includes("LARCO")) return UBIGEO_MAP["150118"];
  if (dir.includes("SAN JUAN DE LURIGANCHO") || dir.includes("PRÓCERES")) return UBIGEO_MAP["150133"];
  if (dir.includes("SAN MARTIN") || dir.includes("SMP") || dir.includes("HONORIO DELGADO")) return UBIGEO_MAP["150135"];
  if (dir.includes("SAN ISIDRO")) return UBIGEO_MAP["150131"];
  if (dir.includes("SAN BORJA")) return UBIGEO_MAP["150130"];
  if (dir.includes("CHORRILLOS")) return UBIGEO_MAP["150108"];
  if (dir.includes("ATE") || dir.includes("VITARTE")) return UBIGEO_MAP["150102"];
  if (dir.includes("LA MOLINA")) return UBIGEO_MAP["150114"];
  if (dir.includes("JESUS MARIA") || dir.includes("JESÚS MARÍA")) return UBIGEO_MAP["150113"];
  if (dir.includes("MAGDALENA")) return UBIGEO_MAP["150120"];
  if (dir.includes("PUEBLO LIBRE")) return UBIGEO_MAP["150121"];
  if (dir.includes("SAN MIGUEL")) return UBIGEO_MAP["150136"];

  // Default Lima Centro
  return {
    lat: -12.065 + (Math.random() - 0.5) * 0.015,
    lng: -77.045 + (Math.random() - 0.5) * 0.015,
    distrito: "Lima Metropolitana",
    zonaId: "lima-centro",
    zonaNombre: "Lima Centro",
  };
}
