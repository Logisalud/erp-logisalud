import 'server-only'
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'

// Extrae el TEXTO de un PDF, solo lo necesario para leer el informe del data logger Elitech RC-61 (D-175): un PDF generado por iText, con tablas de texto y sin imágenes que importen.
// No es un lector de PDF general y no pretende serlo. Soporta: objetos sueltos (no «object streams» ni «xref streams»), FlateDecode, fuentes Type1 (WinAnsi) y Type0 con ToUnicode, y el
// cifrado estándar con contraseña de usuario VACÍA (el informe del RC-61 viene así: AES-256, V5 R5/R6, abre sin contraseña). Cualquier otra cosa devuelve `null` y la pantalla ofrece el
// CSV o anotar la mínima y la máxima a mano. Sin dependencias nuevas: solo `node:zlib` y `node:crypto`.

type Obj = { num: number; dict: string; stream?: Buffer }

const L1 = (b: Buffer, i = 0, j = b.length) => b.toString('latin1', i, j)

// ── Objetos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function leerObjetos(pdf: Buffer): Map<number, Obj> {
  const texto = L1(pdf)
  const objs = new Map<number, Obj>()
  const re = /(\d+)\s+(\d+)\s+obj\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    const num = Number(m[1])
    const ini = m.index + m[0].length
    const fin = texto.indexOf('endobj', ini)
    if (fin < 0) break
    let cuerpo = texto.slice(ini, fin)
    const s = cuerpo.search(/\bstream\r?\n/)
    let stream: Buffer | undefined
    if (s >= 0) {
      const dict = cuerpo.slice(0, s)
      const sm = /\bstream\r?\n/.exec(cuerpo)!
      const desde = ini + s + sm[0].length
      const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict)
      let hasta = len ? desde + Number(len[1]) : -1
      if (hasta < 0 || texto.slice(hasta, hasta + 12).replace(/^\s+/, '').slice(0, 9) !== 'endstream') hasta = texto.indexOf('endstream', desde)
      stream = pdf.subarray(desde, hasta < 0 ? fin : hasta)
      cuerpo = dict
      re.lastIndex = Math.max(re.lastIndex, hasta < 0 ? fin : hasta)
    } else re.lastIndex = fin
    objs.set(num, { num, dict: cuerpo, stream })
  }
  return objs
}

/** El diccionario `<< … >>` que empieza en `desde` (con los anidados), o null. */
function diccionarioEn(t: string, desde: number): string | null {
  const i = t.indexOf('<<', desde)
  if (i < 0) return null
  let prof = 0
  for (let k = i; k < t.length - 1; k++) {
    if (t[k] === '<' && t[k + 1] === '<') { prof++; k++ }
    else if (t[k] === '>' && t[k + 1] === '>') { prof--; k++; if (prof === 0) return t.slice(i, k + 1) }
  }
  return null
}

const refs = (t: string) => [...t.matchAll(/(\d+)\s+\d+\s+R\b/g)].map((m) => Number(m[1]))

// ── Cifrado estándar, contraseña vacía ─────────────────────────────────────────────────────────────────────────────────

/** Una cadena literal `(…)` o hexadecimal `<…>` de un diccionario, ya en bytes. */
function cadenaDe(dict: string, clave: string): Buffer | null {
  const i = dict.indexOf(`/${clave}`)
  if (i < 0) return null
  let k = i + clave.length + 1
  while (/\s/.test(dict[k])) k++
  if (dict[k] === '<') { const f = dict.indexOf('>', k); return Buffer.from(dict.slice(k + 1, f).replace(/\s/g, ''), 'hex') }
  if (dict[k] !== '(') return null
  const out: number[] = []
  let prof = 1
  for (k++; k < dict.length && prof > 0; k++) {
    const c = dict[k]
    if (c === '\\') {
      const n = dict[++k]
      if (n === 'n') out.push(10); else if (n === 'r') out.push(13); else if (n === 't') out.push(9); else if (n === 'b') out.push(8); else if (n === 'f') out.push(12)
      else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(dict[k + 1])) o += dict[++k]; out.push(parseInt(o, 8) & 255) }
      else if (n === '\r' || n === '\n') { if (n === '\r' && dict[k + 1] === '\n') k++ }
      else out.push(n.charCodeAt(0) & 255)
    } else if (c === '(') { prof++; out.push(40) }
    else if (c === ')') { prof--; if (prof > 0) out.push(41) }
    else out.push(c.charCodeAt(0) & 255)
  }
  return Buffer.from(out)
}

