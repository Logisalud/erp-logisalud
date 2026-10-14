import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";
import { requireRole } from "@/lib/auth/session";
import { cargaVigente } from "@/services/avance";
import { ImportadorAvance } from "./importador";

export const dynamic = "force-dynamic";

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export default async function CargarAvancePage() {
  await requireRole(["administrador"]);
  const carga = await cargaVigente();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Avance de ventas" }]} />
        <h2 className="text-xl font-semibold">Avance de ventas</h2>
        <p className="mt-1 text-sm text-slate-600">
          Subí acá el Excel que actualizás todos los días. Cada vendedor ve su avance contra su
          cuota y el detalle de lo que facturó — solo lo suyo.
        </p>
      </div>

      {carga ? (
        <p className="aviso-info">
          <span aria-hidden>i</span>
          <span>
            Ahora mismo los vendedores ven el corte al <strong>{fechaLarga(carga.fechaCorte)}</strong>,
            subido el {new Date(carga.subidoEn).toLocaleString("es-PE")} desde{" "}
            <em>{carga.archivo}</em> ({carga.filasDetalle.toLocaleString("es-PE")} líneas).{" "}
            <Link href="/avance" className="font-medium underline">
              Ver la pantalla como la ven ellos
            </Link>
            .
          </span>
        </p>
      ) : (
        <p className="aviso-bloqueo">
          <span aria-hidden>!</span>
          <span>
            Todavía no hay ningún avance publicado: los vendedores entran y no ven nada. Subí el
            archivo para estrenarlo.
          </span>
        </p>
      )}

      <ImportadorAvance />
    </div>
  );
}
