/**
 * Cálculo de previsão de horários — 1 profissional
 * Regras:
 * - Considera somente atendimentos que ainda ocupam tempo (não cancelado/no_show/finalizado)
 * - Agendamento respeita horario_agendado (não antecipa)
 * - Fila respeita ordem_fila, entra depois de em_andamento/pausados/agendamentos
 * - Em andamento: tempo restante = duracao - tempo_trabalhado (duracao_trabalhada_seg/60)
 * - Pausado: tempo que ainda falta (não conta tempo pausado como consumido)
 * - Cancelado/no_show: libera espaço
 */

export interface PrevisaoCalculoInput {
  id: string;
  modo: 'agendamento' | 'fila';
  status: string;
  cliente_id: string;
  procedimento_id: string;
  horario_agendado?: string | null;
  ordem_fila?: number | null;
  criado_em?: string;
  procedimento?: { duracao_estimada_min: number };
  duracao_trabalhada_seg?: number;
  pausado_desde?: string | null;
}

export interface PrevisaoResultado {
  inicio_previsto?: Date;
  fim_previsto?: Date;
  minutos_restantes?: number;
}

export function calcularPrevisao(atendimentos: PrevisaoCalculoInput[]): Record<string, PrevisaoResultado> {
  // Filtra apenas os que ocupam tempo futuro (exclui cancelado/no_show/finalizado)
  const ativos = atendimentos.filter((a) => {
    const s = a.status;
    return s === 'aguardando' || s === 'em_andamento' || s === 'pausado';
  });

  // Separa agendados e fila
  const agendados = ativos.filter((a) => a.modo === 'agendamento').sort((a, b) => {
    const ha = a.horario_agendado ? new Date(a.horario_agendado).getTime() : Infinity;
    const hb = b.horario_agendado ? new Date(b.horario_agendado).getTime() : Infinity;
    return ha - hb;
  });

  const fila = ativos.filter((a) => a.modo === 'fila').sort((a, b) => {
    return (a.ordem_fila || 9999) - (b.ordem_fila || 9999);
  });

  const resultados: Record<string, PrevisaoResultado> = {};

  // Agendamentos: início fixo pelo horario_agendado, ordenados cronologicamente
  for (const ag of agendados) {
    const durMin = ag.procedimento?.duracao_estimada_min || 0;
    const inicio = ag.horario_agendado ? new Date(ag.horario_agendado) : new Date();
    const fim = new Date(inicio.getTime() + durMin * 60000);

    let minutosRestantes = durMin;
    if (ag.status === 'em_andamento') {
      const trabalhadoSeg = ag.duracao_trabalhada_seg || 0;
      minutosRestantes = Math.max(0, durMin - Math.round(trabalhadoSeg / 60));
    } else if (ag.status === 'pausado') {
      // Pausado: não consome duração estimada; considera que ainda falta tudo (inicio já definido)
      minutosRestantes = durMin;
    }

    resultados[ag.id] = {
      inicio_previsto: inicio,
      fim_previsto: fim,
      minutos_restantes: minutosRestantes,
    };
  }

  // Fila: posicionada respeitando agendamentos (não antecipa horário reservado)
  // Cursor começa no primeiro agendamento existente, ou agora
  let cursorFila = new Date();
  if (agendados.length > 0) {
    const primeiroAg = agendados[0];
    if (primeiroAg.horario_agendado) {
      cursorFila = new Date(new Date(primeiroAg.horario_agendado).getTime());
      // Se há agendamentos futuros, fila pode começar antes do último, mas respeita ordem
    }
  }

  // Ajusta cursor para depois do último agendamento + duração (aproximado para fila)
  // Simples para 1 profissional: fila começa após todos agendamentos ativos
  if (agendados.length > 0) {
    const ultimoAg = agendados[agendados.length - 1];
    const durUltimo = ultimoAg.procedimento?.duracao_estimada_min || 0;
    if (ultimoAg.horario_agendado) {
      cursorFila = new Date(new Date(ultimoAg.horario_agendado).getTime() + durUltimo * 60000);
    } else {
      cursorFila = new Date();
    }
  }

  const emAndamentoOuPausadoFila = fila.filter((a) => a.status === 'em_andamento' || a.status === 'pausado');
  const aguardandoFila = fila.filter((a) => a.status === 'aguardando');

  for (const item of [...emAndamentoOuPausadoFila, ...aguardandoFila]) {
    const durMin = item.procedimento?.duracao_estimada_min || 0;
    const inicio = new Date(cursorFila.getTime());
    const fim = new Date(inicio.getTime() + durMin * 60000);

    let minutosRestantes = durMin;
    if (item.status === 'em_andamento') {
      const trabalhadoSeg = item.duracao_trabalhada_seg || 0;
      minutosRestantes = Math.max(0, durMin - Math.round(trabalhadoSeg / 60));
    }

    resultados[item.id] = {
      inicio_previsto: inicio,
      fim_previsto: fim,
      minutos_restantes: minutosRestantes,
    };

    cursorFila = fim;
  }

  // Retorna Record indexado pelo id do atendimento
  const mapResultado: Record<string, PrevisaoResultado> = {};
  const ordenados = [...agendados, ...fila];
  for (const a of ordenados) {
    mapResultado[a.id] = resultados[a.id] || {};
  }
  // Também inclui os não-ativos (cancelado etc.) como vazio
  for (const a of atendimentos) {
    if (!mapResultado[a.id]) mapResultado[a.id] = {};
  }
  return mapResultado;
}

