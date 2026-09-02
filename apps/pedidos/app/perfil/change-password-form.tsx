"use client";

import { useState, useTransition } from "react";
import { changePassword } from "./actions";

export function ChangePasswordForm() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      const res = await changePassword(formData);
      setResult(res);
      if (res.ok) {
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card flex max-w-sm flex-col gap-3 p-5">
      {result && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {result.message}
        </p>
      )}

      <label className="text-sm text-gray-600">
        Contraseña actual
        <input
          type="password"
          name="currentPassword"
          required
          className="mt-1 min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="text-sm text-gray-600">
        Contraseña nueva
        <input
          type="password"
          name="newPassword"
          required
          minLength={8}
          className="mt-1 min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="text-sm text-gray-600">
        Confirmar contraseña nueva
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          className="mt-1 min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <button type="submit" className="btn-primary self-start" disabled={isPending}>
        Cambiar contraseña
      </button>
    </form>
  );
}
