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
  codigo_original: string | null;  // null si no cambio o no habia codigo previo
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

export function parsearCartera(buffer: ArrayBuffer): CarteraData {
  const wb = XLSX.read(buffer, { type: 'array' });

  // ── Hoja BD VENDEDORES ──────────────────────────────────────────────────────
  const wsV = wb.Sheets['BD VENDEDORES'];
  if (!wsV) throw new Error('No se encontró la hoja "BD VENDEDORES" (verifica el nombre exacto)');

  const rawV = XLSX.utils.sheet_to_json<unknown[]>(wsV, { header: 1, defval: null });
  if (rawV.length < 3) throw new Error('Hoja "BD VENDEDORES": menos de 3 filas, revisa el archivo');

  const hV = (rawV[1] as unknown[]).map(h => String(h ?? '').trim().toUpperCase());
  const vZona = findCol(hV, 'ZONA');
  const vRep  = findCol(hV, 'REPRESENTANTE');
  const vCod  = findCol(hV, 'CODIGO');
  if (vZona < 0 || vRep < 0 || vCod < 0) {
    throw new Error(`Hoja "BD VENDEDORES": columnas no encontradas. Encabezados detectados: ${hV.join(' | ')}`);
  }

  const vendedores: VendedorCartera[] = [];
  for (let i = 2; i < rawV.length; i++) {
    const row = rawV[i] as unknown[];
    const zona   = String(row[vZona] ?? '').trim();
    const rep    = String(row[vRep]  ?? '').trim();
    const codigo = normalCodigo(row[vCod]);
    if (!zona || !rep || !codigo) continue;
    const { nombres, apellidos } = splitNombre(rep);
    vendedores.push({ zona, nombres, apellidos, codigo });
  }

  if (vendedores.length === 0) throw new Error('Hoja "BD VENDEDORES": no se encontraron vendedores con datos completos');

  // ── Hoja TABLA DE VENTA ─────────────────────────────────────────────────────
  const wsT = wb.Sheets['TABLA DE VENTA'];
  if (!wsT) throw new Error('No se encontró la hoja "TABLA DE VENTA" (verifica el nombre exacto)');

  const rawT = XLSX.utils.sheet_to_json<unknown[]>(wsT, { header: 1, defval: null });
  if (rawT.length < 3) throw new Error('Hoja "TABLA DE VENTA": menos de 3 filas');

  const hT = (rawT[1] as unknown[]).map(h => String(h ?? '').trim().toUpperCase());
  const tRuc      = findCol(hT, 'RUC');
  const tCliente  = findCol(hT, 'CLIENTE');
  const tCodOrig  = findCol(hT, 'CODIGO ORIGINAL');
  const tNuevoCod = findCol(hT, 'NUEVO CODIGO');

  if (tRuc < 0 || tCliente < 0 || tNuevoCod < 0) {
    throw new Error(`Hoja "TABLA DE VENTA": faltan columnas RUC/CLIENTE/NUEVO CODIGO. Encabezados: ${hT.join(' | ')}`);
  }

  // Agrupar por RUC para detectar conflictos de NUEVO CODIGO
  const porRuc = new Map<string, { razon_social: string; orig: Set<string>; nuevo: Set<string> }>();

  for (let i = 2; i < rawT.length; i++) {
    const row      = rawT[i] as unknown[];
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

  const clientes: ClienteCartera[] = [];
  const conflictos: ConflictoCartera[] = [];

  Array.from(porRuc.entries()).forEach(([ruc, entry]) => {
    if (entry.nuevo.size > 1) {
      conflictos.push({ ruc, razon_social: entry.razon_social, codigos: Array.from(entry.nuevo) });
      return;
    }
    const nuevo_codigo   = Array.from(entry.nuevo)[0];
    const origArr        = Array.from(entry.orig);
    const codigo_original = origArr.length === 1 && origArr[0] !== nuevo_codigo ? origArr[0] : null;
    clientes.push({ ruc, razon_social: entry.razon_social, codigo_original, nuevo_codigo });
  });

  return { vendedores, clientes, conflictos };
}
