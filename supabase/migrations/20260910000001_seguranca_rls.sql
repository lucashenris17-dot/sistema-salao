-- =============================================================
-- Segurança Row Level Security (RLS) — sistema-salao
-- Migration: 20260910000001_seguranca_rls
-- =============================================================
--
-- Estratégia de segurança:
-- - Usuários autenticados: acesso completo a todas as tabelas
-- - Usuários anônimos: acesso restrito a procedimentos ativos apenas
--
-- =============================================================

-- =============================================================
-- 1. PROCEDIMENTOS
-- =============================================================

alter table procedimentos enable row level security;

-- Usuários autenticados têm acesso total
create policy "authenticated_procedimentos_all"
  on procedimentos
  for all
  to authenticated
  using (true)
  with check (true);

-- Usuários anônimos podem ver apenas procedimentos ativos
create policy "anon_procedimentos_select"
  on procedimentos
  for select
  to anon
  using (ativo = true);

-- =============================================================
-- 2. CLIENTES
-- =============================================================

alter table clientes enable row level security;

-- Usuários autenticados têm acesso total
create policy "authenticated_clientes_all"
  on clientes
  for all
  to authenticated
  using (true)
  with check (true);

-- =============================================================
-- 3. ATENDIMENTOS
-- =============================================================

alter table atendimentos enable row level security;

-- Usuários autenticados têm acesso total
create policy "authenticated_atendimentos_all"
  on atendimentos
  for all
  to authenticated
  using (true)
  with check (true);

-- =============================================================
-- 4. SEGMENTOS DE ATENDIMENTO
-- =============================================================

alter table segmentos_atendimento enable row level security;

-- Usuários autenticados têm acesso total
create policy "authenticated_segmentos_all"
  on segmentos_atendimento
  for all
  to authenticated
  using (true)
  with check (true);
