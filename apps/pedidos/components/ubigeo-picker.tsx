"use client";

import { useState } from "react";

export type UbigeoSeleccion = {
  departamento: string;
  provincia: string;
  distrito: string;
};

export const UBIGEO_VACIO: UbigeoSeleccion = {
  departamento: "",
  provincia: "",
  distrito: "",
};

export function ubigeoCompleto(valor: UbigeoSeleccion): boolean {
  return (
    valor.departamento.trim() !== "" &&
    valor.provincia.trim() !== "" &&
    valor.distrito.trim() !== ""
  );
}

/**
 * Departamento → provincia → distrito, en cascada.
 *
 * El vendedor elige los tres nombres y nunca ve el ubigeo: el código INEI
 * lo resuelve el servidor al guardar. Es la única forma de que la guía de
 * remisión salga con un ubigeo válido sin pedirle a nadie que memorice
 * "150119".
 *
 * Las listas se piden al servidor por nivel. Con 1.884 distritos, mandarlo
 * todo al navegador en cada carga de la pantalla es peso que el vendedor
 * paga en la calle, con datos móviles, casi siempre sin usarlo.
 */
export function UbigeoPicker({
  valor,
  onChange,
  departamentos,
  cargarProvincias,
  cargarDistritos,
  disabled,
  idPrefijo,
}: {
  valor: UbigeoSeleccion;
  onChange: (valor: UbigeoSeleccion) => void;
  departamentos: string[];
  cargarProvincias: (departamento: string) => Promise<string[]>;
  cargarDistritos: (departamento: string, provincia: string) => Promise<string[]>;
  disabled?: boolean;
  /** Para que los dos formularios de la misma pantalla no compartan ids. */
  idPrefijo: string;
}) {
  const [provincias, setProvincias] = useState<string[]>([]);
  const [distritos, setDistritos] = useState<string[]>([]);
  const [cargando, setCargando] = useState<"provincias" | "distritos" | null>(null);

  async function elegirDepartamento(departamento: string) {
    // Cambiar de departamento invalida lo de abajo: una provincia de Lima
    // no existe en Piura, y dejarla puesta haría fallar la resolución del
    // ubigeo en silencio.
    onChange({ departamento, provincia: "", distrito: "" });
    setProvincias([]);
    setDistritos([]);
    if (!departamento) return;
    setCargando("provincias");
    try {
      setProvincias(await cargarProvincias(departamento));
    } finally {
      setCargando(null);
    }
  }

  async function elegirProvincia(provincia: string) {
    onChange({ ...valor, provincia, distrito: "" });
    setDistritos([]);
    if (!provincia) return;
    setCargando("distritos");
    try {
      setDistritos(await cargarDistritos(valor.departamento, provincia));
    } finally {
      setCargando(null);
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div>
        <label className="etiqueta" htmlFor={`${idPrefijo}-departamento`}>
          Departamento
        </label>
        <select
          id={`${idPrefijo}-departamento`}
          className="campo"
          value={valor.departamento}
          disabled={disabled}
          onChange={(e) => void elegirDepartamento(e.target.value)}
        >
          <option value="">Elegir…</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="etiqueta" htmlFor={`${idPrefijo}-provincia`}>
          Provincia
        </label>
        <select
          id={`${idPrefijo}-provincia`}
          className="campo"
          value={valor.provincia}
          disabled={disabled || valor.departamento === "" || cargando === "provincias"}
          onChange={(e) => void elegirProvincia(e.target.value)}
        >
          <option value="">
            {cargando === "provincias"
              ? "Cargando…"
              : valor.departamento === ""
                ? "Elegí departamento"
                : "Elegir…"}
          </option>
          {provincias.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="etiqueta" htmlFor={`${idPrefijo}-distrito`}>
          Distrito
        </label>
        <select
          id={`${idPrefijo}-distrito`}
          className="campo"
          value={valor.distrito}
          disabled={disabled || valor.provincia === "" || cargando === "distritos"}
          onChange={(e) => onChange({ ...valor, distrito: e.target.value })}
        >
          <option value="">
            {cargando === "distritos"
              ? "Cargando…"
              : valor.provincia === ""
                ? "Elegí provincia"
                : "Elegir…"}
          </option>
          {distritos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
