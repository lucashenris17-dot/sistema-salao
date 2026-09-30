'use client';

import { useEffect, useState } from 'react';
import type { AtendimentoListItem } from './page';

export function selecionarProximoAtendimento(
  atendimentos: AtendimentoListItem[],
  agora: number,
) {
  return atendimentos
    .filter((atendimento) =>
      atendimento.status === 'aguardando' &&
      atendimento.modo === 'agendamento' &&
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
      className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm"
    >
      <h2
        id="proximo-atendimento-titulo"
        className="mb-3 text-sm font-semibold text-blue-800"
      >
        Próximo atendimento
      </h2>

      {loading ? (
        <p className="text-sm text-gray-600">Carregando próximo atendimento...</p>
      ) : proximo && horario ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-lg font-semibold text-gray-900">
              {[proximo.clientes?.nome, proximo.clientes?.sobrenome]
                .filter(Boolean).join(' ') || 'Cliente não informado'}
            </p>
            <p className="mt-1 break-words text-sm text-gray-700">
              {proximo.procedimentos?.nome || 'Procedimento não informado'}
            </p>
          </div>
          <time
            dateTime={proximo.horario_agendado}
            className="shrink-0 rounded-lg bg-white px-3 py-2 text-center text-blue-800"
          >
            <span className="block text-xl font-bold tabular-nums">
              {horario.toLocaleTimeString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="block text-xs">
              {horario.toLocaleDateString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
              })}
            </span>
          </time>
        </div>
      ) : (
        <p className="text-sm text-gray-600">
          Nenhum agendamento futuro aguardando.
        </p>
      )}
    </section>
  );
}
