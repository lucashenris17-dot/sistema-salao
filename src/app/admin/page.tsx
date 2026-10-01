'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { AdminIcon } from './admin-icon';

function Card({ nome, valor, href, icon, destaque = false, loading = false }: {
  nome: string;
  valor: number;
  href: string;
  icon: string;
  destaque?: boolean;
  loading?: boolean;
}) {
  return (
    <Link href={href} className={`group flex min-h-40 min-w-0 flex-col justify-between rounded-2xl border p-5 shadow-sm transition-colors sm:p-6 ${destaque ? 'border-amber-400 bg-amber-400 hover:bg-amber-300' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${destaque ? 'bg-zinc-900 text-amber-400' : 'bg-zinc-100 text-zinc-600'}`}>
          <AdminIcon name={icon} />
        </span>
        <AdminIcon name="arrow" className="h-5 w-5 text-zinc-600 transition-transform group-hover:translate-x-1" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-700">{nome}</p>
        <p className="shrink-0 text-4xl font-bold tracking-tight text-zinc-900">{loading ? '—' : valor}</p>
      </div>
    </Link>
  );
}

export default function AdminPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [dados, setDados] = useState({
    total: 0,
    pendentes: 0,
    bloqueios: 0,
  });

  const [proximosHorarios, setProximosHorarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Buscar próximas solicitações pendentes (status_confirmacao pendente)

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      // Buscar todos os atendimentos (sem filtro de status_confirmacao para ver tudo)
      const { data, error } = await supabase
        .from('atendimentos')
        .select(`
          id,
          status,
          modo,
          horario_agendado,
          ordem_fila,
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

      const lista = data || [];
      const hoje = new Date().toISOString().slice(0, 10);

      // Filtrar apenas os de hoje
      const listaHoje = lista.filter((x) => {
        if (x.modo === 'agendamento') {
          return x.horario_agendado?.startsWith(hoje);
        }
        return x.criado_em?.startsWith(hoje);
      });

      // Contar por status
      setDados({
        total: listaHoje.length,
        pendentes: listaHoje.filter((x) => x.status === 'aguardando' || (x as any).status_confirmacao === 'pendente').length,
        bloqueios: 0,
      });

      // Contar bloqueios de agenda
      const { data: bloqueiosData, error: bloqueiosErr } = await supabase
        .from('bloqueios_agenda')
        .select('id');

      if (!bloqueiosErr && bloqueiosData) {
        setDados((prev) => ({ ...prev, bloqueios: bloqueiosData.length }));
      }

      // Buscar próximos horários (agendamentos de hoje confirmados ou em andamento)
      const proximos = lista.filter((x) => {
        if (x.modo === 'agendamento' && x.horario_agendado) {
          return x.horario_agendado.startsWith(hoje) &&
                 (x.status === 'confirmado' || x.status === 'em_andamento' || (x as any).status_confirmacao === 'confirmado');
        }
        return false;
      });

      // Ordenar por horário e pegar os 5 próximos
      const ordenados = proximos.sort((a, b) => {
        const aTime = new Date(a.horario_agendado || '').getTime();
        const bTime = new Date(b.horario_agendado || '').getTime();
        return aTime - bTime;
      });

      setProximosHorarios(ordenados.slice(0, 5));

    } catch (err) {
      console.log(err);
      setErro('Não foi possível carregar o resumo. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            <span className="h-1.5 w-6 rounded-full bg-amber-400" /> Visão geral
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">Olá, Inácia.</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">Seu salão e os compromissos do dia, em um só lugar.</p>
        </div>
        <Link href="/admin/atendimentos" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800">
          <AdminIcon name="calendar" /> Abrir atendimentos
        </Link>
      </header>

      {erro && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p>{erro}</p>
          <button type="button" onClick={carregar} className="min-h-12 rounded-xl border border-red-200 bg-white px-4 font-semibold">Tentar novamente</button>
        </div>
      )}

      <section aria-label="Resumo do salão" aria-busy={loading} className="grid gap-4 sm:grid-cols-3">
        <Card nome="Solicitações pendentes" valor={dados.pendentes} href="/admin/solicitacoes" icon="inbox" destaque loading={loading || !!erro} />
        <Card nome="Atendimentos do dia" valor={dados.total} href="/admin/atendimentos" icon="calendar" loading={loading || !!erro} />
        <Card nome="Bloqueios da agenda" valor={dados.bloqueios} href="/admin/bloqueios" icon="block" loading={loading || !!erro} />
      </section>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6" aria-busy={loading}>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">Agenda de hoje</p>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">Próximos atendimentos</h2>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-zinc-900">
              <AdminIcon name="clock" />
            </span>
          </div>

          {loading ? (
            <div role="status" className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
              <span className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
              Carregando os horários...
            </div>
          ) : erro ? (
            <p className="rounded-xl bg-zinc-50 p-6 text-sm text-zinc-500">Os horários aparecerão aqui quando o resumo for carregado.</p>
          ) : proximosHorarios.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zinc-400 shadow-sm"><AdminIcon name="calendar" className="h-6 w-6" /></span>
              <p className="font-semibold text-zinc-900">Nenhum agendamento para hoje</p>
              <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-zinc-500">Acesse os atendimentos para acompanhar sua agenda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {proximosHorarios.map((item) => (
                <Link key={item.id} href="/admin/atendimentos" className="group flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200 p-3 transition-colors hover:border-amber-400 hover:bg-amber-50/40 sm:gap-4 sm:p-4">
                  <div className="flex w-[72px] shrink-0 flex-col items-center justify-center rounded-xl bg-zinc-900 px-2 py-3 text-white">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Horário</span>
                    <span className="mt-1 text-lg font-bold tabular-nums">{new Date(item.horario_agendado || '').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-base font-bold text-zinc-900">{item.clientes?.nome} {item.clientes?.sobrenome}</p>
                    <p className="mt-1 break-words text-sm text-zinc-500">{item.procedimentos?.nome}</p>
                    {item.procedimentos?.duracao_estimada_min && <p className="mt-2 text-xs font-medium text-zinc-500">{item.procedimentos.duracao_estimada_min} minutos</p>}
                  </div>
                  <AdminIcon name="arrow" className="hidden h-4 w-4 text-zinc-400 sm:block" />
                </Link>
              ))}
            </div>
          )}
          <Link href="/admin/atendimentos" className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50">
            Ver todos os atendimentos <AdminIcon name="arrow" className="h-4 w-4" />
          </Link>
        </section>

        <section className="min-w-0 space-y-4" aria-labelledby="acessos-titulo">
          <div className="px-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">Tudo à mão</p>
            <h2 id="acessos-titulo" className="text-xl font-bold tracking-tight text-zinc-900">Cuide do seu salão</h2>
          </div>
          <nav aria-label="Acessos principais" className="grid gap-3">
            {[
              { href: '/admin/clientes', nome: 'Clientes', descricao: 'Contatos e cadastro de clientes', icon: 'users' },
              { href: '/admin/procedimentos', nome: 'Procedimentos', descricao: 'Serviços, duração e disponibilidade', icon: 'scissors' },
              { href: '/admin/bloqueios', nome: 'Bloqueios', descricao: 'Consulte e organize suas pausas', icon: 'block' },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="group flex min-h-24 min-w-0 items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-400 sm:p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 group-hover:bg-amber-100"><AdminIcon name={item.icon} className="h-6 w-6" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-zinc-900">{item.nome}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.descricao}</p>
                </div>
                <AdminIcon name="arrow" className="h-4 w-4 text-zinc-400" />
              </Link>
            ))}
          </nav>
          <Link href="/admin/solicitacoes" className="flex min-h-20 items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-zinc-900 sm:p-5">
            <div className="min-w-0">
              <p className="text-sm font-bold">Novos pedidos de horário</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">Revise e responda às solicitações.</p>
            </div>
            <AdminIcon name="arrow" />
          </Link>
        </section>
      </div>
    </div>
  );
}
