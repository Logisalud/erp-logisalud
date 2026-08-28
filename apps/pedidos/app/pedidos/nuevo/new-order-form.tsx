"use client";

import { useMemo, useState, useTransition } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { MENSAJE_SIN_DIRECCION } from "@/domain/customers";
import { MIN_SEARCH_LENGTH, displayRazonSocial } from "@/domain/customer-search";
import { IconAlert, IconError, IconPlus, IconSpinner } from "@/components/icons";
import {
  agregarDireccionCliente,
  buscarClientes,
  crearBorrador,
  crearClienteNuevo,
  getAddressesForCustomer,
} from "./actions";

type Seller = {
  id: string;
  codigo_representante: string;
  nombre_completo: string;
  zone: { nombre: string } | null;
};
type Customer = {
  id: string;
  razon_social: string;
  nombre_comercial?: string | null;
  ruc_o_documento: string;
};
type PaymentTerm = { id: number; nombre: string };
type CatalogOption = { id: number; nombre: string };
type Address = { id: string; direccion: string; es_principal: boolean };

/**
 * Un cliente como opción del combobox: el nombre limpio arriba (sin los
 * asteriscos que arrastra la cartera legacy) y el RUC abajo, que es el
 * otro dato por el que el vendedor lo reconoce.
 */
function toOption(c: Customer): ComboboxOption {
  const nombre = displayRazonSocial(c.razon_social);
  const comercial = c.nombre_comercial?.trim();
  const alias = comercial && comercial.toUpperCase() !== nombre.toUpperCase() ? ` — ${comercial}` : "";
  return { id: c.id, label: `${nombre}${alias}`, description: c.ruc_o_documento };
}

/**
 * Arranque del pedido: cliente, dirección y condición de pago.
 *
 * Es el mismo encabezado que después queda colapsado arriba de las líneas,
 * así que se ve igual acá y allá: el vendedor no cruza a "otra pantalla",
 * el encabezado se cierra y aparece la carga de productos.
 */
