'use client';

import { Button } from './Button';

type Props = {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  variantePeligro?: boolean;
  cargando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  textoConfirmar?: string;
};

// Diálogo de confirmación simple — para acciones que no se pueden deshacer
// (anular, eliminar). No usa ninguna librería de modal nueva: overlay +
// panel centrado, bloqueado a teclado/mouse fuera del panel.
export function ConfirmDialog({ abierto, titulo, descripcion, variantePeligro, cargando, onConfirmar, onCancelar, textoConfirmar = 'Confirmar' }: Props) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-ds-card bg-white p-5 shadow-ds-xl font-poppins">
        <h2 className="font-oswald text-lg uppercase tracking-wide text-ink-900">{titulo}</h2>
        {descripcion && <p className="mt-2 text-sm text-ink-500">{descripcion}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variante="secundario" onClick={onCancelar} disabled={cargando}>Cancelar</Button>
          <Button variante={variantePeligro ? 'peligro' : 'primario'} onClick={onConfirmar} cargando={cargando}>{textoConfirmar}</Button>
        </div>
      </div>
    </div>
  );
}
