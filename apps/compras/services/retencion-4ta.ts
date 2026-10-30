import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { anioMesStorageLima } from '@/domain/fecha'
import {
  calcularRxh, constanciaVigentePara, esRucDePersonaNatural,
  type CalculoRxh, type Constancia4ta,
} from '@/domain/retencion-4ta'
import type { FuenteProveedor } from '@/domain/proveedor'

/**
 * Constancias de suspensión de 4ta y el cálculo de un RxH contra la base.
 * Ver domain/retencion-4ta.ts para la regla y migración 0084 para el modelo.
 */

export type ConstanciaGuardada = Constancia4ta & {
  id: string
  storagePath: string
  anuladaMotivo: string | null
}

const columnaProveedor = (fuente: FuenteProveedor) =>
  fuente === 'servicio' ? 'proveedor_servicio_id' : 'proveedor_id'

/**
 * Quien registra o anula una constancia — misma regla que la RLS (0084 y
 * 0085). Contabilidad, y Gestión Humana desde el 2026-10-30 (Sebas): es
 * Arlette quien recibe la constancia del profesional al registrar su RxH.
 */
export const AREAS_GESTIONAN_CONSTANCIAS = ['contabilidad', 'gestion_humana', 'admin'] as const

export async function puedeGestionarConstancias(): Promise<boolean> {
  const perfil = await perfilActual()
  return (AREAS_GESTIONAN_CONSTANCIAS as readonly string[]).includes(perfil?.area ?? '')
}

export async function listarConstancias(fuente: FuenteProveedor, proveedorId: string): Promise<ConstanciaGuardada[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('constancias_suspension_4ta')
    .select('id, ejercicio, numero, fecha_emision, storage_path, anulada_en, anulada_motivo')
    .eq(columnaProveedor(fuente), proveedorId)
    .order('ejercicio', { ascending: false })
  if (error) throw new Error(`No se pudieron leer las constancias: ${error.message}`)
  return (data ?? []).map((c: any) => ({
    id: c.id,
    ejercicio: c.ejercicio,
    numero: c.numero,
    fechaEmision: c.fecha_emision,
    storagePath: c.storage_path,
    anulada: !!c.anulada_en,
    anuladaMotivo: c.anulada_motivo ?? null,
  }))
}

async function rucDe(fuente: FuenteProveedor, proveedorId: string): Promise<string | null> {
  const supabase = crearClienteServidor()
  const { data } = fuente === 'servicio'
    ? await supabase.schema('servicios').from('proveedores_servicio').select('ruc').eq('id', proveedorId).maybeSingle()
    : await supabase.schema('compras').from('proveedores').select('ruc').eq('id', proveedorId).maybeSingle()
  return (data as any)?.ruc ?? null
}

/** Lo que la pantalla de Pago Directo necesita saber del profesional. */
export async function situacionRetencion(fuente: FuenteProveedor, proveedorId: string, fecha: string): Promise<{
  personaNatural: boolean
  constancia: Pick<Constancia4ta, 'numero' | 'ejercicio'> | null
}> {
  const [ruc, constancias] = await Promise.all([rucDe(fuente, proveedorId), listarConstancias(fuente, proveedorId)])
  const vigente = constanciaVigentePara(constancias, fecha)
  return {
    personaNatural: esRucDePersonaNatural(ruc),
    constancia: vigente ? { numero: vigente.numero, ejercicio: vigente.ejercicio } : null,
  }
}

/**
 * El cálculo de un RxH que se GUARDA: la constancia se busca acá, en la
 * base, nunca se toma del formulario. Del formulario solo viene "Retener
 * igual" (un recibo ≤ S/ 1,500 que el profesional prefiere que se le
 * retenga), que no cambia nada en un recibo que supera el umbral.
 */
export async function calcularRxhParaGuardar(input: {
  fuente: FuenteProveedor
  proveedorId: string
  fechaRecibo: string
  monto: number
  moneda: string
  tipoCambio?: number | null
  retenerIgual?: boolean
}): Promise<CalculoRxh> {
  const situacion = await situacionRetencion(input.fuente, input.proveedorId, input.fechaRecibo)
  if (!situacion.personaNatural) {
    throw new Error('Un Recibo por Honorarios solo lo emite una persona natural (RUC que empieza con 10). Revisa el proveedor o el tipo de comprobante.')
  }
  return calcularRxh({
    monto: input.monto,
    moneda: input.moneda,
    tipoCambio: input.tipoCambio,
    constanciaVigente: !!situacion.constancia,
    retenerIgual: input.retenerIgual,
  })
}

export async function registrarConstancia(input: {
  fuente: FuenteProveedor
  proveedorId: string
  numero: string
  fechaEmision: string
  archivo: File
}): Promise<void> {
  if (!(await puedeGestionarConstancias())) throw new Error('Solo Contabilidad o Gestión Humana registran constancias de suspensión.')
  if (!input.numero.trim()) throw new Error('Falta el número de la constancia.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaEmision)) throw new Error('Falta la fecha de emisión.')
  if (!input.archivo || input.archivo.size === 0) {
    throw new Error('Adjunta la constancia: es el respaldo ante SUNAT de no haber retenido.')
  }
  const ruc = await rucDe(input.fuente, input.proveedorId)
  if (!esRucDePersonaNatural(ruc)) throw new Error('Solo un profesional con RUC 10 tiene constancia de suspensión de 4ta.')

  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const nombreLimpio = input.archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${anioMesStorageLima()}/CONST4TA-${ruc}/${Date.now()}-${nombreLimpio}`
  const { error: errSubida } = await supabase.storage
    .from('legajos-compras')
    .upload(path, input.archivo, { contentType: input.archivo.type || undefined })
  if (errSubida) throw new Error(`No se pudo subir la constancia: ${errSubida.message}`)

  const { error } = await supabase
    .schema('cuentas_x_pagar')
    .from('constancias_suspension_4ta')
    .insert({
      [columnaProveedor(input.fuente)]: input.proveedorId,
      ejercicio: Number(input.fechaEmision.slice(0, 4)),
      numero: input.numero.trim(),
      fecha_emision: input.fechaEmision,
      storage_path: path,
      registrada_por: usuario.id,
    })
  if (error) {
    if (error.code === '23505') throw new Error(`Ya hay una constancia vigente de ${input.fechaEmision.slice(0, 4)} para este profesional. Anúlala primero si estaba mal.`)
    throw new Error(`No se pudo registrar la constancia: ${error.message}`)
  }
}

export async function anularConstancia(id: string, motivo: string): Promise<void> {
  if (!(await puedeGestionarConstancias())) throw new Error('Solo Contabilidad o Gestión Humana anulan constancias de suspensión.')
  if (!motivo.trim()) throw new Error('Cuenta por qué se anula.')
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const { error } = await supabase
    .schema('cuentas_x_pagar')
    .from('constancias_suspension_4ta')
    .update({ anulada_en: new Date().toISOString(), anulada_por: usuario.id, anulada_motivo: motivo.trim() })
    .eq('id', id)
    .is('anulada_en', null)
  if (error) throw new Error(`No se pudo anular: ${error.message}`)
}

export async function urlConstancia(storagePath: string): Promise<string | null> {
  const supabase = crearClienteServidor()
  const { data } = await supabase.storage.from('legajos-compras').createSignedUrl(storagePath, 60)
  return data?.signedUrl ?? null
}
