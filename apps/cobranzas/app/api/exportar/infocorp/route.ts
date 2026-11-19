export const dynamic = 'force-dynamic';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { candidatosAInfocorp, type FilaCobranza } from '@/lib/infocorp';
import { FASE_NOMBRE } from '@/lib/fasesCobranza';

/**
 * La lista de Infocorp en Excel, en tres hojas: los que hay que reportar,
 * los ya reportados y los candidatos que nadie marcó todavía.
 *
 * Las mismas tres listas que la pantalla, con las mismas reglas: un Excel
 * que no coincide con la pantalla de al lado hace más daño que no existir.
 */
export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const db = supabaseAdmin();

  const [docs, marcadosRes] = await Promise.all([
    db.rpc('fn_documentos_cobranza', { p_fecha_corte: hoy }),
    db
      .from('infocorp_clientes')
      .select('*, cliente:clientes(razon_social)')
      .order('reportado')
      .order('marcado_en', { ascending: false }),
  ]);

  if (docs.error) throw new Error(docs.error.message);
  if (marcadosRes.error) throw new Error(marcadosRes.error.message);

  const marcados = (marcadosRes.data ?? []) as Array<{
    cliente_ruc: string;
    marcado_en: string;
    marcado_por: string;
    observaciones: string | null;
    saldo_al_marcar: number | string | null;
    dias_vencido_al_marcar: number | null;
    reportado: boolean;
    reportado_en: string | null;
    reportado_por: string | null;
    adjunto_nombre: string | null;
    cliente: { razon_social: string } | null;
  }>;

  const yaMarcados = new Set(marcados.map(m => m.cliente_ruc));
  const candidatos = candidatosAInfocorp((docs.data ?? []) as FilaCobranza[])
    .filter(c => !yaMarcados.has(c.clienteRuc));

  const filaMarcado = (m: (typeof marcados)[number]) => ({
    'RUC': m.cliente_ruc,
    'Cliente': m.cliente?.razon_social ?? '',
    'Deuda al marcar': m.saldo_al_marcar === null ? '' : Number(m.saldo_al_marcar),
    'Días al marcar': m.dias_vencido_al_marcar ?? '',
    'Marcado el': m.marcado_en?.slice(0, 10) ?? '',
    'Marcado por': m.marcado_por,
    'Observaciones': m.observaciones ?? '',
    'Reportado el': m.reportado_en?.slice(0, 10) ?? '',
    'Reportado por': m.reportado_por ?? '',
    'Constancia': m.adjunto_nombre ?? '',
  });

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(marcados.filter(m => !m.reportado).map(filaMarcado)),
    'Por reportar',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(marcados.filter(m => m.reportado).map(filaMarcado)),
    'Ya reportados',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      candidatos.map(c => ({
        'RUC': c.clienteRuc,
        'Cliente': c.razonSocial,
        'Fase': `${c.fase} ${FASE_NOMBRE[c.fase]}`,
        'Vendedor': c.vendedor,
        'Días vencido': c.maxDiasVencido,
        'Documentos': c.nDocs,
        'Deuda vencida': c.saldoVencido,
      })),
    ),
    'Candidatos',
  );

  const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="infocorp-${hoy}.xlsx"`,
    },
  });
}
