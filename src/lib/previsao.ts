/**
 * Cálculo de previsão de horários — 1 profissional
 *
 * Regras:
 * - Em andamento: começa agora e usa somente o tempo restante.
 * - Pausado: precisa voltar a trabalhar e mantém toda a duração que ainda falta.
 * - Agendamento futuro: reserva seu horário, mas não bloqueia a fila antes dele.
 * - Fila: ocupa os espaços disponíveis antes dos agendamentos futuros.
 * - Agendamento atrasado: não fica no passado; passa a partir do horário atual
 *   quando houver disponibilidade.
 * - Cancelado, no_show e finalizado não ocupam tempo.
 */

/**
 * Converte string de data/hora (formato ISO) para Date.
 *
 * O banco Supabase armazena como timestamptz em UTC.
 * Quando o Supabase retorna um timestamp com 'Z', ele está em UTC.
 * O new Date() do JavaScript já converte UTC para o horário local do sistema.
 *
 * IMPORTANTE: O salvamento do agendamento já converte o horário local
 * para UTC antes de salvar no banco. Portanto, ao ler de volta,
 * o new Date(isoString) retorna o horário correto no fuso local.
 */
function parseBrasiliaDateTime(isoString: string | null | undefined): Date | null {
  if (!isoString) return null;

  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;

  // Não subtrair horas - o new Date() já faz a conversão correta
  // Se o agendamento foi salvo como 10:01 horário local,
  // o banco armazena 13:01 UTC (assumindo UTC-3)
  // Ao ler de volta, new Date("13:01Z") retorna 10:01 no fuso local
  return d;
}

export interface PrevisaoCalculoInput {
  id: string;
  modo: "agendamento" | "fila";
  status: string;
  cliente_id: string;
  procedimento_id: string;
  horario_agendado?: string | null;
  ordem_fila?: number | null;
  criado_em?: string;
  procedimento?: {
    duracao_estimada_min: number;
  };
  duracao_trabalhada_seg?: number;
  pausado_desde?: string | null;
}

export interface PrevisaoResultado {
  inicio_previsto?: Date;
  fim_previsto?: Date;
  minutos_restantes?: number;
}

function duracaoDoAtendimento(atendimento: PrevisaoCalculoInput): number {
  return Math.max(
    0,
    atendimento.procedimento?.duracao_estimada_min || 0
  );
}

function minutosTrabalhados(atendimento: PrevisaoCalculoInput): number {
  return Math.max(
    0,
    Math.round((atendimento.duracao_trabalhada_seg || 0) / 60)
  );
}

function minutosRestantes(atendimento: PrevisaoCalculoInput): number {
  const duracao = duracaoDoAtendimento(atendimento);

  if (atendimento.status === "em_andamento") {
    return Math.max(0, duracao - minutosTrabalhados(atendimento));
  }

  if (atendimento.status === "pausado") {
    return Math.max(0, duracao - minutosTrabalhados(atendimento));
  }

  return duracao;
}

function ordenarFila(a: PrevisaoCalculoInput, b: PrevisaoCalculoInput) {
  const ordemA = a.ordem_fila ?? 999999;
  const ordemB = b.ordem_fila ?? 999999;

  if (ordemA !== ordemB) {
    return ordemA - ordemB;
  }

  const criadoA = a.criado_em
    ? new Date(a.criado_em).getTime()
    : 0;

  const criadoB = b.criado_em
    ? new Date(b.criado_em).getTime()
    : 0;

  return criadoA - criadoB;
}

function ordenarAgendamentos(
  a: PrevisaoCalculoInput,
  b: PrevisaoCalculoInput
) {
  const horarioA = a.horario_agendado
    ? parseBrasiliaDateTime(a.horario_agendado)?.getTime()
    : Infinity;

  const horarioB = b.horario_agendado
    ? parseBrasiliaDateTime(b.horario_agendado)?.getTime()
    : Infinity;

  return (horarioA ?? Infinity) - (horarioB ?? Infinity);
}

