import Link from "next/link";
import { listOperationsQueue, listRecentlyDispatched } from "@/services/fulfillments";

function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima" });
}

export default async function OperacionesPage() {
  const [cola, despachados] = await Promise.all([
    listOperationsQueue(),
    listRecentlyDispatched(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold">Despachos</h2>
        <p className="mt-1 text-sm text-gray-600">
          Pedidos listos para preparar. Al confirmar el despacho eliges la fuente de stock y el
          transporte, y capturas lo que realmente sale del almacén.
        </p>
      </div>

      <section>
        <h3 className="font-heading text-lg">
          Por preparar {cola.length > 0 && <span className="text-gray-500">({cola.length})</span>}
        </h3>
        {cola.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No hay pedidos esperando despacho.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {cola.map((o) => (
              <li key={o.id}>
                <Link href={`/operaciones/${o.id}`} className="card block p-4 hover:shadow-md">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-logisalud-green">Pedido #{o.numero}</p>
                    <p className="text-xs text-gray-500">Enviado {fechaHora(o.fecha_envio)}</p>
                  </div>
                  <p className="mt-1 font-medium text-gray-900">
                    {o.razon_social_snapshot ?? o.customer?.razon_social ?? "—"}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    {o.zona_snapshot ?? "Sin zona"} · {o.vendedor_snapshot ?? "Sin vendedor"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-heading text-lg">Despachados recientemente</h3>
        {despachados.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Todavía no hay despachos confirmados.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {despachados.map((o) => (
              <li key={o.id} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/operaciones/${o.id}`}
                    className="font-semibold text-gray-900 hover:text-logisalud-green hover:underline"
                  >
                    Pedido #{o.numero}
                  </Link>
                  <p className="text-xs text-gray-500">
                    Despachado {fechaHora(o.fulfillments?.[0]?.fecha_despacho ?? null)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-gray-600">{o.razon_social_snapshot ?? "—"}</p>
                {/*
                  Segundo link, al pedido en sí: esta pantalla muestra el
                  despacho, pero el Excel y los borradores de comprobante y
                  guía viven en /pedidos/[id]. Sin este enlace había que
                  escribir la URL a mano.
                */}
                <Link
                  href={`/pedidos/${o.id}`}
                  className="mt-2 inline-block text-sm font-medium text-logisalud-green hover:underline"
                >
                  Ver pedido y descargar Excel →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
