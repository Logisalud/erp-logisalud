import Link from "next/link";
import { redirect } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { getCurrentUser } from "@/lib/auth/session";
import { listMisClientesNuevos, type MiClienteNuevo } from "@/services/customers";
import { displayRazonSocial } from "@/domain/customer-search";

/**
 * Los clientes que registró el vendedor y en qué quedaron.
 *
 * Existe porque no había dónde verlo: se registraba un cliente, quedaba
 * pendiente de validación y el vendedor no se enteraba nunca de si lo
 * aprobaron — su única manera de averiguarlo era volver a buscarlo en el
 * selector del pedido. Ahora además le llega un correo cuando se resuelve.
 */
export default async function MisClientesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const clientes = await listMisClientesNuevos(user.userId);
  const pendientes = clientes.filter((c) => c.estado === "PENDIENTE_DE_VALIDACION");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[{ label: "Mis clientes" }]} />
        <h2 className="text-xl font-semibold">Mis clientes nuevos</h2>
        <p className="mt-1 text-sm text-gray-600">
          Los clientes que registraste y en qué quedaron. Control de Pedidos los revisa y aprueba;
          mientras tanto podés armarles el pedido, pero no enviarlo.
        </p>
      </div>

      {pendientes.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pendientes.length === 1
            ? "Tenés 1 cliente esperando validación."
            : `Tenés ${pendientes.length} clientes esperando validación.`}{" "}
          Cuando se resuelva te llega un correo.
        </p>
      )}

      {clientes.length === 0 ? (
        <p className="card p-4 text-sm text-gray-600">
          Todavía no registraste ningún cliente. Se registran desde{" "}
          <Link href="/pedidos/nuevo" className="text-logisalud-green underline">
            un pedido nuevo
          </Link>
          , con el botón &ldquo;Cliente nuevo&rdquo;.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {clientes.map((c) => (
            <li key={c.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{displayRazonSocial(c.razonSocial)}</p>
                  <p className="cifra mt-0.5 text-sm text-gray-600">
                    {c.rucODocumento}
                    {c.zona ? ` · ${c.zona}` : ""}
                  </p>
                </div>
                <EstadoTag estado={c.estado} />
              </div>

              {c.direccion && <p className="mt-1 text-sm text-gray-600">{c.direccion}</p>}

              <p className="mt-2 text-sm text-gray-600">
                {explicacion(c)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ESTILO_ESTADO: Record<string, string> = {
  PENDIENTE_DE_VALIDACION: "border-amber-300 bg-amber-50 text-amber-900",
  ACTIVO: "border-green-300 bg-green-50 text-green-900",
  RECHAZADO: "border-red-300 bg-red-50 text-red-900",
};

const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE_DE_VALIDACION: "Esperando validación",
  ACTIVO: "Aprobado",
  RECHAZADO: "Rechazado",
};

function EstadoTag({ estado }: { estado: string }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
        ESTILO_ESTADO[estado] ?? "border-gray-300 bg-gray-50 text-gray-700"
      }`}
    >
      {ETIQUETA_ESTADO[estado] ?? estado}
    </span>
  );
}

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" });
}

/** Qué significa el estado para el vendedor, en una línea. */
function explicacion(c: MiClienteNuevo): string {
  const esperando =
    c.pedidosEsperando === 1
      ? " Hay 1 pedido esperándolo."
      : c.pedidosEsperando > 1
        ? ` Hay ${c.pedidosEsperando} pedidos esperándolo.`
        : "";

  if (c.estado === "PENDIENTE_DE_VALIDACION") {
    return `Registrado el ${fecha(c.fechaSolicitud)}. Podés armarle el pedido, pero no se puede enviar hasta que lo aprueben.${esperando}`;
  }
  if (c.estado === "ACTIVO") {
    return `Aprobado el ${fecha(c.fechaValidacion)}. Ya se le puede vender normalmente.`;
  }
  if (c.estado === "RECHAZADO") {
    return `Rechazado el ${fecha(c.fechaValidacion)}. Consultá con Control de Pedidos qué corregir antes de volver a cargarlo.${esperando}`;
  }
  return `Registrado el ${fecha(c.fechaSolicitud)}.`;
}
