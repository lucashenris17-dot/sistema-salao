"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { AdminIcon } from "./admin-icon";
import styles from "./admin.module.css";

const navigation = [
  { href: "/admin", label: "Início", icon: "home" },
  { href: "/admin/solicitacoes", label: "Solicitações", icon: "inbox" },
  { href: "/admin/atendimentos", label: "Atendimentos", icon: "calendar" },
  { href: "/admin/clientes", label: "Clientes", icon: "users" },
  { href: "/admin/procedimentos", label: "Procedimentos", icon: "scissors" },
  { href: "/admin/bloqueios", label: "Bloqueios", icon: "block" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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

  const paginaAtual = navigation.find((item) => item.href === pathname);

  return (
    <div className={`${styles.shell} min-h-screen`}>
      <a href="#conteudo-admin" className="sr-only z-50 rounded-xl bg-amber-400 p-3 font-semibold text-zinc-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Ir para o conteúdo
      </a>
      <header className="border-b border-zinc-200 bg-white shadow-sm">
        <div className="bg-zinc-900 text-white">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
            <Link href="/admin" onClick={() => setMenuAberto(false)} className="flex min-w-0 items-center gap-3 rounded-xl">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-zinc-900">
                <AdminIcon name="scissors" className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400">Painel administrativo</span>
                <span className="block text-lg font-bold tracking-tight sm:text-xl">Salão da Inácia</span>
              </span>
            </Link>
            <button type="button" onClick={sair} className="hidden min-h-12 items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 md:inline-flex">
              <AdminIcon name="logout" /> Sair
            </button>
            <button type="button" onClick={() => setMenuAberto(!menuAberto)} aria-expanded={menuAberto} aria-controls="navegacao-admin" aria-label={menuAberto ? "Fechar menu" : "Abrir menu"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-3 text-sm font-semibold hover:bg-zinc-800 md:hidden">
              <AdminIcon name={menuAberto ? "close" : "menu"} />
              <span className="hidden min-[360px]:inline">Menu</span>
            </button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex min-h-12 items-center justify-between gap-3 text-sm md:hidden">
            <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-zinc-900">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              {paginaAtual?.label || "Painel"}
            </span>
            {pathname !== "/admin" && (
              <Link href="/admin" onClick={() => setMenuAberto(false)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900">
                <AdminIcon name="back" className="h-4 w-4" /> Voltar ao início
              </Link>
            )}
          </div>
          <nav id="navegacao-admin" aria-label="Navegação administrativa" className={`${menuAberto ? "grid" : "hidden"} grid-cols-2 gap-2 pb-4 md:flex md:flex-wrap md:gap-1 md:py-3`}>
            {navigation.map((item) => {
              const ativo = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} onClick={() => setMenuAberto(false)} aria-current={ativo ? "page" : undefined} className={`flex min-h-12 min-w-0 items-center gap-2 rounded-xl px-3 py-3 text-xs font-semibold transition-colors sm:text-sm ${ativo ? "bg-zinc-900 text-amber-400 shadow-sm" : "bg-zinc-50 text-zinc-600 hover:bg-amber-50 hover:text-zinc-900 md:bg-white"}`}>
                  <AdminIcon name={item.icon} className="h-[18px] w-[18px]" />
                  {item.label}
                </Link>
              );
            })}
            <button type="button" onClick={() => { setMenuAberto(false); sair(); }} className="col-span-2 mt-1 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 md:hidden">
              <AdminIcon name="logout" className="h-[18px] w-[18px]" /> Sair da conta
            </button>
          </nav>
        </div>
      </header>
      <main id="conteudo-admin" tabIndex={-1} className="min-w-0 pb-8 outline-none">
        {children}
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-zinc-500">
        <span className="mx-auto mb-3 block h-0.5 w-8 rounded-full bg-amber-400" />
        Salão da Inácia · Seu dia, bem organizado.
      </footer>
    </div>
  );
}
