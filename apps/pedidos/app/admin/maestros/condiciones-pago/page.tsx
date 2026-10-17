import { requireSession } from "@/lib/auth/session";
import { listCatalog } from "@/services/catalog";
import { CatalogList } from "@/components/catalog-list";
import { Breadcrumb } from "@/components/breadcrumb";
import { crearCondicionPago, cambiarEstadoCondicionPago } from "./actions";

export default async function CondicionesPagoPage() {
  // Antes de consultar nada: el layout y la página se renderizan en
  // paralelo, así que sin esto la consulta sale al mismo tiempo que el
  // guardia del layout y, con la sesión vencida, gana cualquiera.
  await requireSession();
  const items = await listCatalog("payment_terms");

  return (
    <div>
      <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Condiciones de pago" }]} />
      <h2 className="text-xl font-semibold">Condiciones de pago</h2>
      <div className="mt-4">
        <CatalogList
          items={items}
          onCreate={crearCondicionPago}
          onToggle={cambiarEstadoCondicionPago}
          withDescription
        />
      </div>
    </div>
  );
}
