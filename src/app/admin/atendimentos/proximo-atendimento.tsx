'use client';

import { useEffect, useState } from 'react';
import { AdminIcon } from '../admin-icon';
import type { AtendimentoListItem } from './page';

export function selecionarProximoAtendimento(
  atendimentos: AtendimentoListItem[],
  agora: number,
) {
  return atendimentos
    .filter((atendimento) =>
      atendimento.status === 'aguardando' &&
      atendimento.modo === 'agendamento' &&
      atendimento.status_confirmacao === 'confirmado' &&
      atendimento.horario_agendado &&
      new Date(atendimento.horario_agendado).getTime() > agora
    )
    .sort((a, b) =>
      new Date(a.horario_agendado!).getTime() -
      new Date(b.horario_agendado!).getTime()
    )[0];
}

export default function ProximoAtendimento({
  atendimentos,
  loading,
}: {
  atendimentos: AtendimentoListItem[];
  loading: boolean;
}) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const atualizarHorario = () => setAgora(Date.now());
    // Atualiza o destaque quando o horário passa, mesmo sem alterações na lista.
    const intervalo = window.setInterval(atualizarHorario, 1000);
    window.addEventListener('focus', atualizarHorario);

    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', atualizarHorario);
    };
  }, []);

  const proximo = selecionarProximoAtendimento(atendimentos, agora);
  const horario = proximo?.horario_agendado
    ? new Date(proximo.horario_agendado)
    : null;

  return (
    <section
      aria-labelledby="proximo-atendimento-titulo"
      aria-busy={loading}
      className="mb-6 min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-white shadow-sm sm:p-6"
    >
      <h2
        id="proximo-atendimento-titulo"
        className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400"
      >
        <AdminIcon name="clock" className="h-4 w-4" />
        Próximo atendimento
      </h2>

      {loading ? (
        <p className="text-sm text-zinc-300">Carregando próximo atendimento...</p>
      ) : proximo && horario ? (
        <div className="flex flex-col items-start justify-between gap-4 min-[400px]:flex-row min-[400px]:items-center">
          <div className="w-full min-w-0 flex-1">
            <p className="break-words text-xl font-bold tracking-tight text-white sm:text-2xl">
              {[proximo.clientes?.nome, proximo.clientes?.sobrenome]
                .filter(Boolean).join(' ') || 'Cliente não informado'}
            </p>
            <p className="mt-2 break-words text-sm text-zinc-300">
              {proximo.procedimentos?.nome || 'Procedimento não informado'}
            </p>
          </div>
          <time
            dateTime={proximo.horario_agendado}
            className="w-full shrink-0 rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-3 text-center text-white min-[400px]:w-auto"
          >
            <span className="block text-3xl font-bold tracking-tight tabular-nums text-amber-400">
              {horario.toLocaleTimeString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="mt-1 block text-xs font-medium text-zinc-300">
              {horario.toLocaleDateString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </span>
          </time>
        </div>
      ) : (
        <p className="text-sm text-zinc-300">
          Nenhum agendamento futuro aguardando.
        </p>
      )}
    </section>
  );
}
