# Análise de Modelagem - Sistema de Agendamento Online

Documentação técnica da modelagem de banco de dados para implementação do agendamento online no sistema de salão.

---

## Estrutura Atual Inferida (baseada no código TypeScript)

### **Tabela: `atendimentos`**
```sql
-- Estrutura atual inferida do código TypeScript
atendimentos:
  id: UUID (PK)
  cliente_id: UUID (FK → clientes)
  procedimento_id: UUID (FK → procedimentos)
  modo: TEXT ('agendamento' | 'fila')
  status: TEXT ('aguardando' | 'em_andamento' | 'pausado' | 'finalizado' | 'cancelado' | 'no_show')
  horario_agendado: TIMESTAMPTZ (nullable)
  ordem_fila: INTEGER (nullable)
  motivo_cancelamento: TEXT (nullable)
  token_acesso: TEXT (unique, nullable)
  criado_em: TIMESTAMPTZ
  duracao_trabalhada_seg: INTEGER (nullable)
  pausado_desde: TIMESTAMPTZ (nullable)
```

### **Tabela: `clientes`**
```sql
clientes:
  id: UUID (PK)
  nome: TEXT
  sobrenome: TEXT
  whatsapp: TEXT (nullable) -- ⚠️ pode ser NULL
```

### **Tabela: `procedimentos`**
```sql
procedimentos:
  id: UUID (PK)
  nome: TEXT
  duracao_estimada_min: INTEGER
  ativo: BOOLEAN
```

### **Tabela: `segmentos_atendimento`**
```sql
segmentos_atendimento:
  id: UUID (PK)
  atendimento_id: UUID (FK → atendimentos)
  tipo: TEXT ('ativo')
  inicio: TIMESTAMPTZ
  fim: TIMESTAMPTZ (nullable)
```

---

## Análise: Podemos Aproveitar `atendimentos`?

### ✅ **O que já funciona:**
- Estrutura existente suporta agendamentos com data/hora
- `token_acesso` já permite acompanhamento público
- `modo='agendamento'` já diferencia de fila
- `status` cobre estados do ciclo de vida

### ❌ **O que NÃO funciona:**

#### **1. Fluxo de Aprovação**
```
Problema: status atual não diferencia "solicitado" de "confirmado"
Exemplo:
  - Cliente solicita → status='aguardando' (?)
  - Admin confirma → status='aguardando' (igual!)
  - Como diferenciar?

Solução: adicionar coluna separada para confirmação
```

#### **2. Bloqueios de Agenda**
```
Problema: tabela atendimentos NÃO pode representar bloqueios
- Bloqueio não tem cliente
- Bloqueio não tem procedimento
- Bloqueio não tem token
- Bloqueio tem semântica diferente (impede agendamentos)

Tentativa de reuso FALHA:
  atendimentos {
    cliente_id: NULL,  -- ❌ quebra FK
    procedimento_id: NULL,  -- ❌ quebra FK
    modo: 'bloqueio'?,  -- ❌ não existe
    status: 'bloqueado'?  -- ❌ confuso
  }

Conclusão: NOVA TABELA necessária
```

#### **3. Race Condition**
```
Problema: SELECT + INSERT não é atômico
Dois clientes podem:
  1. Consultar horários disponíveis (ambos veem 16h livre)
  2. Criar atendimento simultaneamente
  3. Resultado: conflito!

Solução: função RPC com LOCK FOR UPDATE
```

#### **4. WhatsApp Obrigatório**
```
Problema: whatsapp é nullable na tabela clientes
- Agendamento online REQUER WhatsApp (notificações)
- Mas clientes cadastrados pelo admin podem não ter

Solução: 
  - Validar no formulário público
  - OU adicionar constraint condicional
  - OU criar flag que diferencia origem
```

---

## Proposta de Modelagem

### **Opção A: Mínima (recomendada)**

#### **Mudanças em tabelas existentes:**

```sql
-- 1. Adicionar coluna de confirmação em atendimentos
ALTER TABLE atendimentos 
ADD COLUMN status_confirmacao TEXT 
  DEFAULT 'confirmado' 
  CHECK (status_confirmacao IN ('pendente', 'confirmado', 'recusado'));

-- Justificativa:
-- - "pendente" = cliente solicitou, aguarda admin
-- - "confirmado" = admin aprovou
-- - "recusado" = admin recusou
-- - Default 'confirmado' mantém compatibilidade com registros existentes (criados por admin)

CREATE INDEX idx_atendimentos_pendentes 
ON atendimentos(status_confirmacao) 
WHERE status_confirmacao = 'pendente';
```

