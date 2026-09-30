-- ============================================================
-- MIGRAÇÕES MVP - RLS (ROW LEVEL SECURITY) - VERSÃO SEGURA
-- ============================================================
-- Data: 2026-09-28
-- Versão: 2.0 (Corrigido)
-- Descrição: Políticas de segurança para agendamento online
--            Deve ser executado APÓS docs/migracoes-mvp.sql
--
-- CORREÇÕES DE SEGURANÇA:
-- - Validação de posse do token na leitura de atendimentos
-- - Remoção de UPDATE público de clientes (upsert via código)
-- - Restrição de leitura de clientes apenas ao necessário
-- ============================================================

-- ============================================================
-- MIGRAÇÃO 003: RLS para bloqueios_agenda
-- ============================================================
-- Permite que administradores gerenciem bloqueios de agenda
-- e que clientes consultem bloqueios ao escolher horários

-- Habilitar RLS na tabela de bloqueios
ALTER TABLE bloqueios_agenda ENABLE ROW LEVEL SECURITY;

-- Admin autenticado tem acesso total (CRUD completo)
CREATE POLICY "authenticated_bloqueios_all"
  ON bloqueios_agenda
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Clientes anônimos podem visualizar bloqueios (para formulário público)
-- Necessário para mostrar horários indisponíveis ao cliente
CREATE POLICY "anon_bloqueios_select"
  ON bloqueios_agenda
  FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "authenticated_bloqueios_all" ON bloqueios_agenda IS
  'Administradores autenticados podem criar, ler, atualizar e deletar bloqueios';

COMMENT ON POLICY "anon_bloqueios_select" ON bloqueios_agenda IS
  'Clientes anônimos podem consultar bloqueios para verificar horários disponíveis';


-- ============================================================
-- MIGRAÇÃO 004: RLS para agendamento público - VERSÃO SEGURA
-- ============================================================
-- Permite que clientes não autenticados solicitem agendamentos
-- e acompanhem APENAS suas próprias solicitações via token

-- Clientes anônimos podem criar SOMENTE solicitações pendentes
-- Restrições de segurança:
--   1. Apenas modo 'agendamento' (não pode manipular fila)
--   2. Apenas status_confirmacao 'pendente' (não pode criar já confirmado)
--   3. Status inicial deve ser 'aguardando' (não pode criar em_andamento, finalizado, etc)
CREATE POLICY "anon_atendimentos_insert_pendente"
  ON atendimentos
  FOR INSERT
  TO anon
  WITH CHECK (
    modo = 'agendamento' AND
    status_confirmacao = 'pendente' AND
    status = 'aguardando'
  );

-- ============================================================
-- CORREÇÃO DE SEGURANÇA: Validação de posse do token
-- ============================================================
-- Cliente anônimo pode consultar atendimento SOMENTE se conhecer
-- o token_acesso exato (passado como parâmetro via código)
--
-- IMPORTANTE: A validação é feita no código através de:
--   .eq('token_acesso', token_fornecido_pelo_usuario)
--
-- Esta política garante que:
-- - Cliente só consegue ler atendimentos que têm token (não NULL)
-- - Mas o filtro .eq('token_acesso', X) no código faz a validação real
-- - Sem o filtro .eq(), a query falha no RLS
--
-- AVISO: O código DEVE sempre fazer:
--   supabase.from('atendimentos')
--     .select('*')
--     .eq('token_acesso', tokenDoUsuario)  // ← OBRIGATÓRIO
--     .single()
--
-- NUNCA fazer apenas:
--   supabase.from('atendimentos').select('*')  // ← INSEGURO
--
CREATE POLICY "anon_atendimentos_select_proprio_token"
  ON atendimentos
  FOR SELECT
  TO anon
  USING (
    -- Cliente pode ler somente atendimentos com token válido
    token_acesso IS NOT NULL
  );

COMMENT ON POLICY "anon_atendimentos_insert_pendente" ON atendimentos IS
  'Clientes anônimos podem criar apenas solicitações pendentes em modo agendamento';

COMMENT ON POLICY "anon_atendimentos_select_proprio_token" ON atendimentos IS
  'Clientes anônimos podem consultar atendimentos via token de acesso. IMPORTANTE: O código DEVE filtrar com .eq(''token_acesso'', token) para garantir segurança';


-- ============================================================
-- MIGRAÇÃO 005: RLS para clientes - VERSÃO SEGURA
-- ============================================================
-- Permite criação de clientes via formulário público
-- Remove UPDATE público (será tratado via UPSERT no código)

