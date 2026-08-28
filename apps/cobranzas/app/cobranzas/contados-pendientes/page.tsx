import { perfilActual } from '@logisalud/auth/server';
import { AREAS_ESCRITURA } from '@/lib/autorizacion';
import ContadosPendientesVista from './vista';

/**
 * Envoltura de servidor de /cobranzas/contados-pendientes.
 *
 * Esta pantalla existe solo para marcar un CONTADO como pagado (mismo PATCH
 * que estado-cuenta y registrar-pago, ahora restringido a área de
 * escritura). No tiene ninguna vista de solo lectura aparte: para quien no
 * puede escribir, mostrar la pantalla es mostrar una tabla sin ninguna
 * acción posible. Se bloquea acá mismo, no solo ocultando el tile del menú
 * en app/cobranzas/page.tsx — entrar por la URL directa tiene que dar el
 * mismo resultado.
 */
export default async function ContadosPendientesPage() {
  const perfil = await perfilActual();
  const area = perfil?.area ?? '';
  const puedeEditarContado = area === 'admin' || (AREAS_ESCRITURA as readonly string[]).includes(area);

  if (!puedeEditarContado) {
    return (
      <div className="min-h-screen bg-gray-50 font-poppins flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-gray-700 font-medium">Este módulo no está disponible para tu área</p>
          <p className="text-gray-400 text-sm mt-1">
            Contados Pendientes es solo para marcar facturas CONTADO como cobradas.
          </p>
          <a href="/cobranzas" className="inline-block mt-4 text-sm font-medium" style={{ color: '#4BB168' }}>
            ← Volver al menú
          </a>
        </div>
      </div>
    );
  }

  return <ContadosPendientesVista />;
}
