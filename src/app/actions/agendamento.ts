'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  SolicitacaoAgendamentoInput,
  SolicitacaoAgendamentoResponse,
} from '@/lib/types';
import { gerarTokenAcompanhamento } from '@/lib/tokens';

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
    if (!input.procedimento_id) {
      return { sucesso: false, erro: 'Procedimento é obrigatório' };
    }
    if (!input.horario_agendado) {
      return { sucesso: false, erro: 'Horário agendado é obrigatório' };
    }

    const dataHorario = new Date(input.horario_agendado);
    if (isNaN(dataHorario.getTime())) {
      return { sucesso: false, erro: 'Horário agendado inválido' };
    }

    const supabase = await createSupabaseClient();
    const whatsappLimpo = input.whatsapp.trim();
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
        return {
          sucesso: false,
          erro: erroCriarCliente?.message || 'Erro ao cadastrar cliente',
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
          procedimento_id: input.procedimento_id,
          modo: 'agendamento',
          status: 'aguardando',
          status_confirmacao: 'pendente',
          horario_agendado: input.horario_agendado,
          token_acesso: tokenAcesso,
        },
      ])
      .select('id')
      .single();

    if (erroAtendimento || !novoAtendimento) {
      return {
        sucesso: false,
        erro: erroAtendimento?.message || 'Erro ao criar solicitação de agendamento',
      };
    }

    // 6. Retornar sucesso + token
    return {
      sucesso: true,
      atendimento_id: novoAtendimento.id,
      token_acesso: tokenAcesso,
    };
  } catch (error) {
    return {
      sucesso: false,
      erro:
        error instanceof Error
          ? error.message
          : 'Erro ao processar solicitação de agendamento',
    };
  }
}
