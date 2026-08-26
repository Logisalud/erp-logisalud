import { Breadcrumb } from "@/components/breadcrumb";
import { getCompanySettings } from "@/services/company-settings";
import { CompanyForm } from "./company-form";

export default async function EmpresaPage() {
  const settings = await getCompanySettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Datos de la empresa" }]} />
        <h2 className="text-xl font-semibold">Datos de la empresa</h2>
        <p className="mt-1 text-sm text-gray-600">
          Datos legales de quien emite los comprobantes y las guías de remisión. Alimentan los
          campos de emisor de la documentación electrónica — el destinatario sale de cada cliente.
        </p>
      </div>

      {!settings ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          No hay datos de empresa cargados. Sin ellos no se pueden generar los borradores de
          documentación electrónica.
        </p>
      ) : (
        <>
          <CompanyForm settings={settings} />
          <p className="text-xs text-gray-500">
            Última actualización:{" "}
            {new Date(settings.updated_at).toLocaleString("es-PE", { timeZone: "America/Lima" })}
          </p>
        </>
      )}
    </div>
  );
}
