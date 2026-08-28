import { perfilActual } from '@logisalud/auth/server';
import { AREAS_ASIGNACION } from '@/lib/autorizacion';
import VendedoresLinksVista from './vista';

/**
 * Envoltura de servidor de /cobranzas/vendedores-links.
 *
 * Mismo patrón que contados-pendientes: esta pantalla existe solo para ver y
 * rotar tokens de acceso de vendedores, acción que ahora exige
 * AREAS_ASIGNACION (grupo F). No tiene vista de solo lectura aparte, así que
 * a quien no tiene el área se le bloquea la pantalla entera en vez de
 * dejarla cargar y que el fetch le devuelva 403.
 */
export default async function VendedoresLinksPage() {
  const perfil = await perfilActual();
  const area = perfil?.area ?? '';
  const puedeVer = area === 'admin' || (AREAS_ASIGNACION as readonly string[]).includes(area);

  if (!puedeVer) {
    return (
      <div className="min-h-screen bg-gray-50 font-poppins flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-gray-700 font-medium">Este módulo no está disponible para tu área</p>
          <p className="text-gray-400 text-sm mt-1">
            Links de vendedores es solo para ver y rotar tokens de acceso.
          </p>
          <a href="/cobranzas" className="inline-block mt-4 text-sm font-medium" style={{ color: '#4BB168' }}>
            ← Volver al menú
          </a>
        </div>
      </div>
    );
  }

  return <VendedoresLinksVista />;
}
