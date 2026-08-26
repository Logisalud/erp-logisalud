import { listCatalog } from "@/services/catalog";
import { CatalogList } from "@/components/catalog-list";
import { Breadcrumb } from "@/components/breadcrumb";
import { crearCondicionPago, cambiarEstadoCondicionPago } from "./actions";

export default async function CondicionesPagoPage() {
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
