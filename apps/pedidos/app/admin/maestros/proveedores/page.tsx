import { requireSession } from "@/lib/auth/session";
import { listCatalog } from "@/services/catalog";
import { CatalogList } from "@/components/catalog-list";
import { Breadcrumb } from "@/components/breadcrumb";
import { crearProveedor, cambiarEstadoProveedor } from "./actions";

export default async function ProveedoresPage() {
  // Antes de consultar nada: el layout y la página se renderizan en
  // paralelo, así que sin esto la consulta sale al mismo tiempo que el
  // guardia del layout y, con la sesión vencida, gana cualquiera.
  await requireSession();
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
