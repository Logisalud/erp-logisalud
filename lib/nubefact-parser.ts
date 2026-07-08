import * as XLSX from 'xlsx';

export interface FilaNubefact {
  fecha_emision: string;
  fecha_vencimiento: string | null;
  tipo: string;
  serie: string;
  numero: number;
  cliente_ruc: string;
  razon_social: string;
  moneda: 'PEN' | 'USD';
  tipo_cambio: number | null;
  importe_total: number;
  forma_pago: 'CONTADO' | 'CREDITO';
  anulado: boolean;
  doc_mod_tipo: string | null;
  doc_mod_serie: string | null;
  doc_mod_numero: number | null;
  fila_excel: number;
}

export interface ResumenPreview {
  total_filas: number;
  validas: number;
  facturas: number;
  boletas: number;
  notas_credito: number;
  notas_debito: number;
  anuladas: number;
  clientes_nuevos: { ruc: string; razon_social: string }[];
  errores: { fila: number; mensaje: string }[];
  filas: FilaNubefact[];
}

function parseFecha(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function parseFechaDesdeDetalle(detalle: string): string | null {
  const m = detalle.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

function parseRuc(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\D/g, '').padStart(11, '0').slice(-11);
}

function parseTipo(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (s === '01' || /factura/i.test(s)) return '01';
  if (s === '03' || /boleta/i.test(s)) return '03';
  if (s === '07' || /nota.*cr/i.test(s)) return '07';
  if (s === '08' || /nota.*d[eé]b/i.test(s)) return '08';
  return s.slice(0, 2).padStart(2, '0');
}

function parseMoneda(raw: unknown): 'PEN' | 'USD' {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === 'USD' || s === 'DOLARES' || s === 'DÓLARES') return 'USD';
  return 'PEN';
}

function parseFormaPago(raw: unknown): 'CONTADO' | 'CREDITO' {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s.includes('CONTADO')) return 'CONTADO';
  return 'CREDITO'; // por defecto crédito si no se reconoce
}

export function parsearExcelNubefact(buffer: ArrayBuffer): FilaNubefact[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
    raw: true,
    defval: null,
  });

  const filas: FilaNubefact[] = [];

  raw.forEach((row, idx) => {
    const fila   = idx + 2;
    const tipo   = parseTipo(row['TIPO']);
    const serie  = String(row['SERIE'] ?? '').trim().toUpperCase();
    const numero = Number(row['NÚMERO'] ?? row['NUMERO'] ?? 0);
    const moneda = parseMoneda(row['MONEDA']);

    const tcRaw     = Number(row['T/C'] ?? 1);
    const tipo_cambio = moneda === 'USD' && tcRaw && tcRaw !== 1 ? tcRaw : null;

    const fechaV   = parseFecha(row['FECHA V']);
    const detalle  = String(row['DETALLE DE PAGO'] ?? '').trim();
    const fechaVencimiento = fechaV ?? (detalle ? parseFechaDesdeDetalle(detalle) : null);

    const forma_pago = parseFormaPago(row['FORMA DE PAGO']);
    const anulado    = String(row['¿ANULADO?'] ?? '').trim().toUpperCase() === 'SI';

    const docModTipo   = row['DOC MODIFICADO - TIPO']   ? parseTipo(row['DOC MODIFICADO - TIPO'])   : null;
    const docModSerie  = row['DOC MODIFICADO - SERIE']  ? String(row['DOC MODIFICADO - SERIE']).trim().toUpperCase() : null;
    const docModNumRaw = row['DOC MODIFICADO - NÚMERO'] ?? row['DOC MODIFICADO - NUMERO'];
    const docModNumero = docModNumRaw ? Number(docModNumRaw) : null;

    filas.push({
      fecha_emision:     parseFecha(row['FECHA E']) ?? '',
      fecha_vencimiento: fechaVencimiento,
      tipo,
      serie,
      numero,
      cliente_ruc:       parseRuc(row['RUC']),
      razon_social:      String(row['DENOMINACIÓN'] ?? row['DENOMINACION'] ?? '').trim(),
      moneda,
      tipo_cambio,
      importe_total:     Math.abs(Number(row['TOTAL'] ?? 0)),
      forma_pago,
      anulado,
      doc_mod_tipo:   docModTipo,
      doc_mod_serie:  docModSerie,
      doc_mod_numero: docModNumero && !isNaN(docModNumero) ? docModNumero : null,
      fila_excel: fila,
    });
  });

  return filas;
}