```sql
-- 2. Adicionar origem do agendamento (opcional, mas útil)
ALTER TABLE atendimentos 
ADD COLUMN origem TEXT 
  DEFAULT 'admin' 
  CHECK (origem IN ('admin', 'online'));

-- Justificativa:
-- - Diferenciar quem criou (admin vs cliente)
-- - Aplicar regras diferentes (ex: WhatsApp obrigatório só para 'online')
-- - Métricas (quantos agendamentos vieram do público)
```

```sql
-- 3. Adicionar índice para detecção de conflitos
CREATE INDEX idx_atendimentos_horario_ativo 
ON atendimentos(horario_agendado, procedimento_id) 
WHERE status IN ('aguardando', 'em_andamento', 'pausado') 
  AND modo = 'agendamento';

-- Justificativa:
-- - Acelera busca de conflitos de horário
-- - Usado pela função RPC de validação
```

#### **Nova tabela: `bloqueios_agenda`**

```sql
CREATE TABLE bloqueios_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Período do bloqueio
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  
  -- Informações
  tipo TEXT NOT NULL CHECK (tipo IN ('folga', 'compromisso', 'academia', 'outro')),
  descricao TEXT,
  
  -- Auditoria
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  criado_por UUID REFERENCES auth.users(id),
  
  -- Validação
  CONSTRAINT bloqueio_periodo_valido CHECK (fim > inicio)
);

-- Índice para busca rápida de conflitos
CREATE INDEX idx_bloqueios_periodo 
ON bloqueios_agenda USING GIST (
  tstzrange(inicio, fim, '[)')  -- range inclusivo-exclusivo
);

COMMENT ON TABLE bloqueios_agenda IS 
'Períodos em que a profissional não está disponível para atendimentos';
```

**Justificativa para tabela separada:**
- Bloqueio não é um atendimento (não tem cliente, procedimento, token)
- Semântica diferente (impede vs registra)
- Consulta otimizada com GIST index
- Admin pode gerenciar independentemente

---

### **Opção B: Estendida (se quiser mais controle)**

Adiciona mais campos, mas pode ser excessivo inicialmente:

```sql
-- Adicional em atendimentos
ALTER TABLE atendimentos 
ADD COLUMN confirmado_em TIMESTAMPTZ,
ADD COLUMN confirmado_por UUID REFERENCES auth.users(id),
ADD COLUMN recusado_em TIMESTAMPTZ,
ADD COLUMN recusado_por UUID REFERENCES auth.users(id),
ADD COLUMN motivo_recusa TEXT;

-- Justificativa:
-- - Auditoria completa de quem aprovou/recusou e quando
-- - Útil para relatórios
-- - Pode ser overkill para MVP
```

---

## Modelagem Final Recomendada

