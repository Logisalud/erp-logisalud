// Un zip mínimo (sin compresión) para armar archivos Word (.docx) sin una librería más. Solo lo que un .docx necesita: nombres UTF-8 y los CRC.
const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ArchivoZip { nombre: string; contenido: string | Uint8Array }

export function armarZip(archivos: readonly ArchivoZip[]): Uint8Array {
  const enc = new TextEncoder()
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let posicion = 0
  const u16 = (v: number) => Uint8Array.of(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (v: number) => Uint8Array.of(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const juntar = (xs: Uint8Array[]) => { const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of xs) { out.set(x, o); o += x.length } return out }
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre)
    const datos = typeof a.contenido === 'string' ? enc.encode(a.contenido) : a.contenido
    const crc = crc32(datos)
    const local = juntar([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(datos.length), u32(datos.length), u16(nombre.length), u16(0), nombre, datos])
    central.push(juntar([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(datos.length), u32(datos.length), u16(nombre.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(posicion), nombre]))
    partes.push(local); posicion += local.length
  }
  const dir = juntar(central)
  const fin = juntar([u32(0x06054b50), u16(0), u16(0), u16(archivos.length), u16(archivos.length), u32(dir.length), u32(posicion), u16(0)])
  return juntar([...partes, dir, fin])
}
