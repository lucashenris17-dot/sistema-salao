'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function AdminPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [dados, setDados] = useState({
    total: 0,
    aguardando: 0,
    andamento: 0,
    finalizados: 0,
  });

  const [fila, setFila] = useState<any[]>([]);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    const { data, error } = await supabase
      .from('atendimentos')
      .select(`
        id,
        status,
        ordem_fila,
        clientes:cliente_id (
          nome,
          sobrenome
        ),
        procedimentos:procedimento_id (
          nome
        )
      `)
      .order('ordem_fila', { ascending: true });

    if (error) {
      console.log(error);
      return;
    }

    const lista = data || [];

    setDados({
      total: lista.length,
      aguardando: lista.filter((x) => x.status === 'aguardando').length,
      andamento: lista.filter((x) => x.status === 'em_andamento').length,
      finalizados: lista.filter((x) => x.status === 'finalizado').length,
    });

    setFila(
      lista.filter((x) => x.status === 'aguardando').slice(0, 5)
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="max-w-5xl mx-auto">

        <h1 className="text-3xl font-bold text-zinc-900 mb-1">
          Salão Elegance
        </h1>

        <p className="text-zinc-600 mb-8">
          Painel de controle
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <Card nome="Hoje" valor={dados.total} />
          <Card nome="Na fila" valor={dados.aguardando} />
          <Card nome="Atendendo" valor={dados.andamento} />
          <Card nome="Concluídos" valor={dados.finalizados} />

        </div>


        <section className="bg-white rounded-2xl border p-5 mt-6">

          <h2 className="text-xl font-bold text-zinc-900 mb-4">
            Fila atual
          </h2>

          {fila.length === 0 ? (
            <p className="text-zinc-500">
              Nenhum cliente aguardando
            </p>
          ) : (
            <div className="space-y-3">

              {fila.map((item, index) => (
                <div
                  key={item.id}
                  className="border rounded-xl p-4"
                >
                  <p className="font-bold text-zinc-900">
                    {index + 1}º - {item.clientes?.nome} {item.clientes?.sobrenome}
                  </p>

                  <p className="text-zinc-600">
                    {item.procedimentos?.nome}
                  </p>
                </div>
              ))}

            </div>
          )}

        </section>

      </div>
    </main>
  );
}

function Card({ nome, valor }: { nome: string; valor: number }) {
  return (
    <div className="bg-white rounded-2xl border p-5 shadow-sm">

      <p className="text-sm text-zinc-600">
        {nome}
      </p>

      <p className="text-4xl font-bold text-zinc-900 mt-2">
        {valor}
      </p>

    </div>
  );
}