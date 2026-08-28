"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { IconCheck, IconError, IconPlus, IconSpinner, IconTrash } from "@/components/icons";
import { formatSoles } from "@/domain/order-email";
import {
  agregarProducto,
  cambiarCantidad,
  enviarPedido,
  quitarProducto,
  solicitarDescuento,
} from "./actions";
import { displayNombreProducto } from "@/domain/products";

type Product = { id: string; descripcion: string; codigo_interno: string };
type OrderItem = {
  id: string;
  product_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  igv: number;
  total: number;
  product: { descripcion: string; codigo_interno: string } | null;
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Las líneas del pedido y el total pegado al pie.
 *
 * El total va fijo abajo porque es el dato que el vendedor le canta al
 * cliente en voz alta, y con 5 a 20 líneas se pierde de vista apenas
 * empieza a hacer scroll.
 *
 * El catálogo es chico (menos de 200 productos con precio vigente), así que
 * acá sí se puede precargar y buscar en el navegador — a diferencia de la
 * cartera de clientes, que son 3.4k y se busca en el servidor. Se usa el
 * mismo combobox por consistencia y para que el vendedor aprenda un solo
 * gesto.
 */
export function OrderItemComposer({
  orderId,
  customerId,
  items,
  products,
}: {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  products: Product[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    estadoResultado: string;
    priceDrift: Array<{ orderItemId: string; precioAnterior: number; precioNuevo: number }>;
  } | null>(null);

  const [productoElegido, setProductoElegido] = useState<ComboboxOption | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [ultimaAgregada, setUltimaAgregada] = useState<string | null>(null);
  const [discountFormItemId, setDiscountFormItemId] = useState<string | null>(null);
  // Confirmación efímera por línea: cambiar una cantidad tiene que
  // acusar recibo, o el vendedor no sabe si se grabó.
  const [cantidadGuardada, setCantidadGuardada] = useState<string | null>(null);
  const cantidadRef = useRef<HTMLInputElement>(null);

  const opciones: ComboboxOption[] = products.map((p) => ({
    id: p.id,
    // La bonificación se marca acá: su par regular trae la MISMA descripción
    // y en el buscador se verían idénticos.
    label: displayNombreProducto(p.descripcion, p.codigo_interno),
    description: p.codigo_interno,
  }));

  async function buscarProducto(term: string): Promise<ComboboxOption[]> {
    const q = normalize(term);
    return opciones
      .filter((o) => normalize(o.label).includes(q) || normalize(o.description ?? "").includes(q))
      .slice(0, 30);
  }

  function agregar() {
    setError(null);
    if (!productoElegido) {
      setError("Elige un producto.");
      return;
    }
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n < 1) {
      setError("La cantidad tiene que ser un número entero de 1 o más.");
      cantidadRef.current?.focus();
      return;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("productId", productoElegido.id);
        fd.set("cantidad", String(n));
        await agregarProducto(orderId, customerId, fd);
        setUltimaAgregada(productoElegido.id);
        // Listo para el siguiente: el vendedor casi nunca carga uno solo.
        setProductoElegido(null);
        setCantidad("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo agregar el producto.");
      }
    });
  }

  function quitar(itemId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await quitarProducto(orderId, itemId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo quitar el producto.");
      }
    });
  }

  function corregirCantidad(itemId: string, valor: string) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1) return;
    setError(null);
    startTransition(async () => {
      try {
        await cambiarCantidad(orderId, itemId, n);
        setCantidadGuardada(itemId);
        setTimeout(() => setCantidadGuardada((id) => (id === itemId ? null : id)), 2200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cambiar la cantidad.");
      }
    });
  }

  function pedirDescuento(itemId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await solicitarDescuento(orderId, itemId, formData);
        setDiscountFormItemId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la solicitud.");
      }
    });
  }

  function enviar() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await enviarPedido(orderId);
        setSubmitResult(result);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo enviar el pedido.");
      }
    });
  }

  const total = items.reduce((acc, item) => acc + item.total, 0);
  const unidades = items.reduce((acc, item) => acc + item.cantidad, 0);

  return (
    <>
      <div className="flex flex-col gap-4 pb-28">
        {error && (
          <p className="aviso-error" role="alert">
            <IconError className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {submitResult && (
          <div className="aviso-ok" role="status">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Pedido enviado.</p>
              {submitResult.priceDrift.length > 0 && (
                <p className="mt-1">
                  El precio de {submitResult.priceDrift.length}{" "}
                  {submitResult.priceDrift.length === 1 ? "línea cambió" : "líneas cambiaron"} desde
                  que armaste el borrador. Ya quedaron al precio vigente.
                </p>
              )}
            </div>
          </div>
        )}

        <section className="panel p-4" aria-labelledby="agregar-titulo">
          <h2 id="agregar-titulo" className="text-lg text-slate-900">
            Agregar producto
          </h2>

          {products.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              No hay productos activos con precio vigente para agregar. Revisa las listas de precios
              en Maestros.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <Combobox
                name="productId"
                label="Producto"
                selected={productoElegido}
                onSelect={setProductoElegido}
                onSearch={buscarProducto}
                initialOptions={opciones.slice(0, 30)}
                placeholder="Busca por nombre o código..."
                minSearchLength={1}
                debounceMs={120}
                emptyMessage="Ningún producto coincide"
              />

              <div className="flex items-end gap-2">
                <div className="w-32">
                  <label className="etiqueta" htmlFor="cantidad-nueva">
                    Cantidad
                  </label>
                  <input
                    id="cantidad-nueva"
                    ref={cantidadRef}
                    className="campo cifra"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        agregar();
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={agregar}
                  className="btn-primary flex-1 sm:flex-none sm:px-8"
                  disabled={isPending}
                >
                  {isPending ? <IconSpinner className="h-5 w-5" /> : <IconPlus className="h-5 w-5" />}
                  Agregar
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="lineas-titulo">
          <div className="flex items-baseline justify-between px-4 pt-4">
            <h2 id="lineas-titulo" className="text-lg text-slate-900">
              Productos del pedido
            </h2>
            {items.length > 0 && (
              <p className="cifra text-sm text-slate-600">
                {items.length} {items.length === 1 ? "línea" : "líneas"} · {unidades} u.
              </p>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 pb-4 pt-2 text-sm text-slate-600">
              Todavía no agregaste productos. Busca el primero arriba.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 border-t border-slate-200">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={item.product_id === ultimaAgregada ? "linea-nueva" : undefined}
                >
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-medium leading-snug text-slate-900">
                        {item.product
                          ? displayNombreProducto(item.product.descripcion, item.product.codigo_interno)
                          : "—"}
                      </p>
                      <p className="cifra shrink-0 font-semibold text-slate-900">
                        {formatSoles(item.total)}
                      </p>
                    </div>
                    <p className="cifra mt-0.5 text-sm text-slate-600">
                      {item.product?.codigo_interno ?? "—"} · {formatSoles(item.precio_unitario)} c/u
                    </p>

                    <div className="mt-2 flex items-center gap-2">
                      <label className="sr-only" htmlFor={`cant-${item.id}`}>
                        Cantidad de {item.product?.descripcion ?? "la línea"}
                      </label>
                      <input
                        id={`cant-${item.id}`}
                        className="campo cifra h-11 min-h-11 w-[4.5rem] px-2 text-center"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        defaultValue={item.cantidad}
                        disabled={isPending}
                        onBlur={(e) => {
                          if (Number(e.target.value) !== item.cantidad) {
                            corregirCantidad(item.id, e.target.value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                      {cantidadGuardada === item.id ? (
                        <span
                          className="flex items-center gap-1 text-sm font-medium text-[#276b3b]"
                          role="status"
                        >
                          <IconCheck className="h-4 w-4" />
                          Guardado
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setDiscountFormItemId(discountFormItemId === item.id ? null : item.id)
                          }
                          className="min-h-11 rounded-lg px-2 text-sm font-medium text-[#1c6d71] hover:bg-logisalud-teal/10"
                        >
                          Precio especial
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => quitar(item.id)}
                        className="btn-ghost ml-auto hover:text-red-700"
                        disabled={isPending}
                        aria-label={`Quitar ${item.product?.descripcion ?? "la línea"} del pedido`}
                      >
                        <IconTrash className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {discountFormItemId === item.id && (
                    <form
                      onSubmit={(e) => pedirDescuento(item.id, e)}
                      className="mx-4 mb-4 flex flex-col gap-2 rounded-lg bg-slate-50 p-3"
                    >
                      <input type="hidden" name="cantidad" value={item.cantidad} />
                      <p className="text-sm text-slate-700">
                        Pedir un precio especial no cambia el pedido: queda como solicitud para que
                        la apruebe un aprobador comercial.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          name="precioSolicitado"
                          type="number"
                          step="0.0001"
                          placeholder="Precio solicitado"
                          className="campo cifra h-11 min-h-11 flex-1 text-sm"
                        />
                        <input
                          name="porcentajeDescuento"
                          type="number"
                          step="0.01"
                          placeholder="% descuento"
                          className="campo cifra h-11 min-h-11 flex-1 text-sm"
                        />
                      </div>
                      <textarea
                        name="motivo"
                        required
                        rows={2}
                        placeholder="Motivo (requerido)"
                        className="campo min-h-0 py-2 text-sm"
                      />
                      <input
                        name="competenciaNegociacion"
                        placeholder="Competencia / negociación (opcional)"
                        className="campo h-11 min-h-11 text-sm"
                      />
                      <input
                        name="comentario"
                        placeholder="Comentario (opcional)"
                        className="campo h-11 min-h-11 text-sm"
                      />
                      <button
                        type="submit"
                        className="btn-secondary self-start text-sm"
                        disabled={isPending}
                      >
                        Enviar solicitud
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/*
        El total no se recalcula acá: se suman las líneas que grabó el
        servidor, igual que el correo y el Excel, para que la pantalla no
        pueda contradecir a la base.
      */}
      <div className="barra-pie pt-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <div>
            <p className="text-sm text-slate-600">Total del pedido</p>
            <p className="cifra text-2xl font-semibold leading-tight text-slate-900">
              {formatSoles(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={enviar}
            className="btn-primary min-w-[9rem]"
            disabled={isPending || items.length === 0}
          >
            {isPending ? <IconSpinner className="h-5 w-5" /> : null}
            Enviar pedido
          </button>
        </div>
        {items.length === 0 && (
          <p className="mx-auto max-w-4xl px-4 pt-1.5 text-sm text-slate-600 sm:px-6">
            Agrega al menos un producto para poder enviarlo.
          </p>
        )}
      </div>
    </>
  );
}
