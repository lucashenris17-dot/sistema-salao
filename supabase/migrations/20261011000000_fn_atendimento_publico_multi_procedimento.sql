-- Retorna todos os procedimentos associados ao atendimento público.
-- O token continua sendo o único critério de acesso à linha do atendimento.
DROP FUNCTION IF EXISTS public.fn_buscar_atendimento_publico(text);

CREATE FUNCTION public.fn_buscar_atendimento_publico(p_token text)
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