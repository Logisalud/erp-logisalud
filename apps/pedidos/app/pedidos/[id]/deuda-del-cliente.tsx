import type { DeudaDelCliente } from "@/services/credito";

const soles = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });

const cuando = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" });

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

      <p className="mt-1 text-sm">
        {hayVencido ? (
          <span className="font-medium text-red-700">
            {soles(deuda.vencido)} vencidos · {deuda.diasAtraso}{" "}
            {deuda.diasAtraso === 1 ? "día" : "días"} de atraso
          </span>
        ) : (
          <span className="font-medium text-gray-900">Sin nada vencido</span>
        )}
        <span className="text-gray-600"> · deuda total {soles(deuda.saldo)}</span>
      </p>

      {grave && (
        <p className="mt-2 text-sm text-red-700">
          Con este atraso el pedido <strong>no se puede enviar</strong>. No es algo que se apruebe:
          hay que regularizar la deuda con Cobranzas y volver a intentarlo.
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
