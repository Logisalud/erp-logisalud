import { notFound } from "next/navigation";
import { getProductDetail } from "@/services/products";
import { listCatalog } from "@/services/catalog";
import { Breadcrumb } from "@/components/breadcrumb";
import { EditProductForm } from "./edit-product-form";
import { PriceCorrectionForm } from "./price-correction-form";
import { editProduct, submitPriceCorrection } from "./actions";
import { displayNombreProducto } from "@/domain/products";
import { IconAlert } from "@/components/icons";
import { formatearFechaProveedor } from "@/domain/fechas";

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const [product, channels] = await Promise.all([
    getProductDetail(params.id),
    listCatalog("sales_channels"),
  ]);

  if (!product) notFound();

  const perfilVigente = product.product_tax_profiles.find((tp) => tp.vigente_hasta === null);
  const currentPrices = product.priceHistory.filter((p) => p.vigente_hasta === null);
  const historicalPrices = product.priceHistory.filter((p) => p.vigente_hasta !== null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Maestros", href: "/admin" },
            { label: "Productos", href: "/admin/maestros/productos" },
            { label: displayNombreProducto(product.descripcion, product.codigo_interno) },
          ]}
        />
        <h2 className="text-xl font-semibold">
          {displayNombreProducto(product.descripcion, product.codigo_interno)}{" "}
          <span className="text-base font-normal text-gray-500">({product.codigo_interno})</span>
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {product.supplier?.nombre ?? "Sin proveedor"} · {product.unidad_medida}
          {product.presentacion ? ` · ${product.presentacion}` : ""} · {product.estado}
        </p>
        {product.nota_estado && (
          <p className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{product.nota_estado}</span>
          </p>
        )}
      </div>

      {!product.hasCurrentPrice && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          ⚠ Sin precio en ningún canal.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold">Datos generales</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-gray-500">Código proveedor</dt>
            <dd>{product.codigo_proveedor ?? "—"}</dd>
            <dt className="text-gray-500">Código bonificación</dt>
            <dd>{product.codigo_bonificacion ?? "—"}</dd>
            <dt className="text-gray-500">Principio activo</dt>
            <dd>{product.principio_activo ?? "—"}</dd>
            <dt className="text-gray-500">Controla lote</dt>
            <dd>{product.controla_lote ? "Sí" : "No"}</dd>
            <dt className="text-gray-500">Controla vencimiento</dt>
            <dd>{product.controla_vencimiento ? "Sí" : "No"}</dd>
          </dl>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold">Tributario y costo de referencia</h3>
          {perfilVigente ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-gray-500">Afectación</dt>
              <dd>
                {perfilVigente.afectacion_tributaria} · {perfilVigente.tasa_aplicable}%
              </dd>
              <dt className="text-gray-500">VVF (sin IGV)</dt>
              <dd>{formatMoney(perfilVigente.vvf_sin_igv)}</dd>
              <dt className="text-gray-500">VVD (sin IGV)</dt>
              <dd>{formatMoney(perfilVigente.vvd_sin_igv)}</dd>
              <dt className="text-gray-500">Costo ref. distribuidora</dt>
              <dd>{formatMoney(perfilVigente.costo_referencial_distribuidora)}</dd>
              <dt className="text-gray-500">Fecha vigencia (proveedor)</dt>
              <dd>{formatearFechaProveedor(perfilVigente.fecha_vigencia_proveedor)}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Sin perfil tributario.</p>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold">Precios vigentes por canal</h3>
        {currentPrices.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Sin precio en ningún canal todavía.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-1 pr-3">Canal</th>
                  <th className="py-1 pr-3">Precio</th>
                  <th className="py-1 pr-3">Vigente desde</th>
                </tr>
              </thead>
              <tbody>
                {currentPrices.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-1 pr-3">{p.sales_channel.nombre}</td>
                    <td className="py-1 pr-3">{formatMoney(p.precio)}</td>
                    <td className="py-1 pr-3">{p.vigente_desde}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {historicalPrices.length > 0 && (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">
            Historial de versiones de precio ({historicalPrices.length})
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-1 pr-3">Canal</th>
                  <th className="py-1 pr-3">Precio</th>
                  <th className="py-1 pr-3">Vigente desde</th>
                  <th className="py-1 pr-3">Vigente hasta</th>
                  <th className="py-1 pr-3">Origen</th>
                </tr>
              </thead>
              <tbody>
                {historicalPrices.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 text-gray-600">
                    <td className="py-1 pr-3">{p.sales_channel.nombre}</td>
                    <td className="py-1 pr-3">{formatMoney(p.precio)}</td>
                    <td className="py-1 pr-3">{p.vigente_desde}</td>
                    <td className="py-1 pr-3">{p.vigente_hasta}</td>
                    <td className="py-1 pr-3">
                      {p.price_list_id ? "Importación" : "Corrección puntual"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <PriceCorrectionForm
        channels={channels.map((c) => ({ id: c.id, nombre: c.nombre }))}
        onSubmit={submitPriceCorrection.bind(null, product.id)}
      />

      <EditProductForm product={product} onSave={editProduct.bind(null, product.id)} />
    </div>
  );
}
