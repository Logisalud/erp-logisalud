export type ZoneParticipant = {
  vendedor: string;
  porcentajeParticipacion: number;
};

/**
 * Refleja la misma validación que el trigger
 * pedidos.check_zone_participants_total: la suma de participación
 * activa en una zona compartida no puede superar 100%.
 */
export function validateZoneParticipantsTotal(participants: ZoneParticipant[]): {
  valid: boolean;
  total: number;
} {
  const total = participants.reduce((sum, p) => sum + p.porcentajeParticipacion, 0);
  return { valid: total <= 100, total };
}
