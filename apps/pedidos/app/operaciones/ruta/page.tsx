import Link from "next/link";
import { cargarDatosDeRuteo } from "@/services/ruteo";
import { NOMBRE_DIA } from "@/domain/ruteo";
import { ArmadorDeRuta } from "./armador";

export const dynamic = "force-dynamic";

export default async function RutaDelDiaPage() {
  const { zonas, pendientes, diaSemana } = await cargarDatosDeRuteo();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/operaciones" className="text-sm text-logisalud-green hover:underline">
          ← Despachos
        </Link>
        <h2 className="mt-1 text-xl font-semibold">Ruta del día</h2>
        <p className="mt-1 text-sm text-gray-600">
          Elegí los pedidos que salen hoy y el sistema los ordena en una hoja de ruta, agrupados
          por zona y distrito. Hoy es {NOMBRE_DIA[diaSemana]}:{" "}
          <strong>
            {zonas.filter((z) => z.esDeHoy).map((z) => z.nombre).join(" y ") || "sin zonas en el plan"}
          </strong>
          , ya vienen marcadas.
        </p>
      </div>

      <ArmadorDeRuta zonas={zonas} pendientes={pendientes} diaSemana={diaSemana} />
    </div>
  );
}
