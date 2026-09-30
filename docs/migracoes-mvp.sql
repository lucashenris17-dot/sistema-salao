-- ============================================================
-- MIGRAÇÕES MVP - AGENDAMENTO ONLINE
-- ============================================================
-- Data: 2026-09-27
-- Versão: 1.0 (MVP)
-- Descrição: Alterações mínimas para permitir agendamento online
--            com fluxo de aprovação pela administradora
-- ============================================================

-- ============================================================
-- MIGRAÇÃO 001: Adicionar status de confirmação
-- ============================================================
-- Permite diferenciar solicitações (cliente) de confirmações (admin)
--
-- Estados:
--   'pendente'   → Cliente solicitou, aguarda aprovação da admin
--   'confirmado' → Admin aprovou (ou admin criou diretamente)
--   'recusado'   → Admin recusou a solicitação
--
-- Default 'confirmado' garante compatibilidade:
--   todos os atendimentos existentes continuam funcionando normalmente

ALTER TABLE atendimentos
ADD COLUMN status_confirmacao TEXT
  DEFAULT 'confirmado'
  CHECK (status_confirmacao IN ('pendente', 'confirmado', 'recusado'));

COMMENT ON COLUMN atendimentos.status_confirmacao IS
  'Status de aprovação do agendamento: pendente (aguarda admin), confirmado (aprovado), recusado (negado)';


-- ============================================================
-- MIGRAÇÃO 002: Criar tabela de bloqueios de agenda
-- ============================================================
-- Permite administradora bloquear horários (folga, compromisso, etc)
--
-- Estrutura simplificada (MVP):
--   - Sem campo 'tipo' (admin escreve na descrição)
--   - Sem campos de auditoria (criado_por, criado_em)
--   - Sem índice GIST (adicionar se performance for problema)

CREATE TABLE bloqueios_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  descricao TEXT,
  CONSTRAINT bloqueio_periodo_valido CHECK (fim > inicio)
);

COMMENT ON TABLE bloqueios_agenda IS
  'Períodos em que a profissional não está disponível para atendimentos (folga, compromisso, etc)';

COMMENT ON COLUMN bloqueios_agenda.inicio IS
  'Data/hora de início do bloqueio (timezone UTC)';

COMMENT ON COLUMN bloqueios_agenda.fim IS
  'Data/hora de fim do bloqueio (timezone UTC)';

COMMENT ON COLUMN bloqueios_agenda.descricao IS
  'Descrição do motivo do bloqueio (ex: "Folga", "Academia", "Médico")';


-- ============================================================
-- VALIDAÇÃO PÓS-MIGRAÇÃO
-- ============================================================
-- Comandos para verificar se as migrações foram aplicadas corretamente

-- Verificar se coluna status_confirmacao foi criada
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'atendimentos' AND column_name = 'status_confirmacao';

-- Verificar se tabela bloqueios_agenda foi criada
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_name = 'bloqueios_agenda';

-- Verificar registros existentes (devem ter status_confirmacao='confirmado')
-- SELECT COUNT(*) as total_atendimentos,
--        COUNT(*) FILTER (WHERE status_confirmacao = 'confirmado') as confirmados
-- FROM atendimentos;


-- ============================================================
-- ROLLBACK (caso precise reverter)
-- ============================================================
-- Executar na ordem inversa se precisar desfazer as mudanças:

-- DROP TABLE IF EXISTS bloqueios_agenda;
-- ALTER TABLE atendimentos DROP COLUMN IF EXISTS status_confirmacao;


-- ============================================================
-- PRÓXIMOS PASSOS (Fase 2 - pós-MVP)
-- ============================================================
-- Melhorias a adicionar quando necessário:
--
-- 1. Coluna 'origem' em atendimentos (diferenciar admin/online)
-- 2. Índice em status_confirmacao (se consultas ficarem lentas)
-- 3. Índice GIST em bloqueios_agenda (se busca de conflitos ficar lenta)
-- 4. Função RPC para validação atômica (se houver race conditions)
-- 5. Constraint de WhatsApp obrigatório (se validação de formulário não bastar)
-- 6. Campos de auditoria em bloqueios_agenda (criado_por, criado_em)
