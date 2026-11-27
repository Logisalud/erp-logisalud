"use client";

import React, { useEffect, useState } from "react";

const STORAGE_KEY = "logisalud_dashboard_auth";
const PASSWORD_REQUIRED = "logisalud";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Verificar si ya tiene la sesión guardada
    try {
      const savedAuth = localStorage.getItem(STORAGE_KEY);
      const hasCookie = document.cookie.includes(`${STORAGE_KEY}=true`);
      if (savedAuth === "true" || hasCookie) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim().toLowerCase() === PASSWORD_REQUIRED) {
      try {
        localStorage.setItem(STORAGE_KEY, "true");
        document.cookie = `${STORAGE_KEY}=true; path=/; max-age=2592000; SameSite=Lax`;
      } catch {}
      setError(false);
      setIsAuthenticated(true);
    } else {
      setError(true);
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      document.cookie = `${STORAGE_KEY}=; path=/; max-age=0`;
    } catch {}
    setIsAuthenticated(false);
    setPassword("");
  };

  // Cargando verificación inicial
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090d16] text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-logisalud-green border-t-transparent" />
          <span className="text-xs font-mono">Verificando acceso...</span>
        </div>
      </div>
    );
  }

  // Si está autenticado, renderiza el dashboard y pasa función de logout en contexto/evento si se desea
  if (isAuthenticated) {
    return (
      <div className="relative">
        {children}
      </div>
    );
  }

  // Pantalla de Ingreso con Contraseña
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090d16] px-4 py-8 text-slate-100">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#0f172a] p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          {/* Logo y Encabezado */}
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-logisalud-green/10 border border-logisalud-green/30 text-2xl">
            🔒
          </div>

          <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-white">
            LOGISALUD
          </h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-logisalud-teal">
            Centro de Monitoreo en Vivo
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Ingresa la contraseña para acceder al mapa de pedidos y flota.
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoFocus
                placeholder="Contraseña de acceso"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(false);
                }}
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 bg-slate-900/90 text-white ${
                  error
                    ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
                    : "border-slate-700 focus:border-logisalud-green focus:ring-2 focus:ring-logisalud-green/20"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                title={showPassword ? "Ocultar" : "Mostrar"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            {error && (
              <p className="mt-2 text-xs font-medium text-red-400 animate-fadeIn">
                Contraseña incorrecta. Inténtalo de nuevo.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-logisalud-green py-3 text-sm font-bold text-white shadow-lg shadow-logisalud-green/20 hover:bg-emerald-600 active:scale-[0.98] transition"
          >
            Ingresar al Dashboard →
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800/80 pt-4 text-center">
          <span className="text-[11px] text-slate-500 font-mono">
            Acceso restringido • Operaciones LOGISALUD
          </span>
        </div>
      </div>
    </div>
  );
}

export function logoutDashboard() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = `${STORAGE_KEY}=; path=/; max-age=0`;
    window.location.reload();
  } catch {}
}
