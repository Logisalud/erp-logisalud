"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconClose } from "./icons";

/**
 * Combobox de un solo campo: se escribe en el input, las sugerencias
 * caen debajo, y un click (o Enter) elige — sin un segundo control que
 * haya que volver a abrir.
 *
 * Está escrito a mano a propósito: el stack no trae ninguna librería de
 * combobox (ni shadcn/ui ni Radix ni headless UI), y las que hay filtran
 * del lado del cliente sobre una lista precargada — justo lo que acá NO
 * se puede hacer, porque la cartera son 3.4k clientes y la búsqueda vive
 * en el servidor. Traer Radix + cmdk para después desactivarles el
 * filtrado sería más código, no menos.
 *
 * Sigue el patrón WAI-ARIA de combobox con listbox: `role="combobox"` en
 * el input, `aria-expanded`, `aria-controls` y `aria-activedescendant`
 * apuntando a la opción resaltada.
 *
 * `required` marca `aria-required` pero NO pone un `required` nativo en un
 * input escondido: Chrome bloquea el submit sin decir nada cuando un
 * control inválido no es enfocable. La obligatoriedad se valida en el
 * submit del formulario y, de red, en la Server Action.
 */

export type ComboboxOption = {
  id: string;
  /** Texto principal, el que queda en el input al elegir. */
  label: string;
  /** Línea secundaria opcional (RUC, zona, etc.). */
  description?: string | null;
};

export function Combobox({
  name,
  selected,
  onSelect,
  onSearch,
  initialOptions = [],
  placeholder,
  minSearchLength = 2,
  debounceMs = 300,
  required = false,
  disabled = false,
  emptyMessage = "Sin coincidencias.",
  hint,
  label,
}: {
  /** Nombre del campo oculto que viaja en el FormData. */
  name: string;
  selected: ComboboxOption | null;
  onSelect: (option: ComboboxOption | null) => void;
  /** Búsqueda real (servidor). Recibe el término crudo. */
  onSearch: (term: string) => Promise<ComboboxOption[]>;
  /** Qué mostrar al enfocar sin haber escrito nada. */
  initialOptions?: ComboboxOption[];
  placeholder?: string;
  minSearchLength?: number;
  debounceMs?: number;
  required?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  hint?: string;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ComboboxOption[]>(initialOptions);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  /** true mientras el usuario está escribiendo, para no pisar su texto. */
  const [editing, setEditing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Solo la respuesta más reciente pinta: las lentas que llegan tarde se
  // descartan en vez de sobrescribir un resultado más nuevo.
  const searchToken = useRef(0);
  const listboxId = useId();

  // Lo que se ve en el input: mientras se escribe, lo escrito; si no, el
  // cliente elegido. Así el campo queda "con el cliente elegido" tras el
  // click, que es justo lo que se pide de un autocomplete.
  const inputValue = editing ? query : (selected?.label ?? "");

  useEffect(() => {
    const term = query.trim();

    if (!editing) return;

    if (term.length < minSearchLength) {
      searchToken.current++; // invalida cualquier búsqueda en vuelo
      setOptions(initialOptions);
      setLoading(false);
      setError(null);
      setHighlighted(0);
      return;
    }

    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      const token = ++searchToken.current;
      try {
        const results = await onSearch(term);
        if (token !== searchToken.current) return;
        setOptions(results);
        setHighlighted(0);
      } catch (err) {
        if (token !== searchToken.current) return;
        setError(err instanceof Error ? err.message : "No se pudo buscar.");
        setOptions([]);
      } finally {
        if (token === searchToken.current) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
    // `initialOptions` y `onSearch` vienen del padre; dependerlos acá
    // relanzaría la búsqueda en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, editing, minSearchLength, debounceMs]);

  // Click fuera: cierra y devuelve el input a mostrar lo elegido.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  function choose(option: ComboboxOption) {
    onSelect(option);
    setQuery("");
    setEditing(false);
    setOpen(false);
    // Que el foco vuelva al campo: en móvil evita que el teclado salte.
    inputRef.current?.focus();
  }

  function clear() {
    onSelect(null);
    setQuery("");
    setEditing(true);
    setOptions(initialOptions);
    setOpen(true);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setEditing(true);
        return;
      }
      setHighlighted((h) => (options.length === 0 ? 0 : (h + 1) % options.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (options.length === 0 ? 0 : (h - 1 + options.length) % options.length));
      return;
    }
    if (e.key === "Enter") {
      // Solo intercepta si hay una sugerencia que elegir: si no, deja que
      // el formulario haga lo suyo.
      if (open && options[highlighted]) {
        e.preventDefault();
        choose(options[highlighted]);
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setEditing(false);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      setEditing(false);
    }
  }

  const buscando = query.trim().length >= minSearchLength;
  const mostrarVacio = open && !loading && !error && options.length === 0;

  return (
    <div ref={containerRef} className="relative">
      {/* El valor que viaja en el submit. El input visible es solo la UI. */}
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-required={required}
          aria-label={label}
          aria-activedescendant={
            open && options[highlighted] ? `${listboxId}-${options[highlighted].id}` : undefined
          }
          autoComplete="off"
          disabled={disabled}
          value={inputValue}
          placeholder={placeholder}
          onChange={(e) => {
            setEditing(true);
            setQuery(e.target.value);
            setOpen(true);
            // Escribir encima de una selección la deshace: el campo no
            // puede mostrar un texto y mandar otro cliente en el submit.
            if (selected) onSelect(null);
          }}
          onFocus={() => {
            setOpen(true);
            if (!selected) setEditing(true);
          }}
          onKeyDown={handleKeyDown}
          className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2 pr-10"
        />

        {selected && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label="Quitar el cliente elegido"
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <IconClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-300 bg-white shadow-md"
        >
          {loading && <li className="px-3 py-2 text-sm text-gray-500">Buscando...</li>}

          {error && <li className="px-3 py-2 text-sm text-red-700">{error}</li>}

          {mostrarVacio && (
            <li className="px-3 py-2 text-sm text-gray-500">
              {buscando ? `${emptyMessage} para "${query.trim()}"` : emptyMessage}
            </li>
          )}

          {!loading &&
            !error &&
            options.map((option, i) => (
              <li key={option.id} id={`${listboxId}-${option.id}`} role="option" aria-selected={i === highlighted}>
                <button
                  type="button"
                  // onMouseDown: el click tiene que ganarle al blur del
                  // input, si no la lista se cierra antes de elegir.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`block min-h-12 w-full px-3 py-2 text-left ${
                    i === highlighted ? "bg-logisalud-green/10" : ""
                  }`}
                >
                  <span className="block text-sm text-gray-900">{option.label}</span>
                  {option.description && (
                    <span className="block text-xs text-gray-500">{option.description}</span>
                  )}
                </button>
              </li>
            ))}

          {hint && !loading && !error && !buscando && (
            <li className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500">{hint}</li>
          )}
        </ul>
      )}
    </div>
  );
}
