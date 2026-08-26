import * as XLSX from 'xlsx';

export interface VendedorCartera {
  zona: string;
  nombres: string;
  apellidos: string;
  codigo: string;
}

export interface ClienteCartera {
  ruc: string;
  razon_social: string;
  codigo_original: string | null;
  nuevo_codigo: string;
}

export interface ConflictoCartera {
  ruc: string;
  razon_social: string;
  codigos: string[];
}

export interface CarteraData {
  vendedores: VendedorCartera[];
  clientes: ClienteCartera[];
  conflictos: ConflictoCartera[];
}

function splitNombre(full: string): { nombres: string; apellidos: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 4) return { nombres: parts.slice(0, 2).join(' '), apellidos: parts.slice(2).join(' ') };
  if (parts.length === 3) return { nombres: parts[0], apellidos: parts.slice(1).join(' ') };
  if (parts.length === 2) return { nombres: parts[0], apellidos: parts[1] };
  return { nombres: full.trim(), apellidos: '' };
}

function normalCodigo(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function findCol(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

// xlsx omite filas completamente vacias al usar { header: 1 }.
// Por eso rawRows[0] = primera fila NO vacia = fila 2 del Excel (los encabezados).
// rawRows[1+] = datos.
function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string
): { headers: string[]; rows: unknown[][] } {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`No se encontro la hoja "${sheetName}" (verifica el nombre exacto en el Excel)`);

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  // Buscar la primera fila que contenga al menos 2 celdas no vacias -> esa es la de encabezados
  let headerIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const filled = (raw[i] as unknown[]).filter(c => c !== null && String(c).trim() !== '').length;
    if (filled >= 2) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error(`Hoja "${sheetName}": no se encontro fila de encabezados`);

  const headers = (raw[headerIdx] as unknown[]).map(h => String(h ?? '').trim().toUpperCase());
  const rows    = raw.slice(headerIdx + 1) as unknown[][];
  return { headers, rows };
}

export function parsearCartera(buffer: ArrayBuffer): CarteraData {
  const wb = XLSX.read(buffer, { type: 'array' });

  // -- Hoja BD VENDEDORES --------------------------------------------------
  const { headers: hV, rows: rowsV } = parseSheet(wb, 'BD VENDEDORES');

  const vZona = findCol(hV, 'ZONA');
  const vRep  = findCol(hV, 'REPRESENTANTE');
  const vCod  = findCol(hV, 'CODIGO');
  if (vZona < 0 || vRep < 0 || vCod < 0) {
    throw new Error(
      `Hoja "BD VENDEDORES": columnas no encontradas. ` +
      `Encabezados detectados: ${hV.filter(Boolean).join(' | ')}`
    );
  }

  const vendedores: VendedorCartera[] = [];
  for (const row of rowsV) {
    const zona   = String(row[vZona] ?? '').trim();
    const rep    = String(row[vRep]  ?? '').trim();
    const codigo = normalCodigo(row[vCod]);
    if (!zona || !rep || !codigo) continue;
    const { nombres, apellidos } = splitNombre(rep);
    vendedores.push({ zona, nombres, apellidos, codigo });
  }
  if (vendedores.length === 0) {
    throw new Error('Hoja "BD VENDEDORES": no se encontraron filas con ZONA + REPRESENTANTE + CODIGO completos');
  }

  // -- Hoja TABLA DE VENTA -------------------------------------------------
  const { headers: hT, rows: rowsT } = parseSheet(wb, 'TABLA DE VENTA');

  const tRuc      = findCol(hT, 'RUC');
  const tCliente  = findCol(hT, 'CLIENTE');
  const tCodOrig  = findCol(hT, 'CODIGO ORIGINAL');
  const tNuevoCod = findCol(hT, 'NUEVO CODIGO');

  if (tRuc < 0 || tCliente < 0 || tNuevoCod < 0) {
    throw new Error(
      `Hoja "TABLA DE VENTA": faltan columnas RUC / CLIENTE / NUEVO CODIGO. ` +
      `Encabezados detectados: ${hT.filter(Boolean).join(' | ')}`
    );
  }

  // Agrupar por RUC para detectar conflictos de NUEVO CODIGO
  const porRuc = new Map<string, { razon_social: string; orig: Set<string>; nuevo: Set<string> }>();

  for (const row of rowsT) {
    const ruc      = String(row[tRuc]     ?? '').trim().replace(/\D/g, '');
    const cliente  = String(row[tCliente] ?? '').trim();
    const codOrig  = tCodOrig >= 0 ? normalCodigo(row[tCodOrig]) : '';
    const codNuevo = normalCodigo(row[tNuevoCod]);
    if (!ruc || ruc.length < 8 || !codNuevo) continue;

    if (!porRuc.has(ruc)) {
      porRuc.set(ruc, { razon_social: cliente, orig: new Set(), nuevo: new Set() });
    }
    const entry = porRuc.get(ruc)!;
    if (codOrig) entry.orig.add(codOrig);
    entry.nuevo.add(codNuevo);
  }

  const clientes: ClienteCartera[]     = [];
  const conflictos: ConflictoCartera[] = [];

  Array.from(porRuc.entries()).forEach(([ruc, entry]) => {
    if (entry.nuevo.size > 1) {
      conflictos.push({ ruc, razon_social: entry.razon_social, codigos: Array.from(entry.nuevo) });
      return;
    }
    const nuevo_codigo    = Array.from(entry.nuevo)[0];
    const origArr         = Array.from(entry.orig);
    const codigo_original = origArr.length === 1 && origArr[0] !== nuevo_codigo ? origArr[0] : null;
    clientes.push({ ruc, razon_social: entry.razon_social, codigo_original, nuevo_codigo });
  });

  return { vendedores, clientes, conflictos };
}
