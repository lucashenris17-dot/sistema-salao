export interface ClienteHistorico {
  id: string;
  nome: string;
  sobrenome: string;
  whatsapp: string;
  criado_em: string;
}

export interface AtendimentoHistoricoItem {
  id: string;
  data: string;
  procedimento: string;
  status: string;
}

export interface EstatisticasPeriodo {
  periodo: string;
  total: number;
  porProcedimento: Record<string, number>;
}

export function formatarPeriodoLabel(p: string) {
  if (p === '7dias') return 'Últimos 7 dias';
  if (p === '30dias') return 'Últimos 30 dias';
  if (p === 'ano') return 'Este ano';
  return 'Todos';
}
