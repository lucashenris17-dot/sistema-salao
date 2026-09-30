'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Procedimento, mascaraWhatsApp, validarWhatsApp } from '@/lib/types';
import { criarSolicitacaoAgendamento } from '@/app/actions/agendamento';

interface BloqueioItem {
  inicio: string;
  fim: string;
}

interface AtendimentoItem {
  horario_agendado: string | null;
  procedimentos?: {
    duracao_estimada_min: number;
  } | null;
}

export default function AgendarPage() {
  const router = useRouter();

  // Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Etapa atual (1, 2, 3 ou 4)
  const [etapa, setEtapa] = useState<1 | 2 | 3 | 4>(1);

  // Estados dos dados
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [bloqueios, setBloqueios] = useState<BloqueioItem[]>([]);
  const [atendimentosOcupados, setAtendimentosOcupados] = useState<AtendimentoItem[]>([]);

  // Estados da interface
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulário
  const [formData, setFormData] = useState({
    nome: '',
    sobrenome: '',
    whatsapp: '',
    procedimento_id: '',
    data: '', // YYYY-MM-DD
    hora: '', // HH:mm
  });

  // Carregar dados de procedimentos, bloqueios e agendamentos existentes
  useEffect(() => {
    async function carregarDados() {
      try {
        setLoading(true);
        setError(null);

        // 1. Procedimentos ativos
        const { data: procsData, error: procsErr } = await supabase
          .from('procedimentos')
          .select('*')
          .eq('ativo', true)
          .order('nome', { ascending: true });

        if (procsErr) throw procsErr;
        setProcedimentos(procsData || []);

        // 2. Bloqueios de agenda
        const { data: bloqData } = await supabase
          .from('bloqueios_agenda')
          .select('inicio, fim');

        setBloqueios(bloqData || []);

        // 3. Atendimentos agendados ativos
        const { data: atendsData } = await supabase
          .from('atendimentos')
          .select(`
            horario_agendado,
            procedimentos (
              duracao_estimada_min
            )
          `)
          .not('status', 'eq', 'cancelado')
          .eq('status_confirmacao', 'confirmado')
          .not('horario_agendado', 'is', null);

        setAtendimentosOcupados((atendsData as unknown as AtendimentoItem[]) || []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar dados. Recarregue a página.'
        );
      } finally {
        setLoading(false);
      }
    }

    carregarDados();
  }, [supabase]);

  // Procedimento selecionado
  const procedimentoSelecionado = useMemo(() => {
    return procedimentos.find((p) => p.id === formData.procedimento_id) || null;
  }, [procedimentos, formData.procedimento_id]);

  // Gerar os próximos 14 dias para os cards de seleção de data
  const diasDisponiveis = useMemo(() => {
    const dias = [];
    const hoje = new Date();
    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const meses = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
    ];

    for (let i = 0; i < 14; i++) {
      const dataObj = new Date(hoje);
      dataObj.setDate(hoje.getDate() + i);

      const ano = dataObj.getFullYear();
      const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
      const diaNum = String(dataObj.getDate()).padStart(2, '0');
      const isoData = `${ano}-${mes}-${diaNum}`;

      dias.push({
        iso: isoData,
        diaSemana: diasSemana[dataObj.getDay()],
        diaNumero: diaNum,
        mesNome: meses[dataObj.getMonth()],
        dataObj,
      });
    }

    return dias;
  }, []);

  // Selecionar primeiro dia por padrão quando os dias carregarem se ainda não houver data
  useEffect(() => {
    if (!formData.data && diasDisponiveis.length > 0) {
      setFormData((prev) => ({ ...prev, data: diasDisponiveis[0].iso }));
    }
  }, [diasDisponiveis, formData.data]);

  // Lista de horários padrão (das 08:00 às 19:00 de 30 em 30 min)
  const horariosBase = useMemo(() => {
    const lista = [];
    for (let h = 8; h <= 19; h++) {
      const horaStr = String(h).padStart(2, '0');
      lista.push(`${horaStr}:00`);
      if (h < 19) {
        lista.push(`${horaStr}:30`);
      }
    }
    return lista;
  }, []);

  // Filtrar horários indisponíveis para a data selecionada e procedimento escolhido
  const horariosFiltrados = useMemo(() => {
    if (!formData.data) return [];

    const duracaoMin = procedimentoSelecionado?.duracao_estimada_min || 30;
    // Comparar pelo dia selecionado em minutos absolutos (evita timezone)
    const dataSelec = formData.data;

    // Converter data + hora para minutos do dia
    function paraMinutos(dataStr: string, horaStr: string) {
      const [h, m] = horaStr.split(':').map(Number);
      return h * 60 + m;
    }

    function paraMinutosData(dataStr: string, horaISO?: string | null) {
      if (!horaISO) return null;
      // horaISO pode ser '2026-09-29T09:00:00...' ou apenas hora
      const ts = horaISO.includes('T') ? horaISO.split('T')[1].split(':')[0] + ':' + horaISO.split('T')[1].split(':')[1] : horaISO;
      const [h, m] = ts.split(':').map(Number);
      return h * 60 + m;
    }

    // Preparar atendimentos confirmados do dia selecionado
    const ocupados = (atendimentosOcupados || []).filter(a => {
      if (!a.horario_agendado) return false;
      // Só considerar se a data do atendimento == data selecionada
      const dataAt = a.horario_agendado.substring(0, 10);
      return dataAt === dataSelec;
    }).map(a => {
      const inicio = paraMinutosData(dataSelec, a.horario_agendado);
      const dur = a.procedimentos?.duracao_estimada_min || 30;
      return inicio !== null ? { inicio, fim: inicio + dur } : null;
    }).filter(Boolean) as { inicio: number; fim: number }[];

    // Preparar bloqueios do dia selecionado
    const bloqueiosDia = (bloqueios || []).map(b => {
      const ini = b.inicio ? b.inicio.substring(0, 10) : '';
      const fim = b.fim ? b.fim.substring(0, 10) : '';
      if (ini === dataSelec && fim === dataSelec) {
        const iniMin = paraMinutosData(dataSelec, b.inicio.split('T')[1]?.substring(0, 5) || b.inicio.substring(11, 16));
        const fimMin = paraMinutosData(dataSelec, b.fim.split('T')[1]?.substring(0, 5) || b.fim.substring(11, 16));
        return iniMin !== null && fimMin !== null ? { inicio: iniMin, fim: fimMin } : null;
      }
      return null;
    }).filter(Boolean) as { inicio: number; fim: number }[];

    // Se data é hoje, não permitir horários que já passaram.
    // Comparamos timestamps UTC diretamente: o horário selecionado é em
    // Brasília (UTC-3) e new Date() dá o instante atual em UTC. Assim
    // 14:30 Brasília (17:30 UTC) é menor que 14:40 Brasília (17:40 UTC)
    // e é corretamente bloqueado.
    const hojeStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
    const agora = new Date();
    const dataHoje = formData.data === hojeStr;

    return horariosBase.filter((horaStr) => {
      const inicioMin = paraMinutos(dataSelec, horaStr);
      const fimMin = inicioMin + duracaoMin;

      // Não permitir antes das 08:00 (limite da agenda)
      if (inicioMin < 8 * 60) return false;

      // Não permitir depois das 19:00 (limite da agenda)
      if (inicioMin + duracaoMin > 19 * 60) return false;

      // Bloqueio: sobreposição?
      const conflitoBloqueio = bloqueiosDia.some(b => inicioMin < b.fim && fimMin > b.inicio);
      if (conflitoBloqueio) return false;

      // Atendimentos confirmados: sobreposição?
      const conflitoAtendimento = ocupados.some(o => inicioMin < o.fim && fimMin > o.inicio);
      if (conflitoAtendimento) return false;

      // Se data é hoje, não permitir horários que já passaram.
      if (dataHoje) {
        const horarioSelecionado = new Date(`${dataSelec}T${horaStr}:00-03:00`);
        if (horarioSelecionado.getTime() <= agora.getTime()) return false;
      }

      return true;
    });
  }, [formData.data, procedimentoSelecionado, horariosBase, bloqueios, atendimentosOcupados]);

  // Avançar Etapa 1
  function handleEtapa1Continuar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.nome.trim()) {
      setError('Por favor, informe seu nome.');
      return;
    }
    if (!formData.whatsapp.trim()) {
      setError('Por favor, informe seu número de WhatsApp.');
      return;
    }
    const v = validarWhatsApp(formData.whatsapp);
    if (!v.valido) {
      setError(v.mensagem || 'WhatsApp inválido.');
      return;
    }

    setEtapa(2);
  }

  // Avançar Etapa 2
  function handleEtapa2Continuar() {
    setError(null);
    if (!formData.procedimento_id) {
      setError('Selecione um procedimento para continuar.');
      return;
    }
    setEtapa(3);
  }

  // Avançar Etapa 3
  function handleEtapa3Continuar() {
    setError(null);
    if (!formData.data) {
      setError('Selecione um dia para o atendimento.');
      return;
    }
    if (!formData.hora) {
      setError('Selecione um horário para o atendimento.');
      return;
    }
    setEtapa(4);
  }

  // Enviar agendamento final (Etapa 4)
  async function handleConfirmarAgendamento() {
    setError(null);
    setSubmitting(true);

    const v = validarWhatsApp(formData.whatsapp);
    if (!v.valido) {
      setError(v.mensagem || 'WhatsApp inválido.');
      setSubmitting(false);
      return;
    }

    // Proteção: não permitir horário que já passou no dia atual.
    // Comparação em UTC: horário selecionado em Brasília (UTC-3) vs
    // instante atual em UTC (new Date()).
    const hojeStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
    const dataHoje = formData.data === hojeStr;
    if (dataHoje) {
      const horarioSelecionado = new Date(`${formData.data}T${formData.hora}:00-03:00`);
      if (horarioSelecionado.getTime() <= new Date().getTime()) {
        setError('Este horário já passou. Escolha outro horário disponível.');
        setSubmitting(false);
        return;
      }
    }

    try {
      // Horário escolhido pelo cliente é em Brasília (UTC-3).
      // Anexamos o offset -03:00 e normalizamos via toISOString() para que o
      // Supabase armazene o UTC equivalente correto (igual ao fluxo admin).
      // Sem isso, a string nua é interpretada como UTC e o horário
      // desloca ~3h (ex: 08:00 vira 05:00).
      const horarioAgendadoIso = new Date(
        `${formData.data}T${formData.hora}:00-03:00`
      ).toISOString();

      const resultado = await criarSolicitacaoAgendamento({
        nome: formData.nome.trim(),
        sobrenome: formData.sobrenome.trim(),
        whatsapp: formData.whatsapp.replace(/\D/g, '').slice(0, 11),
        procedimento_id: formData.procedimento_id,
        horario_agendado: horarioAgendadoIso,
      });

      if (!resultado.sucesso || !resultado.token_acesso) {
        setError(
          resultado.erro ||
            'Não foi possível concluir seu agendamento. Tente novamente.'
        );
        setSubmitting(false);
        return;
      }

      router.push(`/acompanhar/${resultado.token_acesso}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Ocorreu um erro ao enviar seu agendamento. Tente novamente.'
      );
      setSubmitting(false);
    }
  }

  // Formatador de data DD/MM/YYYY
  const dataFormatadaPtBr = useMemo(() => {
    if (!formData.data) return '';
    const partes = formData.data.split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return formData.data;
  }, [formData.data]);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-between">
      <div className="max-w-md w-full mx-auto px-4 py-6 sm:py-10">
        {/* Cabeçalho do Salão */}
        <header className="text-center mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center justify-center gap-2">
            <span>✂️</span> Salão da Inacia
          </h1>
          <div className="w-8 h-0.5 bg-amber-400 mx-auto mt-2 rounded-full" />
          <p className="text-xs text-zinc-500 mt-2">
            Agendamento simples e rápido
          </p>
        </header>

        {/* Indicador de Progresso (Passos) */}
        <div className="mb-6 px-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-500">
              Etapa {etapa} de 4
            </span>
            <span className="text-xs font-medium text-zinc-400">
              {etapa === 1 && 'Dados pessoais'}
              {etapa === 2 && 'Procedimento'}
              {etapa === 3 && 'Data e Horário'}
              {etapa === 4 && 'Revisão'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
            <div
              className={`rounded-full transition-colors ${
                etapa >= 1 ? 'bg-amber-400' : 'bg-zinc-200'
              }`}
            />
            <div
              className={`rounded-full transition-colors ${
                etapa >= 2 ? 'bg-amber-400' : 'bg-zinc-200'
              }`}
            />
            <div
              className={`rounded-full transition-colors ${
                etapa >= 3 ? 'bg-amber-400' : 'bg-zinc-200'
              }`}
            />
            <div
              className={`rounded-full transition-colors ${
                etapa >= 4 ? 'bg-amber-400' : 'bg-zinc-200'
              }`}
            />
          </div>
        </div>

        {/* Mensagem de Erro Global */}
        {error && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 shadow-sm flex items-start gap-3"
          >
            <span className="text-base">⚠️</span>
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Loading inicial de dados */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-zinc-200 text-center">
            <div className="w-8 h-8 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-zinc-500">Carregando informações...</p>
          </div>
        ) : (
          <>
            {/* ETAPA 1 - DADOS PESSOAIS */}
            {etapa === 1 && (
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
                    Vamos começar 😊
                  </h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Informe seus dados de contato para iniciar.
                  </p>
                </div>

                <form onSubmit={handleEtapa1Continuar} className="space-y-4">
                  <div>
                    <label
                      htmlFor="nome"
                      className="block text-sm font-medium text-zinc-700 mb-1.5"
                    >
                      Nome
                    </label>
                    <input
                      id="nome"
                      type="text"
                      value={formData.nome}
                      onChange={(e) =>
                        setFormData({ ...formData, nome: e.target.value })
                      }
                      placeholder="Ex: Maria"
                      required
                      className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="sobrenome"
                      className="block text-sm font-medium text-zinc-700 mb-1.5"
                    >
                      Sobrenome (opcional)
                    </label>
                    <input
                      id="sobrenome"
                      type="text"
                      value={formData.sobrenome}
                      onChange={(e) =>
                        setFormData({ ...formData, sobrenome: e.target.value })
                      }
                      placeholder="Ex: Silva"
                      className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="whatsapp"
                      className="block text-sm font-medium text-zinc-700 mb-1.5"
                    >
                      WhatsApp
                    </label>
                    <input
                      id="whatsapp"
                      type="tel"
                      value={formData.whatsapp ? mascaraWhatsApp(formData.whatsapp) : ''}
                      onChange={(e) => {
                        const limpo = e.target.value.replace(/\D/g, '').slice(0, 11);
                        setFormData({ ...formData, whatsapp: limpo });
                      }}
                      placeholder="(87) 9 9845-4566"
                      required
                      className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>

                  <div className="pt-3">
                    <button
                      type="submit"
                      className="min-h-12 w-full rounded-xl bg-zinc-900 py-3.5 text-base font-semibold text-white transition-transform active:scale-[0.99] shadow-sm hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                    >
                      Continuar
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ETAPA 2 - PROCEDIMENTO */}
            {etapa === 2 && (
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
                    Escolha o procedimento
                  </h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Toque no card para selecionar o serviço desejado.
                  </p>
                </div>

                <div className="space-y-3">
                  {procedimentos.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-4 text-center">
                      Nenhum procedimento ativo disponível no momento.
                    </p>
                  ) : (
                    procedimentos.map((proc) => {
                      const isSelected = formData.procedimento_id === proc.id;
                      return (
                        <button
                          key={proc.id}
                          type="button"
                          onClick={() =>
                            setFormData({ ...formData, procedimento_id: proc.id })
                          }
                          className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between min-h-16 ${
                            isSelected
                              ? 'border-zinc-900 bg-zinc-900 text-white shadow-md'
                              : 'border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300 shadow-sm'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">✂️</span>
                            <div>
                              <p className="font-semibold text-base leading-tight">
                                {proc.nome}
                              </p>
                              <p
                                className={`text-xs mt-1 font-medium ${
                                  isSelected ? 'text-zinc-300' : 'text-zinc-500'
                                }`}
                              >
                                {proc.duracao_estimada_min} minutos
                              </p>
                            </div>
                          </div>
                          <div
                            className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? 'border-amber-400 bg-amber-400 text-zinc-900'
                                : 'border-zinc-300 bg-zinc-50'
                            }`}
                          >
                            {isSelected && (
                              <span className="text-xs font-bold">✓</span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEtapa(1)}
                    className="min-h-12 flex-1 rounded-xl border border-zinc-300 bg-white py-3.5 text-base font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleEtapa2Continuar}
                    disabled={!formData.procedimento_id}
                    className="min-h-12 flex-[2] rounded-xl bg-zinc-900 py-3.5 text-base font-semibold text-white transition-transform active:scale-[0.99] shadow-sm hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            )}

            {/* ETAPA 3 - DATA E HORÁRIO */}
            {etapa === 3 && (
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
                    Data e horário
                  </h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Selecione o dia e o horário conveniente.
                  </p>
                </div>

                {/* Seleção de Dia (Cards Horizontais) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">
                    Selecione a data
                  </label>
                  <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none snap-x">
                    {diasDisponiveis.map((dia) => {
                      const isSelected = formData.data === dia.iso;
                      return (
                        <button
                          key={dia.iso}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, data: dia.iso, hora: '' });
                          }}
                          className={`snap-start flex-shrink-0 min-w-[72px] p-3 rounded-xl border text-center transition-all ${
                            isSelected
                              ? 'border-zinc-900 bg-zinc-900 text-white shadow-md'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300'
                          }`}
                        >
                          <span
                            className={`block text-[11px] font-bold uppercase tracking-wide ${
                              isSelected ? 'text-amber-400' : 'text-zinc-500'
                            }`}
                          >
                            {dia.diaSemana}
                          </span>
                          <span className="block text-xl font-extrabold my-0.5">
                            {dia.diaNumero}
                          </span>
                          <span
                            className={`block text-[10px] font-medium ${
                              isSelected ? 'text-zinc-300' : 'text-zinc-400'
                            }`}
                          >
                            {dia.mesNome}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Seleção de Horário */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">
                    Horários disponíveis
                  </label>
                  {horariosFiltrados.length === 0 ? (
                    <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-center text-sm text-zinc-500">
                      Nenhum horário disponível para esta data. Por favor, selecione outro dia.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto p-1">
                      {horariosFiltrados.map((horaStr) => {
                        const isSelected = formData.hora === horaStr;
                        return (
                          <button
                            key={horaStr}
                            type="button"
                            onClick={() =>
                              setFormData({ ...formData, hora: horaStr })
                            }
                            className={`py-3 px-2 rounded-xl text-center text-sm font-bold border transition-all ${
                              isSelected
                                ? 'border-zinc-900 bg-zinc-900 text-white shadow-md ring-2 ring-zinc-900'
                                : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 shadow-sm'
                            }`}
                          >
                            {horaStr}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEtapa(2)}
                    className="min-h-12 flex-1 rounded-xl border border-zinc-300 bg-white py-3.5 text-base font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleEtapa3Continuar}
                    disabled={!formData.data || !formData.hora}
                    className="min-h-12 flex-[2] rounded-xl bg-zinc-900 py-3.5 text-base font-semibold text-white transition-transform active:scale-[0.99] shadow-sm hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            )}

            {/* ETAPA 4 - REVISÃO */}
            {etapa === 4 && (
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
                    Revisão
                  </h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Confira os dados do seu agendamento antes de confirmar.
                  </p>
                </div>

                {/* Card de Resumo */}
                <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-200 space-y-4">
                  <div className="flex justify-between items-start pb-3 border-b border-zinc-200">
                    <div>
                      <p className="text-xs font-semibold uppercase text-zinc-400 tracking-wide">
                        Cliente
                      </p>
                      <p className="text-base font-bold text-zinc-900 mt-0.5">
                        {formData.nome} {formData.sobrenome}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {formData.whatsapp}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-start pb-3 border-b border-zinc-200">
                    <div>
                      <p className="text-xs font-semibold uppercase text-zinc-400 tracking-wide">
                        Procedimento
                      </p>
                      <p className="text-base font-bold text-zinc-900 mt-0.5 flex items-center gap-1.5">
                        <span>✂️</span> {procedimentoSelecionado?.nome}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase text-zinc-400 tracking-wide">
                        Duração
                      </p>
                      <p className="text-sm font-bold text-zinc-800 mt-0.5">
                        {procedimentoSelecionado?.duracao_estimada_min} minutos
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase text-zinc-400 tracking-wide">
                        Data
                      </p>
                      <p className="text-base font-bold text-zinc-900 mt-0.5">
                        {dataFormatadaPtBr}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-zinc-400 tracking-wide">
                        Horário
                      </p>
                      <p className="text-base font-bold text-zinc-900 mt-0.5">
                        {formData.hora}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmarAgendamento}
                    disabled={submitting}
                    className="min-h-12 w-full rounded-xl bg-zinc-900 py-4 text-base font-semibold text-white transition-transform active:scale-[0.99] shadow-sm hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
                  >
                    {submitting ? 'Enviando solicitação...' : 'Enviar solicitação de horário'}
                  </button>
                  <p className="text-xs text-zinc-500 text-center leading-relaxed">
                    Este horário será confirmado pela Inacia conforme disponibilidade do salão.
                  </p>

                  <button
                    type="button"
                    onClick={() => setEtapa(3)}
                    disabled={submitting}
                    className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                  >
                    Voltar e alterar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
