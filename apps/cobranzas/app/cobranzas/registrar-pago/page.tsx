import { perfilActual } from '@logisalud/auth/server';
import { AREAS_ESCRITURA } from '@/lib/autorizacion';
import RegistrarPagoVista from './vista';

/**
 * Envoltura de servidor de /cobranzas/registrar-pago.
 *
 * Mismo patrón que estado-cuenta/page.tsx: el toggle de contado_pendiente es
 * un PATCH a /api/documentos/[id]/contado-pendiente, que exige área de
 * escritura. Sin esto, gerencia veía el control y recibía un 403 al tocarlo.
 */
export default async function RegistrarPagoPage() {
  const perfil = await perfilActual();
  const area = perfil?.area ?? '';
  const puedeEditarContado = area === 'admin' || (AREAS_ESCRITURA as readonly string[]).includes(area);

  return <RegistrarPagoVista puedeEditarContado={puedeEditarContado} />;
}
