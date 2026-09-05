"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconError, IconPlus } from "@/components/icons";
import {
  UBIGEO_VACIO,
  UbigeoPicker,
  ubigeoCompleto,
  type UbigeoSeleccion,
} from "@/components/ubigeo-picker";
import { buscarDistritos, buscarProvincias, guardarDatosDelCliente, guardarDireccion } from "../actions";
import type { CustomerAddressDetail, CustomerDetail } from "@/services/customers";

type CatalogOption = { id: number; nombre: string };

const TIPOS_COMPROBANTE = ["FACTURA", "BOLETA", "FACTURA_O_BOLETA"];
const ESTADOS = ["ACTIVO", "PENDIENTE_DE_VALIDACION", "RECHAZADO", "INACTIVO"];

/**
 * Ficha de un cliente: datos básicos y direcciones, editables.
 *
 * Existe para dos trabajos concretos: corregir las direcciones cargadas a
 * mano, y cerrar las direcciones que la carga masiva de ubigeos dejó sin
 * resolver por un typo de distrito ("EL TAMBBO", "CHORRRILLOS"). Por eso
 * cada dirección se edita con el mismo selector en cascada que usa el
 * vendedor: el distrito se elige de la lista oficial y el ubigeo lo
 * resuelve el servidor, así el typo no se puede repetir.
 */