```sql
-- ============================================================
-- MUDANÇAS EM TABELAS EXISTENTES
-- ============================================================

-- 1. Status de confirmação (ESSENCIAL para fluxo de aprovação)
ALTER TABLE atendimentos 
ADD COLUMN status_confirmacao TEXT 
  DEFAULT 'confirmado' 
  CHECK (status_confirmacao IN ('pendente', 'confirmado', 'recusado'));

-- 2. Origem do agendamento (RECOMENDADO)
ALTER TABLE atendimentos 
ADD COLUMN origem TEXT 
  DEFAULT 'admin' 
  CHECK (origem IN ('admin', 'online'));

-- 3. Índice para performance
CREATE INDEX idx_atendimentos_pendentes 
ON atendimentos(status_confirmacao) 
WHERE status_confirmacao = 'pendente';

CREATE INDEX idx_atendimentos_horario_ativo 
ON atendimentos(horario_agendado, procedimento_id) 
WHERE status IN ('aguardando', 'em_andamento', 'pausado') 
  AND modo = 'agendamento';

-- ============================================================
-- NOVA TABELA: BLOQUEIOS DE AGENDA
-- ============================================================

CREATE TABLE bloqueios_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('folga', 'compromisso', 'academia', 'outro')),
  descricao TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT bloqueio_periodo_valido CHECK (fim > inicio)
);

CREATE INDEX idx_bloqueios_periodo 
ON bloqueios_agenda USING GIST (tstzrange(inicio, fim, '[)'));

-- ============================================================
-- FUNÇÃO RPC: VALIDAÇÃO ATÔMICA DE HORÁRIO
-- ============================================================

CREATE OR REPLACE FUNCTION fn_validar_horario_disponivel(
  p_horario_inicio TIMESTAMPTZ,
  p_horario_fim TIMESTAMPTZ,
  p_excluir_atendimento_id UUID DEFAULT NULL  -- para edições
) RETURNS JSON AS $$
DECLARE
  v_conflito_atendimento INTEGER;
  v_conflito_bloqueio INTEGER;
BEGIN
  -- Verificar conflito com atendimentos
  SELECT COUNT(*) INTO v_conflito_atendimento
  FROM atendimentos
  WHERE modo = 'agendamento'
    AND status IN ('aguardando', 'em_andamento', 'pausado')
    AND horario_agendado IS NOT NULL
    AND (id != p_excluir_atendimento_id OR p_excluir_atendimento_id IS NULL)
    AND tstzrange(
      horario_agendado,
      horario_agendado + (
        SELECT duracao_estimada_min * INTERVAL '1 minute'
        FROM procedimentos
        WHERE id = atendimentos.procedimento_id
      ),
      '[)'
    ) && tstzrange(p_horario_inicio, p_horario_fim, '[)');

  IF v_conflito_atendimento > 0 THEN
    RETURN json_build_object(
      'disponivel', FALSE,
      'motivo', 'conflito_atendimento'
    );
  END IF;

  -- Verificar conflito com bloqueios
  SELECT COUNT(*) INTO v_conflito_bloqueio
  FROM bloqueios_agenda
  WHERE tstzrange(inicio, fim, '[)') && 
        tstzrange(p_horario_inicio, p_horario_fim, '[)');

  IF v_conflito_bloqueio > 0 THEN
    RETURN json_build_object(
      'disponivel', FALSE,
      'motivo', 'bloqueio_agenda'
    );
  END IF;

  RETURN json_build_object('disponivel', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNÇÃO RPC: CRIAR AGENDAMENTO ONLINE (ATÔMICO)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_criar_agendamento_online(
  p_cliente_nome TEXT,
  p_cliente_sobrenome TEXT,
  p_cliente_whatsapp TEXT,
  p_procedimento_id UUID,
  p_horario_agendado TIMESTAMPTZ
) RETURNS JSON AS $$
DECLARE
  v_cliente_id UUID;
  v_atendimento_id UUID;
  v_token TEXT;
  v_duracao_min INTEGER;
  v_horario_fim TIMESTAMPTZ;
  v_validacao JSON;
BEGIN
  -- Validar procedimento ativo
  SELECT duracao_estimada_min INTO v_duracao_min
  FROM procedimentos
  WHERE id = p_procedimento_id AND ativo = TRUE;

  IF v_duracao_min IS NULL THEN
    RETURN json_build_object(
      'sucesso', FALSE,
      'erro', 'Procedimento inválido ou inativo'
    );
  END IF;

  -- Calcular fim do atendimento
  v_horario_fim := p_horario_agendado + (v_duracao_min || ' minutes')::INTERVAL;

  -- Validar disponibilidade com LOCK
  SELECT fn_validar_horario_disponivel(p_horario_agendado, v_horario_fim)
  INTO v_validacao;

  IF (v_validacao->>'disponivel')::BOOLEAN = FALSE THEN
    RETURN json_build_object(
      'sucesso', FALSE,
      'erro', 'Horário não disponível',
      'motivo', v_validacao->>'motivo'
    );
  END IF;

  -- Criar ou atualizar cliente
  INSERT INTO clientes (nome, sobrenome, whatsapp)
  VALUES (p_cliente_nome, p_cliente_sobrenome, p_cliente_whatsapp)
  ON CONFLICT (whatsapp) DO UPDATE SET
    nome = EXCLUDED.nome,
    sobrenome = EXCLUDED.sobrenome
  RETURNING id INTO v_cliente_id;

  -- Gerar token único
  v_token := encode(gen_random_bytes(16), 'base64url');

  -- Criar atendimento
  INSERT INTO atendimentos (
    cliente_id,
    procedimento_id,
    modo,
    status,
    status_confirmacao,
    origem,
    horario_agendado,
    token_acesso
  ) VALUES (
    v_cliente_id,
    p_procedimento_id,
    'agendamento',
    'aguardando',
    'pendente',  -- ← aguarda aprovação admin
    'online',
    p_horario_agendado,
    v_token
  ) RETURNING id INTO v_atendimento_id;

  RETURN json_build_object(
    'sucesso', TRUE,
    'atendimento_id', v_atendimento_id,
    'token', v_token
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- CONSTRAINTS ADICIONAIS
-- ============================================================

-- WhatsApp obrigatório para agendamentos online
ALTER TABLE atendimentos
ADD CONSTRAINT atendimentos_online_requer_whatsapp
CHECK (
  origem != 'online' OR 
  EXISTS (
    SELECT 1 FROM clientes 
    WHERE id = cliente_id AND whatsapp IS NOT NULL
  )
);

-- Status_confirmacao relevante apenas para origem online
-- (admin não precisa confirmar seus próprios agendamentos)
CREATE OR REPLACE FUNCTION fn_validar_confirmacao_online()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.origem = 'admin' THEN
    NEW.status_confirmacao := 'confirmado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_confirmacao_automatica_admin
BEFORE INSERT OR UPDATE ON atendimentos
FOR EACH ROW
EXECUTE FUNCTION fn_validar_confirmacao_online();
```