export function calcularPrevisao(
  atendimentos: PrevisaoCalculoInput[],
  agora: Date = new Date()
): Record<string, PrevisaoResultado> {
  const resultados: Record<string, PrevisaoResultado> = {};

  const ativos = atendimentos.filter((atendimento) => {
    return (
      atendimento.status === "aguardando" ||
      atendimento.status === "em_andamento" ||
      atendimento.status === "pausado"
    );
  });

  if (ativos.length === 0) {
    return resultados;
  }

  /*
   * ============================================================
   * 1. ATENDIMENTOS QUE JÁ ESTÃO OCUPANDO O PROFISSIONAL
   * ============================================================
   *
   * Em um salão com uma profissional, somente um atendimento
   * pode estar efetivamente sendo trabalhado por vez.
   *
   * Se existir um atendimento em andamento, ele começa agora
   * para efeito da previsão.
   *
   * Se estiver pausado, também consideramos sua retomada.
   */

  const emAndamento = ativos
    .filter((a) => a.status === "em_andamento")
    .sort((a, b) => {
      const aCriado = a.criado_em
        ? new Date(a.criado_em).getTime()
        : 0;

      const bCriado = b.criado_em
        ? new Date(b.criado_em).getTime()
        : 0;

      return aCriado - bCriado;
    });

  const pausados = ativos
    .filter((a) => a.status === "pausado")
    .sort((a, b) => {
      const aPausado = a.pausado_desde
        ? new Date(a.pausado_desde).getTime()
        : Infinity;

      const bPausado = b.pausado_desde
        ? new Date(b.pausado_desde).getTime()
        : Infinity;

      return aPausado - bPausado;
    });

  let cursor = new Date(agora.getTime());

  /*
   * Se existe atendimento em andamento, ele tem prioridade.
   */
  if (emAndamento.length > 0) {
    const atendimento = emAndamento[0];
    const restante = minutosRestantes(atendimento);

    const inicio = new Date(cursor.getTime());
    const fim = new Date(
      inicio.getTime() + restante * 60000
    );

    resultados[atendimento.id] = {
      inicio_previsto: inicio,
      fim_previsto: fim,
      minutos_restantes: restante,
    };

    cursor = fim;
  }

  /*
   * Depois do atendimento em andamento, os pausados podem voltar.
   *
   * A ordem é determinada pelo momento em que foram pausados.
   */
  for (const atendimento of pausados) {
    if (resultados[atendimento.id]) {
      continue;
    }

    const restante = minutosRestantes(atendimento);

    const inicio = new Date(cursor.getTime());
    const fim = new Date(
      inicio.getTime() + restante * 60000
    );

    resultados[atendimento.id] = {
      inicio_previsto: inicio,
      fim_previsto: fim,
      minutos_restantes: restante,
    };

    cursor = fim;
  }

  /*
   * ============================================================
   * 2. AGENDAMENTOS FUTUROS
   * ============================================================
   *
   * Agendamento futuro funciona como uma reserva.
   *
   * IMPORTANTE:
   * Ele não bloqueia a fila inteira.
   *
   * Exemplo:
   *
   * Agora: 14:00
   * Agendamento: 17:00
   * Fila: 30 minutos
   *
   * A fila pode ser atendida às 14:00.
   *
   * Somente se a fila não couber antes das 17:00,
   * ela será colocada depois do agendamento.
   */

  const agendamentos = ativos
    .filter((a) => a.modo === "agendamento")
    .sort(ordenarAgendamentos);

  const agendamentosPendentes = agendamentos.filter(
    (a) => !resultados[a.id]
  );

  /*
   * ============================================================
   * 3. FILA
   * ============================================================
   */

  const fila = ativos
    .filter(
      (a) =>
        a.modo === "fila" &&
        !resultados[a.id]
    )
    .sort(ordenarFila);

  /*
   * ============================================================
   * 4. MISTURA FILA + AGENDAMENTOS
   * ============================================================
   *
   * Percorremos os agendamentos cronologicamente e colocamos
   * clientes da fila nos espaços disponíveis.
   */

  let indiceFila = 0;

  for (const agendamento of agendamentosPendentes) {
    const horarioAgendado = agendamento.horario_agendado
      ? parseBrasiliaDateTime(agendamento.horario_agendado)
      : null;

    /*
     * Se o agendamento não possui horário válido,
     * tratamos como disponível a partir de agora.
     */
    if (!horarioAgendado || Number.isNaN(horarioAgendado.getTime())) {
      const restante = minutosRestantes(agendamento);

      const inicio = new Date(cursor.getTime());
      const fim = new Date(
        inicio.getTime() + restante * 60000
      );

      resultados[agendamento.id] = {
        inicio_previsto: inicio,
        fim_previsto: fim,
        minutos_restantes: restante,
      };

      cursor = fim;
      continue;
    }

    /*
     * Se o horário agendado já passou, não mostramos o
     * atendimento no passado.
     *
     * Ele começa no primeiro momento disponível.
     */
    if (horarioAgendado.getTime() <= cursor.getTime()) {
      const restante = minutosRestantes(agendamento);

      const inicio = new Date(cursor.getTime());
      const fim = new Date(
        inicio.getTime() + restante * 60000
      );

      resultados[agendamento.id] = {
        inicio_previsto: inicio,
        fim_previsto: fim,
        minutos_restantes: restante,
      };

      cursor = fim;
      continue;
    }

    /*
     * Existe um espaço entre "cursor" e o agendamento.
     *
     * Vamos tentar encaixar clientes da fila nesse espaço.
     */
    while (indiceFila < fila.length) {
      const itemFila = fila[indiceFila];
      const duracaoFila = minutosRestantes(itemFila);

      const inicioFila = new Date(cursor.getTime());
      const fimFila = new Date(
        inicioFila.getTime() + duracaoFila * 60000
      );

      /*
       * Se a fila termina antes ou exatamente no horário
       * do agendamento, ela cabe no espaço.
       */
      if (fimFila.getTime() <= horarioAgendado.getTime()) {
        resultados[itemFila.id] = {
          inicio_previsto: inicioFila,
          fim_previsto: fimFila,
          minutos_restantes: duracaoFila,
        };

        cursor = fimFila;
        indiceFila++;
        continue;
      }

      /*
       * Se não cabe, paramos de colocar fila antes desse
       * agendamento.
       */
      break;
    }

    /*
     * Agora colocamos o agendamento no horário reservado,
     * desde que o profissional esteja livre até lá.
     */
    const inicioAgendamento = new Date(
      Math.max(
        cursor.getTime(),
        horarioAgendado.getTime()
      )
    );

    const restanteAgendamento =
      minutosRestantes(agendamento);

    const fimAgendamento = new Date(
      inicioAgendamento.getTime() +
        restanteAgendamento * 60000
    );

    resultados[agendamento.id] = {
      inicio_previsto: inicioAgendamento,
      fim_previsto: fimAgendamento,
      minutos_restantes: restanteAgendamento,
    };

    cursor = fimAgendamento;
  }

  /*
   * ============================================================
   * 5. SOBROU FILA
   * ============================================================
   *
   * Depois de todos os agendamentos, os clientes restantes
   * da fila seguem normalmente.
   */
  while (indiceFila < fila.length) {
    const itemFila = fila[indiceFila];
    const restante = minutosRestantes(itemFila);

    const inicio = new Date(cursor.getTime());
    const fim = new Date(
      inicio.getTime() + restante * 60000
    );

    resultados[itemFila.id] = {
      inicio_previsto: inicio,
      fim_previsto: fim,
      minutos_restantes: restante,
    };

    cursor = fim;
    indiceFila++;
  }

  /*
   * ============================================================
   * 6. GARANTIA DE RESULTADO PARA TODOS OS ATENDIMENTOS
   * ============================================================
   */

  for (const atendimento of atendimentos) {
    if (!resultados[atendimento.id]) {
      resultados[atendimento.id] = {};
    }
  }

  return resultados;
}

