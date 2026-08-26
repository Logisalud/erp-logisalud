import { getCarteraSummary } from "@/services/customers-import";
import { Breadcrumb } from "@/components/breadcrumb";
import { CustomerImporter } from "./customer-importer";

export default async function ClientesPage() {
  const summary = await getCarteraSummary();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Clientes" }]} />
        <h2 className="text-xl font-semibold">Clientes — carga de cartera</h2>
        <p className="mt-1 text-sm text-gray-600">
          Importa la cartera real desde los CSV del sistema de origen. Reimportar actualiza los
          clientes existentes por RUC en vez de duplicarlos.
        </p>
      </div>

      <section>
        <h3 className="font-heading text-lg">Estado actual de la cartera</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4">
            <p className="text-lg font-semibold">{summary.total.toLocaleString("es-PE")}</p>
            <p className="text-xs text-gray-600">Clientes en total</p>
          </div>
          <div className="card p-4">
            <p className="text-lg font-semibold">{summary.activos.toLocaleString("es-PE")}</p>
            <p className="text-xs text-gray-600">ACTIVO</p>
          </div>
          <div className="card p-4">
            <p className="text-lg font-semibold text-amber-700">
              {summary.pendientesDeValidacion.toLocaleString("es-PE")}
            </p>
            <p className="text-xs text-gray-600">PENDIENTE_DE_VALIDACION</p>
          </div>
          <div className="card p-4">
            <p className="text-lg font-semibold text-amber-700">
              {summary.sinDireccion.toLocaleString("es-PE")}
            </p>
            <p className="text-xs text-gray-600">Sin dirección de entrega</p>
          </div>
        </div>
        {summary.sinDireccion > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {summary.sinDireccion.toLocaleString("es-PE")} clientes no pueden recibir un pedido
            todavía: falta registrarles la dirección de entrega. Se puede hacer desde el propio
            flujo de toma de pedido.
          </p>
        )}
      </section>

      <section>
        <h3 className="font-heading text-lg">Importar</h3>
        <div className="mt-3">
          <CustomerImporter />
        </div>
      </section>
    </div>
  );
}