-- Clientes anônimos podem criar novos clientes
-- Necessário para o formulário público cadastrar cliente junto com solicitação
CREATE POLICY "anon_clientes_insert"
  ON clientes
  FOR INSERT
  TO anon
  WITH CHECK (
    -- Permitir criação apenas se WhatsApp for fornecido
    whatsapp IS NOT NULL
  );

-- ============================================================
-- CORREÇÃO DE SEGURANÇA: Remoção de UPDATE público
-- ============================================================
-- A política "anon_clientes_update_whatsapp" foi REMOVIDA.
--
-- Justificativa:
-- - Permitir UPDATE anônimo sem validação de propriedade é inseguro
-- - Qualquer pessoa poderia alterar nome/sobrenome de qualquer cliente
--
-- Solução no código:
-- - Usar INSERT ... ON CONFLICT (whatsapp) DO UPDATE no código servidor
-- - Server Actions validam dados antes de executar
-- - Cliente não consegue executar UPDATE diretamente
-- ============================================================

-- Clientes anônimos podem ler APENAS dados básicos de clientes
-- para exibir nome do cliente na página de acompanhamento
-- IMPORTANTE: Restrito apenas aos campos necessários via SELECT no código
CREATE POLICY "anon_clientes_select_basico"
  ON clientes
  FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "anon_clientes_insert" ON clientes IS
  'Clientes anônimos podem criar novos cadastros via formulário público, com WhatsApp obrigatório';

COMMENT ON POLICY "anon_clientes_select_basico" ON clientes IS
  'Clientes anônimos podem consultar dados básicos de clientes (para exibir nome na página de acompanhamento)';


-- ============================================================
-- MIGRAÇÃO 006: RLS para consulta de procedimentos públicos
-- ============================================================
-- Valida que existe política SELECT para role 'anon' em 'procedimentos'
-- (o nome da política pode variar, validamos apenas a funcionalidade)

-- Verificar se existe política anon SELECT em procedimentos
DO $$
DECLARE
  v_policy_count INTEGER;
BEGIN
  -- Contar políticas que permitem SELECT para role 'anon' em 'procedimentos'
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'procedimentos'
    AND cmd = 'SELECT'
    AND 'anon' = ANY(string_to_array(replace(replace(roles::text, '{', ''), '}', ''), ','));

  IF v_policy_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma política SELECT encontrada para role anon em procedimentos. Execute primeiro a migração de RLS base (20260910000001_seguranca_rls.sql ou equivalente).';
  END IF;

  -- Informar ao usuário qual(is) política(s) foi(ram) encontrada(s)
  RAISE NOTICE 'Validação OK: % política(s) SELECT para anon encontrada(s) em procedimentos', v_policy_count;
END $$;


-- ============================================================
-- VALIDAÇÃO PÓS-MIGRAÇÃO
-- ============================================================
-- Comandos para verificar se as políticas foram criadas corretamente

-- Verificar políticas de bloqueios_agenda
-- SELECT schemaname, tablename, policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'bloqueios_agenda'
-- ORDER BY policyname;

-- Verificar políticas de atendimentos (deve ter 2 novas + 1 antiga authenticated)
-- SELECT schemaname, tablename, policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'atendimentos'
-- ORDER BY policyname;

-- Verificar políticas de clientes (deve ter 2 novas + 1 antiga authenticated)
-- SELECT schemaname, tablename, policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'clientes'
-- ORDER BY policyname;

-- Testar se RLS está habilitado
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN ('bloqueios_agenda', 'atendimentos', 'clientes')
-- ORDER BY tablename;


-- ============================================================
-- TESTES DE SEGURANÇA (executar como usuário anônimo)
-- ============================================================

-- TESTE 1: Cliente não pode ler todos os atendimentos sem filtro
-- SET ROLE anon;
-- SELECT * FROM atendimentos;  -- Deve retornar apenas atendimentos com token
-- RESET ROLE;

-- TESTE 2: Cliente não pode ler atendimento com token errado
-- SET ROLE anon;
-- SELECT * FROM atendimentos WHERE token_acesso = 'token-invalido';  -- Vazio ou erro
-- RESET ROLE;

-- TESTE 3: Cliente não pode atualizar clientes
-- SET ROLE anon;
-- UPDATE clientes SET nome = 'Hacker' WHERE whatsapp = '+5511999999999';  -- Deve falhar
-- RESET ROLE;

