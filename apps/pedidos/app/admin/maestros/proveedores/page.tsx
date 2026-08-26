import { listCatalog } from "@/services/catalog";
import { CatalogList } from "@/components/catalog-list";
import { Breadcrumb } from "@/components/breadcrumb";
import { crearProveedor, cambiarEstadoProveedor } from "./actions";

export default async function ProveedoresPage() {
  const items = await listCatalog("suppliers");

  return (
    <div>
      <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Proveedores" }]} />
      <h2 className="text-xl font-semibold">Proveedores</h2>
      <div className="mt-4">
        <CatalogList items={items} onCreate={crearProveedor} onToggle={cambiarEstadoProveedor} />
      </div>
    </div>
  );
}
