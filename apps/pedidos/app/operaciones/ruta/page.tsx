import Link from "next/link";
import { cargarDatosDeRuteo } from "@/services/ruteo";
import { NOMBRE_DIA } from "@/domain/ruteo";
import { ArmadorDeRuta } from "./armador";

export const dynamic = "force-dynamic";

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

export default async function RutaDelDiaPage({
  searchParams,
}: {
  searchParams?: { desde?: string };
}) {
  // El corte por defecto lo pone el servicio (ayer). Acá solo se respeta lo
  // que haya elegido quien arma la ruta.
  const desdePedido = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.desde ?? "")
    ? searchParams?.desde
    : undefined;

  const { zonas, pendientes, diaSemana, desde, anteriores } =
    await cargarDatosDeRuteo(desdePedido);

  return (
    <div className="flex flex-col gap-6">
      <div className="no-imprimir">
        <Link href="/operaciones" className="text-sm text-logisalud-green hover:underline">
          ← Despachos
        </Link>
        <h2 className="mt-1 text-xl font-semibold">Ruta del día</h2>
        <p className="mt-1 text-sm text-gray-600">
          Elegí los pedidos que salen hoy y el sistema los ordena en una hoja de ruta, agrupados
          por zona y distrito. Hoy es {NOMBRE_DIA[diaSemana]}:{" "}
          <strong>
            {zonas.filter((z) => z.esDeHoy).map((z) => z.nombre).join(" y ") ||
              "sin zonas en el plan"}
          </strong>
          , ya vienen marcadas.
        </p>
      </div>

      <form className="no-imprimir card flex flex-wrap items-end gap-3 p-4" method="get">
        <div>
          <label className="etiqueta" htmlFor="desde">
            Pedidos enviados desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            defaultValue={desde}
            className="campo cifra w-44"
          />
        </div>
        <button type="submit" className="btn-secondary">
          Ver
        </button>
        <p className="text-sm text-gray-600">
          Por defecto, desde ayer ({fechaLarga(desde)}).
          {anteriores > 0 && (
            <>
              {" "}
              Quedan afuera <strong>{anteriores}</strong>{" "}
              {anteriores === 1 ? "pedido anterior" : "pedidos anteriores"} que siguen figurando
              sin despachar en el ERP. Si ya se entregaron, conviene marcarlos como despachados
              para que dejen de aparecer.
            </>
          )}
        </p>
      </form>

      <ArmadorDeRuta zonas={zonas} pendientes={pendientes} diaSemana={diaSemana} />
    </div>
  );
}
