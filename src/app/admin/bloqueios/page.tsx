'use client';

import { useState, useEffect } from 'react';
import { BloqueioAgenda } from '@/lib/types';
import { listarBloqueios, criarBloqueio, excluirBloqueio } from '@/app/actions/bloqueios';

export default function BloqueiosPage() {
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    dataInicio: '',
    horaInicio: '',
    dataFim: '',
    horaFim: '',
    descricao: '',
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarBloqueios();
  }, []);

  async function carregarBloqueios() {
    try {
      setLoading(true);
      const resultado = await listarBloqueios();

      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao carregar bloqueios');
        return;
      }

      setBloqueios(resultado.dados || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar bloqueios');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.dataInicio || !formData.horaInicio || !formData.dataFim || !formData.horaFim) {
      setError('Preencha data e hora de início e fim');
      return;
    }

    try {
      setSalvando(true);
      setError(null);

      // Montar ISO strings para o banco
      const inicio = `${formData.dataInicio}T${formData.horaInicio}:00`;
      const fim = `${formData.dataFim}T${formData.horaFim}:00`;

      const resultado = await criarBloqueio({
        inicio,
        fim,
        descricao: formData.descricao || undefined,
      });

      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao criar bloqueio');
        return;
      }

      setFormData({
        dataInicio: '',
        horaInicio: '',
        dataFim: '',
        horaFim: '',
        descricao: '',
      });
      setShowForm(false);
      await carregarBloqueios();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar bloqueio');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(id: string, descricao?: string | null) {
    const mensagem = descricao
      ? `Tem certeza que deseja excluir o bloqueio "${descricao}"?`
      : 'Tem certeza que deseja excluir este bloqueio?';

    if (!confirm(mensagem)) return;

    try {
      const resultado = await excluirBloqueio(id);

      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao excluir bloqueio');
        return;
      }

      await carregarBloqueios();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir bloqueio');
    }
  }

  function handleCancelar() {
    setShowForm(false);
    setFormData({
      dataInicio: '',
      horaInicio: '',
      dataFim: '',
      horaFim: '',
      descricao: '',
    });
    setError(null);
  }

  function formatarDataHora(isoString: string): string {
    const data = new Date(isoString);
    return data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function calcularDuracao(inicio: string, fim: string): string {
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    const diffMs = dataFim.getTime() - dataInicio.getTime();
    const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHoras > 0) {
      return `${diffHoras}h${diffMinutos > 0 ? ` ${diffMinutos}min` : ''}`;
    }
    return `${diffMinutos}min`;
  }

  function formatarDiaSemana(dataIso: string): string {
    if (!dataIso) return 'Selecione a data';
    const data = new Date(dataIso.length === 10 ? `${dataIso}T12:00:00` : dataIso);
    if (isNaN(data.getTime())) return '';
    return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][data.getDay()];
  }

  return (
    <div className="min-h-screen min-w-0 bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">Sua disponibilidade</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Bloqueios de agenda</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">Organize os períodos em que você não estará disponível.</p>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-amber-300 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Novo bloqueio
            </button>
          )}
        </header>

        {error && (
          <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 min-w-0 space-y-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <div>
              <h2 className="text-xl font-bold tracking-tight">Novo bloqueio</h2>
              <p className="mt-1 text-sm text-zinc-500">Defina o início e o fim do período reservado.</p>
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <fieldset className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <legend className="px-2 text-sm font-semibold text-zinc-900">Início do bloqueio</legend>
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-amber-400" aria-hidden="true">01</span>
                  <p className="text-sm font-medium text-zinc-600">A partir de quando?</p>
                </div>
                <label htmlFor="bloqueio-data-inicio" className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-zinc-700">
                  Data de início
                  {formData.dataInicio && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-zinc-900">{formatarDiaSemana(formData.dataInicio)}</span>}
                </label>
                <input
                  id="bloqueio-data-inicio"
                  type="date"
                  value={formData.dataInicio}
                  onChange={(e) => setFormData({ ...formData, dataInicio: e.target.value })}
                  className="mb-4 block min-h-12 w-full min-w-0 max-w-full appearance-none rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 [color-scheme:light] [-webkit-text-fill-color:#18181b] focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 [&::-webkit-date-and-time-value]:text-left"
                  required
                />

                <label htmlFor="bloqueio-hora-inicio" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Hora de início
                </label>
                <select
                  id="bloqueio-hora-inicio"
                  value={formData.horaInicio}
                  onChange={(e) => setFormData({ ...formData, horaInicio: e.target.value })}
                  className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 [color-scheme:light] focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  required
                >
                  <option value="">Selecione</option>
                  {Array.from({ length: 48 }, (_, i) => {
                    const hour = Math.floor(i / 2);
                    const minute = i % 2 === 0 ? '00' : '30';
                    const time = `${hour.toString().padStart(2, '0')}:${minute}`;
                    return (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    );
                  })}
                </select>
              </fieldset>

              <fieldset className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <legend className="px-2 text-sm font-semibold text-zinc-900">Fim do bloqueio</legend>
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-amber-400" aria-hidden="true">02</span>
                  <p className="text-sm font-medium text-zinc-600">Até quando?</p>
                </div>
                <label htmlFor="bloqueio-data-fim" className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-zinc-700">
                  Data de fim
                  {formData.dataFim && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-zinc-900">{formatarDiaSemana(formData.dataFim)}</span>}
                </label>
                <input
                  id="bloqueio-data-fim"
                  type="date"
                  value={formData.dataFim}
                  onChange={(e) => setFormData({ ...formData, dataFim: e.target.value })}
                  className="mb-4 block min-h-12 w-full min-w-0 max-w-full appearance-none rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 [color-scheme:light] [-webkit-text-fill-color:#18181b] focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 [&::-webkit-date-and-time-value]:text-left"
                  required
                />

                <label htmlFor="bloqueio-hora-fim" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Hora de fim
                </label>
                <select
                  id="bloqueio-hora-fim"
                  value={formData.horaFim}
                  onChange={(e) => setFormData({ ...formData, horaFim: e.target.value })}
                  className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 [color-scheme:light] focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  required
                >
                  <option value="">Selecione</option>
                  {Array.from({ length: 48 }, (_, i) => {
                    const hour = Math.floor(i / 2);
                    const minute = i % 2 === 0 ? '00' : '30';
                    const time = `${hour.toString().padStart(2, '0')}:${minute}`;
                    return (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    );
                  })}
                </select>
              </fieldset>
            </div>

            <div>
              <label htmlFor="bloqueio-descricao" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Descrição (opcional)
              </label>
              <input
                id="bloqueio-descricao"
                type="text"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Ex: Folga, Academia, Médico..."
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-zinc-100 pt-5 sm:flex-row">
              <button
                type="submit"
                disabled={salvando}
                className="min-h-12 flex-1 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-amber-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                {salvando ? 'Salvando...' : 'Criar bloqueio'}
              </button>
              <button
                type="button"
                onClick={handleCancelar}
                disabled={salvando}
                className="min-h-12 flex-1 rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div role="status" className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" aria-hidden="true" />
            <p className="text-sm text-zinc-500">Carregando bloqueios...</p>
          </div>
        ) : bloqueios.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
              <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18m-13 5 2 2 4-4" /></svg>
            </div>
            <p className="mb-2 text-lg font-bold tracking-tight">Nenhum bloqueio cadastrado</p>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-zinc-500">
              Bloqueios impedem agendamentos em horários específicos
            </p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {bloqueios.map((bloqueio) => (
              <article
                key={bloqueio.id}
                className="flex min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"
              >
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-amber-400">
                    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M9 16h6" /></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Período reservado</p>
                    <h2 className="break-words text-lg font-bold tracking-tight">
                      {bloqueio.descricao || 'Bloqueio de agenda'}
                    </h2>
                  </div>
                </div>

                <dl className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Início · {formatarDiaSemana(bloqueio.inicio)}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-zinc-900">{formatarDataHora(bloqueio.inicio)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Fim · {formatarDiaSemana(bloqueio.fim)}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-zinc-900">{formatarDataHora(bloqueio.fim)}</dd>
                  </div>
                </dl>

                <div className="mt-auto flex flex-col gap-4 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-zinc-500">Duração <span className="ml-1 font-semibold text-zinc-900">{calcularDuracao(bloqueio.inicio, bloqueio.fim)}</span></p>
                  <button
                    type="button"
                    onClick={() => handleExcluir(bloqueio.id, bloqueio.descricao)}
                    className="min-h-12 rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                  >
                    Excluir bloqueio
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
