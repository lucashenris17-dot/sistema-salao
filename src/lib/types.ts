/**
 * Tipos compartilhados do sistema de agendamento
 *
 * IMPORTANTE: Após executar as migrações SQL no Supabase,
 * considere gerar tipos automaticamente com:
 * npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 */

// ============================================================
// TIPOS BASE DO BANCO DE DADOS
// ============================================================

/**
 * Status do atendimento no fluxo de trabalho
 */
export type StatusAtendimento =
  | 'aguardando'
  | 'em_andamento'
  | 'pausado'
  | 'finalizado'
  | 'cancelado'
  | 'no_show';

/**
 * Status de confirmação (aprovação) do agendamento
 * Adicionado pela migração MVP
 */
export type StatusConfirmacao = 'pendente' | 'confirmado' | 'recusado';

/**
 * Modo do atendimento
 */
export type ModoAtendimento = 'agendamento' | 'fila';

/**
 * Origem do atendimento
 * (Será adicionado em fase futura, se necessário)
 */
export type OrigemAtendimento = 'admin' | 'online';

// ============================================================
// INTERFACES - ENTIDADES DO BANCO
// ============================================================

/**
 * Procedimento oferecido pelo salão
 */
export interface Procedimento {
  id: string;
  nome: string;
  duracao_estimada_min: number;
  ativo: boolean;
  criado_em?: string;
}

/**
 * Cliente do salão
 */
export interface Cliente {
  id: string;
  nome: string;
  sobrenome: string;
  whatsapp: string | null;
  criado_em?: string;
}

/**
 * Atendimento (agendamento ou fila)
 *
 * CAMPOS NOVOS (pós-migração MVP):
 * - status_confirmacao: controla aprovação de solicitações online
 */
export interface Atendimento {
  id: string;
  cliente_id: string;
  procedimento_id: string;
  modo: ModoAtendimento;
  status: StatusAtendimento;
  status_confirmacao?: StatusConfirmacao; // Novo campo MVP
  horario_agendado?: string | null;
  ordem_fila?: number | null;
  motivo_cancelamento?: string | null;
  token_acesso?: string | null;
  criado_em: string;
  duracao_trabalhada_seg?: number | null;
  pausado_desde?: string | null;
}

/**
 * Atendimento com dados relacionados (joins)
 */
export interface AtendimentoCompleto extends Atendimento {
  clientes?: Cliente;
  procedimentos?: Procedimento;
}

/**
 * Bloqueio de agenda (nova tabela MVP)
 * Períodos em que a profissional não está disponível
 */
export interface BloqueioAgenda {
  id: string;
  inicio: string; // timestamptz (ISO string)
  fim: string; // timestamptz (ISO string)
  descricao?: string | null;
  criado_em?: string;
  // Campos de regra (post-migration 20261004)
  tipo?: 'semanal_fixo' | 'temporario' | 'especifico' | null;
  dias_semana?: number[] | null;
  data_inicio?: string | null; // date (ISO)
  data_fim?: string | null; // date (ISO)
  hora_inicio?: string | null; // HH:MM
  hora_fim?: string | null; // HH:MM
}

/**
 * Segmento de atendimento (cronometragem)
 */
export interface SegmentoAtendimento {
  id: string;
  atendimento_id: string;
  tipo: 'ativo';
  inicio: string;
  fim?: string | null;
}

// ============================================================
// TIPOS PARA FORMULÁRIOS E AÇÕES
// ============================================================

/**
 * Dados do formulário público de solicitação de agendamento
 */
export interface SolicitacaoAgendamentoInput {
  // Dados do cliente
  nome: string;
  sobrenome: string;
  whatsapp: string; // Obrigatório no formulário público

  // Dados do agendamento
  procedimento_id: string;
  horario_agendado: string; // ISO string (timestamptz)
}

/**
 * Resposta da criação de solicitação
 */
export interface SolicitacaoAgendamentoResponse {
  sucesso: boolean;
  atendimento_id?: string;
  token_acesso?: string;
  erro?: string;
}

/**
 * Dados para criar bloqueio de agenda
 */
export interface BloqueioAgendaInput {
  tipo?: 'semanal_fixo' | 'temporario' | 'especifico';
  dias_semana?: number[];
  data_inicio?: string;
  data_fim?: string;
  hora_inicio?: string;
  hora_fim?: string;
  descricao?: string;
}

/**
 * Dados para aprovar solicitação de agendamento
 */
export interface AprovarSolicitacaoInput {
  atendimento_id: string;
}

/**
 * Dados para recusar solicitação de agendamento
 */
export interface RecusarSolicitacaoInput {
  atendimento_id: string;
  motivo?: string;
}

// ============================================================
// TIPOS PARA LISTAGENS E FILTROS
// ============================================================

