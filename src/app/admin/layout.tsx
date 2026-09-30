"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50">

      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">

          <h1 className="text-xl font-bold text-zinc-900 md:mb-3">
            ✂️ Salão da Inacia
          </h1>

          {pathname !== "/admin" && (
            <Link
              href="/admin"
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
            >
              <span aria-hidden="true">←</span>
              Voltar ao início
            </Link>
          )}

          {/* Mobile: botão menu + links colapsáveis */}
          <div className="md:hidden mt-3">
            <button
              type="button"
              onClick={() => setMenuAberto(!menuAberto)}
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuAberto}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
            >
              <span aria-hidden="true">☰</span>
              <span>Menu</span>
            </button>

            {menuAberto && (
              <nav aria-label="Menu mobile" className="mt-3 flex flex-col gap-2 rounded-xl border bg-white p-3 shadow-lg">
                <Link href="/admin" onClick={() => setMenuAberto(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100">
                  <span aria-hidden="true">🏠</span> Início
                </Link>
                <Link href="/admin/atendimentos" onClick={() => setMenuAberto(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100">
                  <span aria-hidden="true">📋</span> Atendimentos
                </Link>
                <Link href="/admin/clientes" onClick={() => setMenuAberto(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100">
                  <span aria-hidden="true">👥</span> Clientes
                </Link>
                <Link href="/admin/procedimentos" onClick={() => setMenuAberto(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100">
                  <span aria-hidden="true">✂️</span> Procedimentos
                </Link>
                <Link href="/admin/bloqueios" onClick={() => setMenuAberto(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100">
                  <span aria-hidden="true">🚫</span> Bloqueios
                </Link>
                <button type="button" onClick={() => { setMenuAberto(false); sair(); }} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white bg-red-500 hover:bg-red-600">
                  <span aria-hidden="true">🚪</span> Sair
                </button>
              </nav>
            )}
          </div>

          {/* Desktop: links visíveis (inalterado) */}
          <nav
            aria-label="Menu superior"
            className="hidden flex-wrap gap-2 py-1 md:flex"
          >
            <Link
              href="/admin"
              className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
            >
              <span aria-hidden="true">🏠</span>
              <span>Início</span>
            </Link>
            <Link
              href="/admin/atendimentos"
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
            >
              <span aria-hidden="true">📋</span>
              <span>Atendimentos</span>
            </Link>
            <Link
              href="/admin/clientes"
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
            >
              <span aria-hidden="true">👥</span>
              <span>Clientes</span>
            </Link>
            <Link
              href="/admin/procedimentos"
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
            >
              <span aria-hidden="true">✂️</span>
              <span>Procedimentos</span>
            </Link>
            <Link
              href="/admin/bloqueios"
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
            >
              <span aria-hidden="true">🚫</span>
              <span>Bloqueios</span>
            </Link>
            <button
              type="button"
              onClick={sair}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-700"
            >
              <span aria-hidden="true">🚪</span>
              <span>Sair</span>
            </button>
          </nav>

        </div>
      </header>

      <main>
        {children}
      </main>

    </div>
  );
}
