'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AcaoResponse, SolicitacaoPendente } from '@/lib/types';

/**
 * Cria cliente Supabase autenticado no servidor.
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
 * Lista todas as solicitações de agendamento pendentes de aprovação (status_confirmacao = 'pendente')
 */
export async function listarSolicitacoesPendentes(): Promise<AcaoResponse<SolicitacaoPendente[]>> {
  try {
    const bloqueado = await exigirAutenticado();
    if (bloqueado) return bloqueado;

    const supabase = await createSupabaseClient();

    const { data, error } = await supabase
      .from('atendimentos')
      .select(`
        id,
        horario_agendado,
        criado_em,
        procedimento_id,
        procedimento_ids,
        clientes:cliente_id (
          nome,
          sobrenome,
          whatsapp
        ),
        procedimentos:procedimento_id (
          nome,
          duracao_estimada_min
        )
      `)
      .eq('status_confirmacao', 'pendente')
      .order('criado_em', { ascending: true });

    if (error) {
      return {
        sucesso: false,
        erro: error.message,
      };
    }

    const rows = (data || []) as any[];
    const idsProcedimentos = [...new Set(rows.flatMap((item) =>
      Array.isArray(item.procedimento_ids) && item.procedimento_ids.length
        ? item.procedimento_ids
        : [item.procedimento_id]
    ).filter(Boolean))];
    const { data: dadosProcedimentos, error: erroProcedimentos } = idsProcedimentos.length
      ? await supabase.from('procedimentos').select('id, nome, duracao_estimada_min').in('id', idsProcedimentos)
      : { data: [], error: null };
    if (erroProcedimentos) return { sucesso: false, erro: erroProcedimentos.message };
    const procedimentosPorId = new Map((dadosProcedimentos || []).map((procedimento) => [procedimento.id, procedimento]));

    const solicitacoes: SolicitacaoPendente[] = rows.map((item: any) => {
      const ids = Array.isArray(item.procedimento_ids) && item.procedimento_ids.length
        ? item.procedimento_ids
        : [item.procedimento_id];
      const procedimentos = ids.map((id: string) => procedimentosPorId.get(id)).filter(Boolean) as { id: string; nome: string; duracao_estimada_min: number }[];
      return {
      id: item.id,
      cliente_nome: item.clientes?.nome || '',
      cliente_sobrenome: item.clientes?.sobrenome || '',
      cliente_whatsapp: item.clientes?.whatsapp || '',
      procedimento_nome: procedimentos.map((procedimento) => procedimento.nome).join(', ') || item.procedimentos?.nome || '',
      procedimento_duracao_min: procedimentos.reduce((total, procedimento) => total + (procedimento.duracao_estimada_min || 0), 0) || item.procedimentos?.duracao_estimada_min || 0,
      procedimentos,
      horario_solicitado: item.horario_agendado || '',
      criado_em: item.criado_em || '',
    };
    });

    return {
      sucesso: true,
      dados: solicitacoes,
    };
  } catch (error) {
    return {
      sucesso: false,
      erro: error instanceof Error ? error.message : 'Erro ao listar solicitações pendentes',
    };
  }
}

/**
 * Aprova uma solicitação de agendamento (status_confirmacao = 'confirmado')
 */
export async function aprovarSolicitacao(id: string): Promise<AcaoResponse<void>> {
  try {
    if (!id) {
      return {
        sucesso: false,
        erro: 'ID da solicitação é obrigatório',
      };
    }

    const bloqueado = await exigirAutenticado();
    if (bloqueado) return bloqueado;

    const supabase = await createSupabaseClient();

    const { error } = await supabase
      .from('atendimentos')
      .update({
        status_confirmacao: 'confirmado',
      })
      .eq('id', id);

    if (error) {
      return {
        sucesso: false,
        erro: error.message,
      };
    }

    return {
      sucesso: true,
      mensagem: 'Solicitação aprovada com sucesso',
    };
  } catch (error) {
    return {
      sucesso: false,
      erro: error instanceof Error ? error.message : 'Erro ao aprovar solicitação',
    };
  }
}

/**
 * Recusa uma solicitação de agendamento (status = 'cancelado', status_confirmacao = 'recusado')
 */
export async function recusarSolicitacao(id: string): Promise<AcaoResponse<void>> {
  try {
    if (!id) {
      return {
        sucesso: false,
        erro: 'ID da solicitação é obrigatório',
      };
    }

    const bloqueado = await exigirAutenticado();
    if (bloqueado) return bloqueado;

    const supabase = await createSupabaseClient();

    const { error } = await supabase
      .from('atendimentos')
      .update({
        status: 'cancelado',
        status_confirmacao: 'recusado',
        motivo_cancelamento: 'Solicitação recusada pela administração',
      })
      .eq('id', id);

    if (error) {
      return {
        sucesso: false,
        erro: error.message,
      };
    }

    return {
      sucesso: true,
      mensagem: 'Solicitação recusada com sucesso',
    };
  } catch (error) {
    return {
      sucesso: false,
      erro: error instanceof Error ? error.message : 'Erro ao recusar solicitação',
    };
  }
}
