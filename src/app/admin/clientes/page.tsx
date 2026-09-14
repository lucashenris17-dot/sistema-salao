'use client';

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

    try {
      if (editingId) {
        const { error: err } = await supabase
          .from('clientes')
          .update({
            nome: formData.nome.trim(),
            sobrenome: formData.sobrenome.trim(),
            whatsapp: formData.whatsapp.trim(),
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
              whatsapp: formData.whatsapp.trim(),
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
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

        <div className="mb-4">
          <label htmlFor="search" className="sr-only">
            Pesquisar clientes
          </label>
          <input
            id="search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por nome, sobrenome ou WhatsApp..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: João"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Sobrenome *</label>
              <input
                type="text"
                value={formData.sobrenome}
                onChange={(e) => setFormData({ ...formData, sobrenome: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Silva"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
              <input
                type="text"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: (11) 99999-9999"
                required
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
        ) : filteredClientes.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">
              {searchQuery ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredClientes.map((cliente) => (
              <div
                key={cliente.id}
                className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {cliente.nome} {cliente.sobrenome}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      WhatsApp: {cliente.whatsapp}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(cliente)}
                    className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition text-sm font-medium"
                  >
                    Editar
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