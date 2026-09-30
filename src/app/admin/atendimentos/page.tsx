'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { calcularPrevisao } from '@/lib/previsao';
import ProximoAtendimento from './proximo-atendimento';

function gerarToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export interface AtendimentoListItem {
  id: string;
  cliente_id: string;
  procedimento_id: string;
  modo: 'agendamento' | 'fila';
  status: string;
  horario_agendado?: string;
  ordem_fila?: number;
  motivo_cancelamento?: string;
  token_acesso?: string;
  criado_em: string;
  duracao_trabalhada_seg?: number;
  pausado_desde?: string | null;
  clientes?: {
  nome: string;
  sobrenome: string;
  whatsapp: string;
};
  procedimentos?: { nome: string; duracao_estimada_min?: number };
}

export default function AtendimentosPage() {
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [atendimentos, setAtendimentos] = useState<AtendimentoListItem[]>([]);
  const [clientes, setClientes] = useState<
    { id: string; nome: string; sobrenome: string }[]
  >([]);
  const [procedimentos, setProcedimentos] = useState<
    { id: string; nome: string }[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    cliente_id: '',
    procedimento_id: '',
    modo: 'agendamento' as 'agendamento' | 'fila',
    ordem_fila: 1,
  });
  const [dataAgendamento, setDataAgendamento] = useState('');
  const [horaAgendamento, setHoraAgendamento] = useState('');


  const [cancelForm, setCancelForm] = useState({
    id: '',
    motivo: '',
  });

  const [previsoes, setPrevisoes] = useState<
    Record<
      string,
      {
        inicio_previsto?: Date;
        fim_previsto?: Date;
        minutos_restantes?: number;
      }
    >
  >({});

  const [showCancel, setShowCancel] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('atendimentos-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atendimentos',
        },
        () => {
          fetchAtendimentos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);

      const { data: cli, error: errCli } = await supabase
        .from('clientes')
        .select('id, nome, sobrenome')
        .order('nome', { ascending: true });

      if (errCli) throw errCli;

      setClientes(cli || []);

      const { data: proc, error: errProc } = await supabase
        .from('procedimentos')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (errProc) throw errProc;

      setProcedimentos(proc || []);

      await fetchAtendimentos();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar dados'
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchAtendimentos() {
    try {
      const { data, error: err } = await supabase
        .from('atendimentos')
        .select(`
          id,
          cliente_id,
          procedimento_id,
          modo,
          status,
          status_confirmacao,
          horario_agendado,
          ordem_fila,
          motivo_cancelamento,
          token_acesso,
          criado_em,
          duracao_trabalhada_seg,
          pausado_desde,
          clientes!cliente_id (
            nome,
            sobrenome,
            whatsapp
          ),
          procedimentos!procedimento_id (
            nome,
            duracao_estimada_min
          )
        `)
        .eq('status_confirmacao', 'confirmado')
        .order('criado_em', { ascending: false });

      if (err) throw err;

      const lista = (data || []) as unknown as AtendimentoListItem[];

      setAtendimentos(lista);

      const calcInputs = lista.map((d) => ({
        id: d.id,
        modo: d.modo,
        status: d.status,
        cliente_id: d.cliente_id,
        procedimento_id: d.procedimento_id,
        horario_agendado: d.horario_agendado,
        ordem_fila: d.ordem_fila,
        token_acesso: d.token_acesso,
        procedimento: d.procedimentos
          ? {
              duracao_estimada_min:
                d.procedimentos.duracao_estimada_min || 0,
            }
          : undefined,
        duracao_trabalhada_seg: d.duracao_trabalhada_seg || 0,
        pausado_desde: d.pausado_desde || null,
      }));

      const preds = calcularPrevisao(calcInputs);

      setPrevisoes(preds);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar atendimentos'
      );
    }
  }

  async function getAtendimento(id: string) {
    const { data, error: err } = await supabase
      .from('atendimentos')
      .select(`
        id,
        status,
        duracao_trabalhada_seg,
        procedimento_id,
        procedimentos!procedimento_id (
          duracao_estimada_min
        )
      `)
      .eq('id', id)
      .single();

    if (err) throw err;

    return data as any;
  }

  async function handleIniciar(id: string) {
    if (processingId) return;

    try {
      setProcessingId(id);
      setError(null);

      const { data: ativo, error: ativoError } = await supabase
        .from('atendimentos')
        .select('id')
        .eq('status', 'em_andamento')
        .limit(1)
        .maybeSingle();

      if (ativoError) throw ativoError;

      if (ativo && ativo.id !== id) {
        setError(
          'Já existe um atendimento em andamento. Finalize ou pause esse atendimento antes de iniciar outro.'
        );
        return;
      }

      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('atendimentos')
        .update({
          status: 'em_andamento',
          pausado_desde: null,
        })
        .eq('id', id)
        .eq('status', 'aguardando');

      if (updateError) throw updateError;
      await supabase
  .channel('atendimento-atualizado')
  .send({
    type: 'broadcast',
    event: 'atendimento-atualizado',
    payload: { id },
  });

      const { error: segmentError } = await supabase
        .from('segmentos_atendimento')
        .insert([
          {
            atendimento_id: id,
            tipo: 'ativo',
            inicio: now,
          },
        ]);

      if (segmentError) throw segmentError;

      await fetchAtendimentos();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao iniciar atendimento'
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function calcularTempoTrabalhado(
    id: string,
    agora: string
  ): Promise<number> {
    const { data: segs, error: segError } = await supabase
      .from('segmentos_atendimento')
      .select('inicio, fim, tipo')
      .eq('atendimento_id', id);

    if (segError) throw segError;

    let segundos = 0;

    for (const segmento of segs || []) {
      if (!segmento.inicio) continue;

      const inicio = new Date(segmento.inicio).getTime();
      const fim = segmento.fim
        ? new Date(segmento.fim).getTime()
        : new Date(agora).getTime();

      if (fim > inicio && segmento.tipo === 'ativo') {
        segundos += Math.round((fim - inicio) / 1000);
      }
    }

    return segundos;
  }

  async function handlePausar(id: string) {
    if (processingId) return;

    try {
      setProcessingId(id);
      setError(null);

      const atendimento = await getAtendimento(id);

      if (atendimento.status !== 'em_andamento') {
        setError('Este atendimento não está em andamento.');
        return;
      }

      const now = new Date().toISOString();

      const segundos = await calcularTempoTrabalhado(id, now);

      const { error: segmentError } = await supabase
        .from('segmentos_atendimento')
        .update({
          fim: now,
        })
        .eq('atendimento_id', id)
        .eq('tipo', 'ativo')
        .is('fim', null);

      if (segmentError) throw segmentError;

      const { error: updateError } = await supabase
        .from('atendimentos')
        .update({
          status: 'pausado',
          pausado_desde: now,
          duracao_trabalhada_seg: segundos,
        })
        .eq('id', id)
        .eq('status', 'em_andamento');

      if (updateError) throw updateError;

      await fetchAtendimentos();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao pausar atendimento'
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function handleContinuar(id: string) {
    if (processingId) return;

    try {
      setProcessingId(id);
      setError(null);

      const { data: ativo, error: ativoError } = await supabase
        .from('atendimentos')
        .select('id')
        .eq('status', 'em_andamento')
        .limit(1)
        .maybeSingle();

      if (ativoError) throw ativoError;

      if (ativo && ativo.id !== id) {
        setError(
          'Já existe outro atendimento em andamento. Pause ou finalize esse atendimento antes de continuar este.'
        );
        return;
      }

      const atendimento = await getAtendimento(id);

      if (atendimento.status !== 'pausado') {
        setError('Este atendimento não está pausado.');
        return;
      }

      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('atendimentos')
        .update({
          status: 'em_andamento',
          pausado_desde: null,
        })
        .eq('id', id)
        .eq('status', 'pausado');

      if (updateError) throw updateError;

      const { error: segmentError } = await supabase
        .from('segmentos_atendimento')
        .insert([
          {
            atendimento_id: id,
            tipo: 'ativo',
            inicio: now,
          },
        ]);

      if (segmentError) throw segmentError;

      await fetchAtendimentos();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao continuar atendimento'
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function handleFinalizar(id: string) {
    if (processingId) return;

    try {
      setProcessingId(id);
      setError(null);

      const atendimento = await getAtendimento(id);

      if (
        atendimento.status !== 'em_andamento' &&
        atendimento.status !== 'pausado'
      ) {
        setError(
          'Somente atendimentos em andamento ou pausados podem ser finalizados.'
        );
        return;
      }

      const now = new Date().toISOString();

      if (atendimento.status === 'em_andamento') {
        const { error: segmentError } = await supabase
          .from('segmentos_atendimento')
          .update({
            fim: now,
          })
          .eq('atendimento_id', id)
          .eq('tipo', 'ativo')
          .is('fim', null);

        if (segmentError) throw segmentError;
      }

      const segundos = await calcularTempoTrabalhado(id, now);

      const { error: updateError } = await supabase
        .from('atendimentos')
        .update({
          status: 'finalizado',
          duracao_trabalhada_seg: segundos,
          pausado_desde: null,
        })
        .eq('id', id)
        .in('status', ['em_andamento', 'pausado']);

      if (updateError) throw updateError;

      await fetchAtendimentos();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao finalizar atendimento'
      );
    } finally {
      setProcessingId(null);
    }
  }
async function handleCopiarLink(at: AtendimentoListItem) {
  if (!at.token_acesso) {
    setError('Este atendimento não possui link de acompanhamento');
    return;
  }

  try {
    const link = `${window.location.origin}/acompanhar/${at.token_acesso}`;

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(link);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = link;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      document.execCommand('copy');

      document.body.removeChild(textarea);
    }

    setCopiadoId(at.id);
    setTimeout(() => setCopiadoId(null), 2000);
    setError(null);

  } catch (err) {
    setError('Não foi possível copiar o link');
  }
}
async function handleEnviarWhatsApp(at: AtendimentoListItem) {
  const whatsapp = at.clientes?.whatsapp;

  if (!whatsapp) {
    setError('Cliente não possui WhatsApp cadastrado');
    return;
  }

  const numero = whatsapp.replace(/\D/g, '');

  const data = at.horario_agendado
  ? new Date(at.horario_agendado).toLocaleDateString('pt-BR')
  : '';

const horario = at.horario_agendado
  ? new Date(at.horario_agendado).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  : '';

const link = `${window.location.origin}/acompanhar/${at.token_acesso}`;

const mensagem = encodeURIComponent(
  `Olá ${at.clientes?.nome}! Tudo bem?\n\n` +
  `Seu atendimento no *Salão da Inacia* está confirmado.\n\n` +
  `Procedimento: ${at.procedimentos?.nome}\n` +
  `Data: ${data}\n` +
  `Horário: ${horario}\n\n` +
  `Você pode acompanhar seu atendimento por este link:\n` +
  `${link}\n\n` +
  `Qualquer dúvida estamos à disposição.`
);

  window.open(
    `https://wa.me/55${numero}?text=${mensagem}`,
    '_blank'
  );
}
  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError(null);

    if (!formData.cliente_id) {
      setError('Selecione um cliente.');
      return;
    }

    if (!formData.procedimento_id) {
      setError('Selecione um procedimento.');
      return;
    }

    if (
      formData.modo === 'agendamento' &&
      (!dataAgendamento || !horaAgendamento)
    ) {
      setError('Informe a data e o horário do agendamento.');
      return;
    }

    if (
      formData.modo === 'fila' &&
      (!formData.ordem_fila || formData.ordem_fila <= 0)
    ) {
      setError('Informe uma ordem de fila válida.');
      return;
    }

    try {
      // Os dois campos representam o horário do salão, em Brasília (UTC-3).
      const horarioAgendado = formData.modo === 'agendamento'
        ? new Date(`${dataAgendamento}T${horaAgendamento}:00-03:00`).toISOString()
        : null;

      if (editingId) {
        const atendimentoAtual = atendimentos.find(
          (at) => at.id === editingId
        );

        if (
          atendimentoAtual &&
          !['aguardando'].includes(atendimentoAtual.status)
        ) {
          setError(
            'Somente atendimentos aguardando podem ser editados.'
          );
          return;
        }

        const payload: any = {
          cliente_id: formData.cliente_id,
          procedimento_id: formData.procedimento_id,
          modo: formData.modo,
        };

        if (formData.modo === 'agendamento') {
          payload.horario_agendado = horarioAgendado;
          payload.ordem_fila = null;
        } else {
          payload.ordem_fila = formData.ordem_fila;
          payload.horario_agendado = null;
        }

        const { error: err } = await supabase
          .from('atendimentos')
          .update(payload)
          .eq('id', editingId)
          .eq('status', 'aguardando');

        if (err) throw err;

        setEditingId(null);
      } else {
        const payload: any = {
          cliente_id: formData.cliente_id,
          procedimento_id: formData.procedimento_id,
          modo: formData.modo,
          status: 'aguardando',
         token_acesso: gerarToken(),
        };

        if (formData.modo === 'agendamento') {
          payload.horario_agendado = horarioAgendado;
          payload.ordem_fila = null;
        } else {
  const { data: ultimaFila } = await supabase
    .from('atendimentos')
    .select('ordem_fila')
    .eq('modo', 'fila')
    .order('ordem_fila', { ascending: false })
    .limit(1)
    .maybeSingle();

  payload.ordem_fila = (ultimaFila?.ordem_fila || 0) + 1;
  payload.horario_agendado = null;
}

        const { data: inserted, error: err } = await supabase
          .from('atendimentos')
          .insert([payload])
          .select('token_acesso')
          .single();

        if (err) throw err;

        if (inserted?.token_acesso) {
          const link = `${window.location.origin}/acompanhar/${inserted.token_acesso}`;

          try {
            await navigator.clipboard.writeText(link);
          } catch {
            // Clipboard pode ser bloqueado pelo navegador.
          }
        }
      }

      setFormData({
        cliente_id: '',
        procedimento_id: '',
        modo: 'agendamento',
        ordem_fila: 1,
      });
      setDataAgendamento('');
      setHoraAgendamento('');

      setShowForm(false);
      setError(null);

      await fetchAtendimentos();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar atendimento'
      );
    }
  }

  function handleEdit(at: AtendimentoListItem) {
    if (at.status !== 'aguardando') {
      setError('Somente atendimentos aguardando podem ser editados.');
      return;
    }

    setFormData({
      cliente_id: at.cliente_id,
      procedimento_id: at.procedimento_id,
      modo: at.modo,
      ordem_fila: at.ordem_fila || 1,
    });

    const horario = at.horario_agendado ? new Date(at.horario_agendado) : null;
    if (horario && !Number.isNaN(horario.getTime())) {
      const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(horario);
      const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
        partes.find((parte) => parte.type === tipo)?.value ?? '';

      setDataAgendamento(`${valor('year')}-${valor('month')}-${valor('day')}`);
      setHoraAgendamento(`${valor('hour')}:${valor('minute')}`);
    } else {
      setDataAgendamento('');
      setHoraAgendamento('');
    }

    setEditingId(at.id);
    setShowForm(true);
    setError(null);
  }

  function handleCancelEdit() {
    setShowForm(false);
    setEditingId(null);

    setFormData({
      cliente_id: '',
      procedimento_id: '',
      modo: 'agendamento',
      ordem_fila: 1,
    });
    setDataAgendamento('');
    setHoraAgendamento('');

    setError(null);
  }

  async function handleCancel() {
    if (!cancelForm.id || !cancelForm.motivo.trim()) {
      setError('Informe o atendimento e o motivo do cancelamento.');
      return;
    }

    try {
      setProcessingId(cancelForm.id);
      setError(null);

      const atendimento = await getAtendimento(cancelForm.id);

      if (
        atendimento.status === 'em_andamento' ||
        atendimento.status === 'pausado'
      ) {
        const now = new Date().toISOString();

        if (atendimento.status === 'em_andamento') {
          await supabase
            .from('segmentos_atendimento')
            .update({ fim: now })
            .eq('atendimento_id', cancelForm.id)
            .eq('tipo', 'ativo')
            .is('fim', null);
        }

        const segundos = await calcularTempoTrabalhado(
          cancelForm.id,
          now
        );

        const { error: cancelError } = await supabase
          .from('atendimentos')
          .update({
            status: 'cancelado',
            motivo_cancelamento: cancelForm.motivo.trim(),
            duracao_trabalhada_seg: segundos,
            pausado_desde: null,
          })
          .eq('id', cancelForm.id);

        if (cancelError) throw cancelError;
      } else {
        const { error: cancelError } = await supabase
          .from('atendimentos')
          .update({
            status: 'cancelado',
            motivo_cancelamento: cancelForm.motivo.trim(),
          })
          .eq('id', cancelForm.id);

        if (cancelError) throw cancelError;
      }

      setShowCancel(false);
      setCancelForm({ id: '', motivo: '' });

      await fetchAtendimentos();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao cancelar atendimento'
      );
    } finally {
      setProcessingId(null);
    }
  }

  function openCancel(at: AtendimentoListItem) {
    setCancelForm({
      id: at.id,
      motivo: '',
    });

    setShowCancel(true);
    setError(null);
  }

  function formatStatus(status: string) {
    const labels: Record<string, string> = {
      aguardando: 'Aguardando',
      em_andamento: 'Em andamento',
      pausado: 'Pausado',
      finalizado: 'Finalizado',
      cancelado: 'Cancelado',
      no_show: 'Não compareceu',
    };

    return labels[status] || status;
  }

  function statusClasses(status: string) {
    if (status === 'aguardando') {
      return 'bg-yellow-100 text-yellow-800';
    }

    if (status === 'em_andamento') {
      return 'bg-green-100 text-green-800';
    }

    if (status === 'pausado') {
      return 'bg-amber-100 text-amber-800';
    }

    if (status === 'finalizado') {
      return 'bg-gray-100 text-gray-800';
    }

    if (status === 'cancelado') {
      return 'bg-red-100 text-red-800';
    }

    return 'bg-gray-100 text-gray-800';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Atendimentos
          </h1>

          <div className="flex gap-2">
            {!showForm && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(true);
                  setError(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                + Novo
              </button>

            )}
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Sair
            </button>
          </div>
        </div>

        <ProximoAtendimento atendimentos={atendimentos} loading={loading} />

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
          )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            <div className="mb-4">
              <label
                htmlFor="cliente_id"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Cliente *
              </label>

              <select
                id="cliente_id"
                value={formData.cliente_id}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cliente_id: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                required
              >
                <option className="text-gray-900" value="">
  Selecione...
</option>

                {clientes.map((c) => (
                  <option className="text-gray-900" key={c.id} value={c.id}>
                    {c.nome} {c.sobrenome}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label
                htmlFor="procedimento_id"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Procedimento *
              </label>

              <select
                id="procedimento_id"
                value={formData.procedimento_id}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    procedimento_id: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                required
              >
                <option className="text-gray-900" value="">
  Selecione...
</option>

                {procedimentos.map((p) => (
                  <option className="text-gray-900" key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label
                htmlFor="modo"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Modo *
              </label>

  <div className="flex gap-3">
  <button
    type="button"
    onClick={() =>
      setFormData({
        ...formData,
        modo: 'agendamento',
      })
    }

    className={`flex-1 py-2 rounded-lg border-2 font-semibold transition ${
  formData.modo === 'agendamento'
    ? 'bg-zinc-900 text-white border-zinc-900 shadow-md'
    : 'bg-gray-100 text-gray-700 border-gray-300'
}`}
  >
    Agendamento
  </button>

  <button
    type="button"
    onClick={() =>
      setFormData({
        ...formData,
        modo: 'fila',
      })
    }
    className={`flex-1 py-2 rounded-lg border-2 font-semibold transition ${
  formData.modo === 'fila'
    ? 'bg-zinc-900 text-white border-zinc-900 shadow-md'
    : 'bg-gray-100 text-gray-700 border-gray-300'
}`}
  >
    Fila
  </button>

            </div>

          </div>
            {formData.modo === 'agendamento' && (
  <div className="mb-4">

    <label
      htmlFor="data_agendamento"
      className="block text-sm font-medium text-gray-700 mb-1"
    >
      Data do Atendimento *
    </label>

    <div className="relative min-w-0">
      <input
        id="data_agendamento"
        type="date"
        autoComplete="off"
        value={dataAgendamento}
        onChange={(e) => setDataAgendamento(e.target.value)}
        className="peer block box-border h-11 w-full min-w-0 max-w-full appearance-none px-3 py-2 border border-gray-300 rounded-lg bg-white text-base text-left text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
      {!dataAgendamento && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-2 left-3 right-10 flex items-center bg-white text-base text-gray-900 peer-focus:hidden"
        >
          Selecione a data
        </span>
      )}
    </div>

    <label
      htmlFor="hora_agendamento"
      className="block text-sm font-medium text-gray-700 mb-1 mt-4"
    >
      Horário *
    </label>

    <div className="relative min-w-0">
      <input
        id="hora_agendamento"
        type="time"
        step="300"
        autoComplete="off"
        value={horaAgendamento}
        onChange={(e) => setHoraAgendamento(e.target.value)}
        className="peer block box-border h-11 w-full min-w-0 max-w-full appearance-none px-3 py-2 border border-gray-300 rounded-lg bg-white text-base text-left text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
      {!horaAgendamento && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-2 left-3 right-10 flex items-center bg-white text-base text-gray-900 peer-focus:hidden"
        >
          Selecione o horário
        </span>
      )}
    </div>

  </div>
)}
            {formData.modo === 'fila' && (
              <div className="mb-4">
                <label
                  htmlFor="ordem_fila"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Ordem na Fila *
                </label>

                <input
                  id="ordem_fila"
                  type="number"
                  min={1}
                  value={formData.ordem_fila}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ordem_fila:
                        parseInt(e.target.value, 10) || 1,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
style={{
  color: '#111827',
  WebkitTextFillColor: '#111827',
}}
                  required
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                {editingId ? 'Salvar' : 'Criar'}
              </button>

              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {showCancel && (
          <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">
              Cancelar Atendimento
            </h3>

            <label
              htmlFor="motivo"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Motivo *
            </label>

            <textarea
              id="motivo"
              value={cancelForm.motivo}
              onChange={(e) =>
                setCancelForm({
                  ...cancelForm,
                  motivo: e.target.value,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              placeholder="Informe o motivo do cancelamento"
              rows={3}
              required
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={!!processingId}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                Confirmar Cancelamento
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCancel(false);
                  setCancelForm({ id: '', motivo: '' });
                }}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Carregando...</p>
          </div>
        ) : atendimentos.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">
              Nenhum atendimento cadastrado
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {atendimentos.map((at) => {
              const previsao = previsoes[at.id];
              const processando = processingId === at.id;

              return (
                <div
                  key={at.id}
                  className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
  {at.clientes?.nome} {at.clientes?.sobrenome}
</h3>

                      <p className="text-sm text-gray-900 font-medium">
                        {at.procedimentos?.nome}
                      </p>

                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            at.modo === 'agendamento'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {at.modo === 'agendamento'
                            ? 'Agendamento'
                            : 'Fila'}
                        </span>

                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${statusClasses(
                            at.status
                          )}`}
                        >
                          {formatStatus(at.status)}
                        </span>
                      </div>
                    </div>

                    <span className="text-xs text-gray-400">
                      {new Date(at.criado_em).toLocaleString(
                        'pt-BR'
                      )}
                    </span>
                  </div>

                  {at.modo === 'agendamento' &&
                    at.horario_agendado && (
                      <p className="text-xs text-gray-500 mb-1">
                        Horário:{' '}
                        {new Date(
                          at.horario_agendado
                        ).toLocaleString('pt-BR')}
                      </p>
                    )}

                  {at.modo === 'fila' && at.ordem_fila && (
                    <p className="text-xs text-gray-500 mb-1">
                      Ordem: {at.ordem_fila}
                    </p>
                  )}

                  {previsao?.inicio_previsto && (
                    <p className="text-xs text-blue-600 mb-1">
                      Início previsto:{' '}
                      {new Date(
                        previsao.inicio_previsto
                      ).toLocaleString('pt-BR')}
                    </p>
                  )}

                  {previsao?.fim_previsto && (
                    <p className="text-xs text-blue-600 mb-1">
                      Fim previsto:{' '}
                      {new Date(
                        previsao.fim_previsto
                      ).toLocaleString('pt-BR')}
                    </p>
                  )}

                  {previsao?.minutos_restantes != null &&
                    previsao.minutos_restantes > 0 && (
                      <p className="text-xs text-amber-600 mb-1">
                        Restantes:{' '}
                        {previsao.minutos_restantes} min
                      </p>
                    )}

                  {at.status === 'cancelado' &&
                    at.motivo_cancelamento && (
                      <p className="text-xs text-red-600 mb-1">
                        Motivo: {at.motivo_cancelamento}
                      </p>
                    )}

                  {at.status === 'aguardando' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        onClick={() => handleIniciar(at.id)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                      >
                        Iniciar
                      </button>
                      <button
                        onClick={() => handleEdit(at)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => openCancel(at)}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {at.status === 'em_andamento' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        onClick={() => handlePausar(at.id)}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
                      >
                        Pausar
                      </button>
                      <button
                        onClick={() => handleFinalizar(at.id)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                      >
                        Finalizar
                      </button>
                      <button
                        onClick={() => openCancel(at)}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {at.status === 'pausado' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        onClick={() => handleContinuar(at.id)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                      >
                        Continuar
                      </button>
                      <button
                        onClick={() => handleFinalizar(at.id)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                      >
                        Finalizar
                      </button>
                      <button
                        onClick={() => openCancel(at)}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {at.token_acesso && (
  <div className="flex gap-2 mt-3">
    <button
      onClick={() => {
  console.log('CLICOU WHATS', at);
  handleEnviarWhatsApp(at);
}}
      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
    >
      WhatsApp
    </button>

    <button
      onClick={() => handleCopiarLink(at)}
      className="px-3 py-1.5 border rounded-lg text-sm text-zinc-900 font-medium hover:bg-gray-50"
    >
      {copiadoId === at.id ? 'Link copiado!' : 'Copiar link do cliente'}
    </button>
  </div>
)}
                </div>
              );
            })}
          </div>
        )}

      {showCancel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Cancelar atendimento</h2>
            <textarea
              value={cancelForm.motivo}
              onChange={(e) => setCancelForm({ ...cancelForm, motivo: e.target.value })}
              placeholder="Motivo do cancelamento"
              className="w-full border rounded-lg p-3 min-h-24"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCancel(false)}
                className="px-4 py-2 border rounded-lg"
              >
                Voltar
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded-lg"
              >
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}







