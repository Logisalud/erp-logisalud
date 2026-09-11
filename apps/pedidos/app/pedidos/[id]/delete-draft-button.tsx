"use client";

import { useState, useTransition } from "react";
import { IconSpinner, IconTrash } from "@/components/icons";
import { borrarBorrador } from "./actions";

/**
 * Descartar un borrador.
 *
 * Pide confirmación en dos pasos en vez de un `confirm()` del navegador: en
 * el celular ese diálogo aparece pegado arriba, lejos del dedo, y se acepta
 * de rebote. Acá el botón destructivo solo aparece después del primer toque,
 * separado del "Enviar pedido" de la barra del pie para que no se confundan.
 */
export function DeleteDraftButton({ orderId }: { orderId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function borrar() {
    setError(null);
    startTransition(async () => {
      try {
        await borrarBorrador(orderId);
      } catch (err) {
        // `redirect()` corta la Server Action lanzando: eso no es un error.
        if (err && typeof err === "object" && "digest" in err && typeof err.digest === "string" && err.digest.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        setError(err instanceof Error ? err.message : "No se pudo borrar el pedido.");
        setConfirmando(false);
      }
    });
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {confirmando ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-700">
            Se borra el pedido con todas sus líneas y no se puede deshacer. Como todavía es un
            borrador, nadie lo recibió y no deja hueco en la numeración.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={borrar}
              disabled={isPending}
              className="btn-secondary border-red-300 text-sm text-red-700 hover:bg-red-50"
            >
              {isPending ? <IconSpinner className="h-4 w-4" /> : <IconTrash className="h-4 w-4" />}
              Sí, borrar el pedido
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={isPending}
              className="btn-secondary text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="btn-secondary text-sm text-red-700"
        >
          <IconTrash className="h-4 w-4" />
          Borrar este pedido
        </button>
      )}
    </div>
  );
}
