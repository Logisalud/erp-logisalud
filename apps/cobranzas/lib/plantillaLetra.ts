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
};

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
const IDX_TITULO = 1;
const IDX_NUMERO_LETRA = 10;
const IDX_REF_GIRADOR = 11;
const IDX_MONTO_PALABRAS = 18;
const IDX_ACEPTANTE = 21;

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
  zip.file('xl/sharedStrings.xml', sharedStrings);

  let sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  sheet = reemplazarValorNumerico(sheet, 'I7', datos.importe);
  sheet = reemplazarValorNumerico(sheet, 'F8', fechaAExcelSerial(datos.fechaGiro));
  sheet = reemplazarValorNumerico(sheet, 'H8', fechaAExcelSerial(datos.fechaVencimiento));
  zip.file('xl/worksheets/sheet1.xml', sheet);

  return zip.generateAsync({ type: 'nodebuffer' });
}
