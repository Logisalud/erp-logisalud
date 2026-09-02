"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "@/lib/auth/actions";

function initialsFrom(fullName: string | null, email: string | null): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

export function UserMenu({
  fullName,
  email,
  roleLabel,
  perfilHref,
}: {
  fullName: string | null;
  email: string | null;
  roleLabel: string | null;
  /** Si no se pasa, el ítem "Mi perfil" no se muestra. */
  perfilHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = initialsFrom(fullName, email);
  const displayName = fullName ?? email ?? "Usuario";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menú de usuario"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-logisalud-green text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-20 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
        >
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="truncate font-medium text-gray-900">{displayName}</p>
            {roleLabel && <p className="text-sm text-gray-500">{roleLabel}</p>}
          </div>

          {perfilHref && (
            <Link
              href={perfilHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Mi perfil (cambiar contraseña)
            </Link>
          )}

          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
