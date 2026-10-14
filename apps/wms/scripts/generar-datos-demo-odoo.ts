// Genera config/datos-demo-odoo.ts (los datos de la DEMOSTRACIÓN) desde los extractos de Odoo que están en
// docs/wms/datos-demo-odoo/. Son datos de PRUEBA tomados de Odoo el 2026-10-14: NO son la carga inicial de producción
// (esa vendrá después, con stock limpio). Reglas de Sebas (2026-10-14), una por una:
//   1. Vencimientos tal cual, normalizados a fecha (sin hora).
//   2. No se cargan los saldos sin posición exacta (los que están solo en «LGS/Stock»).
//   3. No se cargan LGS/Faltantes ni LGS/Sobrantes (cuentas de ajuste).
//   4. No se carga el stock de Logissa en G-8.1, G-9.1 y G-10.1 (3.ª adenda: son de AJR Labs; pendiente de confirmar).
//   5. E-9.1 y E-10.1 existen: se les quita la marca «por verificar» (config/topologia.ts).
//   6. Las cantidades reservadas en Odoo se ignoran.
//   7. Propietario: el stock del almacén LGS es de Logissa; el de Diphasac, de Diphasac. Solo en posiciones de su propietario.
//   8. Los códigos con prefijo BO son productos de bonificación con código propio (productos aparte).
//   9. Cuarentena y Bajas de Odoo entran con ese estado, en su zona.
//   npm run datos:demo-odoo --workspace erp-logisalud-wms
//
// Cuadre de control: la suma de los quants por producto (incluidos Faltantes y Sobrantes) debe coincidir con la cantidad a mano
// del archivo de productos; si no, el script se detiene (así se detecta un dato mal copiado).

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generarPosiciones } from '../config/topologia'

const RAIZ = resolve(__dirname, '../../..')
const DIR = resolve(RAIZ, 'docs/wms/datos-demo-odoo')
const leer = (f: string) => readFileSync(resolve(DIR, f), 'utf8')

/** CSV mínimo con comillas dobles (los números con miles y los nombres con coma vienen entre comillas). */
export function filasCsv(texto: string): string[][] {
  const filas: string[][] = []
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue
    const campos: string[] = []
    let actual = ''
    let entre = false
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i]
      if (c === '"') { if (entre && linea[i + 1] === '"') { actual += '"'; i++ } else entre = !entre } else if (c === ',' && !entre) { campos.push(actual); actual = '' } else actual += c
    }
    campos.push(actual)
    filas.push(campos)
  }
  return filas
}
const sinEscape = (s: string) => s.replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\&/g, '&').trim()
const num = (s: string) => Math.round(Number(s.replace(/,/g, '')))
const nombreLimpio = (s: string) => s.replace(/\s+/g, ' ').trim()

export type EstadoOdoo = 'APROBADO' | 'CUARENTENA' | 'BAJAS_RECHAZADOS'
export interface SaldoOdoo {
  propietario: 'LOGISSA' | 'DIPHASAC'
  producto: string
  lote: string
  vence?: string
  posicion: string
  estado: EstadoOdoo
  cantidad: number
}

const HOY_EXTRACTO = '2026-10-14'
const POSICIONES = new Set(generarPosiciones().map((p) => p.codigo))
const POSICIONES_AJR_PENDIENTES = new Set(['G-8.1', 'G-9.1', 'G-10.1'])
/** «LGS/Cuarentena» no trae ubicación exacta: entra a la primera posición del área Cuarentena (A-6..A-9). */
const POSICION_CUARENTENA = 'A-6'
/** El stock de ejemplo de Diphasac no trae ubicación: se reparte en las posiciones de Diphasac (A-14 a A-27, nivel 1). */
const POSICIONES_DIPHASAC = Array.from({ length: 14 }, (_, i) => `A-${14 + i}.1`)

interface Quant { ubicacion: string; codigo: string; nombre: string; lote: string; cantidad: number; reservada: number }

export function leerQuants(): Quant[] {
  const [, ...filas] = filasCsv(leer('quants.csv'))
  return filas.map(([ub, prod, lote, cant, res]) => {
    const m = /^\[([A-Z0-9]+)\]\s*(.*)$/.exec(sinEscape(prod))
    if (!m) throw new Error(`Producto ilegible: ${prod}`)
    return { ubicacion: ub.trim(), codigo: m[1], nombre: nombreLimpio(m[2]), lote: lote.trim(), cantidad: num(cant), reservada: num(res) }
  })
}

export function leerLotes(): Map<string, string> {
  const [, ...filas] = leer('lotes.tsv').split('\n').filter((l) => l.trim()).map((l) => l.split('\t'))
  const m = new Map<string, string>()
  for (const [lote, cod, , fecha] of filas) m.set(`${cod}|${lote.trim()}`, fecha.slice(0, 10)) // regla 1: sin hora
  return m
}

export function leerProductosConStock(): Map<string, number> {
  const [, ...filas] = filasCsv(leer('productos-lgs-con-stock.csv'))
  return new Map(filas.map(([c, n]) => [c, Number(n)]))
}

