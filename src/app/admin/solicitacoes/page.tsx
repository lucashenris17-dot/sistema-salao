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

  function formatarParteData(isoString: string, opcoes: Intl.DateTimeFormatOptions): string {
    if (!isoString) return '-';
    const data = new Date(isoString);
    if (isNaN(data.getTime())) return isoString;
    return data.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      ...opcoes,
    });
  }

  return (
    <div className="min-h-screen min-w-0 bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">Agenda online</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Solicitações</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Confira os pedidos e confirme os próximos horários do salão.
            </p>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-amber-100 px-4 py-2 text-sm font-semibold text-zinc-900">
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
            {loading ? 'Carregando...' : `${solicitacoes.length} ${solicitacoes.length === 1 ? 'pendente' : 'pendentes'}`}
          </span>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm"
          >
            {error}
          </div>
        )}

        {mensagemSucesso && (
          <div
            role="status"
            className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm"
          >
            {mensagemSucesso}
          </div>
        )}

        {loading ? (
          <div role="status" className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" aria-hidden="true" />
            <p className="text-sm text-zinc-500">Carregando solicitações...</p>
          </div>
        ) : solicitacoes.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-zinc-900">
              <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m8 12 3 3 5-6" /><circle cx="12" cy="12" r="9" />
              </svg>
            </div>
            <p className="mb-2 text-lg font-bold tracking-tight">Tudo em dia por aqui</p>
            <p className="mb-1 text-sm font-medium text-zinc-700">Nenhuma solicitação pendente.</p>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-zinc-500">
              Novos agendamentos feitos online aparecerão aqui para aprovação.
            </p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {solicitacoes.map((item) => {
              const estaProcessando = processandoId === item.id;

              return (
                <article
                  key={item.id}
                  className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900 px-4 py-4 text-white sm:px-6">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-400">Horário solicitado</p>
                      <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
                        {formatarParteData(item.horario_solicitado, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold capitalize text-amber-400">
                        {formatarParteData(item.horario_solicitado, { weekday: 'short' }).replace('.', '')}
                      </p>
                      <p className="mt-1 font-medium text-zinc-200">
                        {formatarParteData(item.horario_solicitado, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-4 sm:p-6">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cliente</p>
                      <h2 className="mt-1 break-words text-xl font-bold tracking-tight">
                        {item.cliente_nome} {item.cliente_sobrenome}
                      </h2>
                      <div className="mt-3 flex items-start gap-2 text-sm text-zinc-600">
                        <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
                        </svg>
                        <p className="min-w-0 break-words"><span className="mr-1.5 text-zinc-500">WhatsApp</span><span className="font-semibold text-zinc-900">{formatarWhatsApp(item.cliente_whatsapp) || 'Não informado'}</span></p>
                      </div>
                    </div>

                    <div className="my-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Procedimento</p>
                        <p className="mt-1 break-words font-semibold">{item.procedimento_nome}</p>
                      </div>
                      <span className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">
                        {item.procedimento_duracao_min} min
                      </span>
                    </div>

                    <p className="mb-4 text-xs leading-relaxed text-zinc-500">
                      Solicitado em {formatarDataHora(item.criado_em)}
                    </p>
                    <div className="mt-auto grid grid-cols-1 gap-3 border-t border-zinc-100 pt-4 min-[380px]:grid-cols-[1.4fr_1fr]">
                      <button
                        type="button"
                        onClick={() => handleAprovar(item.id)}
                        disabled={estaProcessando}
                        className="min-h-12 min-w-0 rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-amber-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                      >
                        {estaProcessando ? 'Processando...' : 'Aprovar'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRecusar(item.id)}
                        disabled={estaProcessando}
                        className="min-h-12 min-w-0 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                      >
                        {estaProcessando ? 'Processando...' : 'Recusar'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
