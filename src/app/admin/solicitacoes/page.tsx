'use client';

import { useState, useEffect } from 'react';
import { SolicitacaoPendente } from '@/lib/types';
import { formatarWhatsApp } from '@/lib/types';
import {
  listarSolicitacoesPendentes,
  aprovarSolicitacao,
  recusarSolicitacao,
} from '@/app/actions/solicitacoes';

export default function SolicitacoesPage() {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  useEffect(() => {
    carregarSolicitacoes();
  }, []);

  async function carregarSolicitacoes() {
    try {
      setLoading(true);
      const resultado = await listarSolicitacoesPendentes();

      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao carregar solicitações pendentes');
        return;
      }

      setSolicitacoes(resultado.dados || []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar solicitações pendentes'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAprovar(id: string) {
    try {
      setProcessandoId(id);
      setError(null);
      setMensagemSucesso(null);

      const resultado = await aprovarSolicitacao(id);

      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao aprovar solicitação');
        return;
      }

      setSolicitacoes((prev) => prev.filter((item) => item.id !== id));
      setMensagemSucesso('Solicitação aprovada com sucesso!');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao aprovar solicitação'
      );
    } finally {
      setProcessandoId(null);
    }
  }

  async function handleRecusar(id: string) {
    if (!confirm('Tem certeza que deseja recusar este agendamento?')) {
      return;
    }

    try {
      setProcessandoId(id);
      setError(null);
      setMensagemSucesso(null);

      const resultado = await recusarSolicitacao(id);

      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao recusar solicitação');
        return;
      }

      setSolicitacoes((prev) => prev.filter((item) => item.id !== id));
      setMensagemSucesso('Solicitação recusada com sucesso.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao recusar solicitação'
      );
    } finally {
      setProcessandoId(null);
    }
  }

  function formatarDataHora(isoString: string): string {
    if (!isoString) return '-';
    const data = new Date(isoString);
    if (isNaN(data.getTime())) return isoString;
    return data.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">
            Solicitações Pendentes
          </h1>
          <span className="text-sm px-3 py-1 bg-amber-100 text-amber-800 rounded-full font-medium">
            {solicitacoes.length} {solicitacoes.length === 1 ? 'pendente' : 'pendentes'}
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {mensagemSucesso && (
          <div
            role="status"
            className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700"
          >
            {mensagemSucesso}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-zinc-500">Carregando solicitações...</p>
          </div>
        ) : solicitacoes.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
            <p className="text-zinc-500 mb-1">Nenhuma solicitação pendente</p>
            <p className="text-sm text-zinc-400">
              Novos agendamentos feitos online aparecerão aqui para aprovação.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {solicitacoes.map((item) => {
              const estaProcessando = processandoId === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-zinc-900">
                          {item.cliente_nome} {item.cliente_sobrenome}
                        </h2>
                      </div>

                      <p className="text-sm text-zinc-600">
                        📱 <span className="font-medium">WhatsApp:</span>{' '}
                        {formatarWhatsApp(item.cliente_whatsapp) || 'Não informado'}
                      </p>

                      <p className="text-sm text-zinc-600">
                        ✂️ <span className="font-medium">Procedimento:</span>{' '}
                        {item.procedimento_nome} ({item.procedimento_duracao_min} min)
                      </p>

                      <p className="text-sm text-zinc-600">
                        📅 <span className="font-medium">Horário Desejado:</span>{' '}
                        <span className="font-semibold text-zinc-900">
                          {formatarDataHora(item.horario_solicitado)}
                        </span>
                      </p>

                      <p className="text-xs text-zinc-400">
                        Solicitado em: {formatarDataHora(item.criado_em)}
                      </p>
                    </div>

                    <div className="flex gap-2 pt-2 md:pt-0">
                      <button
                        type="button"
                        onClick={() => handleAprovar(item.id)}
                        disabled={estaProcessando}
                        className="flex-1 md:flex-initial min-h-11 px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                      >
                        {estaProcessando ? 'Processando...' : 'Aprovar'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRecusar(item.id)}
                        disabled={estaProcessando}
                        className="flex-1 md:flex-initial min-h-11 px-5 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                      >
                        {estaProcessando ? 'Processando...' : 'Recusar'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
