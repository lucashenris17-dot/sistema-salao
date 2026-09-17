import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <p className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Sistema do Salão
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Organização simples para o seu salão
          </h1>

          <p className="mt-3 max-w-2xl text-zinc-600">
            Gerencie atendimentos, clientes e procedimentos em um só lugar.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/login"
            className="group rounded-2xl bg-zinc-900 p-6 text-white shadow-sm transition hover:bg-zinc-800"
          >
            <div className="mb-4 text-3xl">💇</div>

            <h2 className="text-xl font-semibold">
              Área do salão
            </h2>

            <p className="mt-2 text-sm text-zinc-300">
              Entre para gerenciar os atendimentos, clientes e procedimentos.
            </p>

            <div className="mt-5 font-medium">
              Entrar →
            </div>
          </Link>

          <Link
            href="/admin/atendimentos"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow"
          >
            <div className="mb-4 text-3xl">📋</div>

            <h2 className="text-xl font-semibold text-zinc-900">
              Atendimentos
            </h2>

            <p className="mt-2 text-sm text-zinc-600">
              Acompanhe a fila, agendamentos, atendimentos em andamento e pausados.
            </p>

            <div className="mt-5 font-medium text-zinc-900">
              Ver atendimentos →
            </div>
          </Link>

          <Link
            href="/admin/clientes"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow"
          >
            <div className="mb-4 text-3xl">👤</div>

            <h2 className="text-xl font-semibold text-zinc-900">
              Clientes
            </h2>

            <p className="mt-2 text-sm text-zinc-600">
              Cadastre e consulte os clientes do salão.
            </p>

            <div className="mt-5 font-medium text-zinc-900">
              Ver clientes →
            </div>
          </Link>

          <Link
            href="/admin/procedimentos"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow"
          >
            <div className="mb-4 text-3xl">✂️</div>

            <h2 className="text-xl font-semibold text-zinc-900">
              Procedimentos
            </h2>

            <p className="mt-2 text-sm text-zinc-600">
              Configure os serviços oferecidos e suas durações estimadas.
            </p>

            <div className="mt-5 font-medium text-zinc-900">
              Ver procedimentos →
            </div>
          </Link>
        </section>

        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            Como funciona
          </h2>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div>
              <div className="text-2xl">1️⃣</div>
              <h3 className="mt-2 font-medium text-zinc-900">
                Cadastre
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                Cadastre clientes e procedimentos.
              </p>
            </div>

            <div>
              <div className="text-2xl">2️⃣</div>
              <h3 className="mt-2 font-medium text-zinc-900">
                Atenda
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                Inicie, pause, continue e finalize cada atendimento.
              </p>
            </div>

            <div>
              <div className="text-2xl">3️⃣</div>
              <h3 className="mt-2 font-medium text-zinc-900">
                Acompanhe
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                O cliente poderá acompanhar a previsão do atendimento.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}