'use client';

import { useState, useEffect, use } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { calcularPrevisao } from '@/lib/previsao';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string; mensagem: string }> = {
  aguardando: {
    label: 'Aguardando',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    icon: '⏳',
    mensagem: 'Você está na fila. A previsão será atualizada automaticamente.',
  },
  em_andamento: {
    label: 'Em andamento',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    icon: '✅',
    mensagem: 'Seu atendimento está em andamento.',
  },
  pausado: {
    label: 'Pausado',
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    icon: '⏸',
    mensagem: 'Seu atendimento está pausado. A previsão será atualizada quando ele continuar.',
  },
  finalizado: {
    label: 'Finalizado',
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    icon: '✔',
    mensagem: 'Seu atendimento foi finalizado.',
  },
  cancelado: {
    label: 'Cancelado',
    bg: 'bg-red-50',
    text: 'text-red-600',
    icon: '✕',
    mensagem: 'Este atendimento foi cancelado.',
  },
  no_show: {
    label: 'Não compareceu',
    bg: 'bg-red-50',
    text: 'text-red-600',
    icon: '!',
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
        const procDur = (resposta.duracao_estimada_min != null) ? resposta.duracao_estimada_min : 0;
        const calcInputs = [{
          id: atendimentoData.id,
          modo: atendimentoData.modo,
          status: atendimentoData.status,
          cliente_id: atendimentoData.cliente_id || '',
          procedimento_id: atendimentoData.procedimento_id || '',
          horario_agendado: atendimentoData.horario_agendado,
          ordem_fila: atendimentoData.ordem_fila,
          procedimento: { duracao_estimada_min: procDur },
          duracao_trabalhada_seg: atendimentoData.duracao_trabalhada_seg,
          pausado_desde: atendimentoData.pausado_desde,
        }];
        const preds = calcularPrevisao(calcInputs);
        setPrevisao(preds[atendimentoData.id] || {});
      } catch (e) {
        setErro('Erro ao carregar');
      }
    }
    carregar();

    const channel = supabase
      .channel('acompanhar-' + token)
      .on('broadcast', { event: 'atendimento-atualizado' }, () => {
        carregar();
      })
      .subscribe();

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

  const statusCfg = STATUS_CONFIG[atendimento.status] || STATUS_CONFIG.aguardando;
  const isFinalizado = atendimento.status === 'finalizado';
  const isCancelado = atendimento.status === 'cancelado';
  const isNoShow = atendimento.status === 'no_show';
  const isEncerrado = isFinalizado || isCancelado || isNoShow;

  const formatarData = (data: string | Date) => {
    // Garante que esteja interpretado como UTC (timestamptz do Supabase)
    // e formata para horário do salão (UTC-3) sem conversão automática do navegador
    const d = typeof data === 'string' ? new Date(data) : data;
    if (isNaN(d.getTime())) return '--';
    // Ajusta para UTC-3 (Brasília) subtraindo 3h do UTC
    const dBrasilia = new Date(d.getTime() - 3 * 3600 * 1000);
    const dia = String(dBrasilia.getUTCDate()).padStart(2, '0');
    const mes = String(dBrasilia.getUTCMonth() + 1).padStart(2, '0');
    const hora = String(dBrasilia.getUTCHours()).padStart(2, '0');
    const min = String(dBrasilia.getUTCMinutes()).padStart(2, '0');
    return `${dia}/${mes} ${hora}:${min}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-sm mx-auto px-4 py-8">

        {/* Cabeçalho */}
        <header className="text-center mb-6">
          <h1 className="text-xl font-semibold text-zinc-900">Acompanhamento</h1>
          <p className="text-xs text-zinc-400 mt-1">As informações são atualizadas automaticamente.</p>
        </header>

        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">

          {/* Nome do procedimento em destaque */}
          <div className="px-5 pt-5 pb-4">
            <p className="text-base font-semibold text-zinc-900">
              {(atendimento.procedimentos as any)?.nome}
            </p>
            {(atendimento.clientes as any)?.nome && (
              <p className="text-sm text-zinc-500 mt-0.5">
                {(atendimento.clientes as any)?.nome} {(atendimento.clientes as any)?.sobrenome}
              </p>
            )}
          </div>

          {/* Status com ícone */}
          <div className="mx-5 mb-4">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${statusCfg.bg} ${statusCfg.text}`}>
              <span className="text-xs">{statusCfg.icon}</span>
              {statusCfg.label}
            </div>
          </div>

          {/* Horário agendado */}
          {atendimento.horario_agendado && (
            <div className="mx-5 mb-4 flex items-center gap-2 text-sm text-zinc-600">
              <span className="text-zinc-400">Horário:</span>
              <span className="font-medium">{formatarData(atendimento.horario_agendado)}</span>
            </div>
          )}

          {/* Mensagem contextual */}
          <div className={`mx-5 mb-5 px-4 py-3 rounded-xl text-sm ${statusCfg.bg} ${statusCfg.text}`}>
            {statusCfg.mensagem}
          </div>

          {/* Bloco Previsão — só para status ativos */}
          {!isEncerrado && previsao.inicio_previsto && (
            <div className="border-t border-zinc-100 mx-5 pt-4 pb-5">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Previsão</p>
              <div className="grid grid-cols-2 gap-3">
                {previsao.inicio_previsto && (
                  <div>
                    <p className="text-xs text-zinc-400">Início</p>
                    <p className="text-sm font-medium text-zinc-800 mt-0.5">{formatarData(previsao.inicio_previsto)}</p>
                  </div>
                )}
                {previsao.fim_previsto && (
                  <div>
                    <p className="text-xs text-zinc-400">Fim</p>
                    <p className="text-sm font-medium text-zinc-800 mt-0.5">{formatarData(previsao.fim_previsto)}</p>
                  </div>
                )}
              </div>
              {previsao.minutos_restantes != null && previsao.minutos_restantes > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-100">
                  <p className="text-xs text-zinc-400">Tempo restante</p>
                  <p className="text-lg font-semibold text-zinc-900 mt-0.5">{previsao.minutos_restantes} min</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
