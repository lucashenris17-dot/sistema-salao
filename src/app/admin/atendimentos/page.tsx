'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { calcularPrevisao } from '@/lib/previsao';

export interface AtendimentoListItem {
  id: string;
  cliente_id: string;
  procedimento_id: string;
  modo: 'agendamento' | 'fila';
  status: string;
  horario_agendado?: string;
  ordem_fila?: number;
  motivo_cancelamento?: string;
  token_acesso?: string;
  criado_em: string;
  cliente?: { nome: string; sobrenome: string };
  procedimento?: { nome: string };
}

export default function AtendimentosPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [atendimentos, setAtendimentos] = useState<AtendimentoListItem[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome: string; sobrenome: string }[]>([]);
  const [procedimentos, setProcedimentos] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    cliente_id: '',
    procedimento_id: '',
    modo: 'agendamento' as 'agendamento' | 'fila',
    horario_agendado: '',
    ordem_fila: 1,
  });

  const [cancelForm, setCancelForm] = useState({ id: '', motivo: '' });
  const [previsoes, setPrevisoes] = useState<Record<string, { inicio_previsto?: Date; fim_previsto?: Date; minutos_restantes?: number }>>({});
  const [showCancel, setShowCancel] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('atendimentos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, () => {
        fetchAtendimentos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      const { data: cli, error: errCli } = await supabase
        .from('clientes')
        .select('id, nome, sobrenome')
        .order('nome', { ascending: true });
      if (errCli) throw errCli;
      setClientes(cli || []);

      const { data: proc, error: errProc } = await supabase
        .from('procedimentos')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome', { ascending: true });
      if (errProc) throw errProc;
      setProcedimentos(proc || []);

      await fetchAtendimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAtendimentos() {
    try {
      const { data, error: err } = await supabase
        .from('atendimentos')
        .select(`
          id,
          cliente_id,
          procedimento_id,
          modo,
          status,
          horario_agendado,
          ordem_fila,
          motivo_cancelamento,
          token_acesso,
          criado_em,
          duracao_trabalhada_seg,
          pausado_desde,
          clientes:cliente_id (nome, sobrenome),
          procedimentos:procedimento_id (nome, duracao_estimada_min)
        `)
        .order('criado_em', { ascending: false });
      if (err) throw err;
      setAtendimentos((data || []) as unknown as AtendimentoListItem[]);
      // Calcular previsões
      const calcInputs = (data || []).map((d: any) => ({
        id: d.id,
        modo: d.modo,
        status: d.status,
        cliente_id: d.cliente_id,
        procedimento_id: d.procedimento_id,
        horario_agendado: d.horario_agendado,
        ordem_fila: d.ordem_fila,
        token_acesso: d.token_acesso,
        procedimento: d.procedimentos ? { duracao_estimada_min: d.procedimentos.duracao_estimada_min } : undefined,
        duracao_trabalhada_seg: d.duracao_trabalhada_seg,
        pausado_desde: d.pausado_desde,
      }));
      const preds = calcularPrevisao(calcInputs);
      // preds é Record<string, PrevisaoResultado> — associado pelo id
      setPrevisoes(preds);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar atendimentos');
    }
  }

  async function handleIniciar(id: string) {
    try {
      const now = new Date().toISOString();
      await supabase.from('atendimentos').update({ status: 'em_andamento' }).eq('id', id);
      await supabase.from('segmentos_atendimento').insert([{ atendimento_id: id, tipo: 'ativo', inicio: now }]);
      await fetchAtendimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar');
    }
  }

  async function handlePausar(id: string) {
    try {
      const now = new Date().toISOString();
      await supabase.from('segmentos_atendimento').update({ fim: now, tipo: 'pausado' }).eq('atendimento_id', id).is('fim', null);
      await supabase.from('atendimentos').update({ status: 'pausado', pausado_desde: now }).eq('id', id);
      await fetchAtendimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao pausar');
    }
  }

  async function handleContinuar(id: string) {
    try {
      const now = new Date().toISOString();
      await supabase.from('atendimentos').update({ status: 'em_andamento', pausado_desde: null }).eq('id', id);
      await supabase.from('segmentos_atendimento').insert([{ atendimento_id: id, tipo: 'ativo', inicio: now }]);
      await fetchAtendimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao continuar');
    }
  }

  async function handleFinalizar(id: string) {
    try {
      const now = new Date().toISOString();
      // Fecha segmento aberto
      await supabase.from('segmentos_atendimento').update({ fim: now }).eq('atendimento_id', id).is('fim', null);
      // Calcula tempo trabalhado dos segmentos ainda abertos + fechados (simplificado: apenas soma segmentos do atendimento)
      const { data: segs } = await supabase.from('segmentos_atendimento').select('inicio, fim').eq('atendimento_id', id);
      let segundos = 0;
      if (segs) {
        for (const s of segs) {
          if (s.inicio) {
            const fim = s.fim ? new Date(s.fim) : new Date(now);
            segundos += Math.round((fim.getTime() - new Date(s.inicio).getTime()) / 1000);
          }
        }
      }
      await supabase.from('atendimentos').update({ status: 'finalizado', duracao_trabalhada_seg: segundos }).eq('id', id);
      await fetchAtendimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!formData.cliente_id) {
      setError('Selecione um cliente');
      return;
    }
    if (!formData.procedimento_id) {
      setError('Selecione um procedimento');
      return;
    }
    if (formData.modo === 'agendamento') {
      if (!formData.horario_agendado) {
        setError('Informe o horário do agendamento');
        return;
      }
    }
    if (formData.modo === 'fila') {
      if (!formData.ordem_fila || formData.ordem_fila <= 0) {
        setError('Informe uma ordem de fila válida');
        return;
      }
    }

    try {
      if (editingId) {
        const payload: any = {
          cliente_id: formData.cliente_id,
          procedimento_id: formData.procedimento_id,
          modo: formData.modo,
        };
        if (formData.modo === 'agendamento') {
          payload.horario_agendado = formData.horario_agendado;
          payload.ordem_fila = null;
        } else {
          payload.ordem_fila = formData.ordem_fila;
          payload.horario_agendado = null;
        }

        const { error: err } = await supabase.from('atendimentos').update(payload).eq('id', editingId);
        if (err) throw err;
        setEditingId(null);
      } else {
        const payload: any = {
          cliente_id: formData.cliente_id,
          procedimento_id: formData.procedimento_id,
          modo: formData.modo,
          status: 'aguardando',
          token_acesso: crypto.randomUUID(),
        };
        if (formData.modo === 'agendamento') {
          payload.horario_agendado = formData.horario_agendado;
        } else {
          payload.ordem_fila = formData.ordem_fila;
        }

        const { data: inserted, error: err } = await supabase.from('atendimentos').insert([payload]).select('token_acesso').single();
        if (err) throw err;
        if (inserted?.token_acesso) {
          const link = `${window.location.origin}/acompanhar/${inserted.token_acesso}`;
          await navigator.clipboard.writeText(link);
        }
      }

      setFormData({ cliente_id: '', procedimento_id: '', modo: 'agendamento', horario_agendado: '', ordem_fila: 1 });
      setShowForm(false);
      setError(null);
      await fetchAtendimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar atendimento');
    }
  }

  function handleEdit(at: AtendimentoListItem) {
    setFormData({
      cliente_id: at.cliente_id,
      procedimento_id: at.procedimento_id,
      modo: at.modo,
      horario_agendado: at.horario_agendado ? at.horario_agendado.slice(0, 16) : '',
      ordem_fila: at.ordem_fila || 1,
    });
    setEditingId(at.id);
    setShowForm(true);
    setError(null);
  }

  function handleCancelEdit() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ cliente_id: '', procedimento_id: '', modo: 'agendamento', horario_agendado: '', ordem_fila: 1 });
    setError(null);
  }

  async function handleCancel() {
    if (!cancelForm.id || !cancelForm.motivo.trim()) {
      setError('Informe o atendimento e o motivo do cancelamento');
      return;
    }
    try {
      const { error: err } = await supabase
        .from('atendimentos')
        .update({ status: 'cancelado', motivo_cancelamento: cancelForm.motivo.trim() })
        .eq('id', cancelForm.id);
      if (err) throw err;
      setShowCancel(false);
      setCancelForm({ id: '', motivo: '' });
      setError(null);
      await fetchAtendimentos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar atendimento');
    }
  }

  function openCancel(at: AtendimentoListItem) {
    setCancelForm({ id: at.id, motivo: '' });
    setShowCancel(true);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Atendimentos</h1>
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
              <label htmlFor="cliente_id" className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <select
                id="cliente_id"
                value={formData.cliente_id}
                onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome} {c.sobrenome}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label htmlFor="procedimento_id" className="block text-sm font-medium text-gray-700 mb-1">Procedimento *</label>
              <select
                id="procedimento_id"
                value={formData.procedimento_id}
                onChange={(e) => setFormData({ ...formData, procedimento_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option value="">Selecione...</option>
                {procedimentos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label htmlFor="modo" className="block text-sm font-medium text-gray-700 mb-1">Modo *</label>
              <select
                id="modo"
                value={formData.modo}
                onChange={(e) => setFormData({ ...formData, modo: e.target.value as 'agendamento' | 'fila' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option value="agendamento">Agendamento</option>
                <option value="fila">Fila</option>
              </select>
            </div>

            {formData.modo === 'agendamento' && (
              <div className="mb-4">
                <label htmlFor="horario_agendado" className="block text-sm font-medium text-gray-700 mb-1">Horário Agendado *</label>
                <input
                  id="horario_agendado"
                  type="datetime-local"
                  value={formData.horario_agendado}
                  onChange={(e) => setFormData({ ...formData, horario_agendado: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            )}

            {formData.modo === 'fila' && (
              <div className="mb-4">
                <label htmlFor="ordem_fila" className="block text-sm font-medium text-gray-700 mb-1">Ordem na Fila *</label>
                <input
                  id="ordem_fila"
                  type="number"
                  min={1}
                  value={formData.ordem_fila}
                  onChange={(e) => setFormData({ ...formData, ordem_fila: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                {editingId ? 'Salvar' : 'Criar'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {showCancel && (
          <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">Cancelar Atendimento</h3>
            <label htmlFor="motivo" className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
            <textarea
              id="motivo"
              value={cancelForm.motivo}
              onChange={(e) => setCancelForm({ ...cancelForm, motivo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              placeholder="Informe o motivo do cancelamento"
              rows={3}
              required
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Confirmar Cancelamento
              </button>
              <button
                type="button"
                onClick={() => { setShowCancel(false); setCancelForm({ id: '', motivo: '' }); }}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8"><p className="text-gray-500">Carregando...</p></div>
        ) : atendimentos.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-gray-200"><p className="text-gray-500">Nenhum atendimento cadastrado</p></div>
        ) : (
          <div className="space-y-3">
            {atendimentos.map((at) => (
              <div key={at.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{at.cliente?.nome} {at.cliente?.sobrenome}</h3>
                    <p className="text-sm text-gray-600">{at.procedimento?.nome}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        at.modo === 'agendamento' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {at.modo === 'agendamento' ? 'Agendamento' : 'Fila'}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        at.status === 'aguardando' ? 'bg-yellow-100 text-yellow-800' :
                        at.status === 'em_andamento' ? 'bg-green-100 text-green-800' :
                        at.status === 'finalizado' ? 'bg-gray-100 text-gray-800' :
                        at.status === 'cancelado' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {at.status}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(at.criado_em).toLocaleString('pt-BR')}</span>
                </div>

                {at.modo === 'agendamento' && at.horario_agendado && (
                  <p className="text-xs text-gray-500 mb-1">Horário: {new Date(at.horario_agendado).toLocaleString('pt-BR')}</p>
                )}
                {at.modo === 'fila' && at.ordem_fila && (
                  <p className="text-xs text-gray-500 mb-1">Ordem: {at.ordem_fila}</p>
                )}
                {previsoes[at.id]?.inicio_previsto && (
                  <p className="text-xs text-blue-600 mb-1">Início previsto: {new Date(previsoes[at.id]!.inicio_previsto!).toLocaleString('pt-BR')}</p>
                )}
                {previsoes[at.id]?.fim_previsto && (
                  <p className="text-xs text-blue-600 mb-1">Fim previsto: {new Date(previsoes[at.id]!.fim_previsto!).toLocaleString('pt-BR')}</p>
                )}
                {previsoes[at.id]?.minutos_restantes != null && previsoes[at.id]!.minutos_restantes! > 0 && (
                  <p className="text-xs text-amber-600 mb-1">Restantes: {previsoes[at.id]!.minutos_restantes} min</p>
                )}
                {at.status === 'cancelado' && at.motivo_cancelamento && (
                  <p className="text-xs text-red-600 mb-1">Motivo: {at.motivo_cancelamento}</p>
                )}

                <div className="flex gap-2 mt-3">
                  {at.token_acesso && (
                    <button
                      type="button"
                      onClick={() => {
                        const link = `${window.location.origin}/acompanhar/${at.token_acesso}`;
                        navigator.clipboard.writeText(link);
                        setCopiadoId(at.id);
                        setTimeout(() => setCopiadoId(null), 2000);
                      }}
                      className="flex-1 px-3 py-2 bg-violet-50 text-violet-700 rounded hover:bg-violet-100 transition text-sm font-medium"
                    >
                      {copiadoId === at.id ? 'Link copiado!' : 'Copiar link'}
                    </button>
                  )}
                  {at.status === 'aguardando' && (
                    <button onClick={() => handleIniciar(at.id)} className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm font-medium">Iniciar</button>
                  )}
                  {at.status === 'em_andamento' && (
                    <>
                      <button onClick={() => handlePausar(at.id)} className="flex-1 px-3 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition text-sm font-medium">Pausar</button>
                      <button onClick={() => handleFinalizar(at.id)} className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium">Finalizar</button>
                    </>
                  )}
                  {at.status === 'pausado' && (
                    <>
                      <button onClick={() => handleContinuar(at.id)} className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition text-sm font-medium">Continuar</button>
                      <button onClick={() => handleFinalizar(at.id)} className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium">Finalizar</button>
                    </>
                  )}
                  <button onClick={() => handleEdit(at)} className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition text-sm font-medium">Editar</button>
                  {at.status !== 'cancelado' && (
                    <button onClick={() => openCancel(at)} className="flex-1 px-3 py-2 bg-red-50 text-red-700 rounded hover:bg-red-100 transition text-sm font-medium">Cancelar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}