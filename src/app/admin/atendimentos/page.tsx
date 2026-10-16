'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { calcularPrevisao } from '@/lib/previsao';
import { calcularGradeHorario } from '@/lib/horarios';
import { mascaraWhatsApp } from '@/lib/types';
import GradeHorario from '@/components/grade-horarios';
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
  status_confirmacao?: string;
  horario_agendado?: string;
  ordem_fila?: number;
  procedimento_ids?: string[] | null;
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
  /**
   * Todos os procedimentos do atendimento (múltiplos).
   * Preenchido via atendimento_procedimentos (PARTE 2).
   * Retrocompatibilidade: atendimentos antigos só têm procedimento_id.
   */
  procedimentos_multi?: { id: string; nome: string; duracao_estimada_min?: number }[];
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
    { id: string; nome: string; duracao_estimada_min?: number }[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    cliente_id: '',
    procedimento_id: '',
    procedimento_ids: [] as string[],
    modo: 'agendamento' as 'agendamento' | 'fila',
    ordem_fila: 1,
  });
  const [modoCliente, setModoCliente] = useState<'existente' | 'novo'>('existente');
  const [novoCliente, setNovoCliente] = useState({
    nome: '',
    sobrenome: '',
    whatsapp: '',
  });
  const [erroWhatsapp, setErroWhatsapp] = useState(false);
  const [filtroTab, setFiltroTab] = useState<'hoje' | 'semana' | 'proxima' | 'finalizados'>('hoje');
  const [dataAgendamento, setDataAgendamento] = useState('');
  const [horaAgendamento, setHoraAgendamento] = useState('');

  const dataNoFuso = (valor: string | Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(typeof valor === 'string' ? new Date(valor) : valor);

  const atendimentosDaAba = useMemo(() => {
    const hoje = dataNoFuso(new Date());
    const [ano, mes, dia] = hoje.split('-').map(Number);
    const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
    const fimSemana = new Date(Date.UTC(ano, mes - 1, dia + 6 - diaSemana));
    const fim = `${fimSemana.getUTCFullYear()}-${String(fimSemana.getUTCMonth() + 1).padStart(2, '0')}-${String(fimSemana.getUTCDate()).padStart(2, '0')}`;
    // Próxima semana: do dia seguinte ao fim desta semana até 7 dias depois
    // (segunda a domingo da semana que vem).
    const inicioProximaSemana = new Date(Date.UTC(fimSemana.getUTCFullYear(), fimSemana.getUTCMonth(), fimSemana.getUTCDate() + 1));
    const fimProximaSemana = new Date(Date.UTC(fimSemana.getUTCFullYear(), fimSemana.getUTCMonth(), fimSemana.getUTCDate() + 7));
    const inicioProxima = `${inicioProximaSemana.getUTCFullYear()}-${String(inicioProximaSemana.getUTCMonth() + 1).padStart(2, '0')}-${String(inicioProximaSemana.getUTCDate()).padStart(2, '0')}`;
    const fimProxima = `${fimProximaSemana.getUTCFullYear()}-${String(fimProximaSemana.getUTCMonth() + 1).padStart(2, '0')}-${String(fimProximaSemana.getUTCDate()).padStart(2, '0')}`;
    if (filtroTab === 'finalizados') return atendimentos.filter((at) => at.status === 'finalizado');
    return atendimentos.filter((at) => {
      if (!at.horario_agendado || at.status === 'finalizado' || at.status === 'cancelado' || at.status === 'no_show') return false;
      const data = dataNoFuso(at.horario_agendado);
      if (filtroTab === 'hoje') return data === hoje;
      if (filtroTab === 'proxima') return data >= inicioProxima && data <= fimProxima;
      return data >= hoje && data <= fim;
    });
  }, [atendimentos, filtroTab]);


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
          .select('id, nome, duracao_estimada_min')
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
      // A consulta da tabela de junção só existe após a migration multi-procedimento.
      // Começar pelo modelo estável e resolver os procedimentos em uma consulta separada
      // evita que a ausência da tabela/relacionamento esconda todos os atendimentos.
      let { data, error: err } = await supabase
        .from('atendimentos')
        .select(`
          id,
          cliente_id,
          procedimento_id,
          procedimento_ids,
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
        .or('status_confirmacao.is.null,status_confirmacao.in.(pendente,confirmado)')
        .order('horario_agendado', { ascending: false, nullsFirst: false })
        .order('ordem_fila', { ascending: true, nullsFirst: false });

      // Compatibilidade com bancos onde a migration ainda não foi aplicada.
      // Se nem a coluna de confirmação existir, buscar sem os campos novos nem filtro.
      if (err) {
        const fallback = await supabase
          .from('atendimentos')
          .select(`
            id, cliente_id, procedimento_id, modo, status, status_confirmacao,
            horario_agendado, ordem_fila, motivo_cancelamento, token_acesso,
            criado_em, duracao_trabalhada_seg, pausado_desde,
            clientes!cliente_id ( nome, sobrenome, whatsapp ),
            procedimentos!procedimento_id ( nome, duracao_estimada_min )
          `)
          .order('horario_agendado', { ascending: false, nullsFirst: false })
          .order('ordem_fila', { ascending: true, nullsFirst: false });
        if (fallback.error) {
          const legacy = await supabase
            .from('atendimentos')
            .select(`id, cliente_id, procedimento_id, modo, status, horario_agendado,
              ordem_fila, motivo_cancelamento, token_acesso, criado_em,
              duracao_trabalhada_seg, pausado_desde,
              clientes!cliente_id ( nome, sobrenome, whatsapp ),
              procedimentos!procedimento_id ( nome, duracao_estimada_min )`)
            .order('horario_agendado', { ascending: false, nullsFirst: false })
            .order('ordem_fila', { ascending: true, nullsFirst: false });
          data = legacy.data as typeof data;
          err = legacy.error;
        } else {
          data = fallback.data as typeof data;
          err = null;
        }
      }

      if (err) throw err;

      const rows = (data || []) as unknown as (AtendimentoListItem & { procedimento_ids?: string[] | null })[];
      const idsSolicitados = [...new Set(rows.flatMap((atendimento) =>
        Array.isArray(atendimento.procedimento_ids) && atendimento.procedimento_ids.length
          ? atendimento.procedimento_ids
          : [atendimento.procedimento_id]
      ).filter(Boolean))];
      const { data: procedimentosAtendimentos, error: erroProcedimentosAtendimentos } = idsSolicitados.length
        ? await supabase
            .from('procedimentos')
            .select('id, nome, duracao_estimada_min')
            .in('id', idsSolicitados)
        : { data: [], error: null };

      if (erroProcedimentosAtendimentos) throw erroProcedimentosAtendimentos;

      const procedimentosPorId = new Map(
        (procedimentosAtendimentos || []).map((procedimento) => [procedimento.id, procedimento])
      );
      const lista = rows.map((d) => {
        const idsAtendimento = Array.isArray(d.procedimento_ids) && d.procedimento_ids.length
          ? d.procedimento_ids
          : [d.procedimento_id];
        const multi = idsAtendimento
          .map((id: string) => procedimentosPorId.get(id))
          .filter((procedimento): procedimento is NonNullable<typeof procedimento> => Boolean(procedimento));
        if (multi.length === 0 && d.procedimentos) {
          multi.push({
            id: d.procedimento_id,
            nome: d.procedimentos.nome,
            duracao_estimada_min: d.procedimentos.duracao_estimada_min,
          });
        }
        return { ...d, procedimentos_multi: multi } as unknown as AtendimentoListItem;
      });
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
        procedimento_duracao_total_min: d.procedimentos_multi?.reduce(
          (total, procedimento) => total + (procedimento.duracao_estimada_min || 0),
          0
        ),
        duracao_trabalhada_seg: d.duracao_trabalhada_seg || 0,
        pausado_desde: d.pausado_desde || null,
      }));

      const preds = calcularPrevisao(calcInputs);

      setPrevisoes(preds);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error || (err && typeof err === 'object' && 'message' in err)
          ? String((err as { message: unknown }).message)
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

const procedimentosTexto = (at.procedimentos_multi && at.procedimentos_multi.length > 0)
  ? at.procedimentos_multi.map((p) => p.nome).join(', ')
  : (at.procedimentos?.nome || 'Procedimento não informado');

const mensagem = encodeURIComponent(
  `Olá ${at.clientes?.nome}! Tudo bem?\n\n` +
  `Seu atendimento no *Salão da Inacia* está confirmado.\n\n` +
  `Procedimentos: ${procedimentosTexto}\n` +
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

    if (modoCliente === 'existente' && !formData.cliente_id) {
      setError('Selecione um cliente.');
      return;
    }
    if (modoCliente === 'novo' && !novoCliente.nome.trim()) {
      setError('Informe o nome do novo cliente.');
      return;
    }

    const procedimentosSelecionados = formData.procedimento_ids.length
      ? formData.procedimento_ids
      : formData.procedimento_id ? [formData.procedimento_id] : [];
    if (procedimentosSelecionados.length === 0) {
      setError('Selecione pelo menos um procedimento.');
      return;
    }
    if (procedimentosSelecionados.length > 2) {
      setError('Selecione no máximo dois procedimentos.');
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
      // Se for novo cliente, cria no banco antes de prosseguir
      let clienteId = formData.cliente_id;
      if (modoCliente === 'novo') {
        const whatsappLimpo = (novoCliente.whatsapp || '').replace(/\D/g,'').slice(0,11);
        if (whatsappLimpo.length >= 10) {
          const { data: dup } = await supabase.from('clientes').select('id, nome, sobrenome').eq('whatsapp', whatsappLimpo).maybeSingle();
          if (dup) { setErroWhatsapp(true); setError('Contato duplicado: número já cadastrado para ' + dup.nome + ' ' + (dup.sobrenome || '') + '. Use a aba "Já existe".'); return; }
        }
        const { data: novoC, error: errNovo } = await supabase
          .from('clientes')
          .insert([{ nome: novoCliente.nome.trim(), sobrenome: novoCliente.sobrenome.trim(), whatsapp: whatsappLimpo ? mascaraWhatsApp(whatsappLimpo) : null }])
          .select('id, nome, sobrenome')
          .single();
        if (errNovo || !novoC) { setError(errNovo?.message || 'Erro ao criar cliente'); return; }
        clienteId = novoC.id;
        setClientes((prev) => [...prev, novoC].sort((a,b) => a.nome.localeCompare(b.nome)));
        setFormData((prev) => ({ ...prev, cliente_id: novoC.id }));
        setModoCliente('existente');
      }

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
          cliente_id: clienteId,
          procedimento_id: procedimentosSelecionados[0],
          procedimento_ids: procedimentosSelecionados,
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
          cliente_id: clienteId,
          procedimento_id: procedimentosSelecionados[0],
          procedimento_ids: procedimentosSelecionados,
          modo: formData.modo,
          status: 'aguardando',
          status_confirmacao: 'confirmado',
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
        procedimento_ids: [],
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
      procedimento_ids: at.procedimento_ids?.length ? at.procedimento_ids : [at.procedimento_id],
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
      procedimento_ids: [],
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
      return 'bg-amber-100 text-amber-900';
    }

    if (status === 'em_andamento') {
      return 'bg-zinc-900 text-amber-300';
    }

    if (status === 'pausado') {
      return 'bg-amber-100 text-amber-800';
    }

    if (status === 'finalizado') {
      return 'bg-zinc-200 text-zinc-700';
    }

    if (status === 'cancelado') {
      return 'bg-red-100 text-red-800';
    }

    return 'bg-zinc-100 text-zinc-700';
  }

  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  // Grade de 15 dias para frente (mesma regra que /agendar).
  const diasDaSemana = Array.from({ length: 15 }, (_, indice) => {
    const data = new Date();
    data.setDate(data.getDate() + indice);
    return {
      iso: `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`,
      diaSemana: diasSemana[data.getDay()],
      numero: data.getDate(),
      mes: data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    };
  });
  const campoClass = 'min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900';
  const botaoPrincipalClass = 'min-h-12 rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50';
  const botaoSecundarioClass = 'min-h-12 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50';
  const botaoCancelarClass = 'min-h-12 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50';

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">Agenda do salão</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Atendimentos</h1>
            <div className="mt-3 h-1 w-10 rounded-full bg-amber-400" />
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">Organize os horários e acompanhe cada atendimento.</p>
          </div>
          <div className="flex gap-2">
            {!showForm && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(true);
                  setError(null);
                }}
                className={`${botaoPrincipalClass} flex-1 sm:flex-none`}
              >
                + Novo atendimento
              </button>
            )}
          </div>
        </header>

        <ProximoAtendimento atendimentos={atendimentos} loading={loading} />

        {error && (
          <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">
            {error}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight">{editingId ? 'Editar atendimento' : 'Novo atendimento'}</h2>
              <p className="mt-1 text-sm text-zinc-500">Escolha o cliente, o procedimento e a forma de atendimento.</p>
            </div>
            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Cliente *</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button type="button" aria-pressed={modoCliente === 'existente'} onClick={() => { setModoCliente('existente'); setFormData({ ...formData, cliente_id: '' }); }} className="min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition">Já existe</button>
                  <button type="button" aria-pressed={modoCliente === 'novo'} onClick={() => { setModoCliente('novo'); setFormData({ ...formData, cliente_id: '' }); setNovoCliente({ nome: '', sobrenome: '', whatsapp: '' }); }} className="min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition">Cliente novo</button>
                </div>
                {modoCliente === 'existente' ? (
                  <select
                    id="cliente_id"
                    value={formData.cliente_id}
                    onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                    className={campoClass}
                  >
                    <option value="">Selecione o cliente</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome} {c.sobrenome}</option>)}
                  </select>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="novonome" className="mb-1.5 block text-sm font-medium text-zinc-700">Nome *</label>
                      <input id="novonome" type="text" value={novoCliente.nome} onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} className={campoClass} placeholder="Ex: Maria" />
                    </div>
                    <div>
                      <label htmlFor="novosobrenome" className="mb-1.5 block text-sm font-medium text-zinc-700">Sobrenome (opcional)</label>
                      <input id="novosobrenome" type="text" value={novoCliente.sobrenome} onChange={(e) => setNovoCliente({ ...novoCliente, sobrenome: e.target.value })} className={campoClass} placeholder="Ex: Silva" />
                    </div>
                    <div>
                      <label htmlFor="novowhatsapp" className="mb-1.5 block text-sm font-medium text-zinc-700">WhatsApp (opcional)</label>
                      <input id="novowhatsapp" type="tel" value={novoCliente.whatsapp} onChange={(e) => {
                        const masked = mascaraWhatsApp(e.target.value);
                        setErroWhatsapp(false);
                        setNovoCliente({ ...novoCliente, whatsapp: masked });
                      }} maxLength={16} className={erroWhatsapp ? 'min-h-12 w-full min-w-0 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500' : campoClass} placeholder="(87) 9 9845-4566" aria-invalid={erroWhatsapp} />
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                  <fieldset className="min-w-0">
                    <legend className="mb-1.5 text-sm font-medium text-zinc-700">Procedimentos * (selecione até 2)</legend>
                    <div className="space-y-2">
                      {procedimentos.map((p) => {
                        const selecionado = (formData.procedimento_ids.length ? formData.procedimento_ids : formData.procedimento_id ? [formData.procedimento_id] : []).includes(p.id);
                        return (
                          <label key={p.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                            <input
                              type="checkbox"
                              checked={selecionado}
                              disabled={!selecionado && formData.procedimento_ids.length >= 2}
                              onChange={() => {
                                const atual = formData.procedimento_ids.length ? formData.procedimento_ids : formData.procedimento_id ? [formData.procedimento_id] : [];
                                const ids = selecionado ? atual.filter((id) => id !== p.id) : [...atual, p.id];
                                setFormData({ ...formData, procedimento_id: ids[0] || '', procedimento_ids: ids });
                              }}
                              className="h-4 w-4 accent-zinc-900"
                            />
                            <span>{p.nome}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
              </div>
              <fieldset className="min-w-0 sm:col-span-2">
                <legend className="mb-2 text-sm font-medium text-zinc-700">Forma de atendimento *</legend>
                <div className="grid grid-cols-2 gap-3">
                  {(['agendamento', 'fila'] as const).map((modo) => (
                    <button
                      key={modo}
                      type="button"
                      aria-pressed={formData.modo === modo}
                      onClick={() => setFormData({ ...formData, modo })}
                      className={`min-h-12 rounded-xl border px-3 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${
                        formData.modo === modo
                          ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-400'
                      }`}
                    >
                      {modo === 'agendamento' ? 'Agendamento' : 'Fila'}
                    </button>
                  ))}
                </div>
              </fieldset>

              {formData.modo === 'agendamento' && (
                <div className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2">
                  <p className="mb-3 text-sm font-semibold text-zinc-900">Escolha o dia e o horário</p>
                  <div className="mb-4 flex min-w-0 max-w-full gap-2 overflow-x-auto pb-2" aria-label="Dias da semana">
                    {diasDaSemana.map((dia) => {
                      const selecionado = dataAgendamento === dia.iso;
                      return (
                        <button
                          key={dia.iso}
                          type="button"
                          aria-pressed={selecionado}
                          aria-label={`${dia.diaSemana}, ${dia.numero} de ${dia.mes}`}
                          onClick={() => setDataAgendamento(dia.iso)}
                          className={`w-16 shrink-0 rounded-xl border px-2 py-3 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${
                            selecionado ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm' : 'border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400'
                          }`}
                        >
                          <span className={`block text-xs font-semibold ${selecionado ? 'text-amber-400' : 'text-zinc-500'}`}>{dia.diaSemana}</span>
                          <span className="my-1 block text-xl font-bold tabular-nums">{dia.numero}</span>
                          <span className={`block text-xs ${selecionado ? 'text-zinc-300' : 'text-zinc-500'}`}>{dia.mes}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="min-w-0 mt-3">
                    <label htmlFor="hora_agendamento" className="mb-1.5 block text-sm font-medium text-zinc-700">Horário *</label>
                    <GradeHorario
                      opcoes={(() => {
                        try {
                          const idsSelecionados = formData.procedimento_ids.length
                            ? formData.procedimento_ids
                            : formData.procedimento_id ? [formData.procedimento_id] : [];
                          const dur = idsSelecionados.reduce((total, id) => {
                            const procedimento = procedimentos.find((item) => item.id === id);
                            return total + (procedimento?.duracao_estimada_min || 0);
                          }, 0) || 30;
                          const ocupados = atendimentos
                            .filter(a => a.horario_agendado && a.horario_agendado.substring(0,10) === dataAgendamento
                              && a.status !== 'cancelado' && a.status !== 'no_show'
                              && a.status_confirmacao !== 'recusado')
                            .map(a => ({
                              horario_agendado: a.horario_agendado,
                              procedimento_duracao_total_min: a.procedimentos_multi?.reduce(
                                (total, item) => total + (item.duracao_estimada_min || 0),
                                0
                              ) || a.procedimentos?.duracao_estimada_min || 30,
                            }));
                          return calcularGradeHorario(dataAgendamento || new Date().toISOString().split('T')[0], dur, [], ocupados as Parameters<typeof calcularGradeHorario>[3]);
                        } catch { return []; }
                      })()}
                      valor={horaAgendamento}
                      aoSelecionar={(h) => setHoraAgendamento(h)}
                    />
                  </div>
                </div>
              )}
              {formData.modo === 'fila' && (
                <div className="min-w-0">
                  <label htmlFor="ordem_fila" className="mb-1.5 block text-sm font-medium text-zinc-700">Ordem na fila *</label>
                  <input
                    id="ordem_fila"
                    type="number"
                    min={1}
                    value={formData.ordem_fila}
                    onChange={(e) => setFormData({ ...formData, ordem_fila: parseInt(e.target.value, 10) || 1 })}
                    className={campoClass}
                    style={{ color: '#111827', WebkitTextFillColor: '#111827' }}
                    required
                  />
                </div>
              )}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-5">
              <button type="submit" className="min-h-12 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">
                {editingId ? 'Salvar alterações' : 'Criar atendimento'}
              </button>
              <button type="button" onClick={handleCancelEdit} className={botaoSecundarioClass}>Cancelar</button>
            </div>
          </form>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">{["hoje","semana","proxima","finalizados"].map((t) => (<button key={t} type="button" onClick={() => setFiltroTab(t as any)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${t === filtroTab ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200 text-zinc-700"}`} aria-pressed={t === filtroTab}>{t === "hoje" ? "Hoje" : t === "semana" ? "Esta semana" : t === "proxima" ? "Próxima semana" : "Finalizados"}</button>))}</div>
          {!loading && <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm font-semibold tabular-nums text-zinc-600">{atendimentosDaAba.length}</span>}
        </div>
        {loading ? (
          <div role="status" className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-amber-400" />
            <p className="text-sm text-zinc-500">Carregando atendimentos...</p>
          </div>
        ) : atendimentosDaAba.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="font-semibold text-zinc-900">Nenhum atendimento cadastrado</p>
            <p className="mt-2 text-sm text-zinc-500">Os atendimentos confirmados aparecem aqui.</p>
          </div>
        ) : (
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
            {atendimentosDaAba.map((at) => {
              const previsao = previsoes[at.id];
              const processando = processingId === at.id;
              const horario = at.horario_agendado ? new Date(at.horario_agendado) : null;

              return (
                <article key={at.id} className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <div className={`flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-5 ${at.status === 'em_andamento' ? 'border-amber-200 bg-amber-50' : 'border-zinc-100 bg-zinc-50/70'}`}>
                    <div className="min-w-0">
                      {at.modo === 'agendamento' && horario ? (
                        <time dateTime={at.horario_agendado}>
                          <span className="block text-2xl font-bold tracking-tight tabular-nums text-zinc-900">
                            {horario.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="mt-1 block text-xs font-medium text-zinc-500">
                            {horario.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace('-feira', '')}
                          </span>
                        </time>
                      ) : (
                        <div>
                          <p className="text-xl font-bold tracking-tight">{at.modo === 'fila' ? `Fila${at.ordem_fila ? ` · ${at.ordem_fila}º` : ''}` : 'Agendamento'}</p>
                          <p className="mt-1 text-xs text-zinc-500">{at.modo === 'fila' ? 'Ordem de atendimento' : 'Horário não informado'}</p>
                        </div>
                      )}
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${statusClasses(at.status)}`}>
                      {formatStatus(at.status)}
                    </span>
                  </div>
                  <div className="p-4 sm:p-5">
                    <h3 className="break-words text-lg font-bold tracking-tight text-zinc-900">{at.clientes?.nome} {at.clientes?.sobrenome}</h3>
                    {at.procedimentos_multi && at.procedimentos_multi.length > 0 ? (
                      <div className="mt-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Procedimentos</p>
                        <ul className="mt-1 list-inside space-y-0.5">
                          {at.procedimentos_multi.map((p) => (
                            <li key={p.id} className="break-words text-sm text-zinc-600">
                              • {p.nome}
                              {p.duracao_estimada_min != null && <span className="text-zinc-400"> — {p.duracao_estimada_min} min</span>}
                            </li>
                          ))}
                        </ul>
                        {(() => {
                          const total = at.procedimentos_multi.reduce((s, p) => s + (p.duracao_estimada_min || 0), 0);
                          return total > 0 ? <p className="mt-1 text-xs font-semibold text-zinc-500">Duração total: {total} minutos</p> : null;
                        })()}
                      </div>
                    ) : (
                      <p className="mt-1 break-words text-sm text-zinc-600">{at.procedimentos?.nome || 'Procedimento não informado'}</p>
                    )}
                    {at.clientes?.whatsapp && <p className="mt-2 break-words text-sm font-medium text-zinc-700">WhatsApp: {at.clientes.whatsapp}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-lg bg-zinc-100 px-2.5 py-1 font-medium text-zinc-600">{at.modo === 'agendamento' ? 'Agendamento' : 'Fila'}</span>
                      {at.procedimentos?.duracao_estimada_min != null && !(at.procedimentos_multi && at.procedimentos_multi.length > 0) && <span className="text-zinc-500">{at.procedimentos.duracao_estimada_min} min de duração</span>}
                    </div>

                    {(previsao?.inicio_previsto || previsao?.fim_previsto || (previsao?.minutos_restantes != null && previsao.minutos_restantes > 0)) && (
                      <div className="mt-4 space-y-2 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">
                        {previsao?.inicio_previsto && (
                          <p className="flex flex-wrap justify-between gap-x-3 gap-y-1"><span>Início previsto</span><span className="font-medium text-zinc-900">{new Date(previsao.inicio_previsto).toLocaleString('pt-BR')}</span></p>
                        )}
                        {previsao?.fim_previsto && (
                          <p className="flex flex-wrap justify-between gap-x-3 gap-y-1"><span>Fim previsto</span><span className="font-medium text-zinc-900">{new Date(previsao.fim_previsto).toLocaleString('pt-BR')}</span></p>
                        )}
                        {previsao?.minutos_restantes != null && previsao.minutos_restantes > 0 && (
                          <p className="font-semibold text-amber-800">{previsao.minutos_restantes} min restantes</p>
                        )}
                      </div>
                    )}
                    {at.status === 'cancelado' && at.motivo_cancelamento && (
                      <p className="mt-4 break-words rounded-xl bg-red-50 p-3 text-sm text-red-700"><span className="font-semibold">Motivo do cancelamento: </span>{at.motivo_cancelamento}</p>
                    )}
                    {at.status === 'aguardando' && (
                      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-4 sm:grid-cols-3">
                        <button onClick={() => handleIniciar(at.id)} disabled={processando} className={`${botaoPrincipalClass} col-span-2 sm:col-span-1`}>Iniciar</button>
                        <button onClick={() => handleEdit(at)} className={botaoSecundarioClass}>Editar</button>
                        <button onClick={() => openCancel(at)} className={botaoCancelarClass}>Cancelar</button>
                      </div>
                    )}
                    {at.status === 'em_andamento' && (
                      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-4 sm:grid-cols-3">
                        <button onClick={() => handlePausar(at.id)} disabled={processando} className={botaoSecundarioClass}>Pausar</button>
                        <button onClick={() => handleFinalizar(at.id)} disabled={processando} className={botaoPrincipalClass}>Finalizar</button>
                        <button onClick={() => openCancel(at)} className={`${botaoCancelarClass} col-span-2 sm:col-span-1`}>Cancelar</button>
                      </div>
                    )}
                    {at.status === 'pausado' && (
                      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-4 sm:grid-cols-3">
                        <button onClick={() => handleContinuar(at.id)} disabled={processando} className={botaoPrincipalClass}>Continuar</button>
                        <button onClick={() => handleFinalizar(at.id)} disabled={processando} className={botaoSecundarioClass}>Finalizar</button>
                        <button onClick={() => openCancel(at)} className={`${botaoCancelarClass} col-span-2 sm:col-span-1`}>Cancelar</button>
                      </div>
                    )}
                    {at.token_acesso && (
                      <div className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                        <button onClick={() => { console.log('CLICOU WHATS', at); handleEnviarWhatsApp(at); }} className={botaoSecundarioClass}>Enviar WhatsApp</button>
                        <button onClick={() => handleCopiarLink(at)} className={botaoSecundarioClass}>{copiadoId === at.id ? 'Link copiado!' : 'Copiar link do cliente'}</button>
                      </div>
                    )}
                    <p className="mt-4 text-xs leading-relaxed text-zinc-400">Criado em {new Date(at.criado_em).toLocaleString('pt-BR')}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {showCancel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" aria-labelledby="cancelamento-titulo" className="my-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:p-6">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-xl font-bold text-red-600" aria-hidden="true">×</span>
              <h2 id="cancelamento-titulo" className="text-xl font-bold tracking-tight text-zinc-900">Cancelar atendimento</h2>
              <p className="mb-5 mt-2 text-sm leading-relaxed text-zinc-500">Informe o motivo para registrar o cancelamento.</p>
              <label htmlFor="motivo" className="mb-1.5 block text-sm font-medium text-zinc-700">Motivo *</label>
              <textarea
                id="motivo"
                value={cancelForm.motivo}
                onChange={(e) => setCancelForm({ ...cancelForm, motivo: e.target.value })}
                placeholder="Informe o motivo do cancelamento"
                className={`${campoClass} min-h-28 resize-y`}
                rows={3}
                required
              />
              {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
              <div className="mt-5 grid gap-2">
                <button onClick={handleCancel} disabled={!!processingId} className="min-h-12 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">Confirmar cancelamento</button>
                <button onClick={() => { setShowCancel(false); setCancelForm({ id: '', motivo: '' }); }} className={botaoSecundarioClass}>Voltar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
