'use client';
import { formatarWhatsApp, mascaraWhatsApp, validarWhatsApp } from '@/lib/types';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export interface Cliente {
  id: string;
  nome: string;
  sobrenome: string;
  whatsapp: string;
  criado_em: string;
}

export default function ClientesPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [estatisticas, setEstatisticas] = useState<any>({ total: 0, porProcedimento: {} });
  const [periodo, setPeriodo] = useState<'7dias' | '30dias' | 'ano' | 'todos'>('30dias');
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ nome: '', sobrenome: '', whatsapp: '' });

  useEffect(() => {
    fetchClientes();
  }, []);

  async function fetchClientes() {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('clientes')
        .select('*')
        .order('criado_em', { ascending: false });

      if (err) throw err;
      setClientes(data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!formData.nome.trim()) {
      setError('Nome é obrigatório');
      return;
    }

    if (!formData.sobrenome.trim()) {
      setError('Sobrenome é obrigatório');
      return;
    }

    if (!formData.whatsapp.trim()) {
      setError('WhatsApp é obrigatório');
      return;
    }
    const v = validarWhatsApp(formData.whatsapp);
    if (!v.valido) {
      setError(v.mensagem || 'WhatsApp inválido');
      return;
    }

    try {
      if (editingId) {
        const { error: err } = await supabase
          .from('clientes')
          .update({
            nome: formData.nome.trim(),
            sobrenome: formData.sobrenome.trim(),
            whatsapp: v.limpo,
          })
          .eq('id', editingId);

        if (err) throw err;
        setEditingId(null);
      } else {
        const { error: err } = await supabase
          .from('clientes')
          .insert([
            {
              nome: formData.nome.trim(),
              sobrenome: formData.sobrenome.trim(),
              whatsapp: v.limpo,
            },
          ]);

        if (err) throw err;
      }

      setFormData({ nome: '', sobrenome: '', whatsapp: '' });
      setShowForm(false);
      setError(null);
      await fetchClientes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cliente');
    }
  }

  function handleEdit(cliente: Cliente) {
    setFormData({
      nome: cliente.nome,
      sobrenome: cliente.sobrenome,
      whatsapp: cliente.whatsapp,
    });
    setEditingId(cliente.id);
    setShowForm(true);
    setError(null);
  }

  async function carregarHistorico(cliente: Cliente) {
    setLoadingHistorico(true);
    setClienteSelecionado(cliente);
    try {
      const agora = new Date();
      let dataInicio = new Date(agora);
      if (periodo === '7dias') dataInicio.setDate(agora.getDate() - 7);
      else if (periodo === '30dias') dataInicio.setDate(agora.getDate() - 30);
      else if (periodo === 'ano') dataInicio.setMonth(0, 1);
      else dataInicio = new Date('1970-01-01');

      const { data: atendimentos, error } = await supabase
        .from('atendimentos')
        .select(`
          id, status, criado_em, modo,
          procedimentos!procedimento_id ( nome )
        `)
        .eq('cliente_id', cliente.id)
        .eq('status', 'finalizado')
        .gte('criado_em', dataInicio.toISOString())
        .order('criado_em', { ascending: false });

      if (error) throw error;
      const lista = (atendimentos || []) as any[];
      setHistorico(
        lista.map((a: any) => ({
          id: a.id,
          data: a.criado_em ? new Date(a.criado_em).toLocaleDateString('pt-BR') : '--',
          procedimento: a.procedimentos?.nome || '--',
          status: a.status || 'finalizado',
        }))
      );

      const procedimentos: Record<string, number> = {};
      lista.forEach((a: any) => {
        const nome = a.procedimentos?.nome || 'Outros';
        procedimentos[nome] = (procedimentos[nome] || 0) + 1;
      });
      setEstatisticas({ total: lista.length, porProcedimento: procedimentos });
    } catch (e) {
      setHistorico([]);
      setEstatisticas({ total: 0, porProcedimento: {} });
    } finally {
      setLoadingHistorico(false);
    }
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ nome: '', sobrenome: '', whatsapp: '' });
    setError(null);
  }

  const filteredClientes = clientes.filter((cliente) => {
    const query = searchQuery.toLowerCase();
    return (
      cliente.nome.toLowerCase().includes(query) ||
      cliente.sobrenome.toLowerCase().includes(query) ||
      cliente.whatsapp.includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 h-1 w-10 rounded-full bg-amber-400" />
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Clientes</h1>
            <p className="mt-1 text-sm text-zinc-500">Os contatos do salão, sempre por perto.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="min-h-12 flex-1 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 sm:flex-none"
              >
                + Novo cliente
              </button>
            )}
          </div>
        </header>

        {error && (
          <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="break-words text-sm text-red-700">{error}</p>
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
          <label htmlFor="search" className="mb-2 block text-sm font-semibold text-zinc-700">
            Encontre um cliente
          </label>
          <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400">
              <circle cx="10.75" cy="10.75" r="6.75" />
              <path d="m16 16 4 4" strokeLinecap="round" />
            </svg>
            <input
              id="search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nome, sobrenome ou WhatsApp"
              className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-zinc-50 py-3 pl-12 pr-4 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </section>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <div className="mb-6 border-b border-zinc-100 pb-4">
              <h2 className="text-xl font-bold tracking-tight">{editingId ? 'Editar cliente' : 'Novo cliente'}</h2>
              <p className="mt-1 text-sm text-zinc-500">Preencha os dados de contato.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cliente-nome" className="mb-1.5 block text-sm font-medium text-zinc-700">Nome *</label>
              <input
                id="cliente-nome"
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Ex: João"
                required
              />
            </div>

            <div>
              <label htmlFor="cliente-sobrenome" className="mb-1.5 block text-sm font-medium text-zinc-700">Sobrenome *</label>
              <input
                id="cliente-sobrenome"
                type="text"
                value={formData.sobrenome}
                onChange={(e) => setFormData({ ...formData, sobrenome: e.target.value })}
                className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Ex: Silva"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="cliente-whatsapp" className="mb-1.5 block text-sm font-medium text-zinc-700">WhatsApp *</label>
              <input
                id="cliente-whatsapp"
                type="tel"
                value={formData.whatsapp ? mascaraWhatsApp(formData.whatsapp) : ''}
                onChange={(e) => {
                  const limpo = e.target.value.replace(/\D/g, '').slice(0, 11);
                  setFormData({ ...formData, whatsapp: limpo });
                }}
                className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Ex: (87) 9 9845-4566"
                required
              />
            </div>

            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:ml-auto sm:max-w-md">
              <button
                type="submit"
                className="min-h-12 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800"
              >
                {editingId ? 'Salvar alterações' : 'Criar cliente'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="min-h-12 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div role="status" className="rounded-2xl border border-zinc-200 bg-white px-4 py-12 text-center shadow-sm">
            <div aria-hidden="true" className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-amber-400" />
            <p className="text-sm text-zinc-500">Carregando clientes...</p>
          </div>
        ) : filteredClientes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center">
            <p className="font-semibold text-zinc-700">
              {searchQuery ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {searchQuery ? 'Tente outro nome ou número de WhatsApp.' : 'Toque em Novo cliente para começar.'}
            </p>
          </div>
        ) : (
          <section aria-label="Lista de clientes">
            <p className="mb-3 text-sm font-medium text-zinc-500">
              {filteredClientes.length} {filteredClientes.length === 1 ? 'cliente' : 'clientes'}{searchQuery ? ' na busca' : filteredClientes.length === 1 ? ' cadastrado' : ' cadastrados'}
            </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredClientes.map((cliente) => (
              <article
                key={cliente.id}
                className="flex min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
              >
                <div className="mb-5 flex items-start gap-3">
                  <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-base font-bold text-zinc-900">
                    {cliente.nome.slice(0, 1).toUpperCase()}{cliente.sobrenome.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-lg font-bold leading-snug text-zinc-900">
                      {cliente.nome} {cliente.sobrenome}
                    </h3>
                    <p className="mt-2 text-xs font-medium text-zinc-500">WhatsApp</p>
                    <p className="mt-0.5 break-words text-base font-semibold text-zinc-700">{formatarWhatsApp(cliente.whatsapp)}</p>
                  </div>
                </div>

                <div className="mt-auto border-t border-zinc-100 pt-4">
                  <button
                    onClick={() => { setClienteSelecionado(cliente); carregarHistorico(cliente); }}
                    className="min-h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-900 hover:bg-zinc-100"
                  >
                    Ver histórico
                  </button>
                </div>
              </article>
            ))}
          </div>
          </section>
        )}

        {/* Perfil + histórico do cliente selecionado */}
        {clienteSelecionado && (
          <section aria-label="Histórico do cliente" className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-zinc-900">{clienteSelecionado.nome} {clienteSelecionado.sobrenome}</h2>
                <p className="text-sm text-zinc-500">WhatsApp: {formatarWhatsApp(clienteSelecionado.whatsapp)}</p>
              </div>
              <button type="button" onClick={() => setClienteSelecionado(null)} className="min-h-10 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">Fechar</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {(['7dias', '30dias', 'ano', 'todos'] as const).map((p) => (
                <button key={p} type="button" onClick={() => { setPeriodo(p); carregarHistorico(clienteSelecionado); }} aria-pressed={periodo === p} className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${periodo === p ? 'bg-zinc-900 text-amber-400' : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'}`}>
                  {p === '7dias' ? '7 dias' : p === '30dias' ? '30 dias' : p === 'ano' ? 'Este ano' : 'Todos'}
                </button>
              ))}
            </div>

            {loadingHistorico ? (
              <p className="text-sm text-zinc-500">Carregando histórico...</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total</p>
                    <p className="text-2xl font-bold text-zinc-900">{estatisticas.total}</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Primeiro</p>
                    <p className="text-sm font-bold text-zinc-900">{historico.length ? [...historico].map((h: any) => h.data).sort()[0] : '--'}</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Último</p>
                    <p className="text-sm font-bold text-zinc-900">{historico.length ? [...historico].map((h: any) => h.data).sort().pop() : '--'}</p>
                  </div>
                </div>

                <div className="mb-5">
                  <h3 className="text-sm font-bold text-zinc-900 mb-2">Por procedimento</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(estatisticas.porProcedimento || {}).map((entry) => (
                      <span key={String(entry[0])} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{String(entry[0])} <span className="text-amber-700">{String(entry[1])}</span></span>
                    ))}
                    {Object.keys(estatisticas.porProcedimento || {}).length === 0 && <span className="text-xs text-zinc-400">Nenhum procedimento finalizado no período.</span>}
                  </div>
                </div>

                <h3 className="text-sm font-bold text-zinc-900 mb-3">Histórico (finalizados)</h3>
                {historico.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhum atendimento finalizado no período.</p>
                ) : (
                  <div className="space-y-2">
                    {historico.map((item: any) => (
                      <div key={String(item.id)} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3">
                        <div>
                          <p className="text-sm font-bold text-zinc-900">{item.procedimento}</p>
                          <p className="text-xs text-zinc-500">{item.data}</p>
                        </div>
                        <span className="text-xs font-semibold text-emerald-700">{item.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
