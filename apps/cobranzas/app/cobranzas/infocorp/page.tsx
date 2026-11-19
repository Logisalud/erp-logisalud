'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Paperclip, Plus, Trash2 } from 'lucide-react';
import {
  PageHeader, Badge, Button, FilterBar, FilterField,
  DataTable, EstadoVacio, EstadoCargando, EstadoError, ConfirmDialog,
} from '@/components/ds';
import type { Columna } from '@/components/ds';
import { fmtMoneda, fmtFecha, fmtEntero } from '@/lib/formato';
import type { CandidatoInfocorp } from '@/lib/infocorp';

type Marcado = {
  cliente_ruc: string;
  marcado_en: string;
  marcado_por: string;
  motivo: string | null;
  saldo_al_marcar: number | string | null;
  dias_vencido_al_marcar: number | null;
  reportado: boolean;
  reportado_en: string | null;
  reportado_por: string | null;
  adjunto_path: string | null;
  adjunto_nombre: string | null;
  cliente: { razon_social: string } | null;
};

export default function Infocorp() {
  const [candidatos, setCandidatos] = useState<CandidatoInfocorp[]>([]);
  const [marcados, setMarcados] = useState<Marcado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [aSacar, setASacar] = useState<Marcado | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch('/api/infocorp');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Error cargando la lista');
      setCandidatos(j.candidatos ?? []);
      setMarcados(j.marcados ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function marcar(ruc: string) {
    const r = await fetch('/api/infocorp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_ruc: ruc }),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error ?? 'No se pudo marcar'); return; }
    await cargar();
  }

  async function cambiarReportado(m: Marcado, reportado: boolean) {
    const r = await fetch('/api/infocorp', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_ruc: m.cliente_ruc, reportado }),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error ?? 'No se pudo actualizar'); return; }
    await cargar();
  }

  async function adjuntar(m: Marcado, file: File) {
    setSubiendo(m.cliente_ruc);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const sube = await fetch('/api/infocorp/upload', { method: 'POST', body: fd });
      const subida = await sube.json();
      if (!sube.ok) throw new Error(subida.error ?? 'No se pudo subir');

      const r = await fetch('/api/infocorp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_ruc: m.cliente_ruc,
          reportado: true,
          adjunto_path: subida.path,
          adjunto_nombre: subida.nombre,
        }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? 'No se pudo guardar'); }
      await cargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setSubiendo(null);
    }
  }

  async function verAdjunto(path: string) {
    const r = await fetch(`/api/infocorp/adjunto-url?path=${encodeURIComponent(path)}`);
    const j = await r.json();
    if (!r.ok) { alert(j.error ?? 'No se pudo abrir'); return; }
    window.open(j.url, '_blank', 'noopener');
  }

  async function sacar(m: Marcado) {
    const r = await fetch(`/api/infocorp?ruc=${encodeURIComponent(m.cliente_ruc)}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json(); alert(j.error ?? 'No se pudo sacar'); return; }
    setASacar(null);
    await cargar();
  }

  const q = busqueda.trim().toLowerCase();
  const coincide = (ruc: string, nombre: string) =>
    !q || ruc.includes(q) || nombre.toLowerCase().includes(q);

  const pendientes = useMemo(
    () => marcados.filter(m => !m.reportado && coincide(m.cliente_ruc, m.cliente?.razon_social ?? '')),
    [marcados, q],
  );
  const reportados = useMemo(
    () => marcados.filter(m => m.reportado && coincide(m.cliente_ruc, m.cliente?.razon_social ?? '')),
    [marcados, q],
  );
  const candidatosFiltrados = useMemo(
    () => candidatos.filter(c => coincide(c.clienteRuc, c.razonSocial)),
    [candidatos, q],
  );

  const columnasCandidatos: Columna<CandidatoInfocorp>[] = [
    { clave: 'cliente', titulo: 'Cliente', render: c => (
      <div>
        <p className="font-medium text-ink-900">{c.razonSocial}</p>
        <p className="text-xs text-ink-400">{c.clienteRuc}</p>
      </div>
    ) },
    { clave: 'vendedor', titulo: 'Vendedor', render: c => c.vendedor },
    { clave: 'dias', titulo: 'Días', align: 'right', valorOrden: c => c.maxDiasVencido, render: c => fmtEntero(c.maxDiasVencido) },
    { clave: 'docs', titulo: 'Docs', align: 'right', render: c => fmtEntero(c.nDocs) },
    { clave: 'saldo', titulo: 'Deuda vencida', align: 'right', valorOrden: c => c.saldoVencido, render: c => fmtMoneda(c.saldoVencido) },
    { clave: 'accion', titulo: '', render: c => (
      <Button variante="secundario" onClick={() => void marcar(c.clienteRuc)}>
        <Plus size={14} /> Marcar
      </Button>
    ) },
  ];

  function columnasMarcados(conReporte: boolean): Columna<Marcado>[] {
    const base: Columna<Marcado>[] = [
      { clave: 'cliente', titulo: 'Cliente', render: m => (
        <div>
          <p className="font-medium text-ink-900">{m.cliente?.razon_social ?? '—'}</p>
          <p className="text-xs text-ink-400">{m.cliente_ruc}</p>
        </div>
      ) },
      { clave: 'saldo', titulo: 'Deuda al marcar', align: 'right',
        render: m => (m.saldo_al_marcar === null ? '—' : fmtMoneda(Number(m.saldo_al_marcar))) },
      { clave: 'dias', titulo: 'Días al marcar', align: 'right',
        render: m => (m.dias_vencido_al_marcar === null ? '—' : fmtEntero(m.dias_vencido_al_marcar)) },
      { clave: 'marcado', titulo: 'Marcado', render: m => (
        <div>
          <p>{fmtFecha(m.marcado_en)}</p>
          <p className="text-xs text-ink-400">{m.marcado_por}</p>
        </div>
      ) },
    ];

    if (conReporte) {
      base.push(
        { clave: 'reportado_en', titulo: 'Reportado', render: m => (
          <div>
            <p>{m.reportado_en ? fmtFecha(m.reportado_en) : '—'}</p>
            <p className="text-xs text-ink-400">{m.reportado_por ?? ''}</p>
          </div>
        ) },
        { clave: 'constancia', titulo: 'Constancia', render: m => (
          m.adjunto_path ? (
            <button
              onClick={() => void verAdjunto(m.adjunto_path as string)}
              className="inline-flex items-center gap-1 text-brand-green-700 underline"
            >
              <Paperclip size={14} /> {m.adjunto_nombre ?? 'Ver'}
            </button>
          ) : (
            <span className="text-ink-400">Sin adjunto</span>
          )
        ) },
      );
    }

    base.push({ clave: 'acciones', titulo: '', render: m => (
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-1.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={m.reportado}
            onChange={e => void cambiarReportado(m, e.target.checked)}
            className="h-4 w-4"
          />
          Ya reportado
        </label>
        {m.reportado && (
          <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-brand-green-700 underline">
            <Paperclip size={13} />
            {subiendo === m.cliente_ruc ? 'Subiendo…' : m.adjunto_path ? 'Cambiar' : 'Adjuntar'}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void adjuntar(m, f); }}
            />
          </label>
        )}
        {!m.reportado && (
          <button onClick={() => setASacar(m)} className="text-ink-400 hover:text-red-600" title="Sacar de la lista">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    ) });

    return base;
  }

  return (
    <>
      <PageHeader
        titulo="Infocorp — fase legal"
        subtitulo="A quién hay que reportar a Equifax y a quién ya se reportó"
        acciones={
          <a href="/api/exportar/infocorp">
            <Button variante="primario"><Download size={14} /> Exportar Excel</Button>
          </a>
        }
      />

      {cargando ? (
        <EstadoCargando texto="Cargando la lista…" />
      ) : error ? (
        <EstadoError mensaje={error} />
      ) : (
        <>
          <FilterBar>
            <FilterField label="Buscar cliente">
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="RUC o razón social"
                className="w-full rounded-ds-input border border-ink-200 px-2.5 py-1.5 text-sm"
              />
            </FilterField>
          </FilterBar>

          <section className="mb-7">
            <h2 className="mb-2 flex items-center gap-2 font-oswald text-lg text-ink-900">
              Por reportar <Badge tono="critico" conPunto={false}>{fmtEntero(pendientes.length)}</Badge>
            </h2>
            <p className="mb-3 text-sm text-ink-500 font-poppins">
              Los que cobranzas marcó. Cuando Finanzas los reporte a Equifax, tildá &ldquo;Ya reportado&rdquo; y adjuntá la constancia.
            </p>
            {pendientes.length === 0 ? (
              <EstadoVacio titulo="Nadie pendiente de reportar" />
            ) : (
              <DataTable columnas={columnasMarcados(false)} filas={pendientes} claveFila={m => m.cliente_ruc} />
            )}
          </section>

          <section className="mb-7">
            <h2 className="mb-2 flex items-center gap-2 font-oswald text-lg text-ink-900">
              Ya reportados <Badge tono="ok" conPunto={false}>{fmtEntero(reportados.length)}</Badge>
            </h2>
            {reportados.length === 0 ? (
              <EstadoVacio titulo="Todavía no se reportó a nadie" />
            ) : (
              <DataTable columnas={columnasMarcados(true)} filas={reportados} claveFila={m => m.cliente_ruc} />
            )}
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 font-oswald text-lg text-ink-900">
              Candidatos <Badge tono="alerta" conPunto={false}>{fmtEntero(candidatosFiltrados.length)}</Badge>
            </h2>
            <p className="mb-3 text-sm text-ink-500 font-poppins">
              Clientes de la fase 4 —más de 60 días vencido— que todavía nadie marcó.
            </p>
            {candidatosFiltrados.length === 0 ? (
              <EstadoVacio titulo="Sin candidatos nuevos" descripcion="Nadie supera los 60 días sin estar ya en la lista." />
            ) : (
              <DataTable columnas={columnasCandidatos} filas={candidatosFiltrados} claveFila={c => c.clienteRuc} />
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        abierto={aSacar !== null}
        titulo="Sacar de la lista"
        descripcion={
          aSacar
            ? `${aSacar.cliente?.razon_social ?? aSacar.cliente_ruc} deja de estar marcado para Infocorp.`
            : undefined
        }
        variantePeligro
        textoConfirmar="Sacar"
        onConfirmar={() => { if (aSacar) void sacar(aSacar); }}
        onCancelar={() => setASacar(null)}
      />
    </>
  );
}