/**
 * Filtros para listar atendimentos
 */
export interface FiltroAtendimentos {
  modo?: ModoAtendimento;
  status?: StatusAtendimento;
  status_confirmacao?: StatusConfirmacao;
  data_inicio?: string;
  data_fim?: string;
}

/**
 * Item de lista de solicitações pendentes (admin)
 */
export interface SolicitacaoPendente {
  id: string;
  cliente_nome: string;
  cliente_sobrenome: string;
  cliente_whatsapp: string;
  procedimento_nome: string;
  procedimento_duracao_min: number;
  horario_solicitado: string;
  criado_em: string;
}

// ============================================================
// TIPOS PARA VALIDAÇÃO
// ============================================================

/**
 * Resultado de validação de disponibilidade de horário
 */
export interface ValidacaoHorario {
  disponivel: boolean;
  motivo?: 'conflito_atendimento' | 'bloqueio_agenda' | 'horario_passado';
  conflito?: {
    tipo: 'atendimento' | 'bloqueio';
    inicio: string;
    fim: string;
  };
}

// ============================================================
// TIPOS AUXILIARES
// ============================================================

/**
 * Resposta padrão de ações do servidor
 */
export interface AcaoResponse<T = unknown> {
  sucesso: boolean;
  dados?: T;
  erro?: string;
  mensagem?: string;
}

/**
 * Estado de carregamento genérico
 */
export interface EstadoCarregamento {
  carregando: boolean;
  erro: string | null;
}

// ============================================================
// TYPE GUARDS (validadores de tipo)
// ============================================================

/**
 * Verifica se um atendimento está pendente de aprovação
 */
export function isPendente(atendimento: Atendimento): boolean {
  return atendimento.status_confirmacao === 'pendente';
}

/**
 * Verifica se um atendimento está confirmado
 */
export function isConfirmado(atendimento: Atendimento): boolean {
  return (
    atendimento.status_confirmacao === 'confirmado' ||
    atendimento.status_confirmacao === undefined // Retrocompatibilidade
  );
}

/**
 * Verifica se um atendimento está ativo (ocupa tempo na fila)
 */
export function isAtivo(atendimento: Atendimento): boolean {
  return (
    atendimento.status === 'aguardando' ||
    atendimento.status === 'em_andamento' ||
    atendimento.status === 'pausado'
  );
}

/**
 * Verifica se um horário é válido (no futuro)
 */
export function isHorarioFuturo(horario: string): boolean {
  return new Date(horario).getTime() > Date.now();
}

export function formatarWhatsApp(numero: string | null | undefined): string {
  if (!numero) return '';
  const apenasDigitos = numero.replace(/\D/g, '');
  if (apenasDigitos.length === 11 && apenasDigitos[2] === '9') {
    return `(${apenasDigitos.slice(0,2)}) ${apenasDigitos.slice(2,3)} ${apenasDigitos.slice(3,7)}-${apenasDigitos.slice(7)}`;
  }
  const match = apenasDigitos.match(/^(\d{2})(\d{5})(\d{4})$/);
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
  if (apenasDigitos.length === 11) {
    return `(${apenasDigitos.slice(0,2)}) ${apenasDigitos.slice(2,3)} ${apenasDigitos.slice(3,7)}-${apenasDigitos.slice(7)}`;
  }
  return numero;
}

export function mascaraWhatsApp(valor: string): string {
  const apenas = valor.replace(/\D/g, '').slice(0, 11);
  if (apenas.length === 0) return '';
  if (apenas.length <= 2) return `(${apenas}`;
  if (apenas.length <= 3) return `(${apenas.slice(0,2)}) ${apenas.slice(2)}`;
  if (apenas.length <= 7) return `(${apenas.slice(0,2)}) ${apenas.slice(2,3)} ${apenas.slice(3)}`;
  return `${apenas}`.length >= 10 ? `(${apenas.slice(0,2)}) ${apenas.slice(2,3)} ${apenas.slice(3,7)}-${apenas.slice(7,11)}` : `(${apenas.slice(0,2)}) ${apenas.slice(2,3)} ${apenas.slice(3,7)}-${apenas.slice(7)}`;
}

export function validarWhatsApp(valor: string): { valido: boolean; mensagem?: string; limpo: string } {
  const limpo = valor.replace(/\D/g, '');
  if (limpo.length === 0) return { valido: false, mensagem: 'Informe o WhatsApp.', limpo: '' };
  if (limpo.length < 11) return { valido: false, mensagem: 'Número incompleto. Use o formato (87) 9 9845-4566.', limpo };
  if (limpo.length > 11) return { valido: false, mensagem: 'Número muito longo.', limpo: limpo.slice(0, 11) };
  return { valido: true, limpo };
}
