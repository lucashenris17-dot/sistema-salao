'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

function Card({ nome, valor }: { nome: string; valor: number }) {
  return (
    <div className="bg-white rounded-2xl border p-5 shadow-sm">
      <p className="text-sm text-zinc-600">{nome}</p>
      <p className="text-4xl font-bold text-zinc-900 mt-2">{valor}</p>
    </div>
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

  // Buscar próximas solicitações pendentes (status_confirmacao pendente)

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
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
    }
  }

  return (
    <div className="bg-zinc-50 px-4 py-6 md:min-h-screen md:p-6">
      <nav
        aria-label="Acessos principais"
        className="mx-auto flex w-full max-w-md flex-col gap-4 md:hidden"
      >
        <Link
          href="/admin/atendimentos"
          className="flex min-h-24 items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-6 text-xl font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 active:bg-zinc-100"
        >
          <span aria-hidden="true" className="text-3xl">📋</span>
          Atendimentos
        </Link>
        <Link
          href="/admin/clientes"
          className="flex min-h-24 items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-6 text-xl font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 active:bg-zinc-100"
        >
          <span aria-hidden="true" className="text-3xl">👥</span>
          Clientes
        </Link>
        <Link
          href="/admin/procedimentos"
          className="flex min-h-24 items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-6 text-xl font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 active:bg-zinc-100"
        >
          <span aria-hidden="true" className="text-3xl">✂️</span>
          Procedimentos
        </Link>
      </nav>

      <div className="hidden max-w-5xl mx-auto md:block">

        <header className="mb-6">
          <h1 className="text-3xl font-bold text-zinc-900 mb-2">
            ✂️ Salão da Inacia
          </h1>
          <p className="text-zinc-600 mb-2">
            Bom dia, Inacia
          </p>
          <p className="text-zinc-500 text-sm">
            Painel de controle
          </p>
        </header>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card nome="Atendimentos hoje" valor={dados.total} />
          <Card nome="Solicitações pendentes" valor={dados.pendentes} />
          <Card nome="Bloqueios ativos" valor={dados.bloqueios} />
        </div>

        <section className="bg-white rounded-2xl border p-5 mt-6">

          <h2 className="text-xl font-bold text-zinc-900 mb-4">
            Próximos horários
          </h2>

          {proximosHorarios.length === 0 ? (
            <p className="text-zinc-500">
              Nenhum agendamento para hoje
            </p>
          ) : (
            <div className="space-y-3">

              {proximosHorarios.map((item, index) => (
                <div
                  key={item.id}
                  className="border rounded-xl p-4"
                >
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-wide">{new Date(item.horario_agendado || '').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="font-bold text-zinc-900 text-base">{item.clientes?.nome} {item.clientes?.sobrenome}</p>
                  <p className="text-sm text-zinc-600">{item.procedimentos?.nome}</p>
                </div>
              ))}

            </div>
          )}

        </section>

        <div className="mt-6">
          <Link
            href="/admin/atendimentos"
            className="block w-full text-center bg-zinc-900 text-white py-4 rounded-2xl text-base font-semibold shadow-md hover:bg-zinc-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            Ver atendimentos
          </Link>
        </div>

      </div>
    </div>
  );
}
