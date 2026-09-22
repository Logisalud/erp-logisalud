/**
 * "De S/ X de factura, ¿por qué el saldo es S/ Y?" — en una columna que suma.
 *
 * La regla de esta pantalla: toda línea que baje el saldo tiene que estar
 * escrita. Si algo no encaja, se escribe también, en ámbar, en vez de dejar
 * que la resta no cierre en silencio (ver lib/desglose.ts).
 */

import { calcularDesglose, type EntradaDesglose } from '@/lib/desglose';

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export interface PropsDesglose extends EntradaDesglose {
  /** Para el "(3 de 5)" al lado de las letras pagadas. */
  letrasPagadas?: number;
  letrasTotal?: number;
}

function Fila({ etiqueta, monto, signo, clase, nota }: {
  etiqueta: React.ReactNode; monto: number; signo: '+' | '−'; clase: string; nota?: string;
}) {
  return (
    <div className={`flex justify-between items-center ${clase}`}>
      <span>
        ({signo}) {etiqueta}
        {nota && <span className="block text-xs text-amber-600/80 mt-0.5">{nota}</span>}
      </span>
      <span className="font-medium tabular-nums shrink-0">{signo} {fmt(monto)}</span>
    </div>
  );
}

export default function DesgloseDelSaldo(p: PropsDesglose) {
  const d = calcularDesglose(p);
  const hayDiferencia = Number.isNaN(d.sinExplicar) || Math.abs(d.sinExplicar) > 0.004;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
        <h3 className="font-oswald text-sm text-gray-600 tracking-wide uppercase">Desglose del saldo</h3>
      </div>
      <div className="px-5 py-4 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Importe de la factura</span>
          <span className="font-medium text-gray-800 tabular-nums">{fmt(p.importeTotal)}</span>
        </div>

        {p.totalNc > 0 && (
          <Fila etiqueta="Notas de crédito aplicadas" monto={p.totalNc} signo="−" clase="text-purple-700" />
        )}
        {p.totalNd > 0 && (
          <Fila etiqueta="Notas de débito aplicadas" monto={p.totalNd} signo="+" clase="text-blue-700" />
        )}
        {p.totalPagos > 0 && (
          <Fila etiqueta="Pagos registrados" monto={p.totalPagos} signo="−" clase="text-green-700" />
        )}
        {p.totalRetencion > 0 && (
          <div className="flex justify-between items-center" style={{ color: '#4ABCC2' }}>
            <span>(−) Retención IGV</span>
            <span className="font-medium tabular-nums">− {fmt(p.totalRetencion)}</span>
          </div>
        )}
        {p.totalLetrasPagadas > 0 && (
          <Fila
            etiqueta={
              <>
                Letras pagadas{' '}
                {p.letrasTotal ? (
                  <span className="text-gray-400 text-xs">({p.letrasPagadas} de {p.letrasTotal})</span>
                ) : null}
              </>
            }
            monto={p.totalLetrasPagadas}
            signo="−"
            clase="text-teal-700"
          />
        )}

        {hayDiferencia && (
          Number.isNaN(d.sinExplicar) ? (
            <p className="text-amber-700">
              {d.etiqueta}
              {d.nota && <span className="block text-xs text-amber-600/80 mt-0.5">{d.nota}</span>}
            </p>
          ) : (
            <Fila
              etiqueta={d.etiqueta}
              monto={Math.abs(d.sinExplicar)}
              signo={d.sinExplicar > 0 ? '−' : '+'}
              clase={d.esProblema ? 'text-amber-700' : 'text-gray-500'}
              nota={d.nota && `${d.nota} Revisar con Administración.`}
            />
          )
        )}

        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="font-semibold text-gray-700">(=) Saldo pendiente</span>
          <span className={`font-bold tabular-nums text-base ${p.saldoPendiente > 0 ? 'text-orange-600' : 'text-green-600'}`}>
            {fmt(p.saldoPendiente)}
          </span>
        </div>
      </div>
    </div>
  );
}