export function leerDiphasac(): { codigo: string; nombre: string; aMano: number }[] {
  const [, ...filas] = filasCsv(leer('productos-diphasac.csv'))
  return filas.map(([codigo, nombre, a]) => ({ codigo, nombre: nombreLimpio(nombre), aMano: num(a) }))
}

export interface Informe {
  extracto: string
  quants: number
  unidadesQuants: number
  entran: { filas: number; unidades: number }
  entranCuarentena: { filas: number; unidades: number }
  entranBajas: { filas: number; unidades: number }
  excluidoSinPosicion: { filas: number; unidades: number }
  excluidoAjuste: { filas: number; unidades: number }
  excluidoAjrPendiente: { filas: number; unidades: number }
  excluidoPosicionInexistente: { filas: number; unidades: number }
  reservadoIgnorado: number
  lotesConStock: number
  lotesEnArchivo: number
  saldosLogissa: number
  saldosDiphasac: number
  diphasac: { productosConCantidad: number; unidades: number; excluidosAjr: number }
  productosBo: number
  vencidos: number
  porVencer60: number
}

export function construir() {
  const quants = leerQuants()
  const lotes = leerLotes()
  const aMano = leerProductosConStock()

  // Cuadre de control contra el archivo de productos.
  const suma = new Map<string, number>()
  for (const q of quants) suma.set(q.codigo, (suma.get(q.codigo) ?? 0) + q.cantidad)
  for (const c of new Set([...suma.keys(), ...aMano.keys()])) {
    if ((suma.get(c) ?? 0) !== (aMano.get(c) ?? 0)) throw new Error(`No cuadra ${c}: quants ${suma.get(c) ?? 0} vs a mano ${aMano.get(c) ?? 0}`)
  }

  const inf = {
    quants: quants.length, unidadesQuants: quants.reduce((t, q) => t + q.cantidad, 0),
    entran: { filas: 0, unidades: 0 }, entranCuarentena: { filas: 0, unidades: 0 }, entranBajas: { filas: 0, unidades: 0 },
    excluidoSinPosicion: { filas: 0, unidades: 0 }, excluidoAjuste: { filas: 0, unidades: 0 },
    excluidoAjrPendiente: { filas: 0, unidades: 0 }, excluidoPosicionInexistente: { filas: 0, unidades: 0 },
    reservadoIgnorado: 0,
  }
  const sumar = (k: { filas: number; unidades: number }, q: Quant) => { k.filas += 1; k.unidades += q.cantidad }
  const saldos = new Map<string, SaldoOdoo>()
  const agregar = (s: SaldoOdoo) => {
    const k = [s.propietario, s.producto, s.lote, s.posicion, s.estado].join('|')
    const e = saldos.get(k)
    if (e) e.cantidad += s.cantidad
    else saldos.set(k, s)
  }
  for (const q of quants) {
    const u = q.ubicacion
    let posicion: string | undefined
    let estado: EstadoOdoo = 'APROBADO'
    let destino = inf.entran
    if (u === 'LGS/Stock') { sumar(inf.excluidoSinPosicion, q); continue } // regla 2
    if (u === 'LGS/Faltantes' || u === 'LGS/Sobrantes') { sumar(inf.excluidoAjuste, q); continue } // regla 3
    if (u === 'LGS/Cuarentena') { posicion = POSICION_CUARENTENA; estado = 'CUARENTENA'; destino = inf.entranCuarentena } // regla 9
    else if (u.startsWith('LGS/Bajas/')) { posicion = u.split('/').pop()!; estado = 'BAJAS_RECHAZADOS'; destino = inf.entranBajas } // regla 9
    else if (u.startsWith('LGS/Stock/')) {
      posicion = u.split('/').pop()!
      if (POSICIONES_AJR_PENDIENTES.has(posicion)) { sumar(inf.excluidoAjrPendiente, q); continue } // regla 4
    } else throw new Error(`Ubicación desconocida: ${u}`)
    if (!POSICIONES.has(posicion)) { sumar(inf.excluidoPosicionInexistente, q); continue }
    sumar(destino, q)
    inf.reservadoIgnorado += q.reservada // regla 6: no se carga
    agregar({ propietario: 'LOGISSA', producto: q.codigo, lote: q.lote, vence: lotes.get(`${q.codigo}|${q.lote}`), posicion, estado, cantidad: q.cantidad })
  }
  for (const s of saldos.values()) if (!s.vence) throw new Error(`Sin vencimiento en el archivo de lotes: ${s.producto} ${s.lote}`)

  // Diphasac (regla 7): trae productos con su cantidad a mano, sin lote, sin vencimiento y sin ubicación.
  const dip = leerDiphasac()
  const excluidosAjr = dip.filter((d) => d.codigo.startsWith('AJR')).length
  const propios = dip.filter((d) => !d.codigo.startsWith('AJR') && d.aMano > 0)
  propios.forEach((d, i) => saldos.set(`DIPHASAC|${d.codigo}`, {
    propietario: 'DIPHASAC', producto: d.codigo, lote: 'SIN-LOTE-ODOO', posicion: POSICIONES_DIPHASAC[i % POSICIONES_DIPHASAC.length], estado: 'APROBADO', cantidad: d.aMano,
  }))

  const todos = [...saldos.values()]
  const nombres = new Map<string, string>()
  for (const q of quants) nombres.set(q.codigo, q.nombre)
  for (const d of dip) if (!nombres.has(d.codigo)) nombres.set(d.codigo, d.nombre)
  // Productos: primero los de Logissa que no son bonificación, luego las bonificaciones (BO…), luego los que solo tiene Diphasac.
  const codigosLogissa = [...new Set(todos.filter((s) => s.propietario === 'LOGISSA').map((s) => s.producto))]
  const esBo = (c: string) => c.startsWith('BO')
  const orden = [
    ...codigosLogissa.filter((c) => !esBo(c)).sort(),
    ...codigosLogissa.filter(esBo).sort(),
    ...[...new Set(todos.filter((s) => s.propietario === 'DIPHASAC').map((s) => s.producto))].filter((c) => !codigosLogissa.includes(c)).sort(),
  ]
  const productos = orden.map((codigo) => ({ codigo, nombre: nombres.get(codigo)! }))
  const hoy = Date.parse(`${HOY_EXTRACTO}T00:00:00Z`)
  const dias = (v: string) => Math.round((Date.parse(`${v}T00:00:00Z`) - hoy) / 86_400_000)
  const logissaConVence = todos.filter((s) => s.propietario === 'LOGISSA' && s.vence)
  const informe: Informe = {
    extracto: HOY_EXTRACTO, ...inf,
    lotesConStock: new Set(logissaConVence.map((s) => `${s.producto}|${s.lote}`)).size, lotesEnArchivo: lotes.size,
    saldosLogissa: todos.filter((s) => s.propietario === 'LOGISSA').length, saldosDiphasac: propios.length,
    diphasac: { productosConCantidad: propios.length, unidades: propios.reduce((t, d) => t + d.aMano, 0), excluidosAjr: excluidosAjr },
    productosBo: productos.filter((p) => esBo(p.codigo)).length,
    vencidos: logissaConVence.filter((s) => dias(s.vence!) < 0).length,
    porVencer60: logissaConVence.filter((s) => dias(s.vence!) >= 0 && dias(s.vence!) < 60).length,
  }
  return { productos, saldos: todos, informe }
}

export function emitir(): string {
  const { productos, saldos, informe } = construir()
  const l: string[] = []
  l.push('// GENERADO por scripts/generar-datos-demo-odoo.ts desde docs/wms/datos-demo-odoo/. No editar a mano.')
  l.push('// Datos de PRUEBA tomados de Odoo (2026-10-14) para la demostración. NO son la carga inicial de producción.')
  l.push('// Qué entra, qué se excluye y por qué: docs/wms/demo-odoo.md.')
  l.push('')
  l.push("import type { SaldoOdoo } from '../scripts/generar-datos-demo-odoo'")
  l.push('')
  l.push('export interface ProductoOdoo { codigo: string; nombre: string }')
  l.push('export interface SaldoDemoOdoo { propietario: \'LOGISSA\' | \'DIPHASAC\'; producto: string; lote: string; vence?: string; posicion: string; estado: \'APROBADO\' | \'CUARENTENA\' | \'BAJAS_RECHAZADOS\'; cantidad: number }')
  l.push('')
  l.push(`export const EXTRACTO_ODOO = ${JSON.stringify(informe, null, 2)} as const`)
  l.push('')
  l.push('export const PRODUCTOS_ODOO: readonly ProductoOdoo[] = [')
  for (const p of productos) l.push(`  { codigo: ${JSON.stringify(p.codigo)}, nombre: ${JSON.stringify(p.nombre)} },`)
  l.push(']')
  l.push('')
  l.push('/** [propietario, producto, lote, vence, posición, estado, cantidad] */')
  l.push('export const SALDOS_ODOO: readonly SaldoDemoOdoo[] = [')
  for (const s of saldos as SaldoOdoo[]) {
    l.push(`  { propietario: '${s.propietario}', producto: ${JSON.stringify(s.producto)}, lote: ${JSON.stringify(s.lote)}, ${s.vence ? `vence: '${s.vence}', ` : ''}posicion: '${s.posicion}', estado: '${s.estado}', cantidad: ${s.cantidad} },`)
  }
  l.push(']')
  l.push('')
  return l.join('\n').replace("import type { SaldoOdoo } from '../scripts/generar-datos-demo-odoo'\n\n", '')
}

if (process.argv[1]?.endsWith('generar-datos-demo-odoo.ts')) {
  writeFileSync(resolve(__dirname, '../config/datos-demo-odoo.ts'), emitir())
  const { informe } = construir()
  console.log(JSON.stringify(informe, null, 2))
}
