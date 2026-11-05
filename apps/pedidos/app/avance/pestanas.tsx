import Link from "next/link";
import { nombreDeMes, anioDePeriodo } from "@/domain/fechas";
import type { PeriodoPublicado } from "@/services/avance";

/**
 * Las pestañas de mes del avance.
 *
 * Nacieron el 2026-11-05, cuando empezó a haber dos meses cargados a la
 * vez: hasta entonces la pantalla mostraba el último y punto, y el
 * vendedor no tenía forma de saber si lo que veía era de octubre o de
 * noviembre —ni de mirar el mes cerrado para comparar.
 *
 * Son enlaces y no botones: cada mes es una dirección (`?periodo=2026-11`)
 * que se puede compartir por WhatsApp, y la pantalla entera se arma en el
 * servidor. Sin JavaScript de por medio no hay un parpadeo entre el mes
 * viejo y el nuevo.
 *
 * El año solo se escribe cuando hay más de uno a la vista: en enero, con
 * diciembre al lado, "Diciembre" a secas es ambiguo; mientras todos los
 * meses son del mismo año, repetirlo es ruido.
 */
export function PestanasDeMes({
  periodos,
  actual,
}: {
  periodos: PeriodoPublicado[];
  actual: string;
}) {
  // Con un solo mes publicado no hay nada que elegir: el encabezado ya
  // dice de cuándo es.
  if (periodos.length < 2) return null;

  const variosAnios = new Set(periodos.map((p) => anioDePeriodo(p.periodo))).size > 1;

  return (
    <nav aria-label="Mes del avance" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-slate-200">
        {periodos.map((p) => {
          const activo = p.periodo === actual;
          return (
            <li key={p.periodo}>
              <Link
                href={`/avance?periodo=${p.periodo}`}
                aria-current={activo ? "page" : undefined}
                className={
                  // -mb-px para que el borde de la pestaña activa tape el
                  // del <ul> y las dos líneas se lean como una sola.
                  "-mb-px block border-b-2 px-4 py-3 text-sm font-medium transition-colors " +
                  (activo
                    ? "border-logisalud-green text-logisalud-green"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800")
                }
              >
                {nombreDeMes(p.periodo)}
                {variosAnios ? ` ${anioDePeriodo(p.periodo)}` : ""}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