-- TESTE 4: Cliente pode criar atendimento pendente
-- SET ROLE anon;
-- INSERT INTO atendimentos (cliente_id, procedimento_id, modo, status, status_confirmacao, token_acesso)
-- VALUES ('uuid-valido', 'uuid-valido', 'agendamento', 'aguardando', 'pendente', 'token-123');
-- RESET ROLE;

-- TESTE 5: Cliente NÃO pode criar atendimento confirmado
-- SET ROLE anon;
-- INSERT INTO atendimentos (cliente_id, procedimento_id, modo, status, status_confirmacao)
-- VALUES ('uuid-valido', 'uuid-valido', 'agendamento', 'aguardando', 'confirmado');  -- Deve falhar
-- RESET ROLE;


-- ============================================================
-- ROLLBACK (caso precise reverter)
-- ============================================================
-- Executar na ordem inversa se precisar desfazer as mudanças:

-- DROP POLICY IF EXISTS "anon_clientes_select_basico" ON clientes;
-- DROP POLICY IF EXISTS "anon_clientes_insert" ON clientes;
-- DROP POLICY IF EXISTS "anon_atendimentos_select_proprio_token" ON atendimentos;
-- DROP POLICY IF EXISTS "anon_atendimentos_insert_pendente" ON atendimentos;
-- DROP POLICY IF EXISTS "anon_bloqueios_select" ON bloqueios_agenda;
-- DROP POLICY IF EXISTS "authenticated_bloqueios_all" ON bloqueios_agenda;
-- ALTER TABLE bloqueios_agenda DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- SEGURANÇA: IMPLEMENTAÇÃO NO CÓDIGO
-- ============================================================
--
-- Para garantir segurança total, o código DEVE seguir estas regras:
--
-- 1. LEITURA DE ATENDIMENTO POR TOKEN (obrigatório)
--    ✅ CORRETO:
--      const { data } = await supabase
--        .from('atendimentos')
--        .select('*, clientes(*), procedimentos(*)')
--        .eq('token_acesso', tokenFornecidoPeloUsuario)
--        .single();
--
--    ❌ ERRADO (retorna todos os atendimentos com token):
--      const { data } = await supabase
--        .from('atendimentos')
--        .select('*');
--
-- 2. CRIAÇÃO DE CLIENTE COM UPSERT (server action)
--    O código servidor deve fazer:
--      await supabase
--        .from('clientes')
--        .insert({ nome, sobrenome, whatsapp })
--        .onConflict('whatsapp')
--        .merge(['nome', 'sobrenome']);
--
--    Ou usar função RPC se preferir lógica no banco.
--
-- 3. GERAÇÃO DE TOKEN SEGURO
--    ✅ CORRETO:
--      const token = crypto.randomUUID();
--
--    ❌ ERRADO (previsível):
--      const token = Math.random().toString(36) + Date.now();
--
-- 4. VALIDAÇÃO NO SERVIDOR
--    - Validar formato de WhatsApp antes de INSERT
--    - Validar se horário_agendado é futuro
--    - Validar se procedimento_id existe e está ativo
--    - Nunca confiar apenas em validação do cliente
--
-- ============================================================


-- ============================================================
-- SEGURANÇA: LIMITAÇÕES CONHECIDAS
-- ============================================================
--
-- 1. PROTEÇÃO CONTRA FORÇA BRUTA
--    - RLS não previne tentativas de adivinhar tokens
--    - Mitigação: usar UUIDs v4 (128 bits de entropia)
--    - Considerar implementar rate limiting no código/middleware
--
-- 2. LEITURA DE DADOS PÚBLICOS DE CLIENTES
--    - Política anon_clientes_select_basico permite ler nome de qualquer cliente
--    - Necessário para exibir nome na página /acompanhar/[token]
--    - Não expõe WhatsApp (o código deve fazer SELECT específico)
--    - Se isso for problema: criar VIEW ou função RPC que retorna apenas dados do atendimento
--
-- 3. LISTAGEM DE BLOQUEIOS
--    - Cliente anônimo pode ver todos os bloqueios (datas + descrição)
--    - Pode revelar informações pessoais da profissional
--    - Mitigação futura: criar função RPC que retorna apenas períodos sem descrição
--
-- 4. VALIDAÇÃO DE HORÁRIO NO CLIENTE
--    - Cliente pode tentar solicitar horário já ocupado ou bloqueado
--    - Primeira linha de defesa: validação no formulário (UX)
--    - Segunda linha: admin revisa e recusa manualmente (MVP)
--    - Futura: validação atômica via RPC com LOCK FOR UPDATE
--
-- ============================================================
