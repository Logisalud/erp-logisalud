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

// Busca en la fila el valor de una columna por varios alias posibles.
function pick(row: Record<string, unknown>, keys: Map<string, string>, ...alias: string[]): unknown {
  for (const a of alias) {
    const real = keys.get(norm(a));
    if (real !== undefined) return row[real];
  }
  return undefined;
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
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });

  const movimientos: MovimientoBanco[] = [];

  raw.forEach((row, idx) => {
    const keys = new Map<string, string>();
    for (const k of Object.keys(row)) keys.set(norm(k), k);

    const descripcion = String(pick(row, keys, 'Descripción operación', 'Descripcion operacion', 'Descripción', 'Descripcion') ?? '').trim();
    const montoRaw = pick(row, keys, 'Monto');
    // Salta filas vacías (sin descripción ni monto)
    if (!descripcion && (montoRaw === null || montoRaw === undefined || montoRaw === '')) return;

    const monto = parseMonto(montoRaw);
    const clasificacion: 'cobro' | 'no_cobranza' = monto < 0 ? 'no_cobranza' : 'cobro';

    movimientos.push({
      fecha:            parseFecha(pick(row, keys, 'Fecha')),
      fecha_valuta:     parseFecha(pick(row, keys, 'Fecha valuta', 'Fecha Valuta')),
      descripcion,
      monto,
      saldo:            (() => { const v = pick(row, keys, 'Saldo'); return v === null || v === undefined || v === '' ? null : parseMonto(v); })(),
      sucursal_agencia: txt(pick(row, keys, 'Sucursal - agencia', 'Sucursal agencia', 'Sucursal-agencia')),
      operacion_numero: txt(pick(row, keys, 'Operación - Número', 'Operacion - Numero', 'Operación Número', 'Operacion Numero')),
      operacion_hora:   txt(pick(row, keys, 'Operación - Hora', 'Operacion - Hora', 'Operación Hora', 'Operacion Hora')),
      usuario:          txt(pick(row, keys, 'Usuario')),
      utc:              txt(pick(row, keys, 'UTC')),
      referencia2:      txt(pick(row, keys, 'Referencia2', 'Referencia 2')),
      clasificacion,
      nombre_banco_detectado: clasificacion === 'cobro' ? extraerNombre(descripcion) : null,
      fila_excel: idx + 2,
    });
  });

  return movimientos;
}
