-- =============================================================
-- Broadcast pÃºblico por token (nova migration â€” mÃ­nimo, segura)
-- Eventos: INSERT / UPDATE em public.atendimentos
-- Canal: 'acompanhar-' || token_acesso
-- Payload: somente { atendimento_id: ... } â€” sem token_acesso, sem whatsapp
-- Sem SELECT anon em atendimentos. Sem service_role. Sem pg_notify.
-- =============================================================

CREATE OR REPLACE FUNCTION public.fn_broadcast_atendimento_publico()
RETURNS TRIGGER AS $$
BEGIN
  -- Dispara apenas quando houver token (evita broadcast em registros incompletos)
  IF NEW.token_acesso IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('atendimento_id', NEW.id),
      'atendimento-atualizado',
      'acompanhar-' || NEW.token_acesso,
      false
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger para garantir que esteja ativo (idempotente)
DROP TRIGGER IF EXISTS trg_broadcast_atendimento_publico ON public.atendimentos;
CREATE TRIGGER trg_broadcast_atendimento_publico
AFTER INSERT OR UPDATE ON public.atendimentos
FOR EACH ROW
EXECUTE FUNCTION public.fn_broadcast_atendimento_publico();