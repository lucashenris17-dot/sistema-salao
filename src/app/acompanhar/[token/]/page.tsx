'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { calcularPrevisao } from '@/lib/previsao';

export default function AcompanharPage({ params }: { params: { token: string } }) {
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
          .from('atendimentos')
          .select(`
            id, cliente_id, procedimento_id, modo, status,
            horario_agendado, ordem_fila, motivo_cancelamento, criado_em,
            duracao_trabalhada_seg, pausado_desde, token_acesso,
            clientes:cliente_id (nome, sobrenome),
            procedimentos:procedimento_id (nome, duracao_estimada_min)
          `)
          .eq('token_acesso', params.token)
          .single();

        if (error || !data) {
          setErro('Atendimento não encontrado');
          return;
        }

        setAtendimento(data);
        const procDur = (data.procedimentos as any)?.duracao_estimada_min || 0;
        const calcInputs = [{
          id: data.id,
          modo: data.modo,
          status: data.status,
          cliente_id: data.cliente_id,
          procedimento_id: data.procedimento_id,
          horario_agendado: data.horario_agendado,
          ordem_fila: data.ordem_fila,
          procedimento: { duracao_estimada_min: procDur },
          duracao_trabalhada_seg: data.duracao_trabalhada_seg,
          pausado_desde: data.pausado_desde,
        }];
        const preds = calcularPrevisao(calcInputs);
        setPrevisao(preds[data.id] || {});
      } catch (e) {
        setErro('Erro ao carregar');
      }
    }
    carregar();

    const channel = supabase
      .channel('acompanhar-' + params.token)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos', filter: `token_acesso=eq.${params.token}` }, () => {
        carregar();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.token]);

  if (erro) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-sm text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Não encontrado</h1>
          <p className="text-gray-600">O atendimento solicitado não foi localizado.</p>
        </div>
      </div>
    );
  }

  if (!atendimento) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-sm text-center">
          <p className="text-gray-500">Carregando acompanhamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Acompanhamento</h1>
          <p className="text-sm text-gray-500 mb-4">{(atendimento.procedimentos as any)?.nome}</p>

          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs font-medium px-2 py-1 rounded ${
              atendimento.modo === 'agendamento' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {atendimento.modo === 'agendamento' ? 'Agendamento' : 'Fila'}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded ${
              atendimento.status === 'aguardando' ? 'bg-yellow-100 text-yellow-800' :
              atendimento.status === 'em_andamento' ? 'bg-green-100 text-green-800' :
              atendimento.status === 'pausado' ? 'bg-amber-100 text-amber-800' :
              atendimento.status === 'finalizado' ? 'bg-gray-100 text-gray-800' :
              atendimento.status === 'cancelado' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {atendimento.status}
            </span>
          </div>

          <div className="space-y-2 text-sm text-gray-700">
            <p><strong>Cliente:</strong> {(atendimento.clientes as any)?.nome} {(atendimento.clientes as any)?.sobrenome}</p>
            {atendimento.horario_agendado && (
              <p><strong>Horário agendado:</strong> {new Date(atendimento.horario_agendado).toLocaleString('pt-BR')}</p>
            )}
            {atendimento.modo === 'fila' && atendimento.ordem_fila && (
              <p><strong>Ordem na fila:</strong> {atendimento.ordem_fila}</p>
            )}
            {previsao.inicio_previsto && (
              <p><strong>Início previsto:</strong> {new Date(previsao.inicio_previsto).toLocaleString('pt-BR')}</p>
            )}
            {previsao.fim_previsto && (
              <p><strong>Fim previsto:</strong> {new Date(previsao.fim_previsto).toLocaleString('pt-BR')}</p>
            )}
            {previsao.minutos_restantes != null && previsao.minutos_restantes > 0 && (
              <p><strong>Tempo restante:</strong> {previsao.minutos_restantes} min</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
