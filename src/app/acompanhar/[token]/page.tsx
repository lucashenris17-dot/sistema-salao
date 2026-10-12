'use client';

import { useState, useEffect, use } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { calcularPrevisao } from '@/lib/previsao';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string; mensagem: string }> = {
  pendente: {
    label: 'Aguardando confirmação',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    icon: '🕐',
    mensagem: 'Sua solicitação foi enviada.\nA Inácia irá confirmar a disponibilidade do horário.',
  },
  confirmado: {
    label: 'Agendamento confirmado',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    icon: '✅',
    mensagem: 'Seu horário foi confirmado pela Inácia.',
  },
  recusado: {
    label: 'Solicitação recusada',
    bg: 'bg-red-50',
    text: 'text-red-700',
    icon: '✕',
    mensagem: 'Seu agendamento não foi aprovado.',
  },
  aguardando: {
  label: 'Aguardando confirmação',
  bg: 'bg-blue-50',
  text: 'text-blue-700',
  icon: '🕐',
  mensagem: 'Sua solicitação foi enviada.\nA Inácia irá confirmar a disponibilidade do horário.',
},

em_andamento: {
  label: 'Em atendimento',
  bg: 'bg-emerald-50',
  text: 'text-emerald-700',
  icon: '✨',
  mensagem: 'Seu atendimento começou. Aproveite seu momento com a Inacia.',
},

pausado: {
  label: 'Pausado',
  bg: 'bg-amber-50',
  text: 'text-amber-700',
  icon: '⏸️',
  mensagem: 'O atendimento foi pausado temporariamente. A previsão será atualizada.',
},
  finalizado: {
    label: 'Finalizado',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    icon: '✓',
    mensagem: 'Seu atendimento foi concluído. Obrigado pela visita!',
  },
  cancelado: {
    label: 'Cancelado',
    bg: 'bg-zinc-50',
    text: 'text-zinc-600',
    icon: '✕',
    mensagem: 'Este atendimento foi cancelado.',
  },
  no_show: {
    label: 'Não compareceu',
    bg: 'bg-zinc-50',
    text: 'text-zinc-600',
    icon: '—',
    mensagem: 'Este atendimento foi marcado como não comparecimento.',
  },
};

