'use client';

import { useEffect, useRef } from 'react';

// Registra el acceso una vez tras montar, sin bloquear el render (fire-and-forget).
export default function RegistrarAcceso({ token }: { token: string }) {
  const enviado = useRef(false);
  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    fetch('/api/acceso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      keepalive: true,
    }).catch(() => {});
  }, [token]);
  return null;
}
