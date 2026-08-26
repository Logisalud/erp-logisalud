import { listActiveSuppliers } from "@/services/products";
import { listPriceListHistory } from "@/services/price-lists";
import { Breadcrumb } from "@/components/breadcrumb";
import { PriceListImporter } from "./price-list-importer";

export default async function ListasPreciosPage() {
  const [suppliers, history] = await Promise.all([
    listActiveSuppliers(),
    listPriceListHistory(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Listas de precios" }]} />
        <h2 className="text-xl font-semibold">Listas de precios</h2>
        <p className="mt-1 text-sm text-gray-600">
          Sube el Excel del proveedor, revisa la vista previa y confirma para publicar.
          Reimportar el mismo proveedor crea una nueva versión — nunca sobrescribe la vigente.
        </p>
      </div>

      <PriceListImporter suppliers={suppliers} />

      <div>
        <h3 className="text-lg font-semibold">Historial</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {history.map((h) => (
            <li key={h.id} className="card flex items-center justify-between p-4">
              <div>
                <p className="font-semibold">{h.supplier?.nombre ?? "—"}</p>
                <p className="text-sm text-gray-600">
                  {h.archivo_nombre} · {h.item_count} precios · desde {h.fecha_inicio}
                  {h.fecha_fin ? ` hasta ${h.fecha_fin}` : " (vigente)"}
                </p>
              </div>
            </li>
          ))}
          {history.length === 0 && (
            <p className="text-sm text-gray-500">Sin listas publicadas todavía.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
