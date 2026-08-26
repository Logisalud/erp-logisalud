import { Breadcrumb } from "@/components/breadcrumb";
import { CatalogList } from "@/components/catalog-list";
import { listCatalog } from "@/services/catalog";
import { listInventorySources } from "@/services/inventory";
import { InventorySourceList } from "./inventory-source-list";
import {
  cambiarEstadoAlmacen,
  cambiarEstadoChofer,
  cambiarEstadoTransportista,
  cambiarEstadoVehiculo,
  crearAlmacen,
  crearChofer,
  crearTransportista,
  crearVehiculo,
} from "./actions";

export default async function DespachoMaestrosPage() {
  const [sources, warehouses, vehicles, drivers, transporters] = await Promise.all([
    listInventorySources(),
    listCatalog("warehouses"),
    listCatalog("vehicles"),
    listCatalog("drivers"),
    listCatalog("transporters"),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Despacho" }]} />
        <h2 className="text-xl font-semibold">Despacho</h2>
        <p className="mt-1 text-sm text-gray-600">
          Fuentes de stock, almacenes y transporte que Operaciones usa al despachar un pedido.
        </p>
      </div>

      <section>
        <h3 className="font-heading text-lg">Fuentes de stock</h3>
        <p className="mt-1 text-sm text-gray-600">
          El stock de una fuente no se mezcla con el de otra. Operaciones elige la fuente al
          confirmar cada despacho.
        </p>
        <div className="mt-3">
          <InventorySourceList items={sources} />
        </div>
      </section>

      <section>
        <h3 className="font-heading text-lg">Almacenes</h3>
        <p className="mt-1 text-sm text-gray-600">
          La guía de remisión exige dirección y ubigeo del almacén de salida como punto de partida.
          El Almacén Central Lima ya los tiene cargados; para los demás, por ahora se completan
          desde la base de datos y el borrador de guía los reporta como advertencia mientras falten.
        </p>
        <div className="mt-3">
          <CatalogList items={warehouses} onCreate={crearAlmacen} onToggle={cambiarEstadoAlmacen} />
        </div>
      </section>

      <section>
        <h3 className="font-heading text-lg">Vehículos</h3>
        <div className="mt-3">
          <CatalogList items={vehicles} onCreate={crearVehiculo} onToggle={cambiarEstadoVehiculo} />
        </div>
      </section>

      <section>
        <h3 className="font-heading text-lg">Choferes</h3>
        <div className="mt-3">
          <CatalogList items={drivers} onCreate={crearChofer} onToggle={cambiarEstadoChofer} />
        </div>
      </section>

      <section>
        <h3 className="font-heading text-lg">Transportistas</h3>
        <div className="mt-3">
          <CatalogList
            items={transporters}
            onCreate={crearTransportista}
            onToggle={cambiarEstadoTransportista}
          />
        </div>
      </section>
    </div>
  );
}
