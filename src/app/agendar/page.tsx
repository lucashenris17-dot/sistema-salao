'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { BloqueioAgenda, Procedimento, mascaraWhatsApp, validarWhatsApp } from '@/lib/types';
import { criarSolicitacaoAgendamento } from '@/app/actions/agendamento';
import { calcularGradeHorario } from '@/lib/horarios';
import GradeHorario from '@/components/grade-horarios';

type BloqueioItem = Pick<
  BloqueioAgenda,
  'tipo' | 'dias_semana' | 'hora_inicio' | 'hora_fim' | 'inicio' | 'fim'
>;

interface AtendimentoItem {
  horario_agendado: string | null;
  procedimento_ids?: string[] | null;
  procedimento_id?: string | null;
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

  // Reconhecimento inteligente do cliente (estabilizado)
  const [clienteReconhecido, setClienteReconhecido] = useState(false);
  const [nomeClienteReconhecido, setNomeClienteReconhecido] = useState('');
  const [ultimoAtendimento, setUltimoAtendimento] = useState<{ nome: string; criado_em: string; procedimento_id: string } | null>(null);
  const [etapa1Sub, setEtapa1Sub] = useState<'whatsapp' | 'cadastro' | 'reconhecido'>('whatsapp');
  const reconhecendoRef = useRef(false);

  // Formulário
  const [formData, setFormData] = useState({
    nome: '',
    sobrenome: '',
    whatsapp: '',
    procedimento_ids: [] as string[],
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
        const { data: bloqData, error: bloqErr } = await supabase
          .from('bloqueios_agenda')
          .select('tipo, dias_semana, data_inicio, data_fim, hora_inicio, hora_fim, inicio, fim');

        if (bloqErr) throw bloqErr;
        setBloqueios(bloqData || []);

        // 3. Atendimentos agendados ativos
        const { data: atendsData } = await supabase
          .from('atendimentos')
          .select(`
            horario_agendado,
            procedimento_id,
            procedimento_ids,
            procedimentos (
              duracao_estimada_min
            )
          `)
          .not('status', 'eq', 'cancelado')
          .eq('status_confirmacao', 'confirmado')
          .not('horario_agendado', 'is', null);

        const atendimentos = (atendsData as unknown as AtendimentoItem[]) || [];
        const duracaoPorId = new Map((procsData || []).map((p) => [p.id, p.duracao_estimada_min || 0]));
        setAtendimentosOcupados(atendimentos.map((atendimento) => {
          const ids = atendimento.procedimento_ids?.length
            ? atendimento.procedimento_ids
            : atendimento.procedimento_id ? [atendimento.procedimento_id] : [];
          const duracaoTotal = ids.reduce((total, id) => total + (duracaoPorId.get(id) || 0), 0);
          return { ...atendimento, procedimento_duracao_total_min: duracaoTotal || undefined };
        }));
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

  // Procedimentos selecionados (múltiplos)
  const procedimentosSelecionados = useMemo(() => {
    return procedimentos.filter((p) => formData.procedimento_ids.includes(p.id));
  }, [procedimentos, formData.procedimento_ids]);

  const duracaoTotal = useMemo(() => {
    return procedimentosSelecionados.reduce((sum, p) => sum + (p.duracao_estimada_min || 0), 0);
  }, [procedimentosSelecionados]);

  // Gerar os próximos 14 dias para os cards de seleção de data
  const diasDisponiveis = useMemo(() => {
    const dias = [];
    const hoje = new Date();
    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const meses = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
    ];

    for (let i = 0; i < 15; i++) {
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

  const todosHorarios = useMemo(() => {
    if (!formData.data) return [];
    const duracaoMin = duracaoTotal || 30;
    // Lógica centralizada em src/lib/horarios.ts — usada também no painel admin.
    const opcoes = calcularGradeHorario(
      formData.data,
      duracaoMin,
      bloqueios as any[],
      atendimentosOcupados as any[],
    );
    return opcoes;
  }, [formData.data, duracaoTotal, bloqueios, atendimentosOcupados]);

  // Avançar Etapa 1
  function handleEtapa1Continuar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.whatsapp.trim()) {
      setError('Por favor, informe seu número de WhatsApp.');
      return;
    }
    const v = validarWhatsApp(formData.whatsapp);
    if (!v.valido) {
      setError(v.mensagem || 'WhatsApp inválido.');
      return;
    }

    // Somente cliente não encontrado precisa informar nome
    if (etapa1Sub === 'cadastro' && !formData.nome.trim()) {
      setError('Por favor, informe seu nome.');
      return;
    }

    setEtapa(2);
  }

  // Avançar Etapa 2
  function handleEtapa2Continuar() {
    setError(null);
    if (formData.procedimento_ids.length === 0) {
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
        procedimento_ids: formData.procedimento_ids,
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
              {etapa === 1 && 'WhatsApp'}
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
                    <label htmlFor="whatsapp" className="block text-sm font-medium text-zinc-700 mb-1.5">WhatsApp</label>
                    <input id="whatsapp" type="tel" value={formData.whatsapp ? mascaraWhatsApp(formData.whatsapp) : ''} onChange={(e) => {
                        const limpo = e.target.value.replace(/\D/g, '').slice(0, 11);
                        setFormData({ ...formData, whatsapp: limpo });
                        // Reconhecimento inteligente por WhatsApp
                        if (limpo.length >= 11) {
                          if (reconhecendoRef.current) return;
                          reconhecendoRef.current = true;
                          (async () => {
                            try {
                              const { data: c } = await supabase.from('clientes').select('id,nome,sobrenome').eq('whatsapp', limpo).maybeSingle();
                            if (c) {
                              const nomeCompleto = `${(c as any).nome || ''} ${(c as any).sobrenome || ''}`.trim();
                              setClienteReconhecido(true);
                              setNomeClienteReconhecido(nomeCompleto);
                              setFormData((prev) => ({ ...prev, nome: (c as any).nome || prev.nome, sobrenome: (c as any).sobrenome || prev.sobrenome }));
                              // Buscar último atimento finalizado
                              const { data: hist } = await supabase.from('atendimentos').select('criado_em, procedimento_id').eq('status', 'finalizado').order('criado_em', { ascending: false }).limit(1);
                              const primeiro = (hist && hist[0]) || null;
                              if (primeiro) {
                                const { data: proc } = await supabase.from('procedimentos').select('id,nome').eq('id', primeiro.procedimento_id).maybeSingle();
                                setUltimoAtendimento({ nome: proc?.nome || 'Procedimento', criado_em: primeiro.criado_em, procedimento_id: primeiro.procedimento_id });
                              } else {
                                setUltimoAtendimento(null);
                              }
                              setEtapa1Sub('reconhecido');
                            } else {
                              setClienteReconhecido(false);
                              setNomeClienteReconhecido('');
                              setUltimoAtendimento(null);
                              setEtapa1Sub('cadastro');
                            }
                            } finally {
                              reconhecendoRef.current = false;
                            }
                          })();
                        } else {
                          setClienteReconhecido(false);
                          setNomeClienteReconhecido('');
                          setUltimoAtendimento(null);
                          setEtapa1Sub('whatsapp');
                        }
                      }}
                      placeholder="(87) 9 9845-4566"
                      required
                      className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>

                  {/* Sub-etapa: cadastro de nome (somente cliente não encontrado) */}
                  {etapa1Sub === 'cadastro' && (
                    <div key="cadastro" className="space-y-4 pt-2">
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                        Não encontramos um cadastro com este WhatsApp. Vamos criar seu perfil.
                      </div>
                      <div>
                        <label htmlFor="nome" className="block text-sm font-medium text-zinc-700 mb-1.5">Nome</label>
                        <input
                          id="nome"
                          type="text"
                          value={formData.nome}
                          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                          placeholder="Ex: Maria"
                          className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        />
                      </div>
                      <div>
                        <label htmlFor="sobrenome" className="block text-sm font-medium text-zinc-700 mb-1.5">Sobrenome (opcional)</label>
                        <input
                          id="sobrenome"
                          type="text"
                          value={formData.sobrenome}
                          onChange={(e) => setFormData({ ...formData, sobrenome: e.target.value })}
                          placeholder="Ex: Silva"
                          className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        />
                      </div>
                    </div>
                  )}

                  {/* Sub-etapa: cliente reconhecido — sugestão do último atendimento */}
                  {etapa1Sub === 'reconhecido' && (
                    <div key="reconhecido" className="space-y-4 pt-2">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 leading-snug">
                        Olá, {nomeClienteReconhecido || 'cliente'}! 👋<br />
                        Que bom ter você de volta!
                      </div>

                      {ultimoAtendimento ? (
                        <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Seu último atendimento foi:</p>
                          <p className="text-base font-bold text-zinc-900 flex items-center gap-1.5"><span>✂️</span> {ultimoAtendimento.nome}</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            {new Date(ultimoAtendimento.criado_em).toLocaleDateString('pt-BR')}
                          </p>
                          <div className="mt-3 flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const procId = ultimoAtendimento?.procedimento_id;
                                if (!procId) {
                                  setError('Procedimento do último atendimento não encontrado. Escolha outro.');
                                  return;
                                }
                                setFormData({ ...formData, procedimento_ids: [procId] });
                                setEtapa(3);
                              }}
                              className="min-h-11 w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
                            >
                              Repetir procedimento
                            </button>
                            <button
                              type="button"
                              onClick={() => setEtapa(2)}
                              className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                            >
                              Escolher outro procedimento
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-600">
                          Você ainda não tem atendimentos finalizados. Vamos marcar um novo?
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={etapa1Sub === 'cadastro' && !formData.nome.trim()}
                      className="min-h-12 w-full rounded-xl bg-zinc-900 py-3.5 text-base font-semibold text-white transition-transform active:scale-[0.99] shadow-sm hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
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
                      const isSelected = formData.procedimento_ids.includes(proc.id);
                      return (
                        <button
                          key={proc.id}
                          type="button"
                          onClick={() => {
                            const novo = isSelected
                              ? formData.procedimento_ids.filter((id) => id !== proc.id)
                              : [...formData.procedimento_ids, proc.id];
                            setFormData({ ...formData, procedimento_ids: novo });
                          }}
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
                    disabled={formData.procedimento_ids.length === 0}
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

                {/* Seleção de Horário — grade compartilhada com o painel admin */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">
                    Horários disponíveis
                  </label>
                  {todosHorarios.length === 0 ? (
                    <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-center text-sm text-zinc-500">
                      Nenhum horário disponível para esta data. Por favor, selecione outro dia.
                    </div>
                  ) : (
                    <GradeHorario
                      opcoes={todosHorarios}
                      valor={formData.hora}
                      aoSelecionar={(h) => setFormData({ ...formData, hora: h })}
                    />
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
                        <span>✂️</span> {procedimentosSelecionados.map(p => p.nome).join(', ') || '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase text-zinc-400 tracking-wide">
                        Duração
                      </p>
                      <p className="text-sm font-bold text-zinc-800 mt-0.5">
                        {duracaoTotal} minutos
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
