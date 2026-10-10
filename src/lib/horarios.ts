/**
 * Gera a grade de horários padrão do salão (08:00 às 19:00, de 30 em 30 min).
 * Compartilhada entre `/agendar` (cliente) e painéis admin.
 */
export function gerarGradeHorarios(): string[] {
  const lista: string[] = [];
  for (let h = 8; h <= 19; h++) {
    const horaStr = String(h).padStart(2, '0');
    lista.push(`${horaStr}:00`);
    if (h < 19) lista.push(`${horaStr}:30`);
  }
  return lista;
}

/**
 * Converte um horário "HH:MM" em minutos desde a meia-noite.
 */
export function horarioParaMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converte um timestamp ISO em minutos, considerando o fuso do salão
 * (America/Sao_Paulo). Usado para comparar horários armazenados no banco.
 */
export function timestampParaMinutosSalao(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = iso.includes('T')
    ? iso.split('T')[1].split(':')[0] + ':' + iso.split('T')[1].split(':')[1]
    : iso;
  const [h, m] = ts.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calcula o dia da semana (0=dom … 6=sáb) de uma data ISO no fuso de Brasília.
 * Sem o offset, `new Date('YYYY-MM-DDT00:00:00')` é interpretado como UTC e,
 * para datas perto da meia-noite, o dia pode deslocar.
 */
export function diaSemanaDaData(dataIso: string): number {
  return new Date(`${dataIso}T12:00:00-03:00`).getDay();
}

/**
 * Converte uma data ISO (YYYY-MM-DD) em string local DD/MM/YYYY no fuso do salão.
 */
export function formatarDataSalao(dataIso: string): string {
  const d = new Date(`${dataIso}T12:00:00-03:00`);
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Formato de uma regra de bloqueio usada no cálculo da grade. */
export interface BloqueioGrade {
  tipo?: string | null;
  dias_semana?: number[] | null;
  dataInicio?: string | null;
  data_fim?: string | null;
  horaInicio?: string | null;
  hora_fim?: string | null;
  inicio?: string | null;
  fim?: string | null;
}

/** Formato de um atendimento ocupado usado no cálculo da grade. */
export interface OcupadoGrade {
  horario_agendado?: string | null;
  procedimentos?: { duracao_estimada_min?: number } | null;
}

export interface HorarioOpcao {
  horaStr: string;
  disponivel: boolean;
  bloqueado: boolean;
}

/**
 * Calcula a grade de horários para uma data, considerando bloqueios de agenda e
 * atendimentos já ocupados. Mesma lógica que `/agendar`, para que o painel
 * admin mostre o mesmo comportamento (cards vermelhos não clicáveis).
 */
export function calcularGradeHorario(
  dataIso: string,
  duracaoMin: number,
  bloqueios: BloqueioGrade[],
  ocupados: OcupadoGrade[],
  agora: Date = new Date()
): HorarioOpcao[] {
  const grade = gerarGradeHorarios();
  const diaSemana = diaSemanaDaData(dataIso);

  const formatoHorarioSalao = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  const ocupadosMin = (ocupados || []).flatMap((a) => {
    if (!a.horario_agendado) return [];
    const horario = new Date(a.horario_agendado);
    if (Number.isNaN(horario.getTime())) return [];

    const partes = formatoHorarioSalao.formatToParts(horario);
    const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
      partes.find((p) => p.type === tipo)?.value ?? '';
    const dataAt = `${valor('year')}-${valor('month')}-${valor('day')}`;
    if (dataAt !== dataIso) return [];

    const inicio = Number(valor('hour')) * 60 + Number(valor('minute'));
    const dur = a.procedimentos?.duracao_estimada_min || 30;
    return [{ inicio, fim: inicio + dur }];
  });

  const bloqueiosMin = (bloqueios || []).flatMap((b) => {
    const tipoDB = b.tipo || null;
    const tipo = tipoDB || (b.inicio && b.fim && b.inicio.substring(0, 10) === b.fim.substring(0, 10)
      ? 'especifico' : 'semanal_fixo');

    function avaliar(diaBate: boolean, horaIni: string | null, horaFim: string | null) {
      const iniMin = timestampParaMinutosSalao(horaIni);
      const fimMin = timestampParaMinutosSalao(horaFim);
      return diaBate && iniMin !== null && fimMin !== null ? [{ inicio: iniMin, fim: fimMin }] : [];
    }

    if (tipo === 'especifico' || tipo === 'temporario') {
      return avaliar(
        Boolean(b.inicio?.substring(0, 10) === dataIso && b.inicio && b.fim),
        b.inicio ? b.inicio.split('T')[1]?.substring(0, 5) || b.inicio.substring(11, 16) : null,
        b.fim ? b.fim.split('T')[1]?.substring(0, 5) || b.fim.substring(11, 16) : null,
      );
    }

    const diasSemanaRule = b.dias_semana || null;
    const horaIni = b.horaInicio || (b.inicio ? b.inicio.split('T')[1]?.substring(0, 5) : null);
    const horaFim = b.hora_fim || (b.fim ? b.fim.split('T')[1]?.substring(0, 5) : null);
    const diaMatch = !diasSemanaRule ||
      (Array.isArray(diasSemanaRule) ? diasSemanaRule.includes(diaSemana) : diasSemanaRule === diaSemana);
    return avaliar(diaMatch, horaIni || null, horaFim || null);
  }).filter(Boolean) as { inicio: number; fim: number }[];

  const hojeStr = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
  const dataHoje = dataIso === hojeStr;

  return grade.map((horaStr) => {
    const inicioMin = horarioParaMinutos(horaStr);
    const fimMin = inicioMin + duracaoMin;
    const foraExpediente = inicioMin < 8 * 60 || inicioMin > 19 * 60;
    const conflitoBloqueio = bloqueiosMin.some((b) => inicioMin <= b.fim && fimMin > b.inicio);
    const conflitoAtendimento = ocupadosMin.some((o) => inicioMin < o.fim && fimMin > o.inicio);
    const passouHoje = dataHoje && (new Date(`${dataIso}T${horaStr}:00-03:00`).getTime() <= agora.getTime());

    if (foraExpediente) {
      return { horaStr, disponivel: false, bloqueado: true };
    }
    const disponivel = !conflitoBloqueio && !conflitoAtendimento && !passouHoje;
    const bloqueado = conflitoBloqueio || conflitoAtendimento || passouHoje;
    return { horaStr, disponivel, bloqueado };
  });
}