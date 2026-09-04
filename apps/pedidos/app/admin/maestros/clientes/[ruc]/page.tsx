import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { getCurrentUser } from "@/lib/auth/session";
import { listCatalog, listPaymentTerms } from "@/services/catalog";
import { getCustomerByRuc } from "@/services/customers";
import { listDepartamentos } from "@/services/ubigeos";
import { displayRazonSocial } from "@/domain/customer-search";
import { CustomerDetailForm } from "./customer-detail-form";

/**
 * Ficha de un cliente puntual, buscada por su RUC/documento.
 *
 * El RUC va en la URL en vez del uuid: es el dato que la gente tiene a
 * mano (aparece en el CSV del importador, en el comprobante y en la
 * planilla de la carga masiva), así que un link se puede armar a mano
 * cuando hace falta corregir un cliente concreto.
 */
export default async function ClienteDetallePage({ params }: { params: { ruc: string } }) {
  const ruc = decodeURIComponent(params.ruc);

  const [cliente, user, canales, zonas, condicionesPago, departamentos] = await Promise.all([
    getCustomerByRuc(ruc),
    getCurrentUser(),
    listCatalog("sales_channels"),
    listCatalog("zones"),
    listPaymentTerms(),
    listDepartamentos(),
  ]);

  if (!cliente) notFound();

  const puedeEditar = user?.roles.includes("administrador") ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Maestros", href: "/admin" },
            { label: "Clientes", href: "/admin/maestros/clientes" },
            { label: cliente.ruc_o_documento },
          ]}
        />
        <h2 className="text-xl font-semibold">{displayRazonSocial(cliente.razon_social)}</h2>
        <p className="cifra mt-1 text-sm text-gray-600">
          {cliente.ruc_o_documento} · {cliente.canal?.nombre ?? "sin canal"} ·{" "}
          {cliente.zona?.nombre ?? "sin zona"} · {cliente.estado}
        </p>
      </div>

      <CustomerDetailForm
        cliente={cliente}
        canales={canales.map((c) => ({ id: c.id, nombre: c.nombre }))}
        zonas={zonas.map((z) => ({ id: z.id, nombre: z.nombre }))}
        condicionesPago={condicionesPago.map((c) => ({ id: c.id, nombre: c.nombre }))}
        departamentos={departamentos}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
