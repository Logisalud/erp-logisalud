"use client";

import React from "react";
import { RealtimeEvent } from "../../domain/dashboard-types";

interface TvTickerProps {
  events: RealtimeEvent[];
  isTvMode: boolean;
}

export function TvTicker({ events, isTvMode }: TvTickerProps) {
  // Tomamos los últimos 8 eventos para la marquesina
  const tickerItems = events.slice(0, 10);

  return (
    <div
      className={`relative flex items-center overflow-hidden border-t px-4 py-2 transition-colors ${
        isTvMode
          ? "border-slate-800 bg-[#060a12] text-white"
          : "border-slate-200 bg-slate-900 text-white"
      }`}
    >
      {/* Badge fijo en el extremo izquierdo */}
      <div className="z-10 flex shrink-0 items-center gap-2 pr-4 border-r border-slate-700/60 bg-inherit">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
        </span>
        <span className="font-heading font-bold text-xs uppercase tracking-wider text-logisalud-green">
          EN VIVO
        </span>
      </div>

      {/* Marquesina animada */}
      <div className="flex w-full overflow-hidden whitespace-nowrap pl-4">
        <div className="flex shrink-0 animate-marquee items-center gap-8 text-xs">
          {tickerItems.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2">
              <span
                className={`font-semibold ${
                  ev.tipo === "ENTREGADO"
                    ? "text-emerald-400"
                    : ev.tipo === "NUEVO_PEDIDO"
                    ? "text-logisalud-teal"
                    : ev.tipo === "DESPACHADO"
                    ? "text-purple-400"
                    : "text-amber-400"
                }`}
              >
                {ev.titulo}:
              </span>
              <span className="text-slate-300">{ev.descripcion}</span>
              <span className="text-[10px] text-slate-500 font-mono">[{ev.timestamp}]</span>
              <span className="text-slate-600">✦</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
