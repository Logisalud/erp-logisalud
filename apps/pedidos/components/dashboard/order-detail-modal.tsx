"use client";

import React from "react";
import Link from "next/link";
import { RealtimeOrder } from "../../domain/dashboard-types";

interface OrderDetailModalProps {
  order: RealtimeOrder | null;
  onClose: () => void;
  isTvMode: boolean;
}

export function OrderDetailModal({ order, onClose, isTvMode }: OrderDetailModalProps) {
  if (!order) return null;

  // Pasos del flujo
  const STEPS = [
    { id: "SUBMITTED", label: "Enviado" },
    { id: "READY_FOR_OPERATIONS", label: "Listo Picking" },
    { id: "IN_TRANSIT", label: "En Ruta" },
    { id: "DELIVERED", label: "Entregado" },
  ];

  const getStepIndex = (status: string) => {
    switch (status) {
      case "DRAFT":
      case "SUBMITTED":
        return 0;
      case "READY_FOR_OPERATIONS":
        return 1;
      case "IN_TRANSIT":
        return 2;
      case "DELIVERED":
        return 3;
      default:
        return 1;
    }
  };

  const currentStep = getStepIndex(order.estado);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className={`relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl transition-all ${
          isTvMode
            ? "border-slate-800 bg-[#0f172a] text-white"
            : "border-slate-200 bg-white text-slate-800"
        }`}
      >
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between border-b border-slate-700/40 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="font-heading font-bold text-2xl text-logisalud-green">
              {order.codigo}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                order.estado === "DELIVERED"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : order.estado === "IN_TRANSIT"
                  ? "bg-purple-500/20 text-purple-400"
                  : order.estado === "READY_FOR_OPERATIONS"
                  ? "bg-cyan-500/20 text-cyan-400"
                  : order.estado === "EXCEPTION"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {order.estadoLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-700/30 text-lg hover:bg-slate-700/60 transition"
            aria-label="Cerrar detalle"
          >
            ✕
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* 1. Stepper de Estado */}
          <div className="rounded-xl border border-slate-700/30 p-4 bg-slate-500/5">
            <div className="flex items-center justify-between relative">
              <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-slate-700/40 z-0" />
              {STEPS.map((s, idx) => {
                const isPassed = idx <= currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <div key={s.id} className="relative z-10 flex flex-col items-center">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                        isCurrent
                          ? "ring-4 ring-logisalud-green/30 bg-logisalud-green text-white"
                          : isPassed
                          ? "bg-emerald-600 text-white"
                          : isTvMode
                          ? "bg-slate-800 text-slate-400"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {isPassed ? "✓" : idx + 1}
                    </div>
                    <span
                      className={`mt-1.5 text-[11px] font-medium text-center ${
                        isCurrent
                          ? "text-logisalud-green font-bold"
                          : isPassed
                          ? isTvMode
                            ? "text-white"
                            : "text-slate-800"
                          : "text-slate-400"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Grid de Información: Cliente y Destino */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700/30 p-3.5 bg-slate-500/5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Cliente & RUC
              </span>
              <p className="mt-1 font-bold text-sm leading-tight">
                {order.cliente.razonSocial}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                RUC: <span className="font-mono">{order.cliente.ruc}</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Contacto: {order.cliente.contacto} ({order.cliente.telefono})
              </p>
            </div>

            <div className="rounded-xl border border-slate-700/30 p-3.5 bg-slate-500/5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Destino & Reparto
              </span>
              <p className="mt-1 font-bold text-sm leading-tight">
                {order.destino.direccion}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Distrito: <span className="font-semibold text-logisalud-teal">{order.destino.distrito}</span> ({order.destino.zonaNombre})
              </p>
              {order.destino.referencia && (
                <p className="text-xs text-slate-400 mt-1 italic">
                  Ref: {order.destino.referencia}
                </p>
              )}
            </div>
          </div>

          {/* 3. Información de Despacho y Vehículo */}
          {order.conductorAsignado && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-purple-300">
                  🚚 Despacho Asignado
                </span>
                <span className="font-mono text-purple-300">
                  Ventana: {order.ventanaEntrega}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-4 text-purple-200">
                <span>
                  <strong>Conductor:</strong> {order.conductorAsignado.nombre}
                </span>
                <span>
                  <strong>Vehículo:</strong> {order.conductorAsignado.vehiculo}
                </span>
                <span>
                  <strong>Placa:</strong> {order.conductorAsignado.placa}
                </span>
                <span>
                  <strong>Celular:</strong> {order.conductorAsignado.telefono}
                </span>
              </div>
            </div>
          )}

          {/* 4. Lista de Productos del Pedido */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Detalle de Medicamentos ({order.items.length} ítems)
              </span>
              <span className="text-xs text-slate-400">
                Vendedor: <strong>{order.vendedor}</strong>
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-700/30">
              <table className="w-full text-left text-xs">
                <thead
                  className={`border-b ${
                    isTvMode
                      ? "border-slate-800 bg-slate-900 text-slate-400"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <tr>
                    <th className="p-2.5">Código / Descripción</th>
                    <th className="p-2.5 text-center">Cant.</th>
                    <th className="p-2.5 text-right">P. Unit.</th>
                    <th className="p-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/20">
                  {order.items.map((it) => (
                    <tr key={it.id}>
                      <td className="p-2.5">
                        <div className="font-semibold leading-tight">{it.descripcion}</div>
                        <div className="text-[11px] text-slate-400">
                          {it.codigo} • {it.laboratorio}
                        </div>
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold">
                        {it.cantidad}
                      </td>
                      <td className="p-2.5 text-right font-mono">
                        S/ {it.precioUnitario.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold">
                        S/ {it.subtotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Totalización */}
          <div
            className={`flex items-center justify-between rounded-xl border p-4 ${
              isTvMode
                ? "border-slate-800 bg-slate-900"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <div>
              <span className="text-xs text-slate-400">Condición de Pago:</span>
              <p className="font-semibold text-xs">{order.condicionPago}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Total Pedido (inc. IGV):</span>
              <p className="font-heading font-bold text-2xl text-logisalud-green">
                S/ {order.montoTotal.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Pie del modal */}
        <div className="flex items-center justify-between border-t border-slate-700/40 p-4">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
              isTvMode
                ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Cerrar
          </button>
          <div className="flex items-center gap-2">
            <Link
              href={`/pedidos`}
              className="rounded-xl bg-logisalud-green px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-600 transition"
            >
              Abrir en Pedidos →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
