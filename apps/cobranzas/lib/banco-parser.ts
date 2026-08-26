import * as XLSX from 'xlsx';

export interface MovimientoBanco {
  fecha: string | null;
  fecha_valuta: string | null;
  descripcion: string;
  monto: number;
  saldo: number | null;
  sucursal_agencia: string | null;
  operacion_numero: string | null;
  operacion_hora: string | null;
  usuario: string | null;
  utc: string | null;
  referencia2: string | null;
  clasificacion: 'cobro' | 'no_cobranza';
  nombre_banco_detectado: string | null;
  fila_excel: number;
}

function parseFecha(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

// Convierte montos tipo "1,234.56", "-45.00", "S/ 100" a número.
function parseMonto(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  const s = String(raw ?? '').replace(/[^\d.,\-]/g, '').replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const txt = (raw: unknown): string | null => {
  const s = String(raw ?? '').trim();
  return s === '' ? null : s;
};

// Normaliza cabeceras para hacer match flexible (sin acentos, minúsculas).
function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Extrae el nombre cuando la descripción empieza con "DE " + nombre.
// Si no hay nombre reconocible, devuelve null (no inventa).
function extraerNombre(descripcion: string): string | null {
  const d = descripcion.trim();
  if (/^de\s+/i.test(d)) {
    const nombre = d.replace(/^de\s+/i, '').trim();
    return nombre.length >= 2 ? nombre : null;
  }
  return null;
}

export function parsearExtractoBanco(buffer: ArrayBuffer): MovimientoBanco[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Leemos como matriz cruda: el extracto del BCP trae filas de preámbulo
  // (Cuenta, Moneda, etc.) antes de la fila de títulos.
  const matriz: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Detecta la fila de cabecera: la que tiene "Fecha" y ("Monto" o "Descripción operación").
  let headerIdx = -1;
  for (let i = 0; i < matriz.length; i++) {
    const celdas = (matriz[i] ?? []).map(c => norm(String(c ?? '')));
    const tieneFecha = celdas.includes('fecha');
    const tieneMonto = celdas.includes('monto');
    const tieneDesc  = celdas.some(c => c.startsWith('descripcion'));
    if (tieneFecha && (tieneMonto || tieneDesc)) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  // Mapa: cabecera normalizada -> índice de columna
  const cabecera = matriz[headerIdx].map(c => norm(String(c ?? '')));
  const colDe = (...alias: string[]): number => {
    for (const a of alias) { const j = cabecera.indexOf(norm(a)); if (j !== -1) return j; }
    return -1;
  };
  const idx = {
    fecha: colDe('Fecha'),
    fecha_valuta: colDe('Fecha valuta'),
    descripcion: colDe('Descripción operación', 'Descripcion operacion', 'Descripción', 'Descripcion'),
    monto: colDe('Monto'),
    saldo: colDe('Saldo'),
    sucursal: colDe('Sucursal - agencia', 'Sucursal agencia'),
    op_num: colDe('Operación - Número', 'Operacion - Numero', 'Operación Número'),
    op_hora: colDe('Operación - Hora', 'Operacion - Hora'),
    usuario: colDe('Usuario'),
    utc: colDe('UTC'),
    ref2: colDe('Referencia2', 'Referencia 2'),
  };
  const cell = (row: unknown[], j: number): unknown => (j >= 0 ? row[j] : undefined);

  const movimientos: MovimientoBanco[] = [];

  matriz.slice(headerIdx + 1).forEach((row, k) => {
    const idxFila = headerIdx + 1 + k;
    const descripcion = String(cell(row, idx.descripcion) ?? '').trim();
    const montoRaw = cell(row, idx.monto);
    // Salta filas vacías (sin descripción ni monto)
    if (!descripcion && (montoRaw === null || montoRaw === undefined || montoRaw === '')) return;

    const monto = parseMonto(montoRaw);
    const clasificacion: 'cobro' | 'no_cobranza' = monto < 0 ? 'no_cobranza' : 'cobro';

    const saldoRaw = cell(row, idx.saldo);
    movimientos.push({
      fecha:            parseFecha(cell(row, idx.fecha)),
      fecha_valuta:     parseFecha(cell(row, idx.fecha_valuta)),
      descripcion,
      monto,
      saldo:            saldoRaw === null || saldoRaw === undefined || saldoRaw === '' ? null : parseMonto(saldoRaw),
      sucursal_agencia: txt(cell(row, idx.sucursal)),
      operacion_numero: txt(cell(row, idx.op_num)),
      operacion_hora:   txt(cell(row, idx.op_hora)),
      usuario:          txt(cell(row, idx.usuario)),
      utc:              txt(cell(row, idx.utc)),
      referencia2:      txt(cell(row, idx.ref2)),
      clasificacion,
      nombre_banco_detectado: clasificacion === 'cobro' ? extraerNombre(descripcion) : null,
      fila_excel: idxFila + 1,
    });
  });

  return movimientos;
}