const sha = (alg: 'sha256' | 'sha384' | 'sha512', ...p: Buffer[]) => { const h = createHash(alg); for (const x of p) h.update(x); return h.digest() }

/** Algoritmo 2.B del PDF 2.0 (revisión 6). */
function hash2B(clave: Buffer, sal: Buffer, udata: Buffer): Buffer {
  let K = sha('sha256', clave, sal, udata)
  for (let i = 0; ; i++) {
    const K1 = Buffer.concat(Array.from({ length: 64 }, () => Buffer.concat([clave, K, udata])))
    const c = createCipheriv('aes-128-cbc', K.subarray(0, 16), K.subarray(16, 32)); c.setAutoPadding(false)
    const E = Buffer.concat([c.update(K1), c.final()])
    let mod = 0
    for (let j = 0; j < 16; j++) mod += E[j]
    K = sha(mod % 3 === 0 ? 'sha256' : mod % 3 === 1 ? 'sha384' : 'sha512', E)
    if (i >= 63 && E[E.length - 1] <= i + 1 - 32) break
  }
  return K.subarray(0, 32)
}

/** La clave del archivo si está cifrado con AES-256 y se abre sin contraseña; `undefined` si no está cifrado; `null` si no se puede abrir. */
function claveDelArchivo(pdf: Buffer, objs: Map<number, Obj>): Buffer | null | undefined {
  const t = L1(pdf)
  const e = /\/Encrypt\s+(\d+)\s+\d+\s+R/.exec(t)
  if (!e) return /\/Encrypt\s*<</.test(t) ? null : undefined
  const dict = objs.get(Number(e[1]))?.dict
  if (!dict) return null
  const v = Number(/\/V\s+(\d+)/.exec(dict)?.[1]); const r = Number(/\/R\s+(\d+)/.exec(dict)?.[1])
  if (v !== 5 || (r !== 5 && r !== 6)) return null // RC4 y AES-128 no se usan en este informe
  const U = cadenaDe(dict, 'U'); const UE = cadenaDe(dict, 'UE')
  if (!U || !UE || U.length < 48 || UE.length < 32) return null
  const vacia = Buffer.alloc(0)
  const hash = (sal: Buffer) => (r === 5 ? sha('sha256', vacia, sal) : hash2B(vacia, sal, vacia))
  if (!hash(U.subarray(32, 40)).equals(U.subarray(0, 32))) return null // pide contraseña
  const d = createDecipheriv('aes-256-cbc', hash(U.subarray(40, 48)), Buffer.alloc(16)); d.setAutoPadding(false)
  return Buffer.concat([d.update(UE.subarray(0, 32)), d.final()])
}

function descifrar(datos: Buffer, clave: Buffer): Buffer {
  if (datos.length < 32) return Buffer.alloc(0)
  const d = createDecipheriv('aes-256-cbc', clave, datos.subarray(0, 16))
  return Buffer.concat([d.update(datos.subarray(16)), d.final()])
}

function contenido(o: Obj, clave: Buffer | undefined): Buffer | null {
  if (!o.stream) return null
  let datos = o.stream
  try { if (clave) datos = descifrar(datos, clave) } catch { return null }
  const f = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(o.dict)?.[1] ?? ''
  const filtros = [...f.matchAll(/\/(\w+)/g)].map((x) => x[1])
  for (const x of filtros) {
    if (x === 'FlateDecode' || x === 'Fl') { try { datos = inflateSync(datos) } catch { return null } }
    else return null
  }
  return datos
}

// ── Fuentes y texto ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface Fuente { dosBytes: boolean; mapa: Map<number, string> }

function leerCMap(cmap: string): Map<number, string> {
  const mapa = new Map<number, string>()
  const utf16 = (hex: string) => { const b = Buffer.from(hex, 'hex'); let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i)); return s }
  for (const blk of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) mapa.set(parseInt(m[1], 16), utf16(m[2]))
  for (const blk of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
      const a = parseInt(m[1], 16); const b = parseInt(m[2], 16)
      if (m[4]) { const base = utf16(m[4]); for (let c = a; c <= b; c++) mapa.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - a))) }
      else if (m[5]) [...m[5].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((x, k) => mapa.set(a + k, utf16(x[1])))
    }
  }
  return mapa
}