export function NewOrderForm({
  isAdmin,
  sellers,
  customers: initialCustomers,
  paymentTerms,
  salesChannels,
  zones,
}: {
  isAdmin: boolean;
  sellers: Seller[];
  customers: Customer[];
  paymentTerms: PaymentTerm[];
  salesChannels: CatalogOption[];
  zones: CatalogOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedOption, setSelectedOption] = useState<ComboboxOption | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState({ direccion: "", referencia: "" });
  const [newAddressError, setNewAddressError] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    razonSocial: "",
    rucODocumento: "",
    canalId: "",
    zonaId: "",
    condicionPagoHabitualId: "",
    direccion: "",
  });

  function updateNewCustomer(field: keyof typeof newCustomer, value: string) {
    setNewCustomer((prev) => ({ ...prev, [field]: value }));
  }

  // Cliente elegido, direcciones ya cargadas, y ninguna: el pedido queda
  // bloqueado hasta registrar una.
  const sinDireccion = !!selectedCustomerId && !loadingAddresses && addresses.length === 0;

  const initialOptions = useMemo(() => initialCustomers.map(toOption), [initialCustomers]);

  /**
   * Búsqueda real, en el SERVIDOR. No se filtra sobre una lista precargada:
   * son 3.4k clientes, PostgREST corta en 1.000 filas y el resto quedaba
   * invisible para el buscador. El debounce y el descarte de respuestas
   * viejas los hace el Combobox.
   */
  async function searchOptions(term: string): Promise<ComboboxOption[]> {
    const results = await buscarClientes(term);
    return results.map(toOption);
  }

  function handleAddAddress() {
    setNewAddressError(null);
    startTransition(async () => {
      try {
        const created = await agregarDireccionCliente({
          customerId: selectedCustomerId,
          direccion: newAddress.direccion,
          referencia: newAddress.referencia,
        });
        setAddresses((prev) => [...prev, created]);
        setSelectedAddressId(created.id);
        setNewAddress({ direccion: "", referencia: "" });
      } catch (err) {
        setNewAddressError(err instanceof Error ? err.message : "No se pudo guardar la dirección.");
      }
    });
  }

  function handleSelectCustomer(option: ComboboxOption | null) {
    const customerId = option?.id ?? "";
    setSelectedOption(option);
    setSelectedCustomerId(customerId);
    setAddresses([]);
    setSelectedAddressId("");
    setNewAddressError(null);
    setNewAddress({ direccion: "", referencia: "" });
    if (!customerId) return;
    setLoadingAddresses(true);
    startTransition(async () => {
      try {
        const result = (await getAddressesForCustomer(customerId)) as Address[];
        setAddresses(result);
        if (result.length === 1) setSelectedAddressId(result[0].id);
      } finally {
        setLoadingAddresses(false);
      }
    });
  }

  function handleCreateCustomer() {
    setNewCustomerError(null);
    startTransition(async () => {
      try {
        const { customer, addressId } = await crearClienteNuevo({
          razonSocial: newCustomer.razonSocial,
          rucODocumento: newCustomer.rucODocumento,
          canalId: Number(newCustomer.canalId),
          zonaId: Number(newCustomer.zonaId),
          condicionPagoHabitualId: Number(newCustomer.condicionPagoHabitualId),
          direccion: newCustomer.direccion,
        });
        // El cliente recién creado queda elegido en el mismo campo.
        setSelectedOption(toOption(customer));
        setSelectedCustomerId(customer.id);
        setAddresses([{ id: addressId, direccion: newCustomer.direccion, es_principal: true }]);
        setSelectedAddressId(addressId);
        setShowNewCustomerForm(false);
        setNewCustomer({
          razonSocial: "",
          rucODocumento: "",
          canalId: "",
          zonaId: "",
          condicionPagoHabitualId: "",
          direccion: "",
        });
      } catch (err) {
        setNewCustomerError(err instanceof Error ? err.message : "No se pudo registrar el cliente.");
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    // El combobox no usa `required` nativo (ver components/combobox.tsx),
    // así que el cliente se valida acá. La Server Action lo revalida.
    if (!selectedCustomerId) {
      setError("Elige un cliente.");
      return;
    }
    startTransition(async () => {
      try {
        await crearBorrador(formData);
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") return;
        setError(err instanceof Error ? err.message : "No se pudo crear el pedido.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="panel flex flex-col gap-4 p-4">
      {error && (
        <p className="aviso-error" role="alert">
          <IconError className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {isAdmin && (
        <div>
          <label className="etiqueta" htmlFor="sellerId">
            A nombre de qué vendedor
          </label>
          <select id="sellerId" name="sellerId" required className="campo">
            <option value="">Elige un vendedor</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre_completo} {s.zone ? `— ${s.zone.nombre}` : ""} ({s.codigo_representante})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label className="etiqueta mb-0">Cliente</label>
          <button
            type="button"
            onClick={() => setShowNewCustomerForm((v) => !v)}
            className="min-h-11 rounded-lg px-2 text-sm font-medium text-[#1c6d71] hover:bg-logisalud-teal/10"
          >
            {showNewCustomerForm ? "Cancelar" : "Cliente nuevo"}
          </button>
        </div>

        {showNewCustomerForm ? (
          <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
            <p className="aviso-info" role="note">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                El cliente queda pendiente de validación. Podés armarle el pedido, pero no se puede
                enviar hasta que Control de Pedidos lo apruebe.
              </span>
            </p>

            {newCustomerError && (
              <p className="aviso-error" role="alert">
                <IconError className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{newCustomerError}</span>
              </p>
            )}

            <input
              className="campo"
              placeholder="Razón social"
              value={newCustomer.razonSocial}
              onChange={(e) => updateNewCustomer("razonSocial", e.target.value)}
            />
            <input
              className="campo cifra"
              inputMode="numeric"
              placeholder="RUC o documento"
              value={newCustomer.rucODocumento}
              onChange={(e) => updateNewCustomer("rucODocumento", e.target.value)}
            />
            <select
              className="campo"
              value={newCustomer.canalId}
              onChange={(e) => updateNewCustomer("canalId", e.target.value)}
            >
              <option value="">Canal de venta</option>
              {salesChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              className="campo"
              value={newCustomer.zonaId}
              onChange={(e) => updateNewCustomer("zonaId", e.target.value)}
            >
              <option value="">Zona</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nombre}
                </option>
              ))}
            </select>
            <select
              className="campo"
              value={newCustomer.condicionPagoHabitualId}
              onChange={(e) => updateNewCustomer("condicionPagoHabitualId", e.target.value)}
            >
              <option value="">Condición de pago habitual</option>
              {paymentTerms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <input
              className="campo"
              placeholder="Dirección de entrega"
              value={newCustomer.direccion}
              onChange={(e) => updateNewCustomer("direccion", e.target.value)}
            />
            <button
              type="button"
              onClick={handleCreateCustomer}
              className="btn-secondary self-start"
              disabled={isPending}
            >
              {isPending ? <IconSpinner className="h-5 w-5" /> : null}
              Registrar cliente
            </button>
          </div>
        ) : (
          <Combobox
            name="customerId"
            required
            label="Cliente"
            selected={selectedOption}
            onSelect={handleSelectCustomer}
            onSearch={searchOptions}
            initialOptions={initialOptions}
            placeholder="Busca por RUC, razón social o nombre comercial..."
            minSearchLength={MIN_SEARCH_LENGTH}
            emptyMessage="Ningún cliente activo de tu cartera coincide"
            hint={`Escribe ${MIN_SEARCH_LENGTH} caracteres o más para buscar en toda tu cartera.`}
          />
        )}
      </div>

      {selectedCustomerId && (
        <div>
          <label className="etiqueta" htmlFor="customerAddressId">
            Dirección de entrega
          </label>
          {loadingAddresses ? (
            <p className="flex items-center gap-2 py-3 text-sm text-slate-600">
              <IconSpinner className="h-4 w-4" />
              Cargando direcciones...
            </p>
          ) : sinDireccion ? (
            // Bloqueo intencional, no advertencia: preferimos frenar la toma
            // del pedido a que salga un despacho sin dirección real (ver
            // docs/business-rules.md). La cartera migrada entró sin
            // direcciones, así que se captura acá mismo en vez de mandar al
            // vendedor a otra pantalla.
            <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-start gap-2.5 text-sm text-amber-900">
                <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{MENSAJE_SIN_DIRECCION}</span>
              </p>
              {newAddressError && (
                <p className="aviso-error" role="alert">
                  <IconError className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{newAddressError}</span>
                </p>
              )}
              <input
                className="campo"
                placeholder="Dirección de entrega"
                value={newAddress.direccion}
                onChange={(e) => setNewAddress((p) => ({ ...p, direccion: e.target.value }))}
              />
              <input
                className="campo"
                placeholder="Referencia (opcional)"
                value={newAddress.referencia}
                onChange={(e) => setNewAddress((p) => ({ ...p, referencia: e.target.value }))}
              />
              <button
                type="button"
                onClick={handleAddAddress}
                className="btn-secondary self-start"
                disabled={isPending || newAddress.direccion.trim() === ""}
              >
                {isPending ? <IconSpinner className="h-5 w-5" /> : <IconPlus className="h-5 w-5" />}
                Guardar dirección
              </button>
            </div>
          ) : (
            <select
              id="customerAddressId"
              name="customerAddressId"
              required
              className="campo"
              value={selectedAddressId}
              onChange={(e) => setSelectedAddressId(e.target.value)}
            >
              <option value="">Elige una dirección</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.direccion}
                  {a.es_principal ? " (principal)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div>
        <label className="etiqueta" htmlFor="paymentTermsId">
          Condición de pago
        </label>
        <select id="paymentTermsId" name="paymentTermsId" required className="campo">
          <option value="">Elige una condición</option>
          {paymentTerms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="btn-primary"
        disabled={isPending || !selectedCustomerId || !selectedAddressId}
      >
        {isPending ? <IconSpinner className="h-5 w-5" /> : null}
        Empezar el pedido
      </button>
    </form>
  );
}