/*
 * ==============================================================
 * TESTES
 * ==============================================================
 */

export function testarPrevisao() {
  const agora = new Date("2026-09-15T18:00:00Z");

  const casos = [
    {
      nome: "fila começa agora",
      input: [
        {
          id: "f1",
          modo: "fila" as const,
          status: "aguardando",
          cliente_id: "c1",
          procedimento_id: "p1",
          ordem_fila: 1,
          procedimento: {
            duracao_estimada_min: 30,
          },
        },
      ],
      expect: (
        r: Record<string, PrevisaoResultado>
      ) => {
        const inicio = r.f1?.inicio_previsto;
        return !!inicio &&
          inicio.getTime() === agora.getTime();
      },
    },

    {
      nome: "fila não fica no passado",
      input: [
        {
          id: "f1",
          modo: "fila" as const,
          status: "aguardando",
          cliente_id: "c1",
          procedimento_id: "p1",
          ordem_fila: 1,
          procedimento: {
            duracao_estimada_min: 30,
          },
        },
      ],
      expect: (
        r: Record<string, PrevisaoResultado>
      ) => {
        const inicio = r.f1?.inicio_previsto;
        return !!inicio &&
          inicio.getTime() >= agora.getTime();
      },
    },

    {
      nome: "fila cabe antes de agendamento futuro",
      input: [
        {
          id: "f1",
          modo: "fila" as const,
          status: "aguardando",
          cliente_id: "c1",
          procedimento_id: "p1",
          ordem_fila: 1,
          procedimento: {
            duracao_estimada_min: 30,
          },
        },
        {
          id: "a1",
          modo: "agendamento" as const,
          status: "aguardando",
          cliente_id: "c2",
          procedimento_id: "p1",
          horario_agendado: "2026-09-15T19:00:00Z",
          procedimento: {
            duracao_estimada_min: 30,
          },
        },
      ],
      expect: (
        r: Record<string, PrevisaoResultado>
      ) => {
        const fila = r.f1?.inicio_previsto;
        const agendamento = r.a1?.inicio_previsto;

        return !!fila &&
          !!agendamento &&
          fila.getTime() < agendamento.getTime();
      },
    },

    {
      nome: "agendamento atrasado não fica no passado",
      input: [
        {
          id: "a1",
          modo: "agendamento" as const,
          status: "aguardando",
          cliente_id: "c1",
          procedimento_id: "p1",
          horario_agendado: "2026-09-15T15:00:00Z",
          procedimento: {
            duracao_estimada_min: 30,
          },
        },
      ],
      expect: (
        r: Record<string, PrevisaoResultado>
      ) => {
        const inicio = r.a1?.inicio_previsto;
        return !!inicio &&
          inicio.getTime() >= agora.getTime();
      },
    },

    {
      nome: "cancelado não ocupa espaço",
      input: [
        {
          id: "a1",
          modo: "agendamento" as const,
          status: "cancelado",
          cliente_id: "c1",
          procedimento_id: "p1",
          horario_agendado: "2026-09-15T18:00:00Z",
          procedimento: {
            duracao_estimada_min: 30,
          },
        },
        {
          id: "a2",
          modo: "agendamento" as const,
          status: "aguardando",
          cliente_id: "c2",
          procedimento_id: "p1",
          horario_agendado: "2026-09-15T18:30:00Z",
          procedimento: {
            duracao_estimada_min: 30,
          },
        },
      ],
      expect: (
        r: Record<string, PrevisaoResultado>
      ) => {
        const inicio = r.a2?.inicio_previsto;
        return !!inicio &&
          inicio.getTime() ===
            new Date(
              "2026-09-15T18:30:00Z"
            ).getTime();
      },
    },

    {
      nome: "atendimento em andamento usa tempo restante",
      input: [
        {
          id: "a1",
          modo: "agendamento" as const,
          status: "em_andamento",
          cliente_id: "c1",
          procedimento_id: "p1",
          horario_agendado: "2026-09-15T15:00:00Z",
          duracao_trabalhada_seg: 20 * 60,
          procedimento: {
            duracao_estimada_min: 30,
          },
        },
      ],
      expect: (
        r: Record<string, PrevisaoResultado>
      ) => {
        return (
          r.a1?.minutos_restantes === 10
        );
      },
    },

    {
      nome: "pausado mantém somente o tempo restante",
      input: [
        {
          id: "a1",
          modo: "agendamento" as const,
          status: "pausado",
          cliente_id: "c1",
          procedimento_id: "p1",
          duracao_trabalhada_seg: 15 * 60,
          pausado_desde: "2026-09-15T17:30:00Z",
          procedimento: {
            duracao_estimada_min: 30,
          },
        },
      ],
      expect: (
        r: Record<string, PrevisaoResultado>
      ) => {
        return (
          r.a1?.minutos_restantes === 15
        );
      },
    },
  ];

  let ok = 0;

  for (const caso of casos) {
    const resultado = calcularPrevisao(
      caso.input,
      agora
    );

    if (caso.expect(resultado)) {
      ok++;
    }
  }

  return {
    total: casos.length,
    ok,
    falhou: casos.length - ok,
  };
}