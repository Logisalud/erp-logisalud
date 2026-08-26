"use client";

export function ProductForm({
  suppliers,
  onCreate,
}: {
  suppliers: Array<{ id: number; nombre: string }>;
  onCreate: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={onCreate} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
      <input
        name="codigoInterno"
        placeholder="Código interno"
        required
        className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
      />
      <input
        name="codigoProveedor"
        placeholder="Código proveedor (opcional)"
        className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
      />
      <input
        name="descripcion"
        placeholder="Descripción"
        required
        className="min-h-12 rounded-lg border border-gray-300 px-3 py-2 sm:col-span-2"
      />
      <input
        name="presentacion"
        placeholder="Presentación (opcional)"
        className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
      />
      <input
        name="marca"
        placeholder="Marca (opcional)"
        className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
      />
      <select
        name="supplierId"
        className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        defaultValue=""
      >
        <option value="">Sin proveedor</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
      <input
        name="unidadMedida"
        placeholder="Unidad de medida"
        defaultValue="UND"
        className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="controlaLote" /> Controla lote
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="controlaVencimiento" /> Controla vencimiento
      </label>

      <div className="sm:col-span-2 border-t border-gray-200 pt-3">
        <p className="mb-2 text-sm font-semibold text-logisalud-teal">Perfil tributario inicial</p>
      </div>

      <select
        name="afectacionTributaria"
        className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        defaultValue="GRAVADO"
      >
        <option value="GRAVADO">GRAVADO</option>
        <option value="INAFECTO">INAFECTO</option>
      </select>
      <input
        name="tasaAplicable"
        type="number"
        step="0.01"
        placeholder="Tasa aplicable (%)"
        defaultValue="18"
        className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
      />

      <button type="submit" className="btn-primary self-start sm:col-span-2">
        Crear producto
      </button>
    </form>
  );
}
