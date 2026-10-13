import Link from "next/link";
import { getCurrentUser, requireRole } from "@/lib/auth/session";
import { cargaVigente, detalleDeVenta, filasDelCuadro, type FilaCuadro } from "@/services/avance";
import { DetalleDeVenta } from "./detalle";

export const dynamic = "force-dynamic";

const soles = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });

const pct = (avance: number, cuota: number) =>
  cuota === 0 ? "—" : `${((avance / cuota) * 100).toFixed(1)}%`;

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/**
 * El avance del mes, como lo ve el vendedor.
 *
 * Tres cosas y en este orden, que es el orden en que se pregunta: cuánto
 * llevo contra mi cuota, de dónde sale eso (mis líneas, mis semanas), y
 * qué facturé exactamente.
 *
 * La pantalla no filtra por vendedor: eso lo hace la RLS, que a un
 * vendedor sólo le devuelve su fila, sus líneas y los totales de grupo y
 * compañía. Un administrador recibe todo y ve el cuadro completo.
 */
export default async function AvancePage() {
  await requireRole(["administrador", "vendedor"]);
  const user = await getCurrentUser();
  const esAdmin = user?.roles.includes("administrador") ?? false;

  const carga = await cargaVigente();
  if (!carga) {
    return (
      <Pagina>
        <p className="aviso-info">
          <span aria-hidden>i</span>
          <span>
            Todavía no hay un avance publicado.{" "}
            {esAdmin ? (
              <Link href="/admin/avance" className="font-medium underline">
                Subilo acá
              </Link>
            ) : (
              "Cuando Comercial suba el del día, lo vas a ver en esta pantalla."
            )}
          </span>
        </p>
      </Pagina>
    );
  }

  const filas = await filasDelCuadro(carga.id);
  const mias = filas.filter((f) => f.tipo === "vendedor");
  const yo = esAdmin ? null : (mias[0] ?? null);
  const total = filas.find((f) => f.tipo === "total") ?? null;
  const miGrupo = yo?.grupo ? (filas.find((f) => f.tipo === "grupo" && f.etiqueta === yo.grupo) ?? null) : null;

  const detalle = await detalleDeVenta(carga.id, { limite: esAdmin ? 5000 : 3000 });

  return (
    <Pagina>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl text-logisalud-green">Mi avance del mes</h1>
          <p className="text-sm text-slate-600">
            Corte al <strong>{fechaLarga(carga.fechaCorte)}</strong>
            {carga.diasTranscurridos && carga.diasMes
              ? ` · día ${carga.diasTranscurridos} de ${carga.diasMes}`
              : ""}
          </p>
        </div>
        {esAdmin && (
          <Link href="/admin/avance" className="text-sm font-medium text-logisalud-green underline">
            Actualizar el archivo
          </Link>
        )}
      </header>

      {!esAdmin && !yo && (
        <p className="aviso-bloqueo">
          <span aria-hidden>!</span>
          <span>
            El avance de este mes no trae ninguna fila con tu código. Avisale a Comercial para que
            lo revise en la próxima carga.
          </span>
        </p>
      )}

      {yo && <MiTarjeta fila={yo} carga={carga} />}

      {yo && (
        <Comparacion grupo={miGrupo} total={total} />
      )}

      {yo && <MisLineas filas={filas.filter((f) => f.tipo === "linea" && f.codigo === yo.codigo)} />}

      {esAdmin && <CuadroCompleto filas={filas} />}

      <DetalleDeVenta filas={detalle} mostrarVendedor={esAdmin} />
    </Pagina>
  );
}