export function CustomerDetailForm({
  cliente,
  canales,
  zonas,
  condicionesPago,
  departamentos,
  puedeEditar,
}: {
  cliente: CustomerDetail;
  canales: CatalogOption[];
  zonas: CatalogOption[];
  condicionesPago: CatalogOption[];
  departamentos: string[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  function correr(accion: () => Promise<void>, marca: string) {
    setError(null);
    setGuardado(null);
    startTransition(async () => {
      try {
        await accion();
        setGuardado(marca);
        setEditando(null);
        setAgregando(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  function guardarBasicos(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    correr(
      () => guardarDatosDelCliente(cliente.ruc_o_documento, cliente.id, formData),
      "basicos",
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p className="aviso-error" role="alert">
          <IconError className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {!puedeEditar && (
        <p className="aviso-bloqueo" role="status">
          <span>
            Solo un administrador puede editar la ficha de un cliente. Podés ver los datos, pero los
            campos están bloqueados.
          </span>
        </p>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-heading text-lg">Datos del cliente</h3>
          {guardado === "basicos" && (
            <span
              className="flex items-center gap-1 text-sm font-medium text-[#276b3b]"
              role="status"
            >
              <IconCheck className="h-4 w-4" />
              Guardado
            </span>
          )}
        </div>

        <form onSubmit={guardarBasicos} className="card mt-3 flex flex-col gap-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="razonSocial">
                Razón social
              </label>
              <input
                id="razonSocial"
                name="razonSocial"
                required
                defaultValue={cliente.razon_social}
                disabled={!puedeEditar || isPending}
                className="campo"
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="nombreComercial">
                Nombre comercial
              </label>
              <input
                id="nombreComercial"
                name="nombreComercial"
                defaultValue={cliente.nombre_comercial ?? ""}
                disabled={!puedeEditar || isPending}
                className="campo"
              />
            </div>
          </div>

          <div>
            <p className="etiqueta">RUC / documento</p>
            {/*
              El RUC no se edita acá: es la identidad del cliente, la clave
              del importador y lo que aparece en cada comprobante emitido.
              Cambiarlo es dar de alta otro cliente.
            */}
            <p className="cifra text-sm text-slate-900">{cliente.ruc_o_documento}</p>
            <p className="text-xs text-slate-600">
              No se puede cambiar: identifica al cliente en los comprobantes ya emitidos y es la
              clave del importador.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="tipoComprobante">
                Comprobante permitido
              </label>
              <select
                id="tipoComprobante"
                name="tipoComprobante"
                defaultValue={cliente.tipo_comprobante_permitido}
                disabled={!puedeEditar || isPending}
                className="campo"
              >
                {TIPOS_COMPROBANTE.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-600">
                Un documento que no es RUC de contribuyente sólo admite BOLETA; la base rechaza lo
                demás.
              </p>
            </div>
            <div>
              <label className="etiqueta" htmlFor="estado">
                Estado
              </label>
              <select
                id="estado"
                name="estado"
                defaultValue={cliente.estado}
                disabled={!puedeEditar || isPending}
                className="campo"
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="etiqueta" htmlFor="canalId">
                Canal
              </label>
              <select
                id="canalId"
                name="canalId"
                defaultValue={cliente.canal_id ?? ""}
                disabled={!puedeEditar || isPending}
                className="campo"
              >
                <option value="">Sin canal</option>
                {canales.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-600">Decide el precio de lista de sus pedidos.</p>
            </div>
            <div>
              <label className="etiqueta" htmlFor="zonaId">
                Zona
              </label>
              <select
                id="zonaId"
                name="zonaId"
                defaultValue={cliente.zona_id ?? ""}
                disabled={!puedeEditar || isPending}
                className="campo"
              >
                <option value="">Sin zona</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-600">Decide qué vendedor lo ve.</p>
            </div>
            <div>
              <label className="etiqueta" htmlFor="condicionPagoHabitualId">
                Condición de pago habitual
              </label>
              <select
                id="condicionPagoHabitualId"
                name="condicionPagoHabitualId"
                defaultValue={cliente.condicion_pago_habitual_id ?? ""}
                disabled={!puedeEditar || isPending}
                className="campo"
              >
                <option value="">Sin condición habitual</option>
                {condicionesPago.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-600">
                Un pedido con otra condición cae en excepción administrativa.
              </p>
            </div>
          </div>

          {puedeEditar && (
            <button type="submit" className="btn-primary self-start" disabled={isPending}>
              Guardar datos
            </button>
          )}
        </form>
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-heading text-lg">
            Direcciones de entrega ({cliente.direcciones.length})
          </h3>
          {guardado === "direccion" && (
            <span
              className="flex items-center gap-1 text-sm font-medium text-[#276b3b]"
              role="status"
            >
              <IconCheck className="h-4 w-4" />
              Guardado
            </span>
          )}
        </div>

        {cliente.direcciones.length === 0 && (
          <p className="mt-3 text-sm text-slate-600">
            Este cliente no tiene ninguna dirección: no puede recibir un pedido hasta que se le
            registre una.
          </p>
        )}

        <ul className="mt-3 flex flex-col gap-3">
          {cliente.direcciones.map((d) => (
            <li key={d.id} className="card p-4">
              {editando === d.id && puedeEditar ? (
                <DireccionForm
                  direccion={d}
                  departamentos={departamentos}
                  isPending={isPending}
                  onCancelar={() => setEditando(null)}
                  onGuardar={(formData) =>
                    correr(
                      () =>
                        guardarDireccion(cliente.ruc_o_documento, cliente.id, d.id, formData),
                      "direccion",
                    )
                  }
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {d.direccion}
                      {d.es_principal && (
                        <span className="ml-2 rounded bg-logisalud-teal/15 px-2 py-0.5 text-xs font-medium text-[#1c6d71]">
                          Principal
                        </span>
                      )}
                    </p>
                    {d.referencia && (
                      <p className="text-sm text-slate-600">Referencia: {d.referencia}</p>
                    )}
                    {d.ubigeo ? (
                      <p className="text-sm text-slate-600">
                        {d.distrito} · {d.provincia} · {d.departamento}{" "}
                        <span className="cifra">({d.ubigeo})</span>
                      </p>
                    ) : (
                      <p className="text-sm font-medium text-amber-800">
                        Sin ubigeo: no se puede emitir la guía de remisión de esta dirección.
                        Elegí departamento, provincia y distrito para resolverlo.
                      </p>
                    )}
                  </div>
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => setEditando(d.id)}
                      className="btn-secondary shrink-0 text-sm"
                      disabled={isPending}
                    >
                      Editar
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {puedeEditar && !agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="btn-secondary mt-3 self-start"
            disabled={isPending}
          >
            <IconPlus className="h-5 w-5" />
            Agregar dirección
          </button>
        )}

        {puedeEditar && agregando && (
          <div className="card mt-3 p-4">
            <DireccionForm
              direccion={null}
              departamentos={departamentos}
              isPending={isPending}
              onCancelar={() => setAgregando(false)}
              onGuardar={(formData) =>
                correr(
                  () => guardarDireccion(cliente.ruc_o_documento, cliente.id, null, formData),
                  "direccion",
                )
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Alta y corrección de una dirección. El ubigeo se arma con el selector en
 * cascada y el botón no se habilita hasta tener los tres niveles: guardar
 * una dirección sin ubigeo es exactamente la deuda que esta pantalla vino
 * a pagar.
 */
function DireccionForm({
  direccion,
  departamentos,
  isPending,
  onGuardar,
  onCancelar,
}: {
  direccion: CustomerAddressDetail | null;
  departamentos: string[];
  isPending: boolean;
  onGuardar: (formData: FormData) => void;
  onCancelar: () => void;
}) {
  const [ubigeo, setUbigeo] = useState<UbigeoSeleccion>(UBIGEO_VACIO);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("departamento", ubigeo.departamento);
    formData.set("provincia", ubigeo.provincia);
    formData.set("distrito", ubigeo.distrito);
    onGuardar(formData);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <div>
        <label className="etiqueta" htmlFor={`dir-${direccion?.id ?? "nueva"}`}>
          Dirección
        </label>
        <input
          id={`dir-${direccion?.id ?? "nueva"}`}
          name="direccion"
          required
          defaultValue={direccion?.direccion ?? ""}
          disabled={isPending}
          className="campo"
        />
      </div>
      <div>
        <label className="etiqueta" htmlFor={`ref-${direccion?.id ?? "nueva"}`}>
          Referencia (opcional)
        </label>
        <input
          id={`ref-${direccion?.id ?? "nueva"}`}
          name="referencia"
          defaultValue={direccion?.referencia ?? ""}
          disabled={isPending}
          className="campo"
        />
      </div>

      {direccion?.ubigeo && (
        <p className="text-sm text-slate-600">
          Ubigeo actual: {direccion.distrito} · {direccion.provincia} · {direccion.departamento}{" "}
          <span className="cifra">({direccion.ubigeo})</span>. Volvé a elegirlo para cambiarlo.
        </p>
      )}

      <UbigeoPicker
        idPrefijo={`ubigeo-${direccion?.id ?? "nueva"}`}
        valor={ubigeo}
        onChange={setUbigeo}
        departamentos={departamentos}
        cargarProvincias={buscarProvincias}
        cargarDistritos={buscarDistritos}
        disabled={isPending}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="btn-primary text-sm"
          disabled={isPending || !ubigeoCompleto(ubigeo)}
          title={ubigeoCompleto(ubigeo) ? undefined : "Elegí departamento, provincia y distrito"}
        >
          {direccion ? "Guardar dirección" : "Agregar dirección"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="btn-ghost text-sm"
          disabled={isPending}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
