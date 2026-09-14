-- =============================================================
-- Função segura de consulta pública de atendimento por token
-- =============================================================

CREATE OR REPLACE FUNCTION public.fn_buscar_atendimento_publico(p_token text)
RETURNS TABLE (
  atendimento_id uuid,
  procedimento_nome text,
  modo text,
  status text,
  horario_agendado timestamptz,
  ordem_fila integer,
  previsao_inicio timestamptz,
  previsao_fim timestamptz,
  cliente_nome text,
  cliente_sobrenome text,
  duracao_trabalhada_seg integer,
  pausado_desde timestamptz,
  criado_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS atendimento_id,
    p.nome AS procedimento_nome,
    a.modo::text AS modo,
    a.status::text AS status,
    a.horario_agendado,
    a.ordem_fila,
    a.previsao_inicio,
    a.previsao_fim,
    c.nome AS cliente_nome,
    c.sobrenome AS cliente_sobrenome,
    a.duracao_trabalhada_seg,
    a.pausado_desde,
    a.criado_em
  FROM public.atendimentos AS a
  JOIN public.clientes AS c
    ON a.cliente_id = c.id
  JOIN public.procedimentos AS p
    ON a.procedimento_id = p.id
  WHERE a.token_acesso = p_token
  LIMIT 1;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.fn_buscar_atendimento_publico(text)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.fn_buscar_atendimento_publico(text)
  TO anon;

GRANT EXECUTE
  ON FUNCTION public.fn_buscar_atendimento_publico(text)
  TO authenticated;