// El header y el ancho los pone el layout; acá solo el ritmo vertical.
function Pagina({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-col gap-6">{children}</main>;
}

function MiTarjeta({ fila, carga }: { fila: FilaCuadro; carga: { diasMes: number | null; diasTranscurridos: number | null } }) {
  const falta = fila.cuota - fila.avance;
  const diasQueFaltan =
    carga.diasMes && carga.diasTranscurridos ? carga.diasMes - carga.diasTranscurridos : null;
  const porDia = diasQueFaltan && diasQueFaltan > 0 && falta > 0 ? falta / diasQueFaltan : null;
  const avanzado = fila.cuota > 0 ? Math.max(0, Math.min(1, fila.avance / fila.cuota)) : 0;

  return (
    <section className="card-highlight flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg">
          {fila.etiqueta}
          {fila.zona ? <span className="ml-2 text-sm font-normal text-slate-500">{fila.zona}</span> : null}
        </h2>
        <span className="text-sm text-slate-500">{fila.codigo}</span>
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Llevo vendido</p>
          <p className="font-heading text-3xl text-slate-900">{soles(fila.avance)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Mi cuota</p>
          <p className="font-heading text-2xl text-slate-700">{soles(fila.cuota)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Avance</p>
          <p className="font-heading text-2xl text-slate-700">{pct(fila.avance, fila.cuota)}</p>
        </div>
      </div>

      {/* El color no es la única señal: al lado va el porcentaje en texto. */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200" role="presentation">
        <div
          className="h-full rounded-full bg-logisalud-green"
          style={{ width: `${(avanzado * 100).toFixed(1)}%` }}
        />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Dato titulo="Me falta" valor={falta > 0 ? soles(falta) : "Cuota cumplida"} />
        <Dato titulo="Días que quedan" valor={diasQueFaltan !== null ? String(diasQueFaltan) : "—"} />
        <Dato titulo="Por día para llegar" valor={porDia ? soles(porDia) : "—"} />
        <Dato
          titulo="Vendo por día"
          valor={fila.promVentaDiaria !== null ? soles(fila.promVentaDiaria) : "—"}
        />
      </dl>

      <div>
        <p className="etiqueta">Por semana</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {fila.semanas.map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-2.5">
              <p className="text-xs text-slate-500">Semana {i + 1}</p>
              <p className="font-semibold text-slate-900">{soles(s.avance ?? 0)}</p>
              <p className="text-xs text-slate-500">
                de {soles(s.cuota ?? 0)} · {pct(s.avance ?? 0, s.cuota ?? 0)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparacion({ grupo, total }: { grupo: FilaCuadro | null; total: FilaCuadro | null }) {
  if (!grupo && !total) return null;
  return (
    <section className="card p-5">
      <h2 className="font-heading text-lg">Cómo va el equipo</h2>
      <p className="mt-1 text-sm text-slate-600">
        Para ubicarte. Acá no está el número de cada compañero, solo los totales.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {grupo && (
          <div className="rounded-lg border border-slate-200 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{grupo.etiqueta}</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">
              {soles(grupo.avance)}{" "}
              <span className="text-sm font-normal text-slate-600">
                de {soles(grupo.cuota)} · {pct(grupo.avance, grupo.cuota)}
              </span>
            </dd>
          </div>
        )}
        {total && (
          <div className="rounded-lg border border-slate-200 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{total.etiqueta}</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">
              {soles(total.avance)}{" "}
              <span className="text-sm font-normal text-slate-600">
                de {soles(total.cuota)} · {pct(total.avance, total.cuota)}
              </span>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function MisLineas({ filas }: { filas: FilaCuadro[] }) {
  if (filas.length === 0) return null;
  return (
    <section className="card p-5">
      <h2 className="font-heading text-lg">Mis líneas</h2>
      <p className="mt-1 text-sm text-slate-600">De dónde sale el avance, proveedor por proveedor.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Línea</th>
              <th className="py-2 pr-3 text-right">Avance</th>
              <th className="py-2 pr-3 text-right">Cuota</th>
              <th className="py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 font-medium text-slate-800">{f.etiqueta}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{soles(f.avance)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{soles(f.cuota)}</td>
                <td className="py-2 text-right tabular-nums">{pct(f.avance, f.cuota)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CuadroCompleto({ filas }: { filas: FilaCuadro[] }) {
  const cuadro = filas.filter((f) => f.tipo !== "linea");
  return (
    <section className="card p-5">
      <h2 className="font-heading text-lg">Cuadro completo</h2>
      <p className="mt-1 text-sm text-slate-600">
        Lo ves porque sos administrador. Cada vendedor ve solo su fila y estos totales.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Zona</th>
              <th className="py-2 pr-3">Código</th>
              <th className="py-2 pr-3">Vendedor</th>
              <th className="py-2 pr-3 text-right">Avance</th>
              <th className="py-2 pr-3 text-right">Cuota</th>
              <th className="py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {cuadro.map((f, i) => (
              <tr
                key={i}
                className={
                  f.tipo === "vendedor"
                    ? "border-b border-slate-100"
                    : "border-b border-slate-200 bg-slate-50 font-semibold"
                }
              >
                <td className="py-2 pr-3">{f.tipo === "vendedor" ? f.zona : f.etiqueta}</td>
                <td className="py-2 pr-3 text-slate-500">{f.codigo ?? ""}</td>
                <td className="py-2 pr-3">{f.tipo === "vendedor" ? f.etiqueta : ""}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{soles(f.avance)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{soles(f.cuota)}</td>
                <td className="py-2 text-right tabular-nums">{pct(f.avance, f.cuota)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{titulo}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900">{valor}</dd>
    </div>
  );
}
