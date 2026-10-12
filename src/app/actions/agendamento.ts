'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  SolicitacaoAgendamentoInput,
  SolicitacaoAgendamentoResponse,
} from '@/lib/types';
import { gerarTokenAcompanhamento } from '@/lib/tokens';
import { calcularGradeHorario, gerarGradeHorarios } from '@/lib/horarios';

/**
 * Cria cliente Supabase no servidor
 */
async function createSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

/**
 * Cria uma nova solicitação de agendamento pública (status_confirmacao = 'pendente')
 */
export async function criarSolicitacaoAgendamento(
  input: SolicitacaoAgendamentoInput
): Promise<SolicitacaoAgendamentoResponse> {
  try {
    // 1. Validar campos obrigatórios
    // Sobrenome é OPCIONAL no fluxo público. Se vier vazio, normalizamos
    // para string vazia ('') — valor valido para a coluna sobrenome (text),
    // que é NOT NULL no banco. NUNCA enviamos null.
    if (!input.nome?.trim()) {
      return { sucesso: false, erro: 'Nome é obrigatório' };
    }
    if (!input.whatsapp?.trim()) {
      return { sucesso: false, erro: 'WhatsApp é obrigatório' };
    }
    const ids = input.procedimento_ids && input.procedimento_ids.length > 0
      ? input.procedimento_ids
      : (input.procedimento_id ? [input.procedimento_id] : []);
    if (ids.length === 0) {
      return { sucesso: false, erro: 'Procedimento é obrigatório' };
    }
    if (ids.length > 2) {
      return { sucesso: false, erro: 'Selecione no máximo dois procedimentos' };
    }
    if (!input.horario_agendado || typeof input.horario_agendado !== 'string') {
      return { sucesso: false, erro: 'Horário agendado é obrigatório' };
    }

    const dataHorario = new Date(input.horario_agendado);
    if (Number.isNaN(dataHorario.getTime()) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.horario_agendado)) {
      return { sucesso: false, erro: 'Horário agendado inválido' };
    }

    // Validar que o horário não está no passado
    const agora = new Date();
    if (dataHorario <= agora) {
      return {
        sucesso: false,
        erro: 'Não é possível agendar para horários que já passaram',
      };
    }

    const supabase = await createSupabaseClient();
    const idsUnicos = [...new Set(ids)];
    if (idsUnicos.length !== ids.length || ids.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      return { sucesso: false, erro: 'Seleção de procedimentos inválida' };
    }

    const { data: procedimentos, error: erroProcedimentos } = await supabase
      .from('procedimentos').select('id, duracao_estimada_min, ativo').in('id', idsUnicos);
    if (erroProcedimentos) {
      console.error('Falha ao validar procedimentos do agendamento:', erroProcedimentos.message);
      return { sucesso: false, erro: 'Não foi possível validar os procedimentos. Tente novamente.' };
    }
    if (!procedimentos || procedimentos.length !== idsUnicos.length || procedimentos.some((p) => !p.ativo)) {
      return { sucesso: false, erro: 'Um ou mais procedimentos não estão disponíveis' };
    }
    const duracaoMin = procedimentos.reduce((total, p) => total + p.duracao_estimada_min, 0);
    if (!Number.isSafeInteger(duracaoMin) || duracaoMin <= 0) {
      return { sucesso: false, erro: 'Duração dos procedimentos inválida' };
    }

    const dataPartes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(dataHorario);
    const parte = (tipo: Intl.DateTimeFormatPartTypes) => dataPartes.find((p) => p.type === tipo)?.value ?? '';
    const dataSalao = `${parte('year')}-${parte('month')}-${parte('day')}`;
    const horaPartes = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(dataHorario);
    const horaSalao = `${horaPartes.find((p) => p.type === 'hour')?.value}:${horaPartes.find((p) => p.type === 'minute')?.value}`;
    if (!gerarGradeHorarios().includes(horaSalao)) {
      return { sucesso: false, erro: 'Horário solicitado fora dos horários de atendimento' };
    }
    const [horaInicio, minutoInicio] = horaSalao.split(':').map(Number);
    if (horaInicio * 60 + minutoInicio + duracaoMin > 19 * 60) {
      return { sucesso: false, erro: 'A duração do procedimento ultrapassa o horário de atendimento' };
    }

    const [bloqueiosResult, atendimentosResult] = await Promise.all([
      supabase.from('bloqueios_agenda').select('tipo, dias_semana, data_inicio, data_fim, hora_inicio, hora_fim, inicio, fim'),
      supabase.from('atendimentos').select('horario_agendado, procedimento_id, procedimento_ids, status, status_confirmacao').eq('modo', 'agendamento').not('horario_agendado', 'is', null).in('status', ['aguardando', 'em_andamento', 'pausado']),
    ]);
    if (bloqueiosResult.error || atendimentosResult.error) {
      console.error('Falha ao consultar disponibilidade:', bloqueiosResult.error?.message, atendimentosResult.error?.message);
      return { sucesso: false, erro: 'Não foi possível verificar a disponibilidade. Tente novamente.' };
    }

    const atendimentos = (atendimentosResult.data || []) as unknown as {
      horario_agendado: string | null;
      procedimento_id: string | null;
      procedimento_ids: string[] | null;
      status_confirmacao: string | null;
    }[];
    const idsOcupados = [...new Set(atendimentos.flatMap((a) => a.procedimento_ids || (a.procedimento_id ? [a.procedimento_id] : [])))];
    const { data: catalogoOcupados, error: erroCatalogo } = idsOcupados.length
      ? await supabase.from('procedimentos').select('id, duracao_estimada_min').in('id', idsOcupados)
      : { data: [], error: null };
    if (erroCatalogo) {
      console.error('Falha ao consultar duração de atendimentos existentes:', erroCatalogo.message);
      return { sucesso: false, erro: 'Não foi possível verificar a disponibilidade. Tente novamente.' };
    }
    const ocupados = atendimentos.filter((a) => a.status_confirmacao !== 'recusado' && a.horario_agendado).map((a) => ({
      horario_agendado: a.horario_agendado,
      procedimento_duracao_total_min: a.procedimento_ids?.length
        ? a.procedimento_ids.reduce((soma, id) => soma + (catalogoOcupados?.find((p) => p.id === id)?.duracao_estimada_min || 0), 0) || undefined
        : undefined,
    }));
    const slot = calcularGradeHorario(dataSalao, duracaoMin, bloqueiosResult.data || [], ocupados)
      .find((opcao) => opcao.horaStr === horaSalao);
    if (!slot?.disponivel) {
      return { sucesso: false, erro: 'Este horário não está mais disponível. Escolha outro horário.' };
    }
    const horarioSolicitado = dataHorario.toISOString();
    // Normalizar WhatsApp (remover todos os não-dígitos)
    const whatsappNormalizado = input.whatsapp.replace(/\D/g, '');
    const whatsappLimpo = whatsappNormalizado.trim();
    // Sobrenome é opcional: normaliza para string vazia ('') quando não
    // informado, evitando null em coluna NOT NULL do banco.
    const sobrenome = (input.sobrenome || '').trim();

    // 2. Buscar cliente por WhatsApp
    const { data: clienteExistente, error: erroBuscaCliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('whatsapp', whatsappLimpo)
      .maybeSingle();

    if (erroBuscaCliente) {
      console.error('Falha ao localizar cliente para solicitação:', erroBuscaCliente.message);
      return { sucesso: false, erro: 'Erro ao verificar cadastro do cliente' };
    }

    let clienteId = clienteExistente?.id;

    // 3. Se não existir, criar cliente
    if (!clienteId) {
      const { data: novoCliente, error: erroCriarCliente } = await supabase
        .from('clientes')
        .insert([
          {
            nome: input.nome.trim(),
            sobrenome,
            whatsapp: whatsappLimpo,
          },
        ])
        .select('id')
        .single();

      if (erroCriarCliente || !novoCliente) {
        if (erroCriarCliente) console.error('Falha ao cadastrar cliente:', erroCriarCliente.message);
        return {
          sucesso: false,
          erro: 'Não foi possível cadastrar os dados do cliente. Tente novamente.',
        };
      }

      clienteId = novoCliente.id;
    }

    // 4. Gerar token de acompanhamento seguro
    const tokenAcesso = gerarTokenAcompanhamento();

    // 5. Criar atendimento com modo='agendamento', status='aguardando', status_confirmacao='pendente'
    const { data: novoAtendimento, error: erroAtendimento } = await supabase
      .from('atendimentos')
      .insert([
        {
          cliente_id: clienteId,
          procedimento_id: ids[0], // principal (retrocompat)
          procedimento_ids: ids, // múltiplos (PARTE 2)
          modo: 'agendamento',
          status: 'aguardando',
          status_confirmacao: 'pendente',
          horario_agendado: horarioSolicitado,
          token_acesso: tokenAcesso,
        },
      ])
      .select('id')
      .single();

    if (erroAtendimento || !novoAtendimento) {
      if (erroAtendimento) console.error('Falha ao inserir solicitação:', erroAtendimento.message);
      return {
        sucesso: false,
        erro: 'Não foi possível criar a solicitação de agendamento. Tente novamente.',
      };
    }

    // O array na tabela principal é a fonte compatível e obrigatória.
    // A tabela de junção é mantida para consumidores futuros, mas pode ainda
    // não existir em ambientes que não aplicaram a migration.
    if (ids.length > 1) {
      const { error: erroJunção } = await supabase
        .from('atendimento_procedimentos')
        .insert(ids.map((procedimentoId) => ({
          atendimento_id: novoAtendimento.id,
          procedimento_id: procedimentoId,
        })));

      if (erroJunção && !/atendimento_procedimentos|schema cache/i.test(erroJunção.message)) {
        console.error('Não foi possível preencher atendimento_procedimentos:', erroJunção.message);
      }
    }

    // 6. Retornar sucesso + token
    return {
      sucesso: true,
      atendimento_id: novoAtendimento.id,
      token_acesso: tokenAcesso,
    };
  } catch (error) {
    console.error('Erro inesperado ao criar solicitação de agendamento:', error);
    return {
      sucesso: false,
      erro: 'Erro ao processar solicitação de agendamento. Tente novamente.',
    };
  }
}
