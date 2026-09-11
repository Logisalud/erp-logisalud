"use client";

import { useMemo, useState, useTransition } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { PaymentTermsPicker, type PaymentTermOption } from "@/components/payment-terms-picker";
import { validarCondicionDePago } from "@/domain/payment-terms";
import { MENSAJE_SIN_DIRECCION } from "@/domain/customers";
import { MIN_SEARCH_LENGTH, displayRazonSocial } from "@/domain/customer-search";
import { IconAlert, IconError, IconPlus, IconSpinner } from "@/components/icons";
import {
  UBIGEO_VACIO,
  UbigeoPicker,
  ubigeoCompleto,
  type UbigeoSeleccion,
} from "@/components/ubigeo-picker";
import {
  agregarDireccionCliente,
  buscarDistritos,
  buscarProvincias,
  buscarClientes,
  crearBorrador,
  crearClienteNuevo,
  getAddressesForCustomer,
  type ClienteExistente,
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
  estado?: string;
};

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
  // Un cliente recién registrado aparece en la lista (si no, el vendedor no
  // volvería a encontrarlo), pero se dice que está sin validar: el pedido se
  // arma igual y queda esperando a Control de Pedidos.
  const pendiente = c.estado === "PENDIENTE_DE_VALIDACION" ? " · cliente nuevo, sin validar" : "";
  return {
    id: c.id,
    label: `${nombre}${alias}`,
    description: `${c.ruc_o_documento}${pendiente}`,
  };
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
  departamentos,
}: {
  isAdmin: boolean;
  sellers: Seller[];
  customers: Customer[];
  paymentTerms: PaymentTermOption[];
  salesChannels: CatalogOption[];
  /** Los 25 departamentos; provincias y distritos se piden al elegir. */
  departamentos: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedOption, setSelectedOption] = useState<ComboboxOption | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [condicion, setCondicion] = useState<{
    paymentTermsId: number | "";
    diasCredito: string;
  }>({ paymentTermsId: "", diasCredito: "" });
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  /**
   * Sólo lo usa el administrador, que elige a nombre de qué vendedor va el
   * pedido. Está acá y no suelto en el form porque el alta de cliente
   * también lo necesita: la zona del cliente sale de ese vendedor.
   */
  const [sellerId, setSellerId] = useState("");
  /** El cliente que ya tenía ese RUC, para poder elegirlo de un toque. */
  const [clienteExistente, setClienteExistente] = useState<ClienteExistente | null>(null);
  const [newAddress, setNewAddress] = useState({ direccion: "", referencia: "" });
  const [newAddressUbigeo, setNewAddressUbigeo] = useState<UbigeoSeleccion>(UBIGEO_VACIO);
  const [newCustomerUbigeo, setNewCustomerUbigeo] = useState<UbigeoSeleccion>(UBIGEO_VACIO);
  const [newAddressError, setNewAddressError] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    razonSocial: "",
    rucODocumento: "",
    canalId: "",
    condicionPagoHabitualId: "",
    direccion: "",
    celular: "",
    direccionFiscal: "",
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
      const resultado = await agregarDireccionCliente({
        customerId: selectedCustomerId,
        direccion: newAddress.direccion,
        referencia: newAddress.referencia,
        departamento: newAddressUbigeo.departamento,
        provincia: newAddressUbigeo.provincia,
        distrito: newAddressUbigeo.distrito,
      });
      if (!resultado.ok) {
        setNewAddressError(resultado.mensaje);
        return;
      }
      const created = resultado.direccion;
      setAddresses((prev) => [...prev, created]);
      setSelectedAddressId(created.id);
      setNewAddress({ direccion: "", referencia: "" });
      setNewAddressUbigeo(UBIGEO_VACIO);
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
    setNewAddressUbigeo(UBIGEO_VACIO);
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
    setClienteExistente(null);
    startTransition(async () => {
      const resultado = await crearClienteNuevo({
        razonSocial: newCustomer.razonSocial,
        rucODocumento: newCustomer.rucODocumento,
        canalId: Number(newCustomer.canalId),
        sellerId: sellerId || null,
        condicionPagoHabitualId: Number(newCustomer.condicionPagoHabitualId),
        direccion: newCustomer.direccion,
        celular: newCustomer.celular,
        direccionFiscal: newCustomer.direccionFiscal,
        departamento: newCustomerUbigeo.departamento,
        provincia: newCustomerUbigeo.provincia,
        distrito: newCustomerUbigeo.distrito,
      });

      if (!resultado.ok) {
        setNewCustomerError(resultado.mensaje);
        // El RUC ya estaba en la cartera: se ofrece elegir ese cliente, que
        // es lo que el vendedor quería hacer.
        setClienteExistente(resultado.clienteExistente ?? null);
        return;
      }

      const { customer, addressId } = resultado;
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
        condicionPagoHabitualId: "",
        direccion: "",
        celular: "",
        direccionFiscal: "",
      });
      setNewCustomerUbigeo(UBIGEO_VACIO);
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
    if (condicion.paymentTermsId === "") {
      setError("Elige una condición de pago.");
      return;
    }
    const validacion = validarCondicionDePago(paymentTerms, condicion);
    if (!validacion.ok) {
      setError(validacion.mensaje);
      return;
    }
    startTransition(async () => {
      // En el camino feliz esto no vuelve: la acción termina en un
      // `redirect()` al pedido recién creado.
      const resultado = await crearBorrador(formData);
      if (resultado && !resultado.ok) setError(resultado.mensaje);
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
          <select
            id="sellerId"
            name="sellerId"
            required
            className="campo"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
          >
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
                enviar hasta que Control de Pedidos lo apruebe. La zona no se pregunta: es la tuya,
                la misma con la que sale el pedido.
              </span>
            </p>

            {newCustomerError && (
              <p className="aviso-error" role="alert">
                <IconError className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{newCustomerError}</span>
              </p>
            )}

            {/*
              El RUC ya estaba en la cartera. Decirlo y quedarse ahí obliga a
              cerrar el formulario, volver al buscador y escribir el RUC otra
              vez; el vendedor está parado en el mostrador. Se ofrece elegirlo
              de un toque, que es lo que quería hacer.
            */}
            {clienteExistente && (
              <div className="rounded-lg border border-slate-300 bg-white p-3">
                <p className="font-medium text-slate-900">
                  {displayRazonSocial(clienteExistente.razonSocial)}
                </p>
                <p className="cifra mt-0.5 text-sm text-slate-600">
                  {clienteExistente.rucODocumento}
                  {clienteExistente.estado === "PENDIENTE_DE_VALIDACION"
                    ? " · pendiente de validación"
                    : ""}
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-2 text-sm"
                  onClick={() => {
                    const c = clienteExistente;
                    setClienteExistente(null);
                    setNewCustomerError(null);
                    setShowNewCustomerForm(false);
                    handleSelectCustomer({
                      id: c.id,
                      label: displayRazonSocial(c.razonSocial),
                      description: c.rucODocumento,
                    });
                  }}
                >
                  Usar este cliente
                </button>
              </div>
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
              value={newCustomer.condicionPagoHabitualId}
              onChange={(e) => updateNewCustomer("condicionPagoHabitualId", e.target.value)}
            >
              <option value="">Condición de pago habitual</option>
              {/*
                La opción de días a mano no puede ser la condición HABITUAL de
                un cliente: es un plazo distinto en cada pedido, no una
                costumbre contra la cual comparar.
              */}
              {paymentTerms
                .filter((p) => !p.permite_dias_libres)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
            <input
              className="campo"
              inputMode="tel"
              placeholder="Celular (opcional)"
              value={newCustomer.celular}
              onChange={(e) => updateNewCustomer("celular", e.target.value)}
            />
            {/*
              Las dos direcciones son distintas y se confunden fácil, así
              que cada una lleva su etiqueta: la fiscal es la del RUC (una
              sola, la que va a pedir el comprobante) y la de entrega es a
              dónde llega la mercadería (puede haber varias).
            */}
            <div>
              <label className="etiqueta" htmlFor="cliente-nuevo-direccion-fiscal">
                Dirección fiscal (RUC) — opcional
              </label>
              <input
                id="cliente-nuevo-direccion-fiscal"
                className="campo"
                placeholder="Domicilio fiscal declarado en SUNAT"
                value={newCustomer.direccionFiscal}
                onChange={(e) => updateNewCustomer("direccionFiscal", e.target.value)}
              />
              <p className="text-xs text-slate-600">
                No frena el registro, pero conviene cargarla si la tenés a mano: es la que va a
                necesitar la factura o boleta electrónica.
              </p>
            </div>
            <div>
              <label className="etiqueta" htmlFor="cliente-nuevo-direccion-entrega">
                Dirección de entrega
              </label>
              <input
                id="cliente-nuevo-direccion-entrega"
                className="campo"
                placeholder="A dónde se entrega la mercadería"
                value={newCustomer.direccion}
                onChange={(e) => updateNewCustomer("direccion", e.target.value)}
              />
            </div>
            {/*
              El distrito no es un dato de relleno: de ahí sale el ubigeo del
              punto de llegada de la guía de remisión. El vendedor elige los
              tres nombres y el servidor resuelve el código.
            */}
            <UbigeoPicker
              idPrefijo="cliente-nuevo"
              valor={newCustomerUbigeo}
              onChange={setNewCustomerUbigeo}
              departamentos={departamentos}
              cargarProvincias={buscarProvincias}
              cargarDistritos={buscarDistritos}
              disabled={isPending}
            />
            <button
              type="button"
              onClick={handleCreateCustomer}
              className="btn-secondary self-start"
              disabled={isPending || !ubigeoCompleto(newCustomerUbigeo)}
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
            emptyMessage="Ningún cliente de tu cartera coincide"
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
              <UbigeoPicker
                idPrefijo="direccion-nueva"
                valor={newAddressUbigeo}
                onChange={setNewAddressUbigeo}
                departamentos={departamentos}
                cargarProvincias={buscarProvincias}
                cargarDistritos={buscarDistritos}
                disabled={isPending}
              />
              <button
                type="button"
                onClick={handleAddAddress}
                className="btn-secondary self-start"
                disabled={
                  isPending ||
                  newAddress.direccion.trim() === "" ||
                  !ubigeoCompleto(newAddressUbigeo)
                }
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

      <PaymentTermsPicker
        paymentTerms={paymentTerms}
        paymentTermsId={condicion.paymentTermsId}
        diasCredito={condicion.diasCredito}
        onChange={setCondicion}
        idPrefix="condicion-nuevo"
      />

      <button
        type="submit"
        className="btn-primary"
        disabled={
          isPending || !selectedCustomerId || !selectedAddressId || condicion.paymentTermsId === ""
        }
      >
        {isPending ? <IconSpinner className="h-5 w-5" /> : null}
        Empezar el pedido
      </button>
    </form>
  );
}
