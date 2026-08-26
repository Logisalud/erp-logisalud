"use client";

export default function AprobadorComercialError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card-highlight flex flex-col gap-3 p-6">
      <h2 className="text-lg font-semibold text-logisalud-teal">No se pudo cargar esta pantalla</h2>
      <p className="text-sm text-gray-600">
        Hubo un problema al cargar las solicitudes de descuento. Intenta de nuevo; si el
        problema sigue, avisa al administrador con el código de error.
      </p>
      {error.digest && <p className="text-xs text-gray-400">Código: {error.digest}</p>}
      <button type="button" onClick={reset} className="btn-secondary self-start">
        Reintentar
      </button>
    </div>
  );
}
