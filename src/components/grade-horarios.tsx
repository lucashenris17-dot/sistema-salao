'use client';

import { gerarGradeHorarios, horarioParaMinutos } from '@/lib/horarios';

export interface HorarioOpcao {
  horaStr: string;
  disponivel: boolean;
  bloqueado: boolean;
}

interface GradeHorariosProps {
  /** Horários já calculados (ou, se omitido, gera a grade padrão 08:00–19:00). */
  opcoes: HorarioOpcao[];
  /** Horário atualmente selecionado (HH:MM). */
  valor: string;
  /** Chamado ao selecionar um horário disponível. */
  aoSelecionar: (hora: string) => void;
  /** Classes CSS adicionais no contêiner. */
  className?: string;
}

/**
 * Grade de horários padronizada: cards de 30 em 30 min, de 08:00 às 19:00.
 * Horários indisponíveis aparecem em vermelho e não são clicáveis — igual à
 * experiência do cliente em `/agendar`.
 */
export default function GradeHorarios({
  opcoes,
  valor,
  aoSelecionar,
  className = '',
}: GradeHorariosProps) {
  const grade = opcoes.length > 0 ? opcoes : gerarGradeHorarios().map((h) => ({ horaStr: h, disponivel: true, bloqueado: false }));

  return (
    <div className={`grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto p-1 ${className}`}>
      {grade.map((op) => {
        const selecionado = valor === op.horaStr;
        const desabilitado = !op.disponivel || op.bloqueado;

        if (desabilitado && !selecionado) {
          return (
            <button
              key={op.horaStr}
              type="button"
              disabled
              className="py-3 px-2 rounded-xl text-center text-sm font-bold border bg-red-50 border-red-200 text-red-400 cursor-not-allowed"
              title="Horário bloqueado ou ocupado"
            >
              {op.horaStr}
            </button>
          );
        }

        return (
          <button
            key={op.horaStr}
            type="button"
            disabled={desabilitado && !selecionado}
            onClick={() => op.disponivel && aoSelecionar(op.horaStr)}
            className={`py-3 px-2 rounded-xl text-center text-sm font-bold border transition-all ${
              selecionado
                ? 'border-zinc-900 bg-zinc-900 text-white shadow-md ring-2 ring-zinc-900'
                : desabilitado
                  ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed'
                  : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 shadow-sm'
            }`}
            title={desabilitado ? 'Horário bloqueado' : ''}
          >
            {op.horaStr}
          </button>
        );
      })}
    </div>
  );
}

export { horarioParaMinutos };