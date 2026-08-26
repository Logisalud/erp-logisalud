"use client";

import { useTransition } from "react";
import { documentoAlerta } from "@/domain/customers";
import type { PendingCustomer } from "@/services/customers";

export function CustomerValidationList({
  customers,
  onAprobar,
  onRechazar,
}: {
  customers: PendingCustomer[];
  onAprobar: (id: string) => Promise<void>;
  onRechazar: (id: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  if (customers.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No hay clientes pendientes de validación por ahora.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {customers.map((c) => {
        const direccionPrincipal =
          c.customer_addresses.find((a) => a.es_principal) ?? c.customer_addresses[0];
        const alertaDocumento = documentoAlerta(c.ruc_o_documento);

        return (
          <li key={c.id} className="card-highlight p-5">
            <p className="font-semibold">{c.razon_social}</p>
            {c.nombre_comercial && (
              <p className="text-sm text-gray-600">{c.nombre_comercial}</p>
            )}

            {alertaDocumento && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                ⚠ {alertaDocumento}
              </p>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-gray-500">Documento</dt>
              <dd>{c.ruc_o_documento}</dd>

              <dt className="text-gray-500">Dirección</dt>
              <dd>{direccionPrincipal ? direccionPrincipal.direccion : "—"}</dd>

              <dt className="text-gray-500">Ubigeo</dt>
              <dd>{direccionPrincipal?.ubigeo ?? "—"}</dd>

              <dt className="text-gray-500">Canal</dt>
              <dd>{c.canal?.nombre ?? "—"}</dd>

              <dt className="text-gray-500">Zona</dt>
              <dd>{c.zona?.nombre ?? "—"}</dd>

              <dt className="text-gray-500">Condición de pago</dt>
              <dd>{c.condicion_pago?.nombre ?? "—"}</dd>

              <dt className="text-gray-500">Tipo de comprobante</dt>
              <dd>
                {c.tipo_comprobante_permitido}
                {alertaDocumento && (
                  <span className="block text-xs text-gray-500">
                    Aprobar no habilita factura — solo se habilita corrigiendo el documento a un
                    RUC de contribuyente válido.
                  </span>
                )}
              </dd>

              <dt className="text-gray-500">Agente de retención</dt>
              <dd>{c.es_agente_retencion ? "Sí" : "No"}</dd>
            </dl>

            <div className="mt-4 flex gap-3">
              <button
                className="btn-primary text-sm"
                disabled={isPending}
                onClick={() => startTransition(() => onAprobar(c.id))}
              >
                Aprobar
              </button>
              <button
                className="btn-secondary text-sm"
                disabled={isPending}
                onClick={() => startTransition(() => onRechazar(c.id))}
              >
                Rechazar
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
