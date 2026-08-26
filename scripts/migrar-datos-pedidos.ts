/**
 * Migración de los datos reales de Pedidos al proyecto consolidado.
 *
 * Script de administración, se corre una sola vez. Copia de proyecto a
 * proyecto: no puede ser una migración SQL, porque origen y destino son dos
 * bases Supabase distintas.
 *
 *   ORIGEN  Logisalud_pedidos  (dfqhxwkdflnkcjnysbwu) — el de Andrés
 *   DESTINO erp-cobranzas      (qpkigzniatidsvnxikox) — el consolidado
 *
 * QUÉ COPIA, y a dónde va cada cosa
 *
 *   pedidos.products          -> catalogo.productos        (162 filas)
 *   pedidos.suppliers         -> compras.proveedores       (4)
 *   pedidos.price_lists       -> pedidos.price_lists       (4)
 *   pedidos.price_list_items  -> pedidos.price_list_items  (1 211)
 *   pedidos.product_tax_profiles -> idem                   (217)
 *   pedidos.customers         -> pedidos.cliente_config    (3 402)
 *
 * Lo que NO copia, y por qué:
 *   - pedidos.sellers / zones: los catálogos reales ya están en public.
 *   - pedidos.profiles / roles / user_roles: los reemplaza public.perfiles.
 *   - pedidos.orders (18): pedidos de prueba del entorno de Andrés. Si hace
 *     falta traerlos, es un paso aparte y depende de que exista
 *     pedidos.orders en el destino.
 *
 * CÓMO CORRERLO
 *
 *     ORIGEN_URL=https://dfqhxwkdflnkcjnysbwu.supabase.co \
 *     ORIGEN_SERVICE_KEY=<service_role del proyecto de Andrés> \
 *     DESTINO_URL=https://qpkigzniatidsvnxikox.supabase.co \
 *     DESTINO_SERVICE_KEY=<service_role del consolidado> \
 *     npx tsx scripts/migrar-datos-pedidos.ts --dry-run
 *
 * Sacá --dry-run para escribir. Es idempotente: usa upsert por la clave
 * natural de cada tabla, así que se puede reintentar sin duplicar.
 *
 * REQUISITO: las migraciones 0005, 1000 y 1001 tienen que estar aplicadas en
 * el destino. Si no, las tablas no existen y el script falla al primer POST.
 */

import { setTimeout as esperar } from 'node:timers/promises'

const ORIGEN_URL = process.env.ORIGEN_URL
const ORIGEN_KEY = process.env.ORIGEN_SERVICE_KEY
const DESTINO_URL = process.env.DESTINO_URL
const DESTINO_KEY = process.env.DESTINO_SERVICE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!ORIGEN_URL || !ORIGEN_KEY || !DESTINO_URL || !DESTINO_KEY) {
  console.error(
    'Faltan variables. Ver el encabezado de este archivo para el comando completo.'
  )
  process.exit(1)
}

const LOTE = 500

type Ctx = { url: string; key: string; schema: string }
const origen = (schema: string): Ctx => ({ url: ORIGEN_URL!, key: ORIGEN_KEY!, schema })
const destino = (schema: string): Ctx => ({ url: DESTINO_URL!, key: DESTINO_KEY!, schema })

async function pedir(ctx: Ctx, ruta: string, init: RequestInit = {}) {
  const res = await fetch(`${ctx.url}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: ctx.key,
      Authorization: `Bearer ${ctx.key}`,
      'Content-Type': 'application/json',
      'Accept-Profile': ctx.schema,
      'Content-Profile': ctx.schema,
      ...(init.headers ?? {}),
    },
  })
  const texto = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${ruta}: ${texto.slice(0, 300)}`)
  return texto ? JSON.parse(texto) : null
}

/** Trae una tabla completa, paginando: PostgREST tope las respuestas en 1.000. */
async function leerTodo(ctx: Ctx, tabla: string, columnas = '*'): Promise<any[]> {
  const filas: any[] = []
  for (let desde = 0; ; desde += 1000) {
    const lote = await pedir(ctx, `${tabla}?select=${columnas}&limit=1000&offset=${desde}`)
    filas.push(...lote)
    if (lote.length < 1000) break
  }
  return filas
}

