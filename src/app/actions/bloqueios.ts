'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { BloqueioAgenda, AcaoResponse } from '@/lib/types';

/**
 * Cria cliente Supabase autenticado no servidor.
 * `cookies()` é async no Next.js 16 — deve ser aguardado antes de uso.
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
 * Garante que há um usuário autenticado antes de executar uma ação
 * administrativa. O middleware protege as páginas /admin, mas as Server
 * Actions podem ser invocadas diretamente — esta verificação é a
 * barreira no servidor. Retorna null se autorizado, ou a resposta de
 * erro caso contrário.
 */
async function exigirAutenticado(): Promise<AcaoResponse<never> | null> {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { sucesso: false, erro: 'Não autorizado. Faça login como administradora.' };
  }
  return null;
}

/**
 * Lista todos os bloqueios de agenda
 */
export async function listarBloqueios(): Promise<AcaoResponse<BloqueioAgenda[]>> {
  try {
    const bloqueado = await exigirAutenticado();
    if (bloqueado) return bloqueado;

    const supabase = await createSupabaseClient();

    const { data, error } = await supabase
      .from('bloqueios_agenda')
      .select('*')
      .order('inicio', { ascending: true });

    if (error) {
      return {
        sucesso: false,
        erro: error.message,
      };
    }

    return {
      sucesso: true,
      dados: data || [],
    };
  } catch (error) {
    return {
      sucesso: false,
      erro: error instanceof Error ? error.message : 'Erro ao listar bloqueios',
    };
  }
}

/**
 * Cria novo bloqueio de agenda
 */
export interface BloqueioRegraInput {
  tipo?: 'semanal_fixo' | 'temporario' | 'especifico';
  dias_semana?: number[];
  data_inicio?: string; // date (YYYY-MM-DD)
  data_fim?: string; // date
  hora_inicio?: string; // HH:MM
  hora_fim?: string; // HH:MM
  descricao?: string;
  ignorarConflito?: boolean; // se true, salva mesmo com conflito
}

export async function criarBloqueio(
  input: BloqueioRegraInput
): Promise<AcaoResponse<BloqueioAgenda>> {
  try {
    const bloqueado = await exigirAutenticado();
    if (bloqueado) return bloqueado;

    if (!input.descricao || !input.descricao.trim()) {
      return { sucesso: false, erro: 'Motivo é obrigatório' };
    }

    // --- CALCULAR PERÍODO REAL DO BLOQUEIO ---
    let bloqueioInicio: Date;
    let bloqueioFim: Date;

    const tipo = input.tipo || 'especifico';
    if (tipo === 'semanal_fixo') {
      if (!input.dias_semana || input.dias_semana.length === 0) return { sucesso: false, erro: 'Selecione pelo menos um dia' };
      if (!input.hora_inicio || !input.hora_fim) return { sucesso: false, erro: 'Horário obrigatório para bloqueio semanal' };
      const hoje = new Date();
      const diaHoje = hoje.getDay();
      const diaAlvo = input.dias_semana[0];
      const diasAte = (diaAlvo - diaHoje + 7) % 7 || 7;
      const prox = new Date(hoje); prox.setDate(hoje.getDate() + diasAte);
      const y = prox.getFullYear(); const m = String(prox.getMonth()+1).padStart(2,'0'); const d = String(prox.getDate()).padStart(2,'0');
      bloqueioInicio = new Date(`${y}-${m}-${d}T${input.hora_inicio}:00`);
      bloqueioFim = new Date(`${y}-${m}-${d}T${input.hora_fim}:00`);
    } else if (tipo === 'temporario') {
      if (!input.data_inicio || !input.data_fim) return { sucesso: false, erro: 'Data inicial e final são obrigatórias' };
      if (input.data_fim < input.data_inicio) return { sucesso: false, erro: 'Data final deve ser posterior à inicial' };
      if (!input.hora_inicio || !input.hora_fim) return { sucesso: false, erro: 'Horário obrigatório' };
      bloqueioInicio = new Date(`${input.data_inicio}T${input.hora_inicio}:00`);
      bloqueioFim = new Date(`${input.data_fim}T${input.hora_fim}:00`);
    } else {
      // especifico
      if (!input.data_inicio) return { sucesso: false, erro: 'Data específica é obrigatória' };
      if (!input.hora_inicio || !input.hora_fim) return { sucesso: false, erro: 'Horário obrigatório' };
      bloqueioInicio = new Date(`${input.data_inicio}T${input.hora_inicio}:00`);
      bloqueioFim = new Date(`${input.data_inicio}T${input.hora_fim}:00`);
    }

    // --- BUSCAR ATENDIMENTOS CONFLITANTES ---
    const supabase = await createSupabaseClient();
    const statusAtivos = ["aguardando","em_andamento","pausado"];

    // Buscar atendimentos que começam antes do fim do bloqueio e terminam depois do início
    // Como a comparação precisa de início+fim do atendimento, buscamos todos os ativos
    // no intervalo aproximado e filtramos no código para precisão exata.
    // Para eficiência: buscar atendimentos com horario_agendado >= (bloqueioInicio - max_duracao)
    // Mas como não temos max_duracao global, vamos buscar todos os ativos no período do bloqueio +/- 1 dia
    // e calcular individualmente.
    const { data: atendimentosData, error: atError } = await supabase
      .from('atendimentos')
      .select('id, cliente_id, horario_agendado, procedimento_id, status, modo')
      .in('status', statusAtivos)
      .gte('horario_agendado', bloqueioInicio.toISOString())
      .lte('horario_agendado', bloqueioFim.toISOString());

    // Se não achou pelo intervalo exato, buscar um pouco antes (para casos onde atendimento começa antes mas termina dentro)
    let todosAtendimentos: any[] = atendimentosData || [];
    if (!todosAtendimentos.length) {
      const { data: antes } = await supabase
        .from('atendimentos')
        .select('id, cliente_id, horario_agendado, procedimento_id, status, modo')
        .in('status', statusAtivos)
        .gte('horario_agendado', new Date(bloqueioInicio.getTime() - 4*60*60*1000).toISOString()) // até 4h antes
        .lte('horario_agendado', bloqueioFim.toISOString());
      todosAtendimentos = antes || [];
    }

    // Buscar procedimentos e clientes relacionados
    const procedimentoIds = [...new Set(todosAtendimentos.map((a:any)=>a.procedimento_id).filter(Boolean))];
    const clienteIds = [...new Set(todosAtendimentos.map((a:any)=>a.cliente_id).filter(Boolean))];

    const { data: procedimentosData } = await supabase.from('procedimentos').select('id, nome, duracao_estimada_min').in('id', procedimentoIds);
    const { data: clientesData } = await supabase.from('clientes').select('id, nome, sobrenome, whatsapp').in('id', clienteIds);

    const procMap = new Map((procedimentosData || []).map((p:any)=>[p.id,p]));
    const cliMap = new Map((clientesData || []).map((c:any)=>[c.id,c]));

    // Calcular conflitos
    const conflitos: any[] = [];
    for (const at of todosAtendimentos) {
      if (!at.horario_agendado) continue;
      const proc = procMap.get(at.procedimento_id);
      const duracao = proc ? proc.duracao_estimada_min || 0 : 0;
      const atInicio = new Date(at.horario_agendado);
      const atFim = new Date(atInicio.getTime() + duracao*60000);

      // Regra de conflito
      if (atInicio.getTime() <= bloqueioFim.getTime() && atFim.getTime() > bloqueioInicio.getTime()) {
        const cli = cliMap.get(at.cliente_id);
        conflitos.push({
          atendimento_id: at.id,
          cliente_nome: cli ? `${cli.nome || ''} ${cli.sobrenome || ''}`.trim() : 'Cliente',
          cliente_whatsapp: cli ? cli.whatsapp || '' : '',
          horario: at.horario_agendado,
          procedimento: proc ? proc.nome || '—' : '—',
          duracao,
          inicio: atInicio.toISOString(),
          fim: atFim.toISOString(),
        });
      }
    }

    // Se há conflito e não foi solicitado ignorar, retornar antes de salvar
    if (conflitos.length > 0 && !input.ignorarConflito) {
      return {
        sucesso: false as boolean,
        erro: 'Conflito com atendimentos existentes',
        dados: { conflito: true, atendimentos: conflitos.map((c:any)=>({
          cliente: c.cliente_nome,
          whatsapp: c.cliente_whatsapp,
          horario: c.horario,
          procedimento: c.procedimento,
        })) },
      } as any;
    }

    const sb = await createSupabaseClient();

    const insertObj: any = {
      tipo,
      descricao: input.descricao?.trim() || null,
      dias_semana: input.dias_semana ? (Array.isArray(input.dias_semana) ? input.dias_semana : [input.dias_semana]) : null,
      data_inicio: input.data_inicio || null,
      data_fim: input.data_fim || null,
      hora_inicio: input.hora_inicio || null,
      hora_fim: input.hora_fim || null,
      inicio: null,
      fim: null,
    };

    // Se for específico, preencher inicio/fim com a data + horários para manter compatibilidade
    if (tipo === 'especifico' && input.data_inicio && input.hora_inicio && input.hora_fim) {
      insertObj.inicio = `${input.data_inicio}T${input.hora_inicio}:00`;
      insertObj.fim = `${input.data_inicio}T${input.hora_fim}:00`;
    }
    // Se temporário, preencher com data_inicio + horários no início; fim com data_fim + horários
    if (tipo === 'temporario' && input.data_inicio && input.data_fim && input.hora_inicio && input.hora_fim) {
      insertObj.inicio = `${input.data_inicio}T${input.hora_inicio}:00`;
      insertObj.fim = `${input.data_fim}T${input.hora_fim}:00`;
    }
    // Se semanal, preencher com uma data de referência (próxima ocorrência) para manter inicio/fim válidos
    if (tipo === 'semanal_fixo' && input.dias_semana && input.dias_semana.length > 0 && input.hora_inicio && input.hora_fim) {
      // Apenas preenche com uma referência; não cria múltiplos registros
      const hoje = new Date();
      const diaHoje = hoje.getDay();
      const diaAlvo = input.dias_semana[0];
      const diasAte = (diaAlvo - diaHoje + 7) % 7 || 7;
      const prox = new Date(hoje); prox.setDate(hoje.getDate() + diasAte);
      const y = prox.getFullYear(); const m = String(prox.getMonth() + 1).padStart(2, '0'); const d = String(prox.getDate()).padStart(2, '0');
      insertObj.inicio = `${y}-${m}-${d}T${input.hora_inicio}:00`;
      insertObj.fim = `${y}-${m}-${d}T${input.hora_fim}:00`;
    }

    const { data, error } = await sb
      .from('bloqueios_agenda')
      .insert([insertObj])
      .select()
      .single();

    if (error) return { sucesso: false, erro: error.message };
    return { sucesso: true, dados: data, mensagem: 'Regra criada com sucesso' };
  } catch (error) {
    return { sucesso: false, erro: error instanceof Error ? error.message : 'Erro ao criar bloqueio' };
  }
}

