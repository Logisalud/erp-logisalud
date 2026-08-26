"use client";

import { useState, useTransition } from "react";
import type { CompanySettings } from "@/services/company-settings";
import { guardarDatosEmpresa } from "./actions";

export function CompanyForm({ settings }: { settings: CompanySettings }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      try {
        await guardarDatosEmpresa(formData);
        setGuardado(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {guardado && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Datos guardados.</p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Razón social <span className="text-red-600">*</span>
        </label>
        <input
          name="razonSocial"
          required
          defaultValue={settings.razon_social}
          className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            RUC <span className="text-red-600">*</span>
          </label>
          <input
            name="ruc"
            required
            inputMode="numeric"
            defaultValue={settings.ruc}
            className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">Ubigeo (6 dígitos)</label>
          <input
            name="ubigeoCodigo"
            inputMode="numeric"
            defaultValue={settings.ubigeo_codigo ?? ""}
            placeholder="150119"
            className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Dirección del domicilio fiscal <span className="text-red-600">*</span>
        </label>
        <input
          name="direccion"
          required
          defaultValue={settings.direccion}
          className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
          <input
            name="telefono"
            defaultValue={settings.telefono ?? ""}
            className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={settings.email ?? ""}
            className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
      </div>

      <button type="submit" className="btn-primary self-start" disabled={isPending}>
        Guardar
      </button>
    </form>
  );
}