export default function AcompanharPage({ params }: { params: Promise<{ token: string }> }) {
  const resolved = use(params);
  const token = resolved.token;
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [atendimento, setAtendimento] = useState<any>(null);
  const [statusConfirmacao, setStatusConfirmacao] = useState<string | null>(null);
  const [previsao, setPrevisao] = useState<any>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      try {
        
        const { data, error } = await supabase
          .rpc('fn_buscar_atendimento_publico', { p_token: token })
          .single();

        const resposta = data as any;

        if (error || !resposta || !resposta.atendimento_id) {
          setErro('Atendimento não encontrado');
          return;
        }

        const atendimentoData = {
          id: resposta.atendimento_id,
          cliente_id: null,
          procedimento_id: null,
          modo: resposta.modo,
          status: resposta.status,
          horario_agendado: resposta.horario_agendado,
          ordem_fila: resposta.ordem_fila,
          motivo_cancelamento: null,
          criado_em: resposta.criado_em,
          duracao_trabalhada_seg: resposta.duracao_trabalhada_seg,
          pausado_desde: resposta.pausado_desde,
          token_acesso: token,
          clientes: { nome: resposta.cliente_nome, sobrenome: resposta.cliente_sobrenome },
          procedimentos: { nome: resposta.procedimento_nome, duracao_estimada_min: resposta.duracao_estimada_min },
        };

        setAtendimento(atendimentoData);

        // Busca status_confirmacao diretamente (não retornado pela RPC)
        const { data: confirmData } = await supabase
          .from('atendimentos')
          .select('status_confirmacao')
          .eq('token_acesso', token)
          .single();
        setStatusConfirmacao((confirmData as any)?.status_confirmacao ?? null);

        const { data: filaData } = await supabase
  .from('atendimentos')
.select(`
    id,
    cliente_id,
    procedimento_id,
    procedimento_ids,
    modo,
    status,
    horario_agendado,
    ordem_fila,
    criado_em,
    duracao_trabalhada_seg,
    pausado_desde,
    procedimentos!procedimento_id (
      duracao_estimada_min
    )
  `)
.in('status', ['aguardando', 'em_andamento', 'pausado'])
.order('criado_em', { ascending: true });

const procedimentoIds = Array.from(new Set(
  (filaData || []).flatMap((f: any) =>
    Array.isArray(f.procedimento_ids) && f.procedimento_ids.length > 0
      ? f.procedimento_ids
      : f.procedimento_id
        ? [f.procedimento_id]
        : []
  )
));
const { data: procedimentosData } = procedimentoIds.length > 0
  ? await supabase
      .from('procedimentos')
      .select('id, duracao_estimada_min')
      .in('id', procedimentoIds)
  : { data: [] };
const duracoesPorProcedimento = new Map(
  (procedimentosData || []).map((p: any) => [p.id, p.duracao_estimada_min || 0])
);

const calcInputs = (filaData || []).map((f: any) => ({
  id: f.id,
  modo: f.modo,
  status: f.status,
  cliente_id: f.cliente_id || '',
  procedimento_id: f.procedimento_id || '',
  horario_agendado: f.horario_agendado,
  ordem_fila: f.ordem_fila,
  criado_em: f.criado_em,
  procedimento: {
    duracao_estimada_min: (
      Array.isArray(f.procedimento_ids) && f.procedimento_ids.length > 0
        ? f.procedimento_ids
        : f.procedimento_id
          ? [f.procedimento_id]
          : []
    ).reduce(
      (total: number, procedimentoId: string) =>
        total + (duracoesPorProcedimento.get(procedimentoId) || 0),
      0
    ) || f.procedimentos?.duracao_estimada_min || 0
  },
  duracao_trabalhada_seg: f.duracao_trabalhada_seg,
  pausado_desde: f.pausado_desde,
}));

const preds = calcularPrevisao(calcInputs);

setPrevisao(preds[atendimentoData.id] || {});
      } catch (e) {
        setErro('Erro ao carregar');
      }
    }
    carregar();

    const channel = supabase
  .channel('atendimento-atualizado')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'atendimentos',
    },
     (_payload) => {

      carregar();
    }
  )
  .subscribe((status) => {
    console.log('REALTIME STATUS:', status);
  });  
    return () => {
      supabase.removeChannel(channel);
    };
  }, [token]);

  if (erro) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-lg">✕</span>
          </div>
          <h1 className="text-lg font-semibold text-zinc-900 mb-2">Não encontrado</h1>
          <p className="text-sm text-zinc-500">O atendimento solicitado não foi localizado.</p>
        </div>
      </div>
    );
  }

  if (!atendimento) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm text-center">
          <div className="w-8 h-8 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-500">Carregando acompanhamento...</p>
        </div>
      </div>
    );
  }

  // Para agendamentos, usa status_confirmacao para determinar o card de status
  const statusKey =
    atendimento.status === 'aguardando' && statusConfirmacao
      ? statusConfirmacao
      : atendimento.status;
  const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.aguardando;
  const isFinalizado = atendimento.status === 'finalizado';
  const isCancelado = atendimento.status === 'cancelado';
  const isNoShow = atendimento.status === 'no_show';
  const isEncerrado = isFinalizado || isCancelado || isNoShow;

  const formatarData = (data: string | Date) => {
    const d = typeof data === 'string' ? new Date(data) : data;
    if (isNaN(d.getTime())) return '--';
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-sm mx-auto px-4 py-8">

        {/* Cabeçalho */}
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
 ✂️ Salão da Inacia
</h1>
          <div className="w-8 h-0.5 bg-amber-400 mx-auto mt-2 rounded-full" />
           <p className="text-sm text-zinc-500 mt-2">
    Seu atendimento, acompanhado em tempo real
  </p>
</header>

        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        {/* Cliente e procedimento */}
<div className="px-6 pt-6 pb-4">

  {(atendimento.clientes as any)?.nome && (
    <p className="text-sm text-zinc-500 mb-2">
      Olá, {(atendimento.clientes as any)?.nome} 👋
    </p>
  )}

  <h2 className="text-xl font-bold text-zinc-900 leading-tight">
    {(atendimento.procedimentos as any)?.nome}
  </h2>

  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mt-2">
    Seu atendimento
  </p>

</div>  

          {/* Status */}
<div className="px-6 mb-5">
  <div className={`flex items-center justify-center gap-3 px-5 py-3 rounded-2xl text-base font-bold shadow-sm ${statusCfg.bg} ${statusCfg.text}`}>
    <span className="text-xl">{statusCfg.icon}</span>
    <span>{statusCfg.label}</span>
  </div>
</div>

          {/* Horário agendado */}
          {atendimento.horario_agendado && (
            <div className="px-6 mb-5 flex items-center gap-2 text-sm">
              <span className="w-5 h-5 flex items-center justify-center bg-zinc-100 rounded-md text-zinc-500 text-xs shadow-sm">📅</span>
              <span className="text-zinc-500">Agendado para</span>
              <span className="font-semibold text-zinc-800">{formatarData(atendimento.horario_agendado)}</span>
            </div>
          )}

          {/* Mensagem contextual */}
          <div className={`mx-4 mb-6 px-4 py-3 rounded-lg text-sm bg-zinc-50 text-zinc-600 border border-zinc-100 shadow-sm leading-relaxed text-center`}>
            {statusCfg.mensagem}
          </div>

        {/* Previsão inteligente — apenas horário estimado, sem expor fila */}
        {!isEncerrado && (
          <div className="mx-4 mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🕐</span>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">
                Previsão de atendimento
              </p>
            </div>
            <p className="text-sm text-amber-800 leading-snug">
              {previsao.inicio_previsto
                ? `Previsão atual: ${new Date(previsao.inicio_previsto).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`
                : 'Seu horário está mantido.'}
            </p>
          </div>
        )}
  
            {/* Bloco Previsão — só para status ativos */}
          {!isEncerrado && previsao.inicio_previsto && (
            <div className="bg-zinc-50 border-t border-zinc-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Previsão Atualizada
                  </span>
                <div className="flex-1 border-b border-zinc-200" />
              </div>

              <div className="grid grid-cols-2 gap-4">

  {previsao.inicio_previsto && (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-zinc-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>

      <div className="flex items-center gap-2 mb-1">
  <span className="text-lg">🏁</span>
  <p className="text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
    Início Previsto
  </p>
</div>

<p className="text-base font-bold text-zinc-900 mt-1">
  {formatarData(previsao.inicio_previsto)}
</p>
    </div>
  )}

  {previsao.fim_previsto && (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-zinc-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-blue-400"></div>

      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">⏰</span>
        <p className="text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
          Fim estimado
        </p>
      </div>

      <p className="text-base font-bold text-zinc-900 mt-1">
        {formatarData(previsao.fim_previsto)}
      </p>
    </div>
  )}

</div>
              {previsao.minutos_restantes != null && previsao.minutos_restantes > 0 && (
                <div className="mt-4 bg-white rounded-xl p-4 shadow-sm border border-zinc-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
                      Tempo de duração
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-bold text-zinc-900 tracking-tight">
                      {previsao.minutos_restantes}
                      <span className="text-xs font-medium text-zinc-500"> min</span>
                    </p>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}