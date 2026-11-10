// Informe de validación de la carga de ensayo (piloto «como real»): para Sebas y Katia, en palabras llanas. Por línea dice qué pasa y qué hay que corregir; arriba, los totales
// por estado (lista / con advertencia / con error) y un veredicto «lista para cargar» o «no lista».
// Puro. NO decide nada: reutiliza las reglas de `carga-inicial.ts` (`erroresDeFilaCarga`, `resumenCarga`) y los errores que ya devuelve `validar_carga_inicial` (la base manda); aquí solo se
// ordenan, se clasifican y se explican. No toca la confirmación de la carga.
import { diasHasta } from './regulatorio'
import { erroresDeFilaCarga, resumenCarga, ETIQUETA_ESTADO_CARGA, type ResumenCarga } from './carga-inicial'
import type { ErrorFilaCarga, FilaCargaInicial } from './inventario'

export type EstadoLineaInforme = 'LISTA' | 'ADVERTENCIA' | 'ERROR'
export const ETIQUETA_ESTADO_LINEA: Record<EstadoLineaInforme, string> = { LISTA: 'Lista', ADVERTENCIA: 'Con advertencia', ERROR: 'Con error' }

export type CategoriaProblema = 'lote' | 'vencimiento' | 'registro_sanitario' | 'catalogo' | 'duplicado' | 'cantidad' | 'ubicacion' | 'propietario' | 'estado' | 'archivo' | 'otro'
export const ETIQUETA_CATEGORIA: Record<CategoriaProblema, string> = {
  lote: 'Código de lote', vencimiento: 'Vencimiento', registro_sanitario: 'Registro sanitario', catalogo: 'Producto sin catálogo', duplicado: 'Duplicados', cantidad: 'Cantidades',
  ubicacion: 'Ubicaciones', propietario: 'Propietario', estado: 'Estado', archivo: 'Archivo', otro: 'Otros',
}
/** Qué hay que hacer, por categoría (el mensaje de la base dice qué pasa; esto dice cómo se arregla). */
const COMO_SE_CORRIGE: Record<CategoriaProblema, string> = {
  lote: 'Escribe el código de lote que figura en el envase o en Odoo.',
  vencimiento: 'Escribe la fecha de vencimiento del lote (31/12/2028). Si un mismo lote tiene dos fechas, revisa cuál es la correcta.',
  registro_sanitario: 'Dirección Técnica debe cargar o renovar el registro sanitario del producto antes de la carga; o deja esas unidades en Cuarentena.',
  catalogo: 'El producto tiene que estar en el catálogo. Revisa el código o pide a Dirección Técnica que lo cree.',
  duplicado: 'Deja una sola fila por producto, lote, ubicación y estado: suma las cantidades.',
  cantidad: 'Escribe la cantidad como un número entero mayor que cero, sin letras.',
  ubicacion: 'Revisa el código de la ubicación y que acepte al propietario y el estado indicado (mira el mapa del almacén).',
  propietario: 'Revisa el código del propietario (por ejemplo LOGISSA).',
  estado: 'Usa solo Aprobado, Cuarentena o Bajas/Rechazados.',
  archivo: 'Revisa que el archivo tenga las columnas producto, lote, vence, propietario, posicion, estado y cantidad.',
  otro: 'Revisa la fila con Administración.',
}

export interface ProblemaLinea { gravedad: 'ERROR' | 'ADVERTENCIA'; categoria: CategoriaProblema; que_pasa: string; que_corregir: string }
export interface LineaInforme {
  fila: number
  producto: string; lote: string; vence: string; propietario: string; posicion: string; estado: string; cantidad: string
  resultado: EstadoLineaInforme
  problemas: ProblemaLinea[]
}
export type Veredicto = 'LISTA' | 'NO_LISTA'
export interface InformeCarga {
  generadoEn: string
  lineas: LineaInforme[]
  /** Problemas del archivo completo (sin fila): columnas que faltan, archivo vacío. */
  generales: ProblemaLinea[]
  totales: { total: number; listas: number; conAdvertencia: number; conError: number }
  unidades: ResumenCarga
  porCategoria: { categoria: CategoriaProblema; etiqueta: string; errores: number; advertencias: number }[]
  veredicto: Veredicto
  veredictoTexto: string
}

/** Clasifica el mensaje de una regla (el de este dominio o el de la base) en una categoría, para agrupar y para decir cómo se corrige. */
export function categoriaDeMensaje(m: string): CategoriaProblema {
  const t = m.toLowerCase()
  if (t.includes('columnas') || t.startsWith('el archivo')) return 'archivo'
  if (t.includes('registro sanitario')) return 'registro_sanitario'
  if (t.includes('catálogo')) return 'catalogo'
  if (t.includes('ya está en la fila') || t.includes('dos vencimientos') || t.includes('otro vencimiento') || t.includes('una fila por combinación')) return 'duplicado'
  if (t.startsWith('falta el código de lote')) return 'lote'
  if (t.includes('fecha') || t.includes('vencimiento')) return 'vencimiento'
  if (t.includes('cantidad')) return 'cantidad'
  if (t.includes('no hay una ubicación')) return 'ubicacion'
  if (t.includes('propietario') && t.includes('no existe')) return 'propietario'
  if (t.includes('ubicación') || t.includes('ubicacion') || t.includes('zona')) return 'ubicacion'
  if (t.includes('estado')) return 'estado'
  return 'otro'
}

const DIAS_POR_VENCER = 90

/** Avisos que no impiden cargar pero conviene mirar: lote ya vencido fuera de Bajas, o por vencer en menos de 90 días. */
function advertenciasDeFila(f: FilaCargaInicial, hoy: string): ProblemaLinea[] {
  const out: ProblemaLinea[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.vence) || Number.isNaN(Date.parse(f.vence))) return out
  const dias = diasHasta(f.vence, hoy)
  const estado = f.estado.trim().toUpperCase()
  if (dias < 0 && estado !== 'BAJAS_RECHAZADOS') out.push({ gravedad: 'ADVERTENCIA', categoria: 'vencimiento', que_pasa: `El lote ya venció (${f.vence}) y entra como ${ETIQUETA_ESTADO_CARGA[estado] ?? f.estado}`, que_corregir: 'Un lote vencido debe ir a Bajas/Rechazados. Confirma el estado con Dirección Técnica.' })
  else if (dias >= 0 && dias < DIAS_POR_VENCER && estado !== 'BAJAS_RECHAZADOS') out.push({ gravedad: 'ADVERTENCIA', categoria: 'vencimiento', que_pasa: `El lote vence en ${dias} ${dias === 1 ? 'día' : 'días'}`, que_corregir: 'Entra igual; avisa al Jefe de Almacén para que lo despache primero (FEFO).' })
  return out
}

/**
 * Arma el informe. `erroresBase` son los errores que devolvió la validación (la demo o `wms.validar_carga_inicial`) con su número de fila (1 = primera fila de datos; 0 = del archivo);
 * `erroresLectura` son los de leer el archivo (cantidad o fecha que no se entienden). Las reglas propias de la fila se vuelven a aplicar aquí para que el informe sea completo aunque la
 * validación de la base no se haya podido consultar; un mensaje repetido se cuenta una sola vez.
 */
