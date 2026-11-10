#!/usr/bin/env node
// Reinicio del piloto (el 1 de diciembre). Script MANUAL: no hay botón en la aplicación. Por defecto SIMULA (cuenta tablas y archivos, no borra nada).
//   Simular:  node apps/wms/scripts/reinicio-piloto.mjs --db-url postgres://...            (opcional: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para listar el bucket)
//   Ejecutar: node apps/wms/scripts/reinicio-piloto.mjs --ejecutar --confirmo-copia-del-dia AAAA-MM-DD --db-url postgres://...
// Sin la bandera de la copia del día (o con otra fecha que hoy), se niega. Ver docs/wms/piloto/reinicio.md. NUNCA contra una base real sin esa copia.
import pg from 'pg'
import { almacenSupabase, exigirCopiaDelDia, leerArgumentos, reiniciar } from './reinicio-piloto-lib.mjs'

const AYUDA = 'Uso: reinicio-piloto.mjs [--simular] [--ejecutar --confirmo-copia-del-dia AAAA-MM-DD] [--salida carpeta] [--db-url url]\nSin --ejecutar solo simula.'
try {
  const args = leerArgumentos(process.argv.slice(2))
  if (args.ayuda) { console.log(AYUDA); process.exit(0) }
  if (args.ejecutar) exigirCopiaDelDia(args)
  const url = args.dbUrl ?? process.env.WMS_REINICIO_DATABASE_URL
  if (!url) throw new Error('Falta la conexión: --db-url o WMS_REINICIO_DATABASE_URL.')
  const almacen = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? await almacenSupabase({ url: process.env.SUPABASE_URL, llave: process.env.SUPABASE_SERVICE_ROLE_KEY }) : null
  if (!almacen) console.warn('Aviso: sin SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY no se listan ni se borran archivos del bucket.')
  const c = new pg.Client({ connectionString: url }); await c.connect()
  try {
    const informe = await reiniciar(c, { ejecutar: args.ejecutar, almacen, salida: args.salida, ejecutadoPor: process.env.USER ?? 'script', fechaCopia: args.copia })
    console.log(JSON.stringify(informe, null, 2))
    console.log(args.ejecutar ? 'Reinicio hecho y registrado en wms.reinicios.' : 'SIMULACIÓN: no se borró nada. Para ejecutar: --ejecutar --confirmo-copia-del-dia AAAA-MM-DD.')
  } finally { await c.end() }
} catch (e) { console.error(`ERROR: ${e instanceof Error ? e.message : e}`); process.exit(2) }
