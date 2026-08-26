import { listCatalog } from "@/services/catalog";
import { CatalogList } from "@/components/catalog-list";
import { Breadcrumb } from "@/components/breadcrumb";
import { crearCanal, cambiarEstadoCanal } from "./actions";

export default async function CanalesPage() {
  const items = await listCatalog("sales_channels");

  return (
    <div>
      <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Canales de venta" }]} />
      <h2 className="text-xl font-semibold">Canales de venta</h2>
      <div className="mt-4">
        <CatalogList items={items} onCreate={crearCanal} onToggle={cambiarEstadoCanal} />
      </div>
    </div>
  );
}
