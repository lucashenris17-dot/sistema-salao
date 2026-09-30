'use client';

import { useState, useEffect } from 'react';
import { BloqueioAgenda } from '@/lib/types';
import { listarBloqueios, criarBloqueio, excluirBloqueio } from '@/app/actions/bloqueios';

export default function BloqueiosPage() {
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    dataInicio: '',
    horaInicio: '',
    dataFim: '',
    horaFim: '',
    descricao: '',
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarBloqueios();
  }, []);

  async function carregarBloqueios() {
    try {
      setLoading(true);
      const resultado = await listarBloqueios();

      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao carregar bloqueios');
        return;
      }

      setBloqueios(resultado.dados || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar bloqueios');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.dataInicio || !formData.horaInicio || !formData.dataFim || !formData.horaFim) {
      setError('Preencha data e hora de início e fim');
      return;
    }

    try {
      setSalvando(true);
      setError(null);

      // Montar ISO strings para o banco
      const inicio = `${formData.dataInicio}T${formData.horaInicio}:00`;
      const fim = `${formData.dataFim}T${formData.horaFim}:00`;

      const resultado = await criarBloqueio({
        inicio,
        fim,
        descricao: formData.descricao || undefined,
      });

      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao criar bloqueio');
        return;
      }

      setFormData({
        dataInicio: '',
        horaInicio: '',
        dataFim: '',
        horaFim: '',
        descricao: '',
      });
      setShowForm(false);
      await carregarBloqueios();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar bloqueio');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(id: string, descricao?: string | null) {
    const mensagem = descricao
      ? `Tem certeza que deseja excluir o bloqueio "${descricao}"?`
      : 'Tem certeza que deseja excluir este bloqueio?';

    if (!confirm(mensagem)) return;

    try {
      const resultado = await excluirBloqueio(id);

      if (!resultado.sucesso) {
        setError(resultado.erro || 'Erro ao excluir bloqueio');
        return;
      }

      await carregarBloqueios();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir bloqueio');
    }
  }

  function handleCancelar() {
    setShowForm(false);
    setFormData({
      dataInicio: '',
      horaInicio: '',
      dataFim: '',
      horaFim: '',
      descricao: '',
    });
    setError(null);
  }

  function formatarDataHora(isoString: string): string {
    const data = new Date(isoString);
    return data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function calcularDuracao(inicio: string, fim: string): string {
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    const diffMs = dataFim.getTime() - dataInicio.getTime();
    const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHoras > 0) {
      return `${diffHoras}h${diffMinutos > 0 ? ` ${diffMinutos}min` : ''}`;
    }
    return `${diffMinutos}min`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Bloqueios de Agenda</h1>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              + Novo Bloqueio
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Novo Bloqueio</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Início
                </label>
                <input
                  type="date"
                  value={formData.dataInicio}
                  onChange={(e) => setFormData({ ...formData, dataInicio: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hora de Início
                </label>
                <select
                  value={formData.horaInicio}
                  onChange={(e) => setFormData({ ...formData, horaInicio: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecione</option>
                  {Array.from({ length: 48 }, (_, i) => {
                    const hour = Math.floor(i / 2);
                    const minute = i % 2 === 0 ? '00' : '30';
                    const time = `${hour.toString().padStart(2, '0')}:${minute}`;
                    return (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Fim
                </label>
                <input
                  type="date"
                  value={formData.dataFim}
                  onChange={(e) => setFormData({ ...formData, dataFim: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hora de Fim
                </label>
                <select
                  value={formData.horaFim}
                  onChange={(e) => setFormData({ ...formData, horaFim: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecione</option>
                  {Array.from({ length: 48 }, (_, i) => {
                    const hour = Math.floor(i / 2);
                    const minute = i % 2 === 0 ? '00' : '30';
                    const time = `${hour.toString().padStart(2, '0')}:${minute}`;
                    return (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição (opcional)
              </label>
              <input
                type="text"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Folga, Academia, Médico..."
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={salvando}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {salvando ? 'Salvando...' : 'Criar Bloqueio'}
              </button>
              <button
                type="button"
                onClick={handleCancelar}
                disabled={salvando}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Carregando bloqueios...</p>
          </div>
        ) : bloqueios.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 mb-2">Nenhum bloqueio cadastrado</p>
            <p className="text-sm text-gray-400">
              Bloqueios impedem agendamentos em horários específicos
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bloqueios.map((bloqueio) => (
              <div
                key={bloqueio.id}
                className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {bloqueio.descricao || 'Bloqueio de agenda'}
                    </h3>
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <p>
                        <span className="font-medium">Início:</span>{' '}
                        {formatarDataHora(bloqueio.inicio)}
                      </p>
                      <p>
                        <span className="font-medium">Fim:</span>{' '}
                        {formatarDataHora(bloqueio.fim)}
                      </p>
                      <p>
                        <span className="font-medium">Duração:</span>{' '}
                        {calcularDuracao(bloqueio.inicio, bloqueio.fim)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleExcluir(bloqueio.id, bloqueio.descricao)}
                    className="flex-1 px-3 py-2 bg-red-50 text-red-700 rounded hover:bg-red-100 transition text-sm font-medium"
                  >
                    Excluir
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
