-- Corrige políticas públicas antigas de atendimentos

drop policy if exists "Cliente consulta proprio atendimento"
  on public.atendimentos;

drop policy if exists "Cliente consulta segmentos proprios"
  on public.segmentos_atendimento