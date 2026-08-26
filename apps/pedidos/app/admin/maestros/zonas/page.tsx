import { listCatalog } from "@/services/catalog";
import { CatalogList } from "@/components/catalog-list";
import { Breadcrumb } from "@/components/breadcrumb";
import { crearZona, cambiarEstadoZona } from "./actions";

export default async function ZonasPage() {
  const items = await listCatalog("zones");

  return (
    <div>
      <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Zonas" }]} />
      <h2 className="text-xl font-semibold">Zonas</h2>
      <p className="mt-1 text-sm text-gray-600">
        La asignación de vendedores a cada zona (incluyendo el caso de zonas
        compartidas con participación) se gestiona por ahora vía SQL/dashboard
        de Supabase — pantalla dedicada pendiente.
      </p>
      <div className="mt-4">
        <CatalogList items={items} onCreate={crearZona} onToggle={cambiarEstadoZona} />
      </div>
    </div>
  );
}