export function construirInforme(filas: readonly FilaCargaInicial[], erroresBase: readonly ErrorFilaCarga[], opciones: { hoy: string; erroresLectura?: readonly ErrorFilaCarga[]; ahora?: string }): InformeCarga {
  const porFila = new Map<number, ProblemaLinea[]>()
  const generales: ProblemaLinea[] = []
  const agregar = (fila: number, mensaje: string) => {
    const categoria = categoriaDeMensaje(mensaje)
    const p: ProblemaLinea = { gravedad: 'ERROR', categoria, que_pasa: mensaje, que_corregir: COMO_SE_CORRIGE[categoria] }
    const lista = fila === 0 ? generales : (porFila.get(fila) ?? porFila.set(fila, []).get(fila)!)
    if (!lista.some((x) => x.que_pasa === mensaje)) lista.push(p)
  }
  for (const e of [...(opciones.erroresLectura ?? []), ...erroresBase]) agregar(e.fila, e.error)
  filas.forEach((f, i) => { for (const m of erroresDeFilaCarga(f)) agregar(i + 1, m) })

  const lineas: LineaInforme[] = filas.map((f, i) => {
    const fila = i + 1
    const errores = porFila.get(fila) ?? []
    const avisos = errores.length ? [] : advertenciasDeFila(f, opciones.hoy)
    const problemas = [...errores, ...avisos]
    return { fila, producto: f.producto, lote: f.lote, vence: f.vence, propietario: f.propietario, posicion: f.posicion, estado: f.estado, cantidad: f.cantidad, resultado: errores.length ? 'ERROR' : avisos.length ? 'ADVERTENCIA' : 'LISTA', problemas }
  })
  // errores con número de fila fuera del archivo (no deberían pasar) se tratan como del archivo
  for (const [fila, ps] of porFila) if (fila > filas.length) generales.push(...ps)

  const conError = lineas.filter((l) => l.resultado === 'ERROR').length
  const conAdvertencia = lineas.filter((l) => l.resultado === 'ADVERTENCIA').length
  const listas = lineas.length - conError - conAdvertencia
  const cuenta = new Map<CategoriaProblema, { errores: number; advertencias: number }>()
  for (const p of [...generales, ...lineas.flatMap((l) => l.problemas)]) {
    const c = cuenta.get(p.categoria) ?? { errores: 0, advertencias: 0 }
    if (p.gravedad === 'ERROR') c.errores += 1; else c.advertencias += 1
    cuenta.set(p.categoria, c)
  }
  const porCategoria = [...cuenta].map(([categoria, c]) => ({ categoria, etiqueta: ETIQUETA_CATEGORIA[categoria], ...c })).sort((a, b) => b.errores - a.errores || b.advertencias - a.advertencias)

  const hayErrores = conError > 0 || generales.length > 0
  const veredicto: Veredicto = !hayErrores && lineas.length > 0 ? 'LISTA' : 'NO_LISTA'
  const veredictoTexto = lineas.length === 0 && generales.length === 0
    ? 'No lista para cargar: el archivo no trae filas.'
    : veredicto === 'LISTA'
      ? conAdvertencia > 0
        ? `Lista para cargar. Tiene ${conAdvertencia} ${conAdvertencia === 1 ? 'línea con advertencia' : 'líneas con advertencia'}: mírala${conAdvertencia === 1 ? '' : 's'} antes de confirmar, pero no impide${conAdvertencia === 1 ? '' : 'n'} la carga.`
        : 'Lista para cargar: todas las líneas están bien.'
      : `No lista para cargar: ${conError} ${conError === 1 ? 'línea tiene error' : 'líneas tienen error'}${generales.length ? ` y el archivo tiene ${generales.length} ${generales.length === 1 ? 'problema general' : 'problemas generales'}` : ''}. Corrígelo${conError === 1 && !generales.length ? '' : 's'} en el archivo y vuelve a subirlo.`
  return { generadoEn: opciones.ahora ?? new Date().toISOString(), lineas, generales, totales: { total: lineas.length, listas, conAdvertencia, conError }, unidades: resumenCarga(filas), porCategoria, veredicto, veredictoTexto }
}

const celda = (x: string | number) => { const t = String(x ?? ''); return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
export const COLUMNAS_INFORME = ['Fila', 'Resultado', 'Producto', 'Lote', 'Vence', 'Propietario', 'Ubicación', 'Estado', 'Cantidad', 'Qué pasa', 'Qué hay que corregir'] as const

/** Una fila de la tabla por línea (o por problema, si tiene varios, para que se pueda filtrar en Excel). */
export function filasDeInforme(i: InformeCarga): (string | number)[][] {
  const out: (string | number)[][] = []
  for (const g of i.generales) out.push(['—', 'Con error', '', '', '', '', '', '', '', g.que_pasa, g.que_corregir])
  for (const l of i.lineas) {
    const base = [l.fila, ETIQUETA_ESTADO_LINEA[l.resultado], l.producto, l.lote, l.vence, l.propietario, l.posicion, ETIQUETA_ESTADO_CARGA[l.estado] ?? l.estado, Number(l.cantidad) || l.cantidad]
    if (l.problemas.length === 0) out.push([...base, 'Todo bien', ''])
    else for (const p of l.problemas) out.push([...base, p.que_pasa, p.que_corregir])
  }
  return out
}

/** Líneas de resumen que van arriba del CSV y de la hoja «Resumen» del Excel. */
export function resumenDeInforme(i: InformeCarga): [string, string | number][] {
  return [
    ['Veredicto', i.veredicto === 'LISTA' ? 'LISTA PARA CARGAR' : 'NO LISTA PARA CARGAR'],
    ['Detalle', i.veredictoTexto],
    ['Líneas', i.totales.total], ['Listas', i.totales.listas], ['Con advertencia', i.totales.conAdvertencia], ['Con error', i.totales.conError],
    ['Unidades aprobadas', i.unidades.aprobado], ['Unidades en cuarentena', i.unidades.cuarentena], ['Unidades a bajas', i.unidades.bajas], ['Unidades en total', i.unidades.total],
  ]
}

export function informeACsv(i: InformeCarga): string {
  const cab = COLUMNAS_INFORME.map(celda).join(',')
  const res = resumenDeInforme(i).map(([k, v]) => `${celda(k)},${celda(v)}`)
  const cuerpo = filasDeInforme(i).map((f) => f.map(celda).join(','))
  return `﻿${[...res, '', cab, ...cuerpo].join('\r\n')}\r\n`
}
