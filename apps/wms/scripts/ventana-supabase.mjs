#!/usr/bin/env node
// Prepara los bloques de la ventana de aplicación en Supabase real: UN archivo por paso, listo para pegar en el SQL Editor.
// Cada bloque trae la cabecera de seguridad (lock_timeout 5 s, statement_timeout 60 s), el SQL de la migración TAL CUAL está en el repo
// y la línea que la anota en el historial de migraciones (supabase_migrations.schema_migrations).
//
//   node scripts/ventana-supabase.mjs <carpeta_de_salida> <versionBase AAAAMMDDHHMMSS, con segundos 00>
//   ej.: node scripts/ventana-supabase.mjs /tmp/ventana 20261018210000
//
// Claude prepara estos archivos; NO los ejecuta sobre la base real (ver docs/wms/guia-ventana-supabase.md).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** El orden de la ventana. La 0008 va al final de las migraciones: es la única que agrega algo a un objeto de Compras (el trigger de catalogo.productos). */
export const PASOS = [
  { archivo: 'migrations/0001_wms_base.sql', nombre: 'wms_0001_base' },
  { archivo: 'migrations/0002_wms_ledger.sql', nombre: 'wms_0002_ledger' },
  { archivo: 'migrations/0003_wms_productos.sql', nombre: 'wms_0003_productos' },
  { archivo: 'migrations/0004_wms_entradas.sql', nombre: 'wms_0004_entradas' },
  { archivo: 'migrations/0005_wms_flujo_ingreso.sql', nombre: 'wms_0005_flujo_ingreso' },
  { archivo: 'migrations/0006_wms_regulatorio_y_verificacion.sql', nombre: 'wms_0006_regulatorio_y_verificacion' },
  { archivo: 'migrations/0007_wms_inventario.sql', nombre: 'wms_0007_inventario' },
  { archivo: 'migrations/0009_wms_operacion_diaria_y_reportes.sql', nombre: 'wms_0009_operacion_diaria_y_reportes' },
  { archivo: 'migrations/0008_wms_presentacion_principio_activo.sql', nombre: 'wms_0008_presentacion_principio_activo' },
  { archivo: 'seeds/0001_topologia.sql', nombre: null }, // datos de topología: no es una migración, no va al historial
]

const CABECERA = `set lock_timeout = '5s';
set statement_timeout = '60s';`

export function armarBloques({ versionBase, raiz = RAIZ }) {
  if (!/^\d{14}$/.test(versionBase) || Number(versionBase.slice(12)) > 49) {
    throw new Error('versionBase debe ser AAAAMMDDHHMMSS (14 dígitos) con segundos entre 00 y 49, por ejemplo 20261018210000')
  }
  const total = PASOS.length
  return PASOS.map((p, i) => {
    const n = String(i + 1).padStart(2, '0')
    const version = p.nombre ? String(BigInt(versionBase) + BigInt(i)) : null
    const cuerpo = readFileSync(resolve(raiz, 'supabase', p.archivo), 'utf8').trimEnd()
    const historial = p.nombre
      ? `\n\n-- Registro en el historial de migraciones.\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${p.nombre}') on conflict (version) do nothing;\n`
      : '\n'
    const sql = `-- ═══ VENTANA WMS · PASO ${n} de ${total} · ${p.archivo} ═══
-- Pega TODO este texto en el SQL Editor y ejecútalo UNA sola vez.
-- Si falla o se cuelga: DETENTE y avisa. No reintentes ni partas el texto sin aprobación.
${CABECERA}

${cuerpo}${historial}`
    return { orden: i + 1, archivo: `${n}-${(p.nombre ?? 'seed_topologia').replace(/^wms_/, '')}.sql`, origen: p.archivo, version, nombre: p.nombre, sql }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [salida, versionBase] = process.argv.slice(2)
  if (!salida || !versionBase) { console.error('Uso: node scripts/ventana-supabase.mjs <carpeta_de_salida> <AAAAMMDDHHMMSS>'); process.exit(1) }
  mkdirSync(salida, { recursive: true })
  for (const b of armarBloques({ versionBase })) {
    writeFileSync(resolve(salida, b.archivo), b.sql)
    console.log(`${b.archivo}  (${(b.sql.length / 1024).toFixed(0)} KB)${b.version ? `  versión ${b.version}` : ''}`)
  }
}
