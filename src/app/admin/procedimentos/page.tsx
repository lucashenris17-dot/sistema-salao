'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Procedimento } from '@/lib/supabase';

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Procedimentos</h1>
          <div className="flex gap-2">
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                + Novo
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Sair
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Corte de cabelo"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duração (minutos)
              </label>
              <input
                type="number"
                value={formData.duracao_estimada_min}
                onChange={(e) =>
                  setFormData({ ...formData, duracao_estimada_min: parseInt(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
                min="1"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                {editingId ? 'Salvar' : 'Criar'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Carregando...</p>
          </div>
        ) : procedimentos.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">Nenhum procedimento cadastrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {procedimentos.map((proc) => (
              <div
                key={proc.id}
                className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className={`font-semibold ${!proc.ativo ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {proc.nome}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {proc.duracao_estimada_min} minutos
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleAtivo(proc.id, proc.ativo)}
                    className={`px-3 py-1 rounded text-xs font-medium transition ${
                      proc.ativo
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    {proc.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(proc)}
                    className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition text-sm font-medium"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(proc.id)}
                    className="flex-1 px-3 py-2 bg-red-50 text-red-700 rounded hover:bg-red-100 transition text-sm font-medium"
                  >
                    Deletar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
