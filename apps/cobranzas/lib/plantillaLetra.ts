import { readFile } from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { montoEnPalabrasSoles } from './numeroALetras';

// Rellena FORMATO_LETRA_LOGISALUD.xlsx (plantilla recortada a un solo
// ejemplar de letra, A1:I26 — el área de impresión que ya traía el
// archivo original) con los datos reales de una letra. Se edita el XML
// crudo del .xlsx (sharedStrings.xml + sheet1.xml) en vez de pasar por la
// librería `xlsx`, que no preserva imágenes/dibujos al reescribir: así el
// logo y las líneas del formato quedan intactos.

export type DatosPlantillaLetra = {
  numeroLetra: string;        // ej. "000091"
  referenciaGirador: string;  // comprobante(s), ej. "FFF1-002577" o "FFF1-002577, FFF1-002578"
  fechaGiro: string;          // 'YYYY-MM-DD'
  fechaVencimiento: string;   // 'YYYY-MM-DD'
  importe: number;
  aceptante: string;          // razón social del cliente (girado)
  aceptanteRuc: string;       // RUC (o DNI) del cliente
  aceptanteDomicilio: string; // ver domicilioParaLetra; '' si no se conoce
};

// El domicilio del aceptante como lo imprime la letra: la dirección y, al
// final, "DEPARTAMENTO - PROVINCIA - DISTRITO" (el formato de SUNAT que traía
// la plantilla original). Si la dirección ya trae la ubicación al final
// —algunas vienen así de SUNAT— no se repite. Sin dirección cargada (son la
// mayoría de los clientes) queda solo la ubicación, o vacío para llenarlo a
// mano: nunca el domicilio de otro cliente.
export function domicilioParaLetra(c: {
  direccion?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
}): string {
  const limpio = (v?: string | null) => (v ?? '').trim();
  const direccion = limpio(c.direccion);
  const partes = [c.departamento, c.provincia, c.distrito].map(limpio).filter(Boolean);
  const ubicacion = partes.join(' - ');
  if (!direccion) return ubicacion;
  const dirMayus = direccion.toUpperCase();
  const yaTraeUbicacion = partes.length > 0 && partes.slice(0, 2).every((p) => dirMayus.includes(p.toUpperCase()));
  return yaTraeUbicacion || !ubicacion ? direccion : `${direccion} ${ubicacion}`;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function fechaAExcelSerial(fechaIso: string): number {
  const [y, m, d] = fechaIso.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) - EXCEL_EPOCH;
  return Math.round(ms / 86400000);
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function reemplazarSharedString(xml: string, indice: number, nuevoTexto: string): string {
  const items = xml.split(/(<si>[\s\S]*?<\/si>)/);
  let contador = -1;
  for (let i = 0; i < items.length; i++) {
    if (!items[i].startsWith('<si>')) continue;
    contador++;
    if (contador === indice) {
      items[i] = `<si><t xml:space="preserve">${escaparXml(nuevoTexto)}</t></si>`;
      break;
    }
  }
  return items.join('');
}

function reemplazarEnSharedString(xml: string, indice: number, buscar: RegExp, reemplazo: string): string {
  const items = xml.split(/(<si>[\s\S]*?<\/si>)/);
  let contador = -1;
  for (let i = 0; i < items.length; i++) {
    if (!items[i].startsWith('<si>')) continue;
    contador++;
    if (contador === indice) {
      items[i] = items[i].replace(buscar, escaparXml(reemplazo));
      break;
    }
  }
  return items.join('');
}

function reemplazarValorNumerico(xml: string, celda: string, nuevoValor: number): string {
  const re = new RegExp(`(<c r="${celda}"[^>]*>)<v>[^<]*</v>`);
  if (!re.test(xml)) throw new Error(`No se encontró la celda ${celda} en la plantilla`);
  return xml.replace(re, `$1<v>${nuevoValor}</v>`);
}

// Índices fijos en sharedStrings.xml de la plantilla recortada (verificados
// contra el archivo real FORMATO_LETRA_LOGISALUD_4.xlsx):
//   1  -> título con "...LETRA N°...000091" (solo se reemplaza el número al final)
//   10 -> número de letra (celda D7)
//   11 -> ref. del girador (celda E7)
//   18 -> monto en palabras (celda E11)
//   21 -> "Aceptante: <razón social>\r\n" (celda D13)
//   28 -> "DNI/RUC: <ruc>\r\n" (celda D15)
//   30 -> "Domicilio: <dirección>" (celda D17)
//
// 28 y 30 traían el RUC y el domicilio del cliente de ejemplo de la
// plantilla (BVC FARMA, Trujillo) y NO se reemplazaban: todas las letras
// salían con el nombre correcto y el RUC/domicilio de otro (Sebas,
// 2026-10-23, letra L00098 de BOTICA EL SAMARITANO).
const IDX_TITULO = 1;
const IDX_NUMERO_LETRA = 10;
const IDX_REF_GIRADOR = 11;
const IDX_MONTO_PALABRAS = 18;
const IDX_ACEPTANTE = 21;
const IDX_ACEPTANTE_RUC = 28;
const IDX_ACEPTANTE_DOMICILIO = 30;

export async function generarPlantillaLetra(datos: DatosPlantillaLetra): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'templates', 'FORMATO_LETRA_LOGISALUD.xlsx');
  const buffer = await readFile(templatePath);
  const zip = await JSZip.loadAsync(buffer);

  let sharedStrings = await zip.file('xl/sharedStrings.xml')!.async('string');
  sharedStrings = reemplazarEnSharedString(sharedStrings, IDX_TITULO, /000091(?=<\/t>)/, datos.numeroLetra);
  sharedStrings = reemplazarSharedString(sharedStrings, IDX_NUMERO_LETRA, datos.numeroLetra);
  sharedStrings = reemplazarSharedString(sharedStrings, IDX_REF_GIRADOR, datos.referenciaGirador);
  sharedStrings = reemplazarSharedString(sharedStrings, IDX_MONTO_PALABRAS, montoEnPalabrasSoles(datos.importe));
  sharedStrings = reemplazarSharedString(sharedStrings, IDX_ACEPTANTE, `Aceptante: ${datos.aceptante}\r\n`);
  sharedStrings = reemplazarSharedString(sharedStrings, IDX_ACEPTANTE_RUC, `DNI/RUC: ${datos.aceptanteRuc}\r\n`);
  sharedStrings = reemplazarSharedString(sharedStrings, IDX_ACEPTANTE_DOMICILIO, `Domicilio: ${datos.aceptanteDomicilio}`);
  zip.file('xl/sharedStrings.xml', sharedStrings);

  let sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  sheet = reemplazarValorNumerico(sheet, 'I7', datos.importe);
  sheet = reemplazarValorNumerico(sheet, 'F8', fechaAExcelSerial(datos.fechaGiro));
  sheet = reemplazarValorNumerico(sheet, 'H8', fechaAExcelSerial(datos.fechaVencimiento));
  zip.file('xl/worksheets/sheet1.xml', sheet);

  return zip.generateAsync({ type: 'nodebuffer' });
}
