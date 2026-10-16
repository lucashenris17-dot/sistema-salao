-- =============================================================
-- Segurança pré-publicação — sistema-salao
-- Migration: 20261017000000_seguranca_publicacao
-- =============================================================
--
-- 1. Remove as policies anônimas permissivas de LEITURA em
--    atendimentos/clientes. Elas permitiam que qualquer visitante
--    lesse a base de clientes (nome + WhatsApp) e todos os
--    atendimentos, pois o filtro de token era feito só no código,
--    não no banco.
--    MANTIDAS (necessárias p/ agendamento público):
--      - anon_atendimentos_insert_pendente (INSERT com WITH CHECK)
--      - anon_clientes_insert (INSERT com WITH CHECK)
--      - anon_procedimentos_select (só procedimentos ativos)
--      - anon_bloqueios_select (horários indisponíveis no /agendar)
-- 2. Estende fn_buscar_atendimento_publico com status_confirmacao,
--    para a página de acompanhamento não precisar de SELECT direto.
-- 3. Cria fn_fila_publica(p_token): retorna a fila mínima necessária
--    ao cálculo de previsão de espera, SEM identificadores
--    (sem id, cliente_id, procedimento_ids, WhatsApp).
--
-- ATENÇÃO NO DEPLOY: aplicar esta migration JUNTO com o código novo
-- da página /acompanhar/[token] (que passa a usar as RPCs). Aplicar
-- só a migration quebra a página antiga; subir só o código sem a
-- migration também quebra.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Remover leitura anônima ampla
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "anon_atendimentos_select_proprio_token"
  ON public.atendimentos;

DROP POLICY IF EXISTS "anon_clientes_select_basico"
  ON public.clientes;

-- ---------------------------------------------------------------
-- 2. RPC principal: incluir status_confirmacao
-- ---------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_buscar_atendimento_publico(text);

CREATE FUNCTION public.fn_buscar_atendimento_publico(p_token text)
RETURNS TABLE (
  atendimento_id uuid,
  procedimento_nome text,
  modo text,
  status text,
  status_confirmacao text,
  horario_agendado timestamptz,
  ordem_fila integer,
  previsao_inicio timestamptz,
  previsao_fim timestamptz,
  cliente_nome text,
  cliente_sobrenome text,
  duracao_trabalhada_seg integer,
  pausado_desde timestamptz,
  criado_em timestamptz,
  duracao_estimada_min integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS atendimento_id,
    COALESCE(
      (SELECT string_agg(p.nome, ', ' ORDER BY selecionados.ordem)
       FROM unnest(COALESCE(a.procedimento_ids, ARRAY[a.procedimento_id]))
         WITH ORDINALITY AS selecionados(procedimento_id, ordem)
       JOIN public.procedimentos AS p ON p.id = selecionados.procedimento_id),
      p_principal.nome
    ) AS procedimento_nome,
    a.modo::text,
    a.status::text,
    a.status_confirmacao::text,
    a.horario_agendado,
    a.ordem_fila,
    a.previsao_inicio,
    a.previsao_fim,
    c.nome,
    c.sobrenome,
    a.duracao_trabalhada_seg,
    a.pausado_desde,
    a.criado_em,
    COALESCE(
      (SELECT SUM(p.duracao_estimada_min)::integer
       FROM unnest(COALESCE(a.procedimento_ids, ARRAY[a.procedimento_id]))
         AS selecionados(procedimento_id)
       JOIN public.procedimentos AS p ON p.id = selecionados.procedimento_id),
      p_principal.duracao_estimada_min
    ) AS duracao_estimada_min
  FROM public.atendimentos AS a
  JOIN public.clientes AS c ON c.id = a.cliente_id
  JOIN public.procedimentos AS p_principal ON p_principal.id = a.procedimento_id
  WHERE a.token_acesso = p_token
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_buscar_atendimento_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_buscar_atendimento_publico(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_buscar_atendimento_publico(text) TO authenticated;

-- ---------------------------------------------------------------
-- 3. Fila pública mínima (para previsão de espera)
-- ---------------------------------------------------------------
-- Retorna apenas o necessário ao cálculo de previsão, sem nenhum
-- identificador: sem id do atendimento, sem cliente_id,
-- sem procedimento_ids e sem WhatsApp. A coluna eh_meu indica qual
-- linha é a do token consultado.
-- Exige token válido: token desconhecido retorna zero linhas.

CREATE OR REPLACE FUNCTION public.fn_fila_publica(p_token text)
RETURNS TABLE (
  eh_meu boolean,
  modo text,
  status text,
  horario_agendado timestamptz,
  ordem_fila integer,
  criado_em timestamptz,
  duracao_estimada_min integer,
  duracao_trabalhada_seg integer,
  pausado_desde timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.atendimentos WHERE token_acesso = p_token
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (a.token_acesso = p_token) AS eh_meu,
    a.modo::text,
    a.status::text,
    a.horario_agendado,
    a.ordem_fila,
    a.criado_em,
    COALESCE(
      (SELECT SUM(p.duracao_estimada_min)::integer
       FROM unnest(COALESCE(a.procedimento_ids, ARRAY[a.procedimento_id]))
         AS s(pid)
       JOIN public.procedimentos AS p ON p.id = s.pid),
      pp.duracao_estimada_min
    ) AS duracao_estimada_min,
    a.duracao_trabalhada_seg,
    a.pausado_desde
  FROM public.atendimentos AS a
  JOIN public.procedimentos AS pp ON pp.id = a.procedimento_id
  WHERE a.status IN ('aguardando', 'em_andamento', 'pausado')
  ORDER BY a.criado_em ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fila_publica(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fila_publica(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_fila_publica(text) TO authenticated;
