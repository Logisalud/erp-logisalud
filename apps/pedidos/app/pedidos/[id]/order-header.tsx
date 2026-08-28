"use client";

import { useState, useTransition } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { displayRazonSocial, MIN_SEARCH_LENGTH } from "@/domain/customer-search";
import { IconAlert, IconChevronDown, IconEdit, IconError, IconSpinner } from "@/components/icons";
import {
  buscarClientesParaPedido,
  cambiarCliente,
  cambiarDireccion,
  getDireccionesDeCliente,
  actualizarCondicionPago,
} from "./actions";

type Address = { id: string; direccion: string; es_principal: boolean };
type PaymentTerm = { id: number; nombre: string };

/**
 * Encabezado del pedido: cliente, dirección de entrega y condición de pago.
 *
 * Colapsado por defecto una vez resuelto, para que la pantalla se entregue a
 * lo que de verdad ocupa el tiempo del vendedor: cargar líneas. Reabrirlo
 * para corregir algo **nunca toca las líneas ya cargadas** — las tres
 * acciones del servidor escriben solo en `orders`.
 *
 * El cliente es el único de los tres que puede estar bloqueado, y por una
 * razón de datos, no de comodidad: el precio de cada línea se resuelve por
 * el canal del cliente, así que cambiarlo con líneas cargadas dejaría
 * precios que no le corresponden. El servidor lo permite solo si ninguna
 * línea cambia de precio, y si no, devuelve qué producto lo impide.
 */
export function OrderHeader({
  orderId,
  customer,
  address,
  paymentTerms,
  currentPaymentTermsId,
  tieneLineas,
}: {
  orderId: string;
  customer: { id: string; razonSocial: string; rucODocumento: string };
  address: { id: string; direccion: string };
  paymentTerms: PaymentTerm[];
  currentPaymentTermsId: number;
  tieneLineas: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [clienteElegido, setClienteElegido] = useState<ComboboxOption | null>({
    id: customer.id,
    label: displayRazonSocial(customer.razonSocial),
    description: customer.rucODocumento,
  });
  const [direcciones, setDirecciones] = useState<Address[] | null>(null);
  const [direccionId, setDireccionId] = useState(address.id);
  const [condicionId, setCondicionId] = useState(currentPaymentTermsId);

  const [error, setError] = useState<string | null>(null);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const cambioDeCliente = clienteElegido !== null && clienteElegido.id !== customer.id;

  function abrir() {
    setAbierto(true);
    setError(null);
    setBloqueo(null);
    setGuardado(false);
    if (direcciones === null) {
      startTransition(async () => {
        try {
          const result = (await getDireccionesDeCliente(customer.id)) as Address[];
          setDirecciones(result);
        } catch {
          setDirecciones([]);
        }
      });
    }
  }

  function cerrar() {
    // Cancelar devuelve los campos a lo que está grabado, sin efectos.
    setAbierto(false);
    setClienteElegido({
      id: customer.id,
      label: displayRazonSocial(customer.razonSocial),
      description: customer.rucODocumento,
    });
    setDireccionId(address.id);
    setCondicionId(currentPaymentTermsId);
    setError(null);
    setBloqueo(null);
  }

  async function elegirCliente(option: ComboboxOption | null) {
    setClienteElegido(option);
    setBloqueo(null);
    setError(null);
    if (!option) {
      setDirecciones([]);
      setDireccionId("");
      return;
    }
    // Al cambiar de cliente hay que recargar sus direcciones: la del cliente
    // anterior no sirve, y guardar con ella apuntaría el despacho a otro lado.
    setDirecciones(null);
    setDireccionId("");
    startTransition(async () => {
      try {
        const result = (await getDireccionesDeCliente(option.id)) as Address[];
        setDirecciones(result);
        if (result.length === 1) setDireccionId(result[0].id);
      } catch {
        setDirecciones([]);
      }
    });
  }

  function guardar() {
    setError(null);
    setBloqueo(null);
    setGuardado(false);

    if (!clienteElegido) {
      setError("Elige un cliente.");
      return;
    }
    if (!direccionId) {
      setError("Elige una dirección de entrega.");
      return;
    }

    startTransition(async () => {
      try {
        if (cambioDeCliente) {
          const r = await cambiarCliente(orderId, clienteElegido.id, direccionId);
          if (!r.ok) {
            setBloqueo(r.mensaje);
            return;
          }
        } else if (direccionId !== address.id) {
          await cambiarDireccion(orderId, direccionId);
        }

        if (condicionId !== currentPaymentTermsId) {
          const fd = new FormData();
          fd.set("paymentTermsId", String(condicionId));
          await actualizarCondicionPago(orderId, fd);
        }

        setGuardado(true);
        setAbierto(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el encabezado.");
      }
    });
  }

  const condicionActual = paymentTerms.find((p) => p.id === currentPaymentTermsId)?.nombre ?? "—";

  if (!abierto) {
    return (
      <section className="panel p-4" aria-labelledby="encabezado-titulo">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="encabezado-titulo" className="line-clamp-2 text-lg leading-snug text-slate-900">
              {displayRazonSocial(customer.razonSocial)}
            </h2>
            <p className="cifra mt-0.5 text-sm text-slate-600">{customer.rucODocumento}</p>
          </div>
          <button type="button" onClick={abrir} className="btn-secondary shrink-0 px-4 text-sm">
            <IconEdit className="h-4 w-4" />
            Editar
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0 text-slate-600">Entrega:</dt>
            <dd className="min-w-0 text-slate-900">{address.direccion}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-slate-600">Pago:</dt>
            <dd className="text-slate-900">{condicionActual}</dd>
          </div>
        </dl>

        {guardado && (
          <p className="aviso-ok mt-3" role="status">
            <IconChevronDown className="mt-0.5 h-4 w-4 shrink-0 rotate-[-90deg]" />
            <span>Encabezado actualizado. Las líneas del pedido no se tocaron.</span>
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="panel p-4" aria-labelledby="encabezado-titulo">
      <h2 id="encabezado-titulo" className="text-lg text-slate-900">
        Datos del pedido
      </h2>
      {tieneLineas && (
        <p className="mt-1 text-sm text-slate-600">
          Corregir estos datos no borra los productos que ya cargaste.
        </p>
      )}

      {bloqueo && (
        <p className="aviso-bloqueo mt-3" role="alert">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{bloqueo}</span>
        </p>
      )}
      {error && (
        <p className="aviso-error mt-3" role="alert">
          <IconError className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <label className="etiqueta" htmlFor="cliente-combobox">
            Cliente
          </label>
          <Combobox
            name="customerId"
            label="Cliente"
            selected={clienteElegido}
            onSelect={elegirCliente}
            onSearch={async (term) => {
              const results = await buscarClientesParaPedido(term);
              return results.map((c) => ({
                id: c.id,
                label: displayRazonSocial(c.razon_social),
                description: c.ruc_o_documento,
              }));
            }}
            placeholder="Busca por RUC o razón social..."
            minSearchLength={MIN_SEARCH_LENGTH}
            emptyMessage="Ningún cliente activo de tu cartera coincide"
          />
          {tieneLineas && (
            <p className="mt-1.5 text-sm text-slate-600">
              Si el cliente nuevo tiene otra lista de precios, el cambio se frena y te decimos qué
              producto lo impide.
            </p>
          )}
        </div>

        <div>
          <label className="etiqueta" htmlFor="direccion">
            Dirección de entrega
          </label>
          {direcciones === null ? (
            <p className="flex items-center gap-2 py-3 text-sm text-slate-600">
              <IconSpinner className="h-4 w-4" />
              Cargando direcciones...
            </p>
          ) : direcciones.length === 0 ? (
            <p className="aviso-bloqueo" role="alert">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Este cliente no tiene una dirección de entrega activa, así que no se le puede
                facturar el pedido. Regístrala desde la ficha del cliente y vuelve.
              </span>
            </p>
          ) : (
            <select
              id="direccion"
              className="campo"
              value={direccionId}
              onChange={(e) => setDireccionId(e.target.value)}
            >
              <option value="">Elige una dirección</option>
              {direcciones.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.direccion}
                  {d.es_principal ? " (principal)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="etiqueta" htmlFor="condicion">
            Condición de pago
          </label>
          <select
            id="condicion"
            className="campo"
            value={condicionId}
            onChange={(e) => setCondicionId(Number(e.target.value))}
          >
            {paymentTerms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={guardar} className="btn-primary flex-1" disabled={isPending}>
          {isPending ? <IconSpinner className="h-5 w-5" /> : null}
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>
        <button type="button" onClick={cerrar} className="btn-secondary" disabled={isPending}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
