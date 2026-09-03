import { Breadcrumb } from "@/components/breadcrumb";
import { listPromocionesVigentes } from "@/services/promo-import";
import { PromoImporter } from "./promo-importer";

export default async function PromocionesPage() {
  const vigentes = await listPromocionesVigentes();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Promociones" }]} />
        <h2 className="text-xl font-semibold">Promociones</h2>
        <p className="mt-1 text-sm text-slate-600">
          Escalas y bonificaciones por producto y canal. Se aplican automáticamente al armar el
          pedido y al enviarlo: no generan solicitud de aprobación ni frenan el pedido.
        </p>
      </div>

      <PromoImporter />

      <section>
        <h3 className="font-heading text-lg">Promociones vigentes</h3>
        <p className="mt-1 text-sm text-slate-600">
          Lo que un pedido de hoy va a aplicar. Sólo Diphasac por ahora: Biosana y Prades quedan sin
          promociones hasta que entreguen su archivo.
        </p>

        {vigentes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Todavía no hay ninguna promoción cargada, salvo las que se hayan cargado a mano.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium">Canal</th>
                  <th className="py-2 pr-3 font-medium">Detalle</th>
                  <th className="py-2 font-medium">Desde</th>
                </tr>
              </thead>
              <tbody>
                {vigentes.map((fila, i) => (
                  <tr
                    key={`${fila.tipo}-${fila.codigo}-${fila.canal}-${i}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-2 pr-3">{fila.tipo}</td>
                    <td className="cifra py-2 pr-3">{fila.codigo}</td>
                    <td className="py-2 pr-3">{fila.descripcion}</td>
                    <td className="py-2 pr-3">{fila.canal}</td>
                    <td className="py-2 pr-3">{fila.detalle}</td>
                    <td className="cifra py-2 text-slate-600">{fila.vigenteDesde}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
