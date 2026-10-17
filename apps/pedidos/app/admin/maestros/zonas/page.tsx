import { requireSession } from "@/lib/auth/session";
import { listCatalog } from "@/services/catalog";
import { CatalogList } from "@/components/catalog-list";
import { Breadcrumb } from "@/components/breadcrumb";
import { crearZona, cambiarEstadoZona } from "./actions";

export default async function ZonasPage() {
  // Antes de consultar nada: el layout y la página se renderizan en
  // paralelo, así que sin esto la consulta sale al mismo tiempo que el
  // guardia del layout y, con la sesión vencida, gana cualquiera.
  await requireSession();
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
