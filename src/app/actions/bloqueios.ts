'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { BloqueioAgenda, BloqueioAgendaInput, AcaoResponse } from '@/lib/types';

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
 * Lista todos os bloqueios de agenda
 */
export async function listarBloqueios(): Promise<AcaoResponse<BloqueioAgenda[]>> {
  try {
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
export async function criarBloqueio(
  input: BloqueioAgendaInput
): Promise<AcaoResponse<BloqueioAgenda>> {
  try {
    // Validações
    if (!input.inicio || !input.fim) {
      return {
        sucesso: false,
        erro: 'Data de início e fim são obrigatórias',
      };
    }

    const inicio = new Date(input.inicio);
    const fim = new Date(input.fim);

    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
      return {
        sucesso: false,
        erro: 'Datas inválidas',
      };
    }

    if (fim <= inicio) {
      return {
        sucesso: false,
        erro: 'Data de fim deve ser posterior à data de início',
      };
    }

    const supabase = await createSupabaseClient();

    const { data, error } = await supabase
      .from('bloqueios_agenda')
      .insert([
        {
          inicio: input.inicio,
          fim: input.fim,
          descricao: input.descricao || null,
        },
      ])
      .select()
      .single();

    if (error) {
      return {
        sucesso: false,
        erro: error.message,
      };
    }

    return {
      sucesso: true,
      dados: data,
      mensagem: 'Bloqueio criado com sucesso',
    };
  } catch (error) {
    return {
      sucesso: false,
      erro: error instanceof Error ? error.message : 'Erro ao criar bloqueio',
    };
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