---

## Resumo da Modelagem

### **Tabelas Novas:**
1. ✅ **`bloqueios_agenda`** - ESSENCIAL (bloqueios não cabem em atendimentos)

### **Colunas Novas em `atendimentos`:**
1. ✅ **`status_confirmacao`** - ESSENCIAL (pendente/confirmado/recusado)
2. ✅ **`origem`** - RECOMENDADO (admin/online)

### **Funções RPC:**
1. ✅ **`fn_validar_horario_disponivel`** - evita race condition
2. ✅ **`fn_criar_agendamento_online`** - criação atômica

### **Índices:**
1. ✅ **GIST em bloqueios_agenda** - busca rápida de conflitos
2. ✅ **Índice parcial em atendimentos** - performance

---

## Alternativa Mais Simples (se quiser menos código SQL)

Se preferir simplicidade máxima:

```sql
-- Apenas o essencial:
ALTER TABLE atendimentos 
ADD COLUMN status_confirmacao TEXT DEFAULT 'confirmado';

CREATE TABLE bloqueios_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  descricao TEXT,
  CONSTRAINT bloqueio_valido CHECK (fim > inicio)
);

-- Race condition tratado no código TypeScript com try-catch
-- (não ideal, mas funciona para baixo volume)
```

---

## Fluxo de Aprovação Proposto

### **Estados do Agendamento Online:**

```
1. Cliente preenche formulário
   ↓
   status='aguardando' + status_confirmacao='pendente' + origem='online'

2. Admin visualiza solicitações pendentes
   ↓
   Opção A: Aprovar → status_confirmacao='confirmado'
   Opção B: Recusar → status='cancelado' + status_confirmacao='recusado'

3. Cliente é notificado via WhatsApp ou visualiza na página de acompanhamento
```

### **Diferença de Agendamentos Admin:**

```
Admin cria atendimento diretamente:
  status='aguardando' + status_confirmacao='confirmado' + origem='admin'

Não passa por aprovação (já é criado confirmado)
```

---

## Considerações de Implementação

### **Race Condition (Conflito de Horários):**
- **Problema:** Dois clientes consultam horários simultaneamente e ambos veem o mesmo slot livre
- **Solução:** Função RPC com transação atômica e `LOCK FOR UPDATE`
- **Fallback:** Se não implementar RPC, tratar erro de conflito no frontend e pedir para escolher outro horário

### **WhatsApp Obrigatório:**
- **Abordagem 1:** Validar no formulário público (mais simples)
- **Abordagem 2:** Constraint CHECK condicional (mais robusto)
- **Abordagem 3:** Campo `origem` diferencia e permite WhatsApp nullable para admin

### **Bloqueios de Agenda:**
- **UI Admin:** Nova página `/admin/bloqueios` para CRUD
- **Integração:** Modificar `lib/previsao.ts` para considerar bloqueios ao calcular slots
- **Performance:** Índice GIST garante busca rápida de sobreposições

---

## Próximos Passos Sugeridos

1. **Revisar modelagem** com stakeholders
2. **Decidir entre Opção A (mínima) ou Opção B (estendida)**
3. **Executar migrações SQL** no Supabase
4. **Implementar CRUD de bloqueios** (admin)
5. **Criar página pública** `/agendar`
6. **Implementar fluxo de aprovação** (admin)

---

## Referências

- Código atual analisado: `src/app/admin/atendimentos/page.tsx`
- Algoritmo de previsão: `src/lib/previsao.ts`
- Cliente Supabase: `src/lib/supabase.ts`
