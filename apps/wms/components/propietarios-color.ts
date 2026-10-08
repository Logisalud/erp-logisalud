// Cada propietario tiene un color y una LETRA: el mapa nunca depende solo del color.
export const PROPIETARIO_VISTA: Record<string, { color: string; tinte: string; letra: string; corto: string }> = {
  LOGISSA: { color: '#2F7644', tinte: '#D8F1DF', letra: 'L', corto: 'Logissa' },
  DIPHASAC: { color: '#2E7C80', tinte: '#D5F1F2', letra: 'D', corto: 'Diphasac' },
  TRIAMED: { color: '#6B4FB3', tinte: '#E8E1F7', letra: 'T', corto: 'Triamed' },
  MEDIC_PHARMA_LAB: { color: '#B45309', tinte: '#FDE8CF', letra: 'M', corto: 'Medic Pharma Lab' },
  AJR_LABS: { color: '#A21C6B', tinte: '#F8DCEC', letra: 'A', corto: 'AJR Labs' },
}

export const vistaPropietario = (codigo: string) =>
  PROPIETARIO_VISTA[codigo] ?? { color: '#55625B', tinte: '#EDF1EF', letra: '?', corto: codigo }
