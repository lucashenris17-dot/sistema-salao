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
  if (iso.includes('T')) {
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return null;
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(data);
    const hora = Number(partes.find((parte) => parte.type === 'hour')?.value);
    const minuto = Number(partes.find((parte) => parte.type === 'minute')?.value);
    return Number.isFinite(hora) && Number.isFinite(minuto) ? hora * 60 + minuto : null;
  }
  const ts = iso;
  const [h, m] = ts.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function dataTimestampSalao(iso: string): string | null {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
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
  data_inicio?: string | null;
  data_fim?: string | null;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  inicio?: string | null;
  fim?: string | null;
}

/** Formato de um atendimento ocupado usado no cálculo da grade. */
export interface OcupadoGrade {
  horario_agendado?: string | null;
  procedimentos?: { duracao_estimada_min?: number } | null;
  procedimento_duracao_total_min?: number;
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
    const dur = a.procedimento_duracao_total_min || a.procedimentos?.duracao_estimada_min || 30;
    return [{ inicio, fim: inicio + dur }];
  });

  const bloqueiosMin = (bloqueios || []).flatMap((b, indice) => {
    const tipoDB = b.tipo || null;
    const tipo = tipoDB || (b.inicio && b.fim && b.inicio.substring(0, 10) === b.fim.substring(0, 10)
      ? 'especifico' : 'semanal_fixo');

    function avaliar(diaBate: boolean, horaIni: string | null, horaFim: string | null) {
      const iniMin = timestampParaMinutosSalao(horaIni);
      const fimMin = timestampParaMinutosSalao(horaFim);
      const aplicado = diaBate && iniMin !== null && fimMin !== null;
      return aplicado && iniMin !== null && fimMin !== null
        ? [{ inicio: iniMin, fim: fimMin, indice, tipo, dias_semana: b.dias_semana, hora_inicio: b.hora_inicio, hora_fim: b.hora_fim }]
        : [];
    }

    if (tipo === 'especifico' || tipo === 'temporario') {
      const dataInicioBloqueio = b.data_inicio || (b.inicio ? dataTimestampSalao(b.inicio) : null);
      const dataFimBloqueio = tipo === 'temporario'
        ? b.data_fim || (b.fim ? dataTimestampSalao(b.fim) : dataInicioBloqueio)
        : dataInicioBloqueio;
      const diaBate = Boolean(dataInicioBloqueio && dataFimBloqueio &&
        dataIso >= dataInicioBloqueio && dataIso <= dataFimBloqueio);
      return avaliar(
        diaBate,
        b.hora_inicio || (b.inicio ? b.inicio.split('T')[1]?.substring(0, 5) || b.inicio.substring(11, 16) : null),
        b.hora_fim || (b.fim ? b.fim.split('T')[1]?.substring(0, 5) || b.fim.substring(11, 16) : null),
      );
    }

    const diasSemanaRule = b.dias_semana || null;
    const horaIni = b.hora_inicio || (b.inicio ? b.inicio.split('T')[1]?.substring(0, 5) : null);
    const horaFim = b.hora_fim || (b.fim ? b.fim.split('T')[1]?.substring(0, 5) : null);
    const diaMatch = !diasSemanaRule ||
      (Array.isArray(diasSemanaRule) ? diasSemanaRule.includes(diaSemana) : diasSemanaRule === diaSemana);
    return avaliar(diaMatch, horaIni || null, horaFim || null);
  }).filter(Boolean) as {
    inicio: number;
    fim: number;
    indice: number;
    tipo: string;
    dias_semana?: number[] | null;
    hora_inicio?: string | null;
    hora_fim?: string | null;
  }[];

  const hojeStr = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
  const dataHoje = dataIso === hojeStr;

  return grade.map((horaStr) => {
    const inicioMin = horarioParaMinutos(horaStr);
    const fimMin = inicioMin + duracaoMin;
    const foraExpediente = inicioMin < 8 * 60 || inicioMin > 19 * 60;
    // O início do bloqueio é exclusivo para permitir que um atendimento termine
    // nesse limite; o fim é inclusivo, pois um atendimento não pode começar
    // exatamente no horário final do bloqueio.
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