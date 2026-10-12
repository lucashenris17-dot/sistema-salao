'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { AdminIcon } from './admin-icon';

// ─── Tipos locais ────────────────────────────────────────────────────────────

type AtendimentoDia = {
  id: string;
  status: string;
  status_confirmacao: string | null;
  modo: string;
  horario_agendado: string | null;
  criado_em: string | null;
  // O Supabase pode retornar array ou objeto dependendo da versão do client
  clientes: { nome: string; sobrenome: string } | { nome: string; sobrenome: string }[] | null;
  procedimentos:
    | { nome: string; duracao_estimada_min: number | null }
    | { nome: string; duracao_estimada_min: number | null }[]
    | null;
};

type ResumoDia = {
  aguardando: number;
  em_andamento: number;
  pausado: number;
  finalizado: number;
  cancelado: number;
};

type Periodo = 'hoje' | 'semana' | 'mes' | 'personalizado';

type ResumoSalao = {
  periodo: Periodo;
  clientesAtendidos: number;
  procedimentos: Record<string, number>;
};

// ─── Fim de período (início do dia seguinte) ──────────────────────────────────

function fimPeriodo(periodo: Periodo, base: Date): Date {
  const d = new Date(base.toLocaleString('en-US', { timeZone: 'America/Recife' }));
  d.setHours(0, 0, 0, 0);
  switch (periodo) {
    case 'hoje':
      d.setDate(d.getDate() + 1);
      return d;
    case 'semana':
      // Domingo como fim de semana
      while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
      d.setDate(d.getDate() + 1);
      return d;
    case 'mes':
      d.setMonth(d.getMonth() + 1, 1);
      return d;
    default:
      return d;
  }
}

function inicioPeriodo(periodo: Periodo, base: Date): Date {
  const d = new Date(base.toLocaleString('en-US', { timeZone: 'America/Recife' }));
  d.setHours(0, 0, 0, 0);
  switch (periodo) {
    case 'hoje':
      return d;
    case 'semana':
      while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
      return d;
    case 'mes':
      d.setDate(1);
      return d;
    default:
      return d;
  }
}

// ─── Componente de card numérico ─────────────────────────────────────────────

function Card({
  nome,
  valor,
  href,
  icon,
  destaque = false,
  loading = false,
}: {
  nome: string;
  valor: number;
  href: string;
  icon: string;
  destaque?: boolean;
  loading?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex min-h-36 min-w-0 flex-col justify-between rounded-2xl border p-5 shadow-sm transition-colors sm:p-6 ${
        destaque
          ? 'border-amber-400 bg-amber-400 hover:bg-amber-300'
          : 'border-zinc-200 bg-white hover:border-zinc-400'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            destaque ? 'bg-zinc-900 text-amber-400' : 'bg-zinc-100 text-zinc-600'
          }`}
        >
          <AdminIcon name={icon} />
        </span>
        <AdminIcon
          name="arrow"
          className="h-5 w-5 text-zinc-600 transition-transform group-hover:translate-x-1"
        />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-700">{nome}</p>
        <p className="shrink-0 text-4xl font-bold tracking-tight text-zinc-900">
          {loading ? '—' : valor}
        </p>
      </div>
    </Link>
  );
}

// ─── Helpers para normalizar relações do Supabase (array ou objeto) ──────────

function resolverCliente(
  clientes: AtendimentoDia['clientes']
): { nome: string; sobrenome: string } | null {
  if (!clientes) return null;
  if (Array.isArray(clientes)) return clientes[0] ?? null;
  return clientes;
}

function resolverProcedimento(
  procedimentos: AtendimentoDia['procedimentos']
): { nome: string; duracao_estimada_min: number | null } | null {
  if (!procedimentos) return null;
  if (Array.isArray(procedimentos)) return procedimentos[0] ?? null;
  return procedimentos;
}

// ─── Hora atual (atualiza a cada minuto) ─────────────────────────────────────

function HoraAtual() {
  const [hora, setHora] = useState(() =>
    new Date().toLocaleTimeString('pt-BR', {
      timeZone: 'America/Recife',
      hour: '2-digit',
      minute: '2-digit',
    })
  );

  useEffect(() => {
    const tick = () =>
      setHora(
        new Date().toLocaleTimeString('pt-BR', {
          timeZone: 'America/Recife',
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return <span className="tabular-nums">{hora}</span>;
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AdminPage() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [dados, setDados] = useState({ total: 0, pendentes: 0, bloqueios: 0 });
  const [resumoDia, setResumoDia] = useState<ResumoDia>({
    aguardando: 0,
    em_andamento: 0,
    pausado: 0,
    finalizado: 0,
    cancelado: 0,
  });
  const [proximosHorarios, setProximosHorarios] = useState<AtendimentoDia[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [resumoSalao, setResumoSalao] = useState<ResumoSalao | null>(null);
  const [loadingResumo, setLoadingResumo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // ─── Resumo de gestão do salão (por período) ──────────────────────────────────

function carregarResumoSalao(
  supabase: any,
  periodo: Periodo
): Promise<ResumoSalao | null> {
  const inicio = inicioPeriodo(periodo, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Recife' })));
  const fim = fimPeriodo(periodo, new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Recife' })));

  return supabase
    .from('atendimentos')
    .select(`
      status,
      clientes:cliente_id ( id ),
      procedimentos:procedimento_id ( nome )
    `)
    .gte('criado_em', inicio.toISOString())
    .lt('criado_em', fim.toISOString())
    .then(({ data, error }: { data: any[] | null; error: any }) => {
      if (error) {
        console.log(error);
        return null;
      }

      const lista = data || [];
      const finalizados = lista.filter((x: any) => x.status === 'finalizado');

      const clienteIds = new Set(
        finalizados
          .map((x: any) =>
            Array.isArray(x.clientes) ? x.clientes[0]?.id : x.clientes?.id
          )
          .filter(Boolean)
      );

      const procedimentos: Record<string, number> = {};
      finalizados.forEach((x: any) => {
        const proc = Array.isArray(x.procedimentos)
          ? x.procedimentos[0]
          : x.procedimentos;
        const nome = proc?.nome || 'Outros';
        procedimentos[nome] = (procedimentos[nome] || 0) + 1;
      });

      return {
        periodo,
        clientesAtendidos: clienteIds.size,
        procedimentos,
      };
    });
}

const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase
        .from('atendimentos')
        .select(`
          id,
          status,
          status_confirmacao,
          modo,
          horario_agendado,
          criado_em,
          clientes:cliente_id (
            nome,
            sobrenome
          ),
          procedimentos:procedimento_id (
            nome,
            duracao_estimada_min
          )
        `)
        .order('criado_em', { ascending: false });

      if (error) {
        console.log(error);
        setErro('Não foi possível carregar o resumo. Tente novamente.');
        return;
      }

      const lista = (data || []) as AtendimentoDia[];
      const hoje = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Recife',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      // ── Atendimentos de hoje ──────────────────────────────────────────────
      const listaHoje = lista.filter((x) => {
        if (x.modo === 'agendamento') return x.horario_agendado?.startsWith(hoje);
        return x.criado_em?.startsWith(hoje);
      });

      // ── Resumo de status do dia (todos os status, para telinha) ──────────
      const contarStatus = (s: string) => listaHoje.filter((x) => x.status === s).length;
      setResumoDia({
        aguardando: contarStatus('aguardando'),
        em_andamento: contarStatus('em_andamento'),
        pausado: contarStatus('pausado'),
        finalizado: contarStatus('finalizado'),
        cancelado: contarStatus('cancelado'),
      });

      // ── Pendentes de confirmação (todas as datas) ─────────────────────────
      const totalPendentes = lista.filter(
        (x) => x.status_confirmacao === 'pendente'
      ).length;

      // ── Operacionais do dia (ainda falta acontecer) ───────────────────────
      const statusOperacionais = ['aguardando', 'em_andamento', 'pausado'];
      const totalOperacional = listaHoje.filter((x) =>
        statusOperacionais.includes(x.status)
      ).length;

      setDados({ total: totalOperacional, pendentes: totalPendentes, bloqueios: 0 });

      // ── Bloqueios de agenda ───────────────────────────────────────────────
      const { data: bloqueiosData, error: bloqueiosErr } = await supabase
        .from('bloqueios_agenda')
        .select('id');

      if (!bloqueiosErr && bloqueiosData) {
        setDados((prev) => ({ ...prev, bloqueios: bloqueiosData.length }));
      }

      // ── Próximos horários: aguardando ou em_andamento, confirmados, de hoje
      const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Recife' })).getTime();
      const proximos = lista
        .filter((x) => {
          if (x.modo !== 'agendamento' || !x.horario_agendado) return false;
          return (
            x.horario_agendado.startsWith(hoje) &&
            (x.status === 'aguardando' || x.status === 'em_andamento') &&
            x.status_confirmacao === 'confirmado' &&
            new Date(x.horario_agendado).getTime() >= agora - 30 * 60 * 1000 // até 30 min atrás
          );
        })
        .sort(
          (a, b) =>
            new Date(a.horario_agendado!).getTime() -
            new Date(b.horario_agendado!).getTime()
        )
        .slice(0, 6);

      setProximosHorarios(proximos);

      // ── Resumo de gestão do salão (por período) ──────────────────────────
      const resumo = await carregarResumoSalao(supabase, periodo);
      setResumoSalao(resumo);
      setLoadingResumo(false);
    } catch (err) {
      console.log(err);
      setErro('Não foi possível carregar o resumo. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [supabase, periodo]);

  useEffect(() => {
    carregar();

    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atendimentos' },
        () => { carregar(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, carregar]);

  // Data de hoje formatada
  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Recife',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  // Próximo atendimento (o primeiro da lista ordenada)
  const proximo = proximosHorarios[0] ?? null;
  const demais = proximosHorarios.slice(1);

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            <span className="h-1.5 w-6 rounded-full bg-amber-400" />
            <HoraAtual /> · {dataHoje}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Olá, Inácia.
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
            Central operacional do salão — tudo do dia, em um só lugar.
          </p>
        </div>
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-500">
          <AdminIcon name="calendar" className="h-4 w-4" />
          Agenda do dia
        </span>
      </header>

      {/* ── Erro ─────────────────────────────────────────────────────────── */}
      {erro && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{erro}</p>
          <button
            type="button"
            onClick={carregar}
            className="min-h-12 rounded-xl border border-red-200 bg-white px-4 font-semibold"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Cards de resumo ───────────────────────────────────────────────── */}
      <section aria-label="Resumo operacional" aria-busy={loading} className="grid gap-4 sm:grid-cols-3">
        <Card
          nome="Solicitações pendentes"
          valor={dados.pendentes}
          href="/admin/solicitacoes"
          icon="inbox"
          destaque
          loading={loading || !!erro}
        />
        <Card
          nome="Atendimentos do dia"
          valor={dados.total}
          href="/admin/atendimentos"
          icon="calendar"
          loading={loading || !!erro}
        />
        <Card
          nome="Bloqueios da agenda"
          valor={dados.bloqueios}
          href="/admin/bloqueios"
          icon="block"
          loading={loading || !!erro}
        />
      </section>

      {/* ── Grid principal ────────────────────────────────────────────────── */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">

        {/* ── Coluna esquerda: agenda do dia ──────────────────────────────── */}
        <section
          className="min-w-0 rounded-2xl border border-zinc-200 bg-white shadow-sm"
          aria-busy={loading}
          aria-labelledby="agenda-titulo"
        >
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 sm:px-6">
            <div>
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Agenda de hoje
              </p>
              <h2
                id="agenda-titulo"
                className="text-lg font-bold tracking-tight text-zinc-900"
              >
                Próximos atendimentos
              </h2>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-zinc-900">
              <AdminIcon name="clock" />
            </span>
          </div>

          <div className="p-4 sm:p-6">
            {loading ? (
              <div
                role="status"
                className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500"
              >
                <span className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
                Carregando horários...
              </div>
            ) : erro ? (
              <p className="rounded-xl bg-zinc-50 p-6 text-sm text-zinc-500">
                Os horários aparecerão aqui quando o resumo for carregado.
              </p>
            ) : proximosHorarios.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zinc-400 shadow-sm">
                  <AdminIcon name="calendar" className="h-6 w-6" />
                </span>
                <p className="font-semibold text-zinc-900">Nenhum agendamento para hoje</p>
                <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-zinc-500">
                  Acesse os atendimentos para acompanhar a fila presencial.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Próximo em destaque */}
                {proximo && (
                  <Link
                    href="/admin/atendimentos"
                    className="group flex min-w-0 items-center gap-4 rounded-xl border-2 border-zinc-900 bg-zinc-900 p-4 text-white transition-colors hover:border-amber-400 sm:p-5"
                  >
                    <div className="flex w-[76px] shrink-0 flex-col items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-2 py-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                        Próximo
                      </span>
                      <span className="mt-1 text-xl font-bold tabular-nums text-white">
                        {new Date(proximo.horario_agendado!).toLocaleTimeString('pt-BR', {
                          timeZone: 'America/Recife',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-base font-bold text-white">
                        {[resolverCliente(proximo.clientes)?.nome, resolverCliente(proximo.clientes)?.sobrenome]
                          .filter(Boolean)
                          .join(' ') || 'Cliente não informado'}
                      </p>
                      <p className="mt-0.5 break-words text-sm text-zinc-400">
                        {resolverProcedimento(proximo.procedimentos)?.nome || 'Procedimento não informado'}
                      </p>
                      {resolverProcedimento(proximo.procedimentos)?.duracao_estimada_min && (
                        <p className="mt-2 text-xs font-medium text-zinc-500">
                          {resolverProcedimento(proximo.procedimentos)!.duracao_estimada_min!} min
                          {proximo.status === 'em_andamento' && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-900/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              Em andamento
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <AdminIcon
                      name="arrow"
                      className="hidden h-4 w-4 shrink-0 text-zinc-500 transition-transform group-hover:translate-x-1 sm:block"
                    />
                  </Link>
                )}

                {/* Demais horários do dia */}
                {demais.length > 0 && (
                  <div className="space-y-2">
                    {demais.map((item) => (
                      <Link
                        key={item.id}
                        href="/admin/atendimentos"
                        className="group flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200 p-3 transition-colors hover:border-amber-400 hover:bg-amber-50/40 sm:gap-4 sm:p-4"
                      >
                        <div className="flex w-[64px] shrink-0 flex-col items-center justify-center rounded-xl bg-zinc-100 px-2 py-2.5 text-zinc-900">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Horário
                          </span>
                          <span className="mt-0.5 text-base font-bold tabular-nums">
                            {new Date(item.horario_agendado!).toLocaleTimeString('pt-BR', {
                              timeZone: 'America/Recife',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-bold text-zinc-900">
                            {[resolverCliente(item.clientes)?.nome, resolverCliente(item.clientes)?.sobrenome]
                              .filter(Boolean)
                              .join(' ') || 'Cliente não informado'}
                          </p>
                          <p className="mt-0.5 break-words text-xs text-zinc-500">
                            {resolverProcedimento(item.procedimentos)?.nome || 'Procedimento não informado'}
                            {resolverProcedimento(item.procedimentos)?.duracao_estimada_min
                              ? ` · ${resolverProcedimento(item.procedimentos)!.duracao_estimada_min!} min`
                              : ''}
                          </p>
                        </div>
                        <AdminIcon
                          name="arrow"
                          className="hidden h-4 w-4 shrink-0 text-zinc-400 sm:block"
                        />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Link
              href="/admin/atendimentos"
              className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
            >
              Ver todos os atendimentos <AdminIcon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>

      {/* ── Resumo do salão ────────────────────────────────────────────────── */}
      <section
        aria-labelledby="resumo-salao-titulo"
        aria-busy={loadingResumo}
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Gestão do salão
            </p>
            <h2
              id="resumo-salao-titulo"
              className="text-base font-bold tracking-tight text-zinc-900"
            >
              Resumo do salão
            </h2>
          </div>
          <div
            role="group"
            aria-label="Período do resumo"
            className="inline-flex w-full overflow-hidden rounded-xl border border-zinc-200 sm:w-auto"
          >
            {(['hoje', 'semana', 'mes'] as Periodo[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                aria-pressed={periodo === p}
                className={`min-h-11 flex-1 px-3 py-2 text-xs font-semibold transition-colors sm:flex-none sm:px-4 ${
                  periodo === p
                    ? 'bg-zinc-900 text-amber-400'
                    : 'bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Esta semana' : 'Este mês'}
              </button>
            ))}
          </div>
        </div>

        {loadingResumo ? (
          <div
            role="status"
            className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500"
          >
            <span className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
            Carregando indicadores...
          </div>
        ) : !resumoSalao ? (
          <p className="rounded-xl bg-zinc-50 p-6 text-sm text-zinc-500">
            Não foi possível carregar os indicadores do período.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Clientes atendidos
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-zinc-900">
                  {resumoSalao.clientesAtendidos}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Procedimentos
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-zinc-900">
                  {Object.values(resumoSalao.procedimentos).reduce(
                    (a, b) => a + b,
                    0
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Finalizados
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-zinc-900">
                  {resumoDia.finalizado}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Cancelados
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-zinc-900">
                  {resumoDia.cancelado}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Procedimentos realizados
              </p>
              {Object.keys(resumoSalao.procedimentos).length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
                  Nenhum procedimento finalizado no período.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.entries(resumoSalao.procedimentos)
                    .sort((a, b) => b[1] - a[1])
                    .map(([nome, qtd]) => (
                      <div
                        key={nome}
                        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
                      >
                        <span className="min-w-0 truncate text-sm font-medium text-zinc-700">
                          {nome}
                        </span>
                        <span className="shrink-0 inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-900">
                          {qtd}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
