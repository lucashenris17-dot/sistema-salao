'use client';

import { useState, useEffect, useMemo } from 'react';
import { BloqueioAgenda } from '@/lib/types';
import { listarBloqueios, criarBloqueio, excluirBloqueio } from '@/app/actions/bloqueios';
import GradeHorario from '@/components/grade-horarios';
import { gerarGradeHorarios } from '@/lib/horarios';

export default function BloqueiosPage() {
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Aba ativa: 'semanal_fixo' | 'temporario' | 'especifico'
  const [aba, setAba] = useState<'semanal_fixo' | 'temporario' | 'especifico'>('semanal_fixo');

  const [formData, setFormData] = useState({
    // Semanal
    dias_semana: [] as number[],
    hora_inicio: '',
    hora_fim: '',
    // Temporario
    data_inicio: '',
    data_fim: '',
    // Especifico
    data_especifica: '',
    // Comum
    descricao: '',
  });

  const [salvando, setSalvando] = useState(false);
  // Modal de conflito
  const [mostrarConflito, setMostrarConflito] = useState(false);
  const [conflitosData, setConflitosData] = useState<{cliente:string;whatsapp:string;horario:string;procedimento:string}[]>([]);
  const [manterConflito, setManterConflito] = useState(false);

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
    setError(null);

    if (!formData.descricao || !formData.descricao.trim()) {
      setError('Motivo é obrigatório');
      return;
    }

    // Validações por aba
    if (aba === 'semanal_fixo') {
      if (formData.dias_semana.length === 0) {
        setError('Selecione pelo menos um dia da semana');
        return;
      }
      if (!formData.hora_inicio || !formData.hora_fim) {
        setError('Hora de início e fim são obrigatórias');
        return;
      }
    }
    if (aba === 'temporario') {
      if (!formData.data_inicio || !formData.data_fim) {
        setError('Data de início e fim são obrigatórias para bloqueio temporário');
        return;
      }
      if (formData.data_fim < formData.data_inicio) {
        setError('Data final deve ser posterior à inicial');
        return;
      }
      if (!formData.hora_inicio || !formData.hora_fim) {
        setError('Hora de início e fim são obrigatórias');
        return;
      }
    }
    if (aba === 'especifico') {
      if (!formData.data_especifica) {
        setError('Data específica é obrigatória');
        return;
      }
      if (!formData.hora_inicio || !formData.hora_fim) {
        setError('Hora de início e fim são obrigatórias');
        return;
      }
    }

    try {
      setSalvando(true);

      const payload: any = {
        tipo: aba,
        descricao: formData.descricao.trim(),
        hora_inicio: formData.hora_inicio,
        hora_fim: formData.hora_fim,
      };

      if (aba === 'semanal_fixo') {
        payload.dias_semana = formData.dias_semana;
      }
      if (aba === 'temporario') {
        payload.data_inicio = formData.data_inicio;
        payload.data_fim = formData.data_fim;
      }
      if (aba === 'especifico') {
        payload.data_inicio = formData.data_especifica;
      }

      const resultado = await criarBloqueio(payload);

      if (!resultado.sucesso) {
        const dados = (resultado as any).dados;
        if (dados && dados.conflito) {
          setConflitosData(dados.atendimentos || []);
          setMostrarConflito(true);
          setManterConflito(false);
          setError('Conflito com atendimentos existentes');
          setSalvando(false);
          return;
        }
        setError(resultado.erro || 'Erro ao criar bloqueio');
        return;
      }

      setFormData({
        dias_semana: [],
        hora_inicio: '',
        hora_fim: '',
        data_inicio: '',
        data_fim: '',
        data_especifica: '',
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

  async function handleManterBloqueio() {
    setManterConflito(true);
    setMostrarConflito(false);
    setSalvando(true);
    try {
      const payload: any = {
        tipo: aba,
        descricao: formData.descricao.trim(),
        hora_inicio: formData.hora_inicio,
        hora_fim: formData.hora_fim,
        ignorarConflito: true,
      };
      if (aba === 'semanal_fixo') payload.dias_semana = formData.dias_semana;
      if (aba === 'temporario') { payload.data_inicio = formData.data_inicio; payload.data_fim = formData.data_fim; }
      if (aba === 'especifico') payload.data_inicio = formData.data_especifica;

      const resultado = await criarBloqueio(payload);
      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao salvar bloqueio');
        setManterConflito(false);
        return;
      }
      setFormData({ dias_semana: [], hora_inicio: '', hora_fim: '', data_inicio: '', data_fim: '', data_especifica: '', descricao: '' });
      setShowForm(false);
      await carregarBloqueios();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar bloqueio');
    } finally {
      setSalvando(false);
      setManterConflito(false);
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
      dias_semana: [],
      hora_inicio: '',
      hora_fim: '',
      data_inicio: '',
      data_fim: '',
      data_especifica: '',
      descricao: '',
    });
    setError(null);
  }

  function formatarDataHora(isoString: string | null): string {
    if (!isoString) return '-';
    const data = new Date(isoString);
    if (isNaN(data.getTime())) return '-';
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
    if (diffHoras > 0) return `${diffHoras}h${diffMinutos > 0 ? ` ${diffMinutos}min` : ''}`;
    return `${diffMinutos}min`;
  }

  function formatarDiaSemana(isoString: string | null): string {
    if (!isoString) return '';
    const data = new Date(isoString.length === 10 ? `${isoString}T12:00:00` : isoString);
    if (isNaN(data.getTime())) return '';
    return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][data.getDay()];
  }

  function tipoLabel(bloqueio: BloqueioAgenda): string {
   switch (bloqueio.tipo) {
      case 'semanal_fixo': return 'Fixo semanal';
      case 'temporario': return 'Temporário';
      case 'especifico': return 'Data específica';
      default: return 'Bloqueio';
    }
  }

  const diasSemanaLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const horas = useMemo(() => Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2).toString().padStart(2, '0');
    const m = (i % 2 === 0 ? '00' : '30');
    return `${h}:${m}`;
  }), []);

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

        {mostrarConflito && (
          <div role="dialog" aria-modal="true" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-lg">
            <h3 className="mb-3 text-lg font-bold text-amber-900">Conflito com atendimentos existentes</h3>
            <p className="mb-4 text-sm text-amber-800">Este bloqueio intersecta atendimentos ativos:</p>
            <div className="mb-4 space-y-3">
              {conflitosData.map((c, idx) => (
                <div key={idx} className="rounded-xl bg-white p-3 shadow-sm border border-amber-200">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
                    <span>{c.cliente}</span>
                    <span className="text-zinc-400">•</span>
                    <span className="text-zinc-600">{c.procedimento}</span>
                    <span className="text-zinc-400">•</span>
                    <span className="text-zinc-700">{new Date(c.horario).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                  {c.whatsapp && (
                    <a
                      href={`https://wa.me/${c.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá, ${c.cliente}! Tudo bem?

Pedimos desculpas, mas tivemos uma alteração na agenda e não conseguiremos manter seu atendimento no horário de ${new Date(c.horario).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}.

Você pode escolher um novo horário disponível pelo link:

${(process.env.NEXT_PUBLIC_URL || 'http://localhost:8080')}/agendar

Obrigada pela compreensão. 💛`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600"
                    >
                      WhatsApp {c.whatsapp}
                    </a>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleManterBloqueio}
                disabled={salvando}
                className="min-h-12 flex-1 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-amber-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                {salvando ? 'Salvando...' : 'Manter bloqueio'}
              </button>
              <button
                type="button"
                onClick={() => { setMostrarConflito(false); setConflitosData([]); setManterConflito(false); setError(null); }}
                disabled={salvando}
                className="min-h-12 flex-1 rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 min-w-0 space-y-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Novo bloqueio</h2>
              <p className="mt-1 text-sm text-zinc-500">Defina o tipo, dia(s) e horário do período reservado.</p>
            </div>

            {/* Abas */}
            <div className="flex min-w-0 gap-2 overflow-x-auto" role="tablist" aria-label="Tipo de bloqueio">
              {[
                { key: 'semanal_fixo', label: 'Fixo semanal' },
                { key: 'temporario', label: 'Temporário' },
                { key: 'especifico', label: 'Data específica' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={aba === t.key}
                  onClick={() => setAba(t.key as any)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${
                    aba === t.key
                      ? 'bg-zinc-900 text-amber-400 shadow-sm'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Formulário por aba */}
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Coluna de dados */}
                <div className="min-w-0 space-y-4">
                  {aba === 'semanal_fixo' && (
                    <>
                      <fieldset>
                        <legend className="mb-2 text-sm font-semibold text-zinc-900">Dias da semana</legend>
                        <div className="flex flex-wrap gap-2">
                          {diasSemanaLabels.map((label, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                const current = formData.dias_semana;
                                const val = idx;
                                if (current.includes(val)) {
                                  setFormData({ ...formData, dias_semana: current.filter((d) => d !== val) });
                                } else {
                                  setFormData({ ...formData, dias_semana: [...current, val].sort((a,b)=>a-b) });
                                }
                              }}
                              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                                formData.dias_semana.includes(idx)
                                  ? 'bg-zinc-900 text-amber-400 shadow-sm'
                                  : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <div>
                        <label htmlFor="semanal-hora-inicio" className="mb-1.5 block text-sm font-medium text-zinc-700">Hora de início</label>
                        <select
                          id="semanal-hora-inicio"
                          value={formData.hora_inicio}
                          onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                          className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          required
                        >
                          <option value="">Selecione</option>
                          {horas.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="semanal-hora-fim" className="mb-1.5 block text-sm font-medium text-zinc-700">Hora de fim</label>
                        <select
                          id="semanal-hora-fim"
                          value={formData.hora_fim}
                          onChange={(e) => setFormData({ ...formData, hora_fim: e.target.value })}
                          className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          required
                        >
                          <option value="">Selecione</option>
                          {horas.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </>
                  )}

                  {aba === 'temporario' && (
                    <>
                      <div>
                        <label htmlFor="temp-data-inicio" className="mb-1.5 block text-sm font-medium text-zinc-700">Data de início</label>
                        <input
                          id="temp-data-inicio"
                          type="date"
                          value={formData.data_inicio}
                          onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                          className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="temp-data-fim" className="mb-1.5 block text-sm font-medium text-zinc-700">Data de fim</label>
                        <input
                          id="temp-data-fim"
                          type="date"
                          value={formData.data_fim}
                          onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                          className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="temp-hora-inicio" className="mb-1.5 block text-sm font-medium text-zinc-700">Hora de início</label>
                        <select
                          id="temp-hora-inicio"
                          value={formData.hora_inicio}
                          onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                          className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          required
                        >
                          <option value="">Selecione</option>
                          {horas.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="temp-hora-fim" className="mb-1.5 block text-sm font-medium text-zinc-700">Hora de fim</label>
                        <select
                          id="temp-hora-fim"
                          value={formData.hora_fim}
                          onChange={(e) => setFormData({ ...formData, hora_fim: e.target.value })}
                          className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          required
                        >
                          <option value="">Selecione</option>
                          {horas.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </>
                  )}

                  {aba === 'especifico' && (
                    <>
                      <div>
                        <label htmlFor="esp-data" className="mb-1.5 block text-sm font-medium text-zinc-700">Data</label>
                        <input
                          id="esp-data"
                          type="date"
                          value={formData.data_especifica}
                          onChange={(e) => setFormData({ ...formData, data_especifica: e.target.value })}
                          className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="esp-hora-inicio" className="mb-1.5 block text-sm font-medium text-zinc-700">Hora de início</label>
                        <select
                          id="esp-hora-inicio"
                          value={formData.hora_inicio}
                          onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                          className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          required
                        >
                          <option value="">Selecione</option>
                          {horas.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="esp-hora-fim" className="mb-1.5 block text-sm font-medium text-zinc-700">Hora de fim</label>
                        <select
                          id="esp-hora-fim"
                          value={formData.hora_fim}
                          onChange={(e) => setFormData({ ...formData, hora_fim: e.target.value })}
                          className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          required
                        >
                          <option value="">Selecione</option>
                          {horas.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {/* Coluna descrição */}
                <div className="min-w-0 space-y-4">
                  <div>
                    <label htmlFor="bloqueio-descricao" className="mb-1.5 block text-sm font-medium text-zinc-700">Descrição (obrigatório)</label>
                    <input
                      id="bloqueio-descricao"
                      type="text"
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      placeholder="Ex: Folga, Academia, Médico..."
                      required
                    />
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="font-semibold">Regra de bloqueio:</p>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5 text-xs">
                      <li><strong>Fixo semanal:</strong> repete nos dias selecionados toda semana.</li>
                      <li><strong>Temporário:</strong> válido apenas entre as datas escolhidas.</li>
                      <li><strong>Data específica:</strong> apenas no dia indicado.</li>
                    </ul>
                  </div>
                </div>
              </div>
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
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-zinc-500">Bloqueios impedem agendamentos em horários específicos</p>
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
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">{tipoLabel(bloqueio)}</span>
                    </div>
                    <h2 className="break-words text-lg font-bold tracking-tight mt-1">{bloqueio.descricao || 'Bloqueio de agenda'}</h2>
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

                <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600 space-y-1">
                  {bloqueio.tipo === 'semanal_fixo' && bloqueio.dias_semana && (
                    <p><strong>Dias fixos:</strong> {bloqueio.dias_semana.map(d => diasSemanaLabels[d]).join(', ')}</p>
                  )}
                  {bloqueio.tipo === 'temporario' && (
                    <><p><strong>Temporário:</strong> {bloqueio.data_inicio || '-'} até {bloqueio.data_fim || '-'}</p></>
                  )}
                  {bloqueio.tipo === 'especifico' && (bloqueio.data_inicio) && (
                    <p><strong>Data específica:</strong> {bloqueio.data_inicio}</p>
                  )}
                  <p><strong>Horário:</strong> {bloqueio.hora_inicio || '-'} → {bloqueio.hora_fim || '-'}</p>
                </div>

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