async function escribir(ctx: Ctx, tabla: string, filas: any[], onConflict: string) {
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE)
    await pedir(ctx, `${tabla}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(lote),
    })
    await esperar(50)
  }
}

const resumen: { tabla: string; origen: number; escritas: number; destino: number }[] = []

async function paso(
  nombre: string,
  tablaDestino: string,
  schemaDestino: string,
  onConflict: string,
  cargar: () => Promise<any[]>
) {
  const filas = await cargar()
  const ctx = destino(schemaDestino)
  const antes = DRY_RUN ? 0 : (await pedir(ctx, `${tablaDestino}?select=count`))[0]?.count ?? 0

  if (!DRY_RUN && filas.length) await escribir(ctx, tablaDestino, filas, onConflict)

  const despues = DRY_RUN ? 0 : (await pedir(ctx, `${tablaDestino}?select=count`))[0]?.count ?? 0
  resumen.push({ tabla: nombre, origen: filas.length, escritas: filas.length, destino: despues })
  console.log(
    `  ${nombre.padEnd(34)} origen ${String(filas.length).padStart(5)}` +
      (DRY_RUN ? '   (dry-run, no escribe)' : `   destino ${antes} -> ${despues}`)
  )
}

async function main() {
  console.log(`Migración de datos de Pedidos${DRY_RUN ? '  (DRY RUN)' : ''}\n`)

  // --- Proveedores: pedidos.suppliers -> compras.proveedores -------------
  // suppliers solo tiene nombre y estado; proveedores exige ruc unique. Sin
  // RUC real se usa un placeholder marcado, para completarlo después sin
  // perder el vínculo con los productos.
  const suppliers = await leerTodo(origen('pedidos'), 'suppliers')
  const mapaProveedor = new Map<number, string>()
  await paso('suppliers -> compras.proveedores', 'proveedores', 'compras', 'ruc', async () =>
    suppliers.map((s) => ({
      ruc: `PENDIENTE-${String(s.id).padStart(3, '0')}`,
      razon_social: s.nombre,
      activo: s.estado === 'activo',
    }))
  )
  if (!DRY_RUN) {
    const creados = await leerTodo(destino('compras'), 'proveedores', 'id,ruc')
    for (const s of suppliers) {
      const m = creados.find((p: any) => p.ruc === `PENDIENTE-${String(s.id).padStart(3, '0')}`)
      if (m) mapaProveedor.set(s.id, m.id)
    }
  }

  // --- Productos: pedidos.products -> catalogo.productos ----------------
  const products = await leerTodo(origen('pedidos'), 'products')
  const mapaProducto = new Map<string, string>()
  await paso('products -> catalogo.productos', 'productos', 'catalogo', 'codigo', async () =>
    products.map((p) => ({
      codigo: p.codigo_interno,
      codigo_proveedor: p.codigo_proveedor,
      codigo_bonificacion: p.codigo_bonificacion,
      descripcion: p.descripcion,
      presentacion: p.presentacion,
      marca: p.marca,
      principio_activo: p.principio_activo,
      unidad_medida: p.unidad_medida,
      proveedor_id: mapaProveedor.get(p.supplier_id) ?? null,
      controla_lote: p.controla_lote,
      controla_vencimiento: p.controla_vencimiento,
      peso_unitario: p.peso_unitario_futuro,
      estado: p.estado,
      nota_estado: p.nota_estado ?? null,
    }))
  )
  if (!DRY_RUN) {
    const creados = await leerTodo(destino('catalogo'), 'productos', 'id,codigo')
    for (const p of products) {
      const m = creados.find((c: any) => c.codigo === p.codigo_interno)
      if (m) mapaProducto.set(p.id, m.id)
    }
  }

  // --- Clientes: pedidos.customers -> pedidos.cliente_config ------------
  // Solo los que existan en public.clientes: cliente_config tiene FK al RUC.
  // Los que no matcheen se listan al final para revisar a mano.
  const customers = await leerTodo(origen('pedidos'), 'customers')
  const rucsDestino = new Set(
    DRY_RUN ? [] : (await leerTodo(destino('public'), 'clientes', 'ruc')).map((c: any) => c.ruc.trim())
  )
  const sinCliente: string[] = []
  await paso(
    'customers -> pedidos.cliente_config',
    'cliente_config',
    'pedidos',
    'cliente_ruc',
    async () =>
      customers
        .filter((c) => {
          const ruc = String(c.ruc_o_documento ?? '').trim()
          if (ruc.length !== 11) { sinCliente.push(`${ruc} (no es RUC de 11)`); return false }
          if (!DRY_RUN && !rucsDestino.has(ruc)) { sinCliente.push(`${ruc} (no está en public.clientes)`); return false }
          return true
        })
        .map((c) => ({
          cliente_ruc: String(c.ruc_o_documento).trim(),
          tipo_comprobante_permitido: c.tipo_comprobante_permitido,
          whatsapp: c.whatsapp,
          es_agente_retencion: c.es_agente_retencion,
          fecha_ultima_validacion_tributaria: c.fecha_ultima_validacion_tributaria,
          estado: c.estado,
          fecha_validacion: c.fecha_validacion,
        }))
  )

  // --- Precios ----------------------------------------------------------
  const taxProfiles = await leerTodo(origen('pedidos'), 'product_tax_profiles')
  await paso(
    'product_tax_profiles',
    'product_tax_profiles',
    'pedidos',
    'id',
    async () =>
      taxProfiles
        .filter((t) => DRY_RUN || mapaProducto.has(t.product_id))
        .map((t) => ({
          producto_id: mapaProducto.get(t.product_id),
          afectacion_tributaria: t.afectacion_tributaria,
          tasa_aplicable: t.tasa_aplicable,
          vvf_sin_igv: t.vvf_sin_igv,
          vvd_sin_igv: t.vvd_sin_igv,
          costo_referencial_distribuidora: t.costo_referencial_distribuidora,
          fecha_vigencia_proveedor: t.fecha_vigencia_proveedor,
          vigente_desde: t.vigente_desde,
          vigente_hasta: t.vigente_hasta,
        }))
  )

  const priceLists = await leerTodo(origen('pedidos'), 'price_lists')
  await paso('price_lists', 'price_lists', 'pedidos', 'id', async () =>
    priceLists.map((p) => ({
      id: p.id,
      proveedor_id: mapaProveedor.get(p.supplier_id) ?? null,
      fecha_inicio: p.fecha_inicio,
      fecha_fin: p.fecha_fin,
      archivo_nombre: p.archivo_nombre,
      archivo_storage_path: p.archivo_storage_path,
      importado_por: p.importado_por,
      publicado_en: p.publicado_en,
    }))
  )

  const items = await leerTodo(origen('pedidos'), 'price_list_items')
  await paso(
    'price_list_items',
    'price_list_items',
    'pedidos',
    'price_list_id,producto_id,sales_channel_id',
    async () =>
      items
        .filter((i) => DRY_RUN || mapaProducto.has(i.product_id))
        .map((i) => ({
          price_list_id: i.price_list_id,
          producto_id: mapaProducto.get(i.product_id),
          sales_channel_id: i.sales_channel_id,
          precio: i.precio,
          vigente_hasta: i.vigente_hasta ?? null,
        }))
  )

  console.log('\n=========== RESUMEN ===========')
  for (const r of resumen) {
    console.log(`  ${r.tabla.padEnd(34)} origen ${r.origen}  destino ${r.destino}`)
  }
  if (sinCliente.length) {
    console.log(`\nClientes de Pedidos que NO entraron (${sinCliente.length}):`)
    for (const s of sinCliente.slice(0, 40)) console.log(`  ! ${s}`)
    if (sinCliente.length > 40) console.log(`  … y ${sinCliente.length - 40} más`)
    console.log('  Revisar a mano: o falta el cliente en public.clientes, o el documento no es un RUC.')
  }
  console.log(
    '\nOJO: los proveedores entraron con RUC placeholder PENDIENTE-NNN, porque\n' +
      'pedidos.suppliers no guardaba RUC. Hay que completarlos con el real antes\n' +
      'de emitir la primera orden de compra.'
  )
}

main().catch((e) => {
  console.error(`\nError: ${(e as Error).message}`)
  process.exit(1)
})