// ---- Casos de teste simples internos ----
export function testarPrevisao() {
  const casos = [
    // 1. Agendamento 12/09
    {
      nome: 'agendamento 12/09',
      input: [{ id: 'a1', modo: 'agendamento' as const, status: 'aguardando', cliente_id: 'c1', procedimento_id: 'p1', horario_agendado: '2026-09-12T10:56:00Z', procedimento: { duracao_estimada_min: 30 } }],
      expect: (r: Record<string, PrevisaoResultado>) => r['a1']?.inicio_previsto ? r['a1'].inicio_previsto.getTime() === new Date('2026-09-12T10:56:00Z').getTime() : false,
    },
    // 2. Agendamento 23/09 (depois do 12/09)
    {
      nome: 'agendamento 23/09',
      input: [
        { id: 'a1', modo: 'agendamento' as const, status: 'aguardando', cliente_id: 'c1', procedimento_id: 'p1', horario_agendado: '2026-09-12T10:56:00Z', procedimento: { duracao_estimada_min: 30 } },
        { id: 'a2', modo: 'agendamento' as const, status: 'aguardando', cliente_id: 'c2', procedimento_id: 'p1', horario_agendado: '2026-09-23T13:00:00Z', procedimento: { duracao_estimada_min: 30 } },
      ],
      expect: (r: Record<string, PrevisaoResultado>) => {
        const first = r['a1']?.inicio_previsto ? r['a1'].inicio_previsto.getTime() : 0;
        const second = r['a2']?.inicio_previsto ? r['a2'].inicio_previsto.getTime() : Infinity;
        return first < second;
      },
    },
    // 3. Fila respeita agendamentos
    {
      nome: 'fila apos agendamento',
      input: [
        { id: 'a1', modo: 'agendamento' as const, status: 'aguardando', cliente_id: 'c1', procedimento_id: 'p1', horario_agendado: '2026-09-12T10:00:00Z', procedimento: { duracao_estimada_min: 30 } },
        { id: 'f1', modo: 'fila' as const, status: 'aguardando', cliente_id: 'c3', procedimento_id: 'p1', ordem_fila: 1, procedimento: { duracao_estimada_min: 30 } },
      ],
      expect: (r: Record<string, PrevisaoResultado>) => {
        const f = r['f1'];
        return !!(f?.inicio_previsto && new Date(f.inicio_previsto).getTime() > new Date('2026-09-12T10:30:00Z').getTime());
      },
    },
    // 4. Cancelamento libera espaço (não aparece no ativo)
    {
      nome: 'cancelado libera',
      input: [
        { id: 'a1', modo: 'agendamento' as const, status: 'cancelado', cliente_id: 'c1', procedimento_id: 'p1', horario_agendado: '2026-09-12T10:00:00Z', procedimento: { duracao_estimada_min: 30 }, motivo_cancelamento: 'teste' },
        { id: 'a2', modo: 'agendamento' as const, status: 'aguardando', cliente_id: 'c2', procedimento_id: 'p1', horario_agendado: '2026-09-12T10:30:00Z', procedimento: { duracao_estimada_min: 30 } },
      ],
      expect: (r: Record<string, PrevisaoResultado>) => r['a2']?.inicio_previsto ? r['a2'].inicio_previsto.getTime() === new Date('2026-09-12T10:30:00Z').getTime() : false,
    },
  ];

  let ok = 0;
  for (const c of casos) {
    const res = calcularPrevisao(c.input);
    const passou = c.expect(res);
    if (passou) ok++;
  }
  return { total: casos.length, ok, falhou: casos.length - ok };
}
