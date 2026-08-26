export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { computeCobranza, buildCobranzaXlsx, CobranzaData } from '@/lib/cobranza';

const VERDE = '#4BB168', TEAL = '#4ABCC2';
const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function limaHoy(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); }
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function lunesDe(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow); return dt.toISOString().slice(0, 10);
}
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

interface FilaRank { vendedor_id: string; nombre: string; codigo: string | null; total: number; vencido: number; alDia: number; nCobros: number; }

// Une el roster de vendedores activos con la cobranza del período (0 si no cobró),
// ordenado por lo vencido recuperado, mayor a menor.
function mergeRoster(roster: { id: string; nombre: string; codigo: string | null }[], data: CobranzaData): FilaRank[] {
  const m = new Map(data.ranking.map(r => [r.vendedor_id, r]));
  return roster.map(v => {
    const r = m.get(v.id);
    return { vendedor_id: v.id, nombre: v.nombre, codigo: v.codigo, total: r?.total ?? 0, vencido: r?.vencido ?? 0, alDia: r?.alDia ?? 0, nCobros: r?.nCobros ?? 0 };
  }).sort((a, b) => b.vencido - a.vencido || b.total - a.total);
}

function colorFila(i: number, n: number, vencido: number): string {
  if (vencido <= 0) return '#f3f4f6';            // sin recuperación → gris
  if (i < Math.ceil(n / 3)) return '#e9f7ee';    // arriba → verde suave
  if (i < Math.ceil(2 * n / 3)) return '#fef6e7'; // medio → ámbar suave
  return '#fdecec';                               // abajo → rojo suave
}

function tablaRanking(titulo: string, filas: FilaRank[]): string {
  const n = filas.length;
  const rows = filas.map((f, i) => `
    <tr style="background:${colorFila(i, n, f.vencido)}">
      <td style="padding:8px 10px;font-weight:700;color:#374151;">${i + 1}°</td>
      <td style="padding:8px 10px;color:#111827;">${f.nombre}${f.codigo ? ` <span style="color:#9ca3af;font-size:11px;">(${f.codigo})</span>` : ''}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:${f.vencido > 0 ? VERDE : '#9ca3af'};white-space:nowrap;">${fmt(f.vencido)}</td>
      <td style="padding:8px 10px;text-align:right;color:#374151;white-space:nowrap;">${fmt(f.total)}</td>
      <td style="padding:8px 10px;text-align:right;color:#6b7280;white-space:nowrap;">${fmt(f.alDia)}</td>
      <td style="padding:8px 10px;text-align:right;color:#6b7280;">${f.nCobros}</td>
    </tr>`).join('');
  return `
  <p style="font:600 13px Arial,Helvetica,sans-serif;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin:22px 0 8px;">${titulo}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font:400 13px Arial,Helvetica,sans-serif;">
    <thead>
      <tr style="background:#f9fafb;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
        <th style="padding:8px 10px;text-align:left;">#</th>
        <th style="padding:8px 10px;text-align:left;">Vendedor</th>
        <th style="padding:8px 10px;text-align:right;color:${VERDE};">De lo vencido</th>
        <th style="padding:8px 10px;text-align:right;">Total</th>
        <th style="padding:8px 10px;text-align:right;">Al día</th>
        <th style="padding:8px 10px;text-align:right;">Cobros</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="6" style="padding:14px;text-align:center;color:#9ca3af;">Sin cobros</td></tr>`}</tbody>
  </table>`;
}

function construirHtml(ayerISO: string, ayer: CobranzaData, semana: CobranzaData, rankAyer: FilaRank[], rankSemana: FilaRank[]): string {
  const top = rankAyer.find(f => f.vencido > 0) ?? null;
  const ceros = rankAyer.filter(f => f.vencido <= 0);
  const nombresCeros = ceros.slice(0, 4).map(f => f.nombre).join(', ');

  const totalCell = (label: string, valor: string, color: string) => `
    <td style="padding:14px 10px;text-align:center;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="font:600 11px Arial;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">${label}</div>
      <div style="font:700 22px 'Arial Narrow',Arial;color:${color};margin-top:4px;white-space:nowrap;">${valor}</div>
    </td>`;

  return `
<div style="background:#f3f4f6;padding:16px 0;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:${VERDE};padding:18px 22px;">
      <div style="border-left:4px solid ${TEAL};padding-left:12px;">
        <div style="font:700 20px 'Arial Narrow',Arial;color:#ffffff;letter-spacing:1px;">LOGISALUD · COBRANZA</div>
        <div style="font:400 13px Arial;color:rgba(255,255,255,0.85);margin-top:2px;">Reporte diario — ${fechaLarga(ayerISO)}</div>
      </div>
    </td></tr>

    <tr><td style="padding:20px 22px 4px;">
      <p style="font:600 13px Arial;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Cobranza de ayer</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
        ${totalCell('Cobranza total', fmt(ayer.totalCobrado), '#111827')}
        ${totalCell('De lo vencido', fmt(ayer.totalVencido), VERDE)}
        ${totalCell('% vencido', ayer.pctVencido + '%', TEAL)}
      </tr></table>
    </td></tr>

    <tr><td style="padding:10px 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:12px 14px;background:#e9f7ee;border-radius:8px;font:400 13px Arial;color:#166534;">
            🏆 <strong>Más recuperó ayer:</strong> ${top ? `${top.nombre} — <strong>${fmt(top.vencido)}</strong> de vencido` : 'nadie recuperó vencido ayer'}
          </td>
        </tr>
        <tr><td style="height:6px;"></td></tr>
        <tr>
          <td style="padding:12px 14px;background:#fdecec;border-radius:8px;font:400 13px Arial;color:#991b1b;">
            ⚠️ <strong>${ceros.length} vendedor${ceros.length !== 1 ? 'es' : ''} sin recuperar vencido ayer</strong>${nombresCeros ? `: ${nombresCeros}${ceros.length > 4 ? '…' : ''}` : ''}
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding:0 22px 8px;">
      ${tablaRanking('Ranking de ayer (por lo vencido)', rankAyer)}
      ${tablaRanking('Acumulado de la semana', rankSemana)}
    </td></tr>

    <tr><td style="padding:6px 22px 20px;">
      <p style="font:400 12px Arial;color:#9ca3af;margin:8px 0 0;">📎 Adjunto: Excel con el detalle completo (ayer + semana) por vendedor.</p>
      <p style="font:400 11px Arial;color:#c0c4cc;margin:14px 0 0;border-top:1px solid #eee;padding-top:12px;">
        Cobranza = pagos reales del período (excluye retenciones de IGV y notas de crédito). "De lo vencido" = pagos aplicados a facturas ya vencidas al momento del pago. Generado automáticamente por LOGISALUD.
      </p>
    </td></tr>
  </table>
</div>`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  const apiKey     = process.env.RESEND_API_KEY;
  const remitente  = process.env.REPORTE_REMITENTE;
  const destinRaw  = process.env.REPORTE_DESTINATARIOS;
  if (!apiKey || !remitente || !destinRaw) {
    const falta = [!apiKey && 'RESEND_API_KEY', !remitente && 'REPORTE_REMITENTE', !destinRaw && 'REPORTE_DESTINATARIOS'].filter(Boolean).join(', ');
    console.error(`[reporte-cobranza] Faltan variables: ${falta}`);
    return NextResponse.json({ ok: false, error: `Faltan variables: ${falta}` }, { status: 500 });
  }
  const destinatarios = destinRaw.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const hoy = limaHoy();
    const ayerISO = addDays(hoy, -1);
    const lunes = lunesDe(hoy);

    const [ayer, semana] = await Promise.all([
      computeCobranza(ayerISO, ayerISO),
      computeCobranza(lunes, hoy),
    ]);

    const roster = (await fetchAll<{ id: string; nombres: string; apellidos: string | null; codigo: string | null; activo: boolean }>((from, to) =>
      supabaseAdmin().from('vendedores').select('id, nombres, apellidos, codigo, activo').range(from, to)
    )).filter(v => v.activo).map(v => ({ id: v.id, nombre: `${v.nombres} ${v.apellidos ?? ''}`.trim(), codigo: v.codigo }));

    const rankAyer = mergeRoster(roster, ayer);
    const rankSemana = mergeRoster(roster, semana);

    const html = construirHtml(ayerISO, ayer, semana, rankAyer, rankSemana);
    const xlsx = buildCobranzaXlsx([{ nombre: 'Ayer', data: ayer }, { nombre: 'Semana', data: semana }]);

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remitente,
        to: destinatarios,
        subject: `📊 Cobranza LOGISALUD — ${fechaLarga(ayerISO)}`,
        html,
        attachments: [{ filename: `cobranza-${ayerISO}.xlsx`, content: xlsx.toString('base64') }],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[reporte-cobranza] Resend falló ${resp.status}: ${body}`);
      return NextResponse.json({ ok: false, error: `Resend ${resp.status}: ${body}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ayer: ayerISO, destinatarios: destinatarios.length, totalAyer: ayer.totalCobrado, vencidoAyer: ayer.totalVencido }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(`[reporte-cobranza] Error: ${String(err)}`);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
