import { supabaseAdmin } from '@/lib/supabase';

export interface VendedorDelLink {
  id: string;
  nombres: string;
  apellidos: string | null;
  codigo: string | null;
}

/**
 * Quién es el dueño de un link `/v/[token]`.
 *
 * El token es la única credencial que tiene el vendedor: no hay login en esa
 * vista. Todas las rutas públicas que sirven datos del vendedor resuelven la
 * identidad acá y nunca aceptan un `vendedor_id` por querystring — el link
 * jamás expone el UUID interno.
 */
export async function vendedorPorToken(token: string): Promise<VendedorDelLink | null> {
  const limpio = token?.trim() ?? '';
  if (limpio.length < 16) return null;

  const db = supabaseAdmin();
  const { data } = await db
    .from('vendedores')
    .select('id, nombres, apellidos, codigo, activo')
    .eq('token_acceso', limpio)
    .single();

  if (!data || !data.activo) return null;
  return { id: data.id, nombres: data.nombres, apellidos: data.apellidos, codigo: data.codigo };
}

/**
 * ¿Este cliente es de este vendedor?
 *
 * Es el filtro de permisos de todo el estado de cuenta en el link: un
 * vendedor ve el historial de SUS clientes y de ningún otro. Se pregunta por
 * las dos vías porque ninguna sola alcanza: `v_saldos.vendedor_id` cubre a
 * quien le facturó (incluso si después se reasignó la zona), y
 * `clientes.vendedor_actual_id` cubre al cliente que todavía no tiene una
 * sola factura emitida.
 */
export async function clienteEsDelVendedor(ruc: string, vendedorId: string): Promise<boolean> {
  const db = supabaseAdmin();

  const { data: doc } = await db
    .from('v_saldos')
    .select('id')
    .eq('cliente_ruc', ruc)
    .eq('vendedor_id', vendedorId)
    .limit(1);
  if ((doc ?? []).length > 0) return true;

  const { data: cli } = await db
    .from('clientes')
    .select('ruc')
    .eq('ruc', ruc)
    .eq('vendedor_actual_id', vendedorId)
    .limit(1);
  return (cli ?? []).length > 0;
}
