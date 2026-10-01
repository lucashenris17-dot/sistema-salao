'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Procedimento } from '@/lib/supabase';
import { AdminIcon } from '../admin-icon';

export default function ProcedimentosPage() {
  const router = useRouter();
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ nome: '', duracao_estimada_min: 0 });

  useEffect(() => {
    fetchProcedimentos();
  }, []);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function fetchProcedimentos() {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('procedimentos')
        .select('*')
        .order('criado_em', { ascending: false });

      if (err) throw err;
      setProcedimentos(data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar procedimentos');
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

  async function handleSubmit(e: any) {
    e.preventDefault();

    if (!formData.nome.trim()) {
      setError('Nome é obrigatório');
      return;
    }

    if (formData.duracao_estimada_min <= 0) {
      setError('Duração deve ser maior que 0');
      return;
    }

    try {
      if (editingId) {
        const { error: err } = await supabase
          .from('procedimentos')
          .update({
            nome: formData.nome,
            duracao_estimada_min: formData.duracao_estimada_min,
          })
          .eq('id', editingId);

        if (err) throw err;
        setEditingId(null);
      } else {
        const { error: err } = await supabase
          .from('procedimentos')
          .insert([
            {
              nome: formData.nome,
              duracao_estimada_min: formData.duracao_estimada_min,
              ativo: true,
            },
          ]);

        if (err) throw err;
      }

      setFormData({ nome: '', duracao_estimada_min: 0 });
      setShowForm(false);
      setError(null);
      await fetchProcedimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar procedimento');
    }
  }

  async function handleToggleAtivo(id: string, ativo: boolean) {
    try {
      const { error: err } = await supabase
        .from('procedimentos')
        .update({ ativo: !ativo })
        .eq('id', id);

      if (err) throw err;
      await fetchProcedimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar procedimento');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja deletar este procedimento?')) return;

    try {
      const { error: err } = await supabase.from('procedimentos').delete().eq('id', id);

      if (err) throw err;
      await fetchProcedimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar procedimento');
    }
  }

  function handleEdit(proc: Procedimento) {
    setFormData({ nome: proc.nome, duracao_estimada_min: proc.duracao_estimada_min });
    setEditingId(proc.id);
    setShowForm(true);
    setError(null);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ nome: '', duracao_estimada_min: 0 });
    setError(null);
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 h-1 w-10 rounded-full bg-amber-400" />
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Procedimentos</h1>
            <p className="mt-1 text-sm text-zinc-500">Organize os serviços e o tempo de cada atendimento.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="min-h-12 flex-1 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 sm:flex-none"
              >
                + Novo procedimento
              </button>
            )}
          </div>
        </header>

        {error && (
          <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="break-words text-sm text-red-700">{error}</p>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <div className="mb-6 border-b border-zinc-100 pb-4">
              <h2 className="text-xl font-bold tracking-tight">{editingId ? 'Editar procedimento' : 'Novo procedimento'}</h2>
              <p className="mt-1 text-sm text-zinc-500">Informe o nome do serviço e a duração estimada.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <label htmlFor="procedimento-nome" className="mb-1.5 block text-sm font-medium text-zinc-700">Nome</label>
              <input
                id="procedimento-nome"
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Ex: Corte de cabelo"
              />
            </div>

            <div>
              <label htmlFor="procedimento-duracao" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Duração (minutos)
              </label>
              <input
                id="procedimento-duracao"
                type="number"
                value={formData.duracao_estimada_min}
                onChange={(e) =>
                  setFormData({ ...formData, duracao_estimada_min: parseInt(e.target.value) || 0 })
                }
                className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="0"
                min="1"
              />
            </div>

            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:ml-auto sm:max-w-md">
              <button
                type="submit"
                className="min-h-12 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800"
              >
                {editingId ? 'Salvar alterações' : 'Criar procedimento'}
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
            <p className="text-sm text-zinc-500">Carregando procedimentos...</p>
          </div>
        ) : procedimentos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center">
            <p className="font-semibold text-zinc-700">Nenhum procedimento cadastrado</p>
            <p className="mt-2 text-sm text-zinc-500">Adicione o primeiro serviço do salão.</p>
          </div>
        ) : (
          <section aria-label="Lista de procedimentos">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600">
                {procedimentos.length} {procedimentos.length === 1 ? 'procedimento' : 'procedimentos'}
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-zinc-800">
                {procedimentos.filter((proc) => proc.ativo).length} ativos
              </span>
            </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {procedimentos.map((proc) => (
              <article
                key={proc.id}
                className={`flex min-w-0 flex-col rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5 ${proc.ativo ? 'border-zinc-200' : 'border-dashed border-zinc-300'}`}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${proc.ativo ? 'bg-amber-100 text-zinc-900' : 'bg-zinc-100 text-zinc-400'}`}>
                    <AdminIcon name="scissors" className="h-6 w-6" />
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleAtivo(proc.id, proc.ativo)}
                    aria-label={`${proc.ativo ? 'Desativar' : 'Ativar'} ${proc.nome}`}
                    aria-pressed={proc.ativo}
                    className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                      proc.ativo
                        ? 'border-amber-200 bg-amber-50 text-zinc-800 hover:bg-amber-100'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                    }`}
                  >
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${proc.ativo ? 'bg-amber-500' : 'bg-zinc-400'}`} />
                    {proc.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </div>
                <div className="mb-5 min-w-0 flex-1">
                    <h3 className={`break-words text-lg font-bold leading-snug ${!proc.ativo ? 'text-zinc-500' : 'text-zinc-900'}`}>
                      {proc.nome}
                    </h3>
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-zinc-50 p-3 text-zinc-700">
                      <AdminIcon name="clock" className="h-5 w-5 text-zinc-400" />
                      <span className="text-sm"><strong className="font-semibold">{proc.duracao_estimada_min} min</strong> de duração</span>
                    </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4">
                  <button
                    onClick={() => handleEdit(proc)}
                    className="min-h-12 rounded-xl bg-zinc-900 px-3 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(proc.id)}
                    className="min-h-12 rounded-xl border border-red-200 bg-white px-3 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
          </section>
        )}
      </div>
    </div>
  );
}