function fuenteDe(o: Obj | undefined, objs: Map<number, Obj>, clave: Buffer | undefined): Fuente {
  const simple: Fuente = { dosBytes: false, mapa: new Map() }
  if (!o) return simple
  if (/\/Subtype\s*\/Type0/.test(o.dict)) {
    const tu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(o.dict)
    const cm = tu ? objs.get(Number(tu[1])) : undefined
    const datos = cm ? contenido(cm, clave) : null
    return { dosBytes: true, mapa: datos ? leerCMap(L1(datos)) : new Map() }
  }
  return simple
}

interface Pieza { x: number; y: number; texto: string }

/** Decodifica una cadena de texto del PDF con la fuente actual. */
function decodificar(bytes: Buffer, f: Fuente): string {
  if (!f.dosBytes) return bytes.toString('latin1')
  let s = ''
  for (let i = 0; i + 1 < bytes.length; i += 2) s += f.mapa.get(bytes.readUInt16BE(i)) ?? ''
  return s
}

function tokenizar(c: string): (string | { cadena: Buffer } | { arreglo: ({ cadena: Buffer } | number)[] })[] {
  const out: ReturnType<typeof tokenizar> = []
  let i = 0
  const n = c.length
  const cadena = (): Buffer => {
    const b: number[] = []; let prof = 1; i++
    for (; i < n && prof > 0; i++) {
      const ch = c[i]
      if (ch === '\\') {
        const x = c[++i]
        if (x === 'n') b.push(10); else if (x === 'r') b.push(13); else if (x === 't') b.push(9); else if (x === 'b') b.push(8); else if (x === 'f') b.push(12)
        else if (/[0-7]/.test(x)) { let o = x; while (o.length < 3 && /[0-7]/.test(c[i + 1])) o += c[++i]; b.push(parseInt(o, 8) & 255) }
        else if (x === '\n') { /* continuación */ } else if (x === '\r') { if (c[i + 1] === '\n') i++ }
        else b.push(x.charCodeAt(0) & 255)
      } else if (ch === '(') { prof++; b.push(40) } else if (ch === ')') { prof--; if (prof > 0) b.push(41) } else b.push(ch.charCodeAt(0) & 255)
    }
    i--
    return Buffer.from(b)
  }
  for (; i < n; i++) {
    const ch = c[i]
    if (/\s/.test(ch)) continue
    if (ch === '%') { while (i < n && c[i] !== '\n' && c[i] !== '\r') i++; continue }
    if (ch === '(') { out.push({ cadena: cadena() }); continue }
    if (ch === '<' && c[i + 1] !== '<') { const f = c.indexOf('>', i); out.push({ cadena: Buffer.from(c.slice(i + 1, f).replace(/\s/g, '').padEnd(2, '0'), 'hex') }); i = f; continue }
    if (ch === '<' || ch === '>') { i++; continue }
    if (ch === '[') {
      const arr: ({ cadena: Buffer } | number)[] = []
      for (i++; i < n && c[i] !== ']'; i++) {
        if (/\s/.test(c[i])) continue
        if (c[i] === '(') arr.push({ cadena: cadena() })
        else if (c[i] === '<') { const f = c.indexOf('>', i); arr.push({ cadena: Buffer.from(c.slice(i + 1, f).replace(/\s/g, ''), 'hex') }); i = f }
        else { const m = /^-?[\d.]+/.exec(c.slice(i, i + 24)); if (m) { arr.push(Number(m[0])); i += m[0].length - 1 } }
      }
      out.push({ arreglo: arr }); continue
    }
    const m = /^[^\s()<>[\]{}/%]+|^\/[^\s()<>[\]{}/%]*/.exec(c.slice(i, i + 64))
    if (m) { out.push(m[0]); i += m[0].length - 1 }
  }
  return out
}

function piezasDe(contenidoPagina: string, fuentes: Map<string, Fuente>): Pieza[] {
  const piezas: Pieza[] = []
  const pila: (string | { cadena: Buffer } | { arreglo: ({ cadena: Buffer } | number)[] })[] = []
  let fuente: Fuente = { dosBytes: false, mapa: new Map() }
  let lx = 0, ly = 0, tx = 0, ty = 0, lead = 0
  const num = (k: number) => Number(pila[pila.length - k] ?? 0)
  const poner = (texto: string, avanzar: boolean) => { if (texto) piezas.push({ x: tx, y: ty, texto }); if (avanzar) tx += texto.length * 4 }
  for (const t of tokenizar(contenidoPagina)) {
    if (typeof t !== 'string' || /^(-?[\d.]+|\/.*)$/.test(t)) { pila.push(t); continue }
    switch (t) {
      case 'BT': lx = ly = tx = ty = 0; break
      case 'Tf': { const nombre = pila[pila.length - 2]; if (typeof nombre === 'string') fuente = fuentes.get(nombre.slice(1)) ?? { dosBytes: false, mapa: new Map() }; break }
      case 'TL': lead = num(1); break
      case 'Tm': lx = num(2); ly = num(1); tx = lx; ty = ly; break
      case 'Td': lx += num(2); ly += num(1); tx = lx; ty = ly; break
      case 'TD': lx += num(2); ly += num(1); lead = -num(1); tx = lx; ty = ly; break
      case 'T*': ly -= lead; tx = lx; ty = ly; break
      case 'Tj': { const s = pila[pila.length - 1]; if (typeof s === 'object' && 'cadena' in s) poner(decodificar(s.cadena, fuente), true); break }
      case "'": case '"': { ly -= lead; tx = lx; ty = ly; const s = pila[pila.length - 1]; if (typeof s === 'object' && 'cadena' in s) poner(decodificar(s.cadena, fuente), true); break }
      case 'TJ': {
        const a = pila[pila.length - 1]
        if (typeof a === 'object' && 'arreglo' in a) { let s = ''; for (const x of a.arreglo) { if (typeof x === 'number') { if (x < -200) s += ' ' } else s += decodificar(x.cadena, fuente) } poner(s, true) }
        break
      }
      default: break
    }
    pila.length = 0
  }
  return piezas
}

/** Las piezas de texto de una página, de arriba hacia abajo y de izquierda a derecha, una línea por fila (separadas por espacio). */
function lineas(piezas: Pieza[]): string {
  const filas: { y: number; p: Pieza[] }[] = []
  for (const p of [...piezas].sort((a, b) => b.y - a.y)) {
    const f = filas.find((x) => Math.abs(x.y - p.y) <= 2)
    if (f) f.p.push(p); else filas.push({ y: p.y, p: [p] })
  }
  return filas.map((f) => f.p.sort((a, b) => a.x - b.x).map((p) => p.texto.trim()).filter(Boolean).join(' ')).filter(Boolean).join('\n')
}

/**
 * El texto del PDF, página por página, o `null` si no se pudo leer (cifrado con contraseña, formato distinto, archivo dañado). Nunca lanza.
 */
export function textoDePdf(pdf: Buffer): string | null {
  try {
    if (L1(pdf, 0, 5) !== '%PDF-') return null
    const objs = leerObjetos(pdf)
    const clave = claveDelArchivo(pdf, objs)
    if (clave === null) return null
    // Páginas en orden: recorre el árbol desde el catálogo.
    const raiz = /\/Root\s+(\d+)\s+\d+\s+R/.exec(L1(pdf))?.[1]
    const catalogo = raiz ? objs.get(Number(raiz)) : undefined
    const arbol = catalogo ? Number(/\/Pages\s+(\d+)\s+\d+\s+R/.exec(catalogo.dict)?.[1]) : NaN
    const paginas: Obj[] = []
    const visitar = (n: number, prof = 0) => {
      const o = objs.get(n)
      if (!o || prof > 20) return
      if (/\/Type\s*\/Pages\b/.test(o.dict)) { const k = /\/Kids\s*\[([^\]]*)\]/.exec(o.dict); if (k) for (const r of refs(k[1])) visitar(r, prof + 1) }
      else if (/\/Type\s*\/Page\b/.test(o.dict)) paginas.push(o)
    }
    if (Number.isFinite(arbol)) visitar(arbol)
    else for (const o of objs.values()) if (/\/Type\s*\/Page\b/.test(o.dict)) paginas.push(o)
    if (!paginas.length) return null
    const salida: string[] = []
    for (const pg of paginas) {
      const fi = pg.dict.indexOf('/Font')
      const fd = fi >= 0 ? diccionarioEn(pg.dict, fi) : null
      const fuentes = new Map<string, Fuente>()
      if (fd) for (const m of fd.matchAll(/\/(\w+)\s+(\d+)\s+\d+\s+R/g)) fuentes.set(m[1], fuenteDe(objs.get(Number(m[2])), objs, clave ?? undefined))
      const cs = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(pg.dict)?.[1]
      const partes = cs ? refs(cs).map((r) => objs.get(r)).map((o) => (o ? contenido(o, clave ?? undefined) : null)) : []
      if (partes.some((p) => p === null)) return null
      salida.push(lineas(piezasDe(partes.map((p) => L1(p!)).join('\n'), fuentes)))
    }
    return salida.join('\n')
  } catch {
    return null
  }
}
