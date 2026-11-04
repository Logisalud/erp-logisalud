import type { DeudaDelCliente } from "@/services/credito";

const soles = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });

const cuando = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" });

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/**
 * Lo que el cliente debe, a la vista mientras se arma el pedido.
 *
 * Enterarse al apretar "Enviar" es enterarse tarde: el vendedor ya se
 * comprometió con el cliente. Acá aparece antes, y dice qué va a pasar —no
 * solo que hay deuda— porque "tiene deuda" sin consecuencia se vuelve
 * paisaje en dos semanas.
 */
export function DeudaDelClienteAviso({ deuda }: { deuda: DeudaDelCliente }) {
  const hayVencido = deuda.vencido > 0;
  const grave = deuda.nivel === "bloqueo";

  return (
    <section
      className={`card p-4 ${deuda.nivel !== "ninguno" ? "border-red-300 bg-red-50/40" : hayVencido ? "border-amber-300 bg-amber-50/40" : ""}`}
    >
      <h3 className="font-heading text-base text-gray-900">Deuda del cliente</h3>

      {/*
        El total y los días son cosas distintas —el monto suma TODAS las
        facturas vencidas y los días son los de la más vieja— y pegados en
        una frase se leían como una sola factura de ese monto con esa
        antigüedad. Por eso se nombran por separado y abajo va el detalle.
      */}
      <p className="mt-1 text-sm">
        {hayVencido ? (
          <span className="font-medium text-red-700">
            {soles(deuda.vencido)} vencidos en {deuda.documentosVencidos}{" "}
            {deuda.documentosVencidos === 1 ? "factura" : "facturas"} · la más vieja,{" "}
            {dias(deuda.diasAtraso)} de atraso
          </span>
        ) : (
          <span className="font-medium text-gray-900">Sin nada vencido</span>
        )}
        <span className="text-gray-600"> · deuda total {soles(deuda.saldo)}</span>
      </p>

      {deuda.documentos.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600">
                <th className="py-1 pr-3 font-medium">Factura</th>
                <th className="py-1 pr-3 text-right font-medium">Vencido</th>
                <th className="py-1 text-right font-medium">Atraso</th>
              </tr>
            </thead>
            <tbody>
              {deuda.documentos.map((d) => (
                <tr key={d.comprobante} className="border-b border-gray-100 last:border-0">
                  <td className="cifra py-1 pr-3">
                    {d.comprobante}
                    {d.tieneLetras && (
                      <span className="ml-1 text-xs text-gray-500">(en letras)</span>
                    )}
                  </td>
                  <td className="cifra py-1 pr-3 text-right">{soles(d.saldoVencido)}</td>
                  <td className="cifra py-1 text-right">{dias(d.diasAtraso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {deuda.documentos.some((d) => d.tieneLetras) && (
            <p className="mt-1 text-xs text-gray-500">
              En las facturas canjeadas por letras solo se muestra lo que ya venció: el resto son
              letras que todavía no vencen.
            </p>
          )}
        </div>
      )}

      {grave && (
        <p className="mt-2 text-sm text-red-700">
          Con este atraso el pedido <strong>no se puede enviar</strong>. No es algo que se apruebe:
          hay que regularizar la deuda con Cobranzas y volver a intentarlo. Pagando las facturas
          más viejas el pedido vuelve a salir, porque los días que cuentan son los de la más
          antigua que siga impaga.
        </p>
      )}

      {deuda.nivel === "alerta" && (
        <p className="mt-2 text-sm text-red-700">
          Con esta deuda el pedido <strong>no va a salir a operaciones</strong>: al enviarlo queda
          esperando que el aprobador comercial lo autorice.
        </p>
      )}

      {deuda.reglaApagada && (
        <p className="mt-2 text-sm text-amber-900">
          Pasa la tolerancia, pero el freno por deuda todavía está apagado: el pedido va a salir
          igual.
        </p>
      )}

      <p className="mt-2 text-xs text-gray-500">
        Dato del ERP de cobranzas, actualizado el {cuando(deuda.actualizadoEn)}. Si el cliente ya
        pagó, Administración puede refrescarlo desde Crédito del cliente.
      </p>
    </section>
  );
}
