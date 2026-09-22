/**
 * Detalle de las letras de cambio de una factura.
 *
 * Es la misma tabla en los dos lugares donde se mira una factura canjeada
 * por letras: el panel de administración (estado de cuenta) y el link de
 * cobranza que usa cada vendedor. Vive acá para que sigan siendo la misma:
 * cuando el vendedor y Administración discuten una letra por teléfono
 * tienen que estar mirando exactamente lo mismo.
 *
 * Muestra TODAS las letras del documento, incluidas las pagadas: media
 * letra pagada es la mitad de la conversación ("de las 5 cuotas ya pagó 4,
 * falta la de setiembre").
 */

export interface LetraDetalle {
  numero_letra: string;
  importe: number;
  fecha_giro: string | null;
  fecha_vencimiento: string;
  banco: string | null;
  estado: string;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

/** Una letra vencida que todavía no se pagó: es la que hay que ir a cobrar. */
const vencidaSinPagar = (l: LetraDetalle, hoyISO: string) =>
  l.estado !== 'pagada' && l.fecha_vencimiento < hoyISO;

export function EstadoLetraBadge({ estado }: { estado: string }) {
  const estilos: Record<string, string> = {
    'en_cartera': 'bg-gray-100 text-gray-600',
    'en_banco':   'bg-teal-100 text-teal-700',
    'pagada':     'bg-green-100 text-green-700',
    'protestada': 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    'en_cartera': 'En cartera',
    'en_banco':   'En banco',
    'pagada':     'Pagada',
    'protestada': 'Protestada',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${estilos[estado] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[estado] ?? estado}
    </span>
  );
}

export default function DetalleLetras({
  letras, comprobante, hoyISO,
}: {
  letras: LetraDetalle[];
  comprobante: string;
  /** Fecha de hoy (ISO) para marcar en rojo las letras vencidas sin pagar. */
  hoyISO: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4ABCC2' }}>
        Letras de cambio — {comprobante}
      </p>
      {letras.length === 0 ? (
        <p className="text-xs text-gray-400">Sin letras registradas</p>
      ) : (
        <>
          {/* Pantalla ancha (el panel de admin, y el celular apaisado): la
              tabla de siempre. */}
          <table className="w-full text-xs hidden sm:table">
            <thead>
              <tr className="text-gray-400 uppercase tracking-wide">
                <th className="py-1 pr-4 text-left font-semibold">Nº Letra</th>
                <th className="py-1 pr-4 text-right font-semibold">Importe</th>
                <th className="py-1 pr-4 text-left font-semibold">F. Giro</th>
                <th className="py-1 pr-4 text-left font-semibold">F. Vencimiento</th>
                <th className="py-1 pr-4 text-left font-semibold">Banco</th>
                <th className="py-1 text-left font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal-100">
              {letras.map(l => (
                <tr key={l.numero_letra} className="hover:bg-white/60">
                  <td className="py-1.5 pr-4 font-mono">{l.numero_letra}</td>
                  <td className="py-1.5 pr-4 text-right font-medium">{fmt(Number(l.importe))}</td>
                  <td className="py-1.5 pr-4 text-gray-500">{fmtFecha(l.fecha_giro)}</td>
                  <td className={`py-1.5 pr-4 font-medium ${vencidaSinPagar(l, hoyISO) ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmtFecha(l.fecha_vencimiento)}
                  </td>
                  <td className="py-1.5 pr-4 text-gray-400">{l.banco ?? '—'}</td>
                  <td className="py-1.5"><EstadoLetraBadge estado={l.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Celular: los mismos seis datos en dos líneas. Una tabla de seis
              columnas no entra en 390px y lo primero que se sale de pantalla
              es justo el Estado, que es lo que el vendedor vino a ver. */}
          <ul className="sm:hidden divide-y divide-teal-100">
            {letras.map(l => (
              <li key={l.numero_letra} className="py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-gray-700">{l.numero_letra}</span>
                  <span className="text-xs font-medium text-gray-800">{fmt(Number(l.importe))}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-0.5">
                  <span className={`text-xs font-medium ${vencidaSinPagar(l, hoyISO) ? 'text-red-600' : 'text-gray-600'}`}>
                    Vence {fmtFecha(l.fecha_vencimiento)}
                  </span>
                  <EstadoLetraBadge estado={l.estado} />
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Giro {fmtFecha(l.fecha_giro)} · {l.banco ?? 'sin banco'}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