/** Atualiza uma regra de bloqueio existente, preservando a confirmação de conflitos. */
export async function atualizarBloqueio(
  id: string,
  input: BloqueioRegraInput
): Promise<AcaoResponse<BloqueioAgenda>> {
  try {
    if (!id) return { sucesso: false, erro: 'ID do bloqueio é obrigatório' };
    const bloqueado = await exigirAutenticado();
    if (bloqueado) return bloqueado;
    if (!input.descricao?.trim()) return { sucesso: false, erro: 'Motivo é obrigatório' };
    const tipo = input.tipo || 'especifico';
    if (!input.hora_inicio || !input.hora_fim || input.hora_fim <= input.hora_inicio) {
      return { sucesso: false, erro: 'Hora de fim deve ser posterior à hora de início' };
    }
    if (tipo === 'semanal_fixo' && !input.dias_semana?.length) return { sucesso: false, erro: 'Selecione pelo menos um dia' };
    if (tipo === 'temporario' && (!input.data_inicio || !input.data_fim || input.data_fim < input.data_inicio)) {
      return { sucesso: false, erro: 'Data inicial e final são obrigatórias e válidas' };
    }
    if (tipo === 'especifico' && !input.data_inicio) return { sucesso: false, erro: 'Data específica é obrigatória' };

    const sb = await createSupabaseClient();
    const referencia = tipo === 'temporario' || tipo === 'especifico' ? input.data_inicio! : (() => {
      const hoje = new Date();
      const diasAte = (input.dias_semana![0] - hoje.getDay() + 7) % 7 || 7;
      hoje.setDate(hoje.getDate() + diasAte);
      return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    })();
    const dataFim = tipo === 'temporario' ? input.data_fim! : referencia;
    const inicio = new Date(`${referencia}T${input.hora_inicio}:00-03:00`);
    const fim = new Date(`${dataFim}T${input.hora_fim}:00-03:00`);
    const statusAtivos = ['aguardando', 'em_andamento', 'pausado'];
    const { data: atendimentos } = await sb.from('atendimentos')
      .select('id, cliente_id, horario_agendado, procedimento_id, status')
      .in('status', statusAtivos)
      .gte('horario_agendado', new Date(inicio.getTime() - 4 * 60 * 60 * 1000).toISOString())
      .lte('horario_agendado', fim.toISOString());
    const registros = atendimentos || [];
    const procIds = [...new Set(registros.map((a: any) => a.procedimento_id).filter(Boolean))];
    const cliIds = [...new Set(registros.map((a: any) => a.cliente_id).filter(Boolean))];
    const [{ data: procs }, { data: clientes }] = await Promise.all([
      procIds.length ? sb.from('procedimentos').select('id,nome,duracao_estimada_min').in('id', procIds) : Promise.resolve({ data: [] }),
      cliIds.length ? sb.from('clientes').select('id,nome,sobrenome,whatsapp').in('id', cliIds) : Promise.resolve({ data: [] }),
    ]);
    const procMap = new Map((procs || []).map((p: any) => [p.id, p]));
    const cliMap = new Map((clientes || []).map((c: any) => [c.id, c]));
    const conflitos = registros.flatMap((a: any) => {
      const atInicio = new Date(a.horario_agendado);
      const proc: any = procMap.get(a.procedimento_id);
      const atFim = new Date(atInicio.getTime() + (proc?.duracao_estimada_min || 0) * 60000);
      if (atInicio > fim || atFim <= inicio) return [];
      const cli: any = cliMap.get(a.cliente_id);
      return [{ cliente: `${cli?.nome || ''} ${cli?.sobrenome || ''}`.trim() || 'Cliente', whatsapp: cli?.whatsapp || '', horario: a.horario_agendado, procedimento: proc?.nome || '—' }];
    });
    if (conflitos.length && !input.ignorarConflito) {
      return { sucesso: false, erro: 'Conflito com atendimentos existentes', dados: { conflito: true, atendimentos: conflitos } } as any;
    }
    const dados: any = {
      tipo, descricao: input.descricao.trim(), dias_semana: tipo === 'semanal_fixo' ? input.dias_semana : null,
      data_inicio: tipo === 'semanal_fixo' ? null : input.data_inicio,
      data_fim: tipo === 'temporario' ? input.data_fim : null,
      hora_inicio: input.hora_inicio, hora_fim: input.hora_fim,
      inicio: inicio.toISOString(), fim: fim.toISOString(),
    };
    const { data, error } = await sb.from('bloqueios_agenda').update(dados).eq('id', id).select().single();
    if (error) return { sucesso: false, erro: error.message };
    return { sucesso: true, dados, mensagem: 'Bloqueio atualizado com sucesso' };
  } catch (error) {
    return { sucesso: false, erro: error instanceof Error ? error.message : 'Erro ao atualizar bloqueio' };
  }
}

/**
 * Exclui bloqueio de agenda
 */
export async function excluirBloqueio(id: string): Promise<AcaoResponse<void>> {
  try {
    if (!id) {
      return {
        sucesso: false,
        erro: 'ID do bloqueio é obrigatório',
      };
    }

    const bloqueado = await exigirAutenticado();
    if (bloqueado) return bloqueado;

    const supabase = await createSupabaseClient();

    const { error } = await supabase
      .from('bloqueios_agenda')
      .delete()
      .eq('id', id);

    if (error) {
      return {
        sucesso: false,
        erro: error.message,
      };
    }

    return {
      sucesso: true,
      mensagem: 'Bloqueio excluído com sucesso',
    };
  } catch (error) {
    return {
      sucesso: false,
      erro: error instanceof Error ? error.message : 'Erro ao excluir bloqueio',
    };
  }
}
