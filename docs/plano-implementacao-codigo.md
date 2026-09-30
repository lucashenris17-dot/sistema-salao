# Plano de Implementação - Código do Agendamento Online

**Status:** Preparação (Aguardando execução das migrações no Supabase)

---

## Contexto

Este documento detalha a implementação do código TypeScript/React para o sistema de agendamento online, seguindo o plano aprovado de implementação em fases sem quebrar o sistema atual.

**Premissas:**
- ✅ Migrações SQL preparadas: `docs/migracoes-mvp.sql` e `docs/migracoes-mvp-rls.sql`
- ❌ Migrações ainda NÃO executadas no Supabase
- 🔒 Sistema atual de fila permanece intocado
- 📋 RLS possui vulnerabilidades identificadas (ver análise de segurança)

---

## Estrutura de Implementação

### 📂 Arquivos que Serão Criados

#### Fase 1: Infraestrutura Base
```
src/lib/types.ts                              ✅ CRIADO (preparado)
src/lib/tokens.ts                             ⏳ Geração segura de tokens
```

#### Fase 2: CRUD de Bloqueios (Admin)
```
src/app/actions/bloqueios.ts                  ⏳ Server actions CRUD
src/app/admin/bloqueios/page.tsx              ⏳ Interface de gerenciamento
src/components/bloqueios/FormularioBloqueio.tsx  ⏳ Formulário criar/editar
src/components/bloqueios/ListaBloqueios.tsx   ⏳ Lista com ações
```

#### Fase 3: Formulário Público
```
src/app/agendar/page.tsx                      ⏳ Formulário público
src/app/agendar/sucesso/page.tsx              ⏳ Confirmação de solicitação
src/app/actions/agendamento.ts                ⏳ Criar solicitação (RPC segura)
src/components/agendamento/FormularioPublico.tsx  ⏳ Formulário com validação
src/components/agendamento/SeletorHorario.tsx ⏳ Escolha de data/hora
```

#### Fase 4: Painel de Aprovação (Admin)
```
src/app/admin/solicitacoes/page.tsx           ⏳ Lista de pendentes
src/app/actions/solicitacoes.ts               ⏳ Aprovar/recusar
src/components/solicitacoes/CardSolicitacao.tsx  ⏳ Card individual
src/components/solicitacoes/ListaSolicitacoes.tsx ⏳ Lista completa
```

#### Fase 5: Utilitários e Validação
```
src/lib/validacao-horario.ts                  ⏳ Validar disponibilidade
src/lib/formatacao.ts                         ⏳ Formatação de datas/horas
src/hooks/useAgendamento.ts                   ⏳ Hook compartilhado (opcional)
```

---

### 🔧 Arquivos Existentes que Serão Alterados

#### Alterações Mínimas (Fase 1)

**`src/lib/supabase.ts`**
- **Alteração:** Adicionar tipo `BloqueioAgenda` exportado
- **Risco:** 🟢 Baixo (apenas adiciona tipo, não altera comportamento)
- **Dependência:** Após migração MVP executada
- **Plano:**
  ```typescript
  // Adicionar ao final do arquivo:
  export interface BloqueioAgenda {
    id: string;
    inicio: string;
    fim: string;
    descricao?: string | null;
  }
  ```

**`src/middleware.ts`**
- **Alteração:** Adicionar `/agendar` como rota pública
- **Risco:** 🟢 Baixo (apenas libera nova rota)
- **Dependência:** Independente de migração
- **Plano:**
  ```typescript
  // Linha 38-44: Alterar lógica de proteção
  // ANTES:
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(loginUrl);
    }
  }
  
  // DEPOIS:
  const isPublicRoute = 
    request.nextUrl.pathname.startsWith("/agendar") ||
    request.nextUrl.pathname.startsWith("/acompanhar");
  
  if (request.nextUrl.pathname.startsWith("/admin") && !isPublicRoute) {
    if (!user) {
      return NextResponse.redirect(loginUrl);
    }
  }
  
  // E adicionar ao matcher:
  export const config = {
    matcher: ["/admin/:path*", "/agendar/:path*"],
  };
  ```

#### Sem Alteração Nesta Fase

**NÃO serão alterados:**
- ❌ `src/lib/previsao.ts` - mantém lógica atual (sem bloqueios ainda)
- ❌ `src/app/admin/atendimentos/page.tsx` - permanece intocado
- ❌ `src/app/acompanhar/[token]/page.tsx` - funciona como está

---

## Dependências Entre Arquivos

### Grafo de Dependências

```
src/lib/types.ts (base, sem dependências)
    ↓
    ├─→ src/lib/tokens.ts
    ├─→ src/lib/supabase.ts (adiciona BloqueioAgenda)
    ├─→ src/lib/validacao-horario.ts
    └─→ src/lib/formatacao.ts

src/middleware.ts (independente, pode ser alterado a qualquer momento)

Fase 2 - Bloqueios:
    src/lib/types.ts
         ↓
    src/app/actions/bloqueios.ts
         ↓
    src/app/admin/bloqueios/page.tsx
         ↓
    src/components/bloqueios/* (opcional, pode ser inline)

Fase 3 - Formulário Público:
    src/lib/types.ts + src/lib/tokens.ts + src/lib/validacao-horario.ts
         ↓
    src/app/actions/agendamento.ts (RPC segura)
         ↓
    src/app/agendar/page.tsx
         ↓
    src/app/agendar/sucesso/page.tsx

Fase 4 - Aprovação:
    src/lib/types.ts
         ↓
    src/app/actions/solicitacoes.ts
         ↓
    src/app/admin/solicitacoes/page.tsx
```

---

## Riscos Identificados

### 🔴 Riscos Críticos (Bloqueadores)

#### 1. Vulnerabilidades de Segurança no RLS
**Problema:** Políticas RLS em `docs/migracoes-mvp-rls.sql` possuem falhas críticas.

**Impacto:**
- Cliente pode ler atendimentos de outros clientes (via força bruta de tokens)
- Cliente pode alterar cadastros de terceiros
- Tokens gerados com `Math.random()` são previsíveis

**Mitigação Requerida:**
- ✅ Criar `src/lib/tokens.ts` com geração segura via `crypto.randomUUID()`
- ⚠️ Substituir políticas RLS por funções RPC com `SECURITY DEFINER`
- ⚠️ Validar posse do token antes de retornar dados

**Status:** ❌ NÃO RESOLVIDO (precisa decisão antes de implementar Fase 3)

---

#### 2. Geração Insegura de Tokens
**Problema:** Código atual usa `Math.random()` em `src/app/admin/atendimentos/page.tsx:9-11`

```typescript
function gerarToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
```

**Impacto:**
- Tokens previsíveis
- Facilita força bruta
- Comprometimento de dados pessoais

**Mitigação:**
```typescript
// src/lib/tokens.ts
export function gerarTokenSeguro(): string {
  // Node.js / Edge Runtime
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (não deveria acontecer)
  throw new Error('crypto.randomUUID não disponível');
}
```

**Status:** ⏳ PREPARADO (arquivo `src/lib/tokens.ts` será criado na Fase 1)

---

### 🟠 Riscos Altos (Requerem Atenção)

#### 3. Race Condition em Solicitações Simultâneas
**Problema:** Dois clientes podem solicitar o mesmo horário simultaneamente.

**Impacto:**
- Conflito de agendamentos
- Admin precisa recusar um manualmente

**Mitigação:**
- Fase 1 (MVP): Try-catch no código TypeScript + mensagem de erro amigável
- Fase 2 (Futuro): Função RPC com `LOCK FOR UPDATE`

**Status:** ⏳ ACEITÁVEL para MVP (volume baixo esperado)

---

#### 4. Validação de Horário Não Considera Bloqueios
**Problema:** `src/lib/previsao.ts` não consulta `bloqueios_agenda` ainda.

**Impacto:**
- Cliente pode solicitar horário bloqueado
- Admin recusa manualmente
- Experiência do usuário ruim

**Mitigação:**
- Fase 1 (MVP): Cliente vê mensagem "Sua solicitação será analisada"
- Fase 2 (Futuro): Integrar bloqueios em `validacao-horario.ts`

**Status:** ⏳ ACEITÁVEL para MVP (aprovação manual compensa)

---

### 🟡 Riscos Médios (Monitorar)

#### 5. Confusão entre Fila e Solicitações Pendentes
**Problema:** Admin pode confundir solicitações pendentes com fila regular.

**Mitigação:**
- Views separadas: `/admin/atendimentos` (fila confirmada) vs `/admin/solicitacoes` (pendentes)
- Filtrar `status_confirmacao='confirmado'` na query da fila
- Badge visual diferenciando pendentes

**Status:** ✅ DESIGN previsto (Fase 4)

---

#### 6. WhatsApp Obrigatório Apenas no Frontend
**Problema:** Validação só no formulário, não no banco.

**Impacto:**
- Admin pode cadastrar cliente sem WhatsApp via painel admin
- Solicitação online sempre exige WhatsApp

**Mitigação:**
- Consistente com decisão de design (flexibilidade para admin)
- Formulário público valida antes de submeter

**Status:** ✅ COMPORTAMENTO ESPERADO

---

## Ordem Recomendada de Implementação

### Fase 0: Preparação (ATUAL)
- [x] Criar `src/lib/types.ts`
- [x] Documentar plano completo
- [ ] **BLOQUEADOR:** Decidir sobre correção de vulnerabilidades RLS
- [ ] **BLOQUEADOR:** Executar migrações no Supabase

---

### Fase 1: Infraestrutura Segura

**Pré-requisitos:**
- ✅ Migrações executadas no Supabase
- ✅ Decisão sobre RLS tomada

**Tarefas:**
1. Criar `src/lib/tokens.ts` (geração segura de tokens)
2. Alterar `src/lib/supabase.ts` (adicionar `BloqueioAgenda`)
3. Alterar `src/middleware.ts` (liberar `/agendar`)
4. Testar build do Next.js

**Validação:**
- ✅ `npm run build` passa sem erros
- ✅ Tipos de `BloqueioAgenda` disponíveis
- ✅ Rota `/agendar` retorna 404 (ainda não existe página)
- ✅ Sistema atual continua funcionando

**Tempo estimado:** 30 minutos

---

### Fase 2: CRUD de Bloqueios (Admin)

**Pré-requisitos:**
- ✅ Fase 1 concluída
- ✅ Políticas RLS de `bloqueios_agenda` ativas

**Tarefas:**
1. Criar `src/app/actions/bloqueios.ts` (CRUD via Supabase)
2. Criar `src/app/admin/bloqueios/page.tsx` (UI admin)
3. Testar criação, edição, exclusão

**Validação:**
- ✅ Admin cria bloqueio e aparece no banco
- ✅ Admin edita bloqueio e mudanças persistem
- ✅ Admin deleta bloqueio e desaparece
- ❌ Bloqueios ainda NÃO afetam previsão (esperado)

**Tempo estimado:** 2-3 horas

---

### Fase 3: Formulário Público

**Pré-requisitos:**
- ✅ Fase 1 concluída
- ⚠️ **CRÍTICO:** Vulnerabilidades RLS resolvidas OU funções RPC implementadas

**Tarefas:**
1. Criar `src/app/actions/agendamento.ts` (RPC segura ou Supabase direto)
2. Criar `src/app/agendar/page.tsx` (formulário público)
3. Criar `src/app/agendar/sucesso/page.tsx` (confirmação)
4. Testar fluxo completo

**Validação:**
- ✅ Formulário público acessível sem autenticação
- ✅ Cliente preenche dados e recebe token
- ✅ Solicitação criada com `status_confirmacao='pendente'`
- ✅ Token funciona em `/acompanhar/[token]`
- ❌ Solicitação NÃO aparece na fila ainda (esperado)

**Tempo estimado:** 4-5 horas

---

### Fase 4: Painel de Aprovação (Admin)

**Pré-requisitos:**
- ✅ Fase 3 concluída
- ✅ Solicitações pendentes criadas via formulário

**Tarefas:**
1. Criar `src/app/actions/solicitacoes.ts` (aprovar/recusar)
2. Criar `src/app/admin/solicitacoes/page.tsx` (lista pendentes)
3. Testar aprovação e recusa

**Validação:**
- ✅ Admin vê solicitações pendentes em `/admin/solicitacoes`
- ✅ Admin aprova → atendimento aparece em `/admin/atendimentos`
- ✅ Admin recusa → atendimento desaparece (cancelado)
- ✅ Cliente vê status atualizado em `/acompanhar/[token]`
- ✅ Fila principal só mostra confirmados

**Tempo estimado:** 3-4 horas

---

### Fase 5: Integração e Testes Finais

**Pré-requisitos:**
- ✅ Todas as fases anteriores concluídas

**Tarefas:**
1. Testar fluxo completo ponta a ponta
2. Validar retrocompatibilidade com dados antigos
3. Verificar previsão continua funcionando
4. Documentar comportamento final

**Casos de teste:**
- ✅ Atendimento antigo (antes da migração) aparece normalmente
- ✅ Admin cria atendimento novo → `status_confirmacao='confirmado'` automático
- ✅ Cliente solicita online → fica pendente
- ✅ Admin aprova → entra na fila
- ✅ Previsão calcula corretamente (ignora bloqueios ainda)

**Tempo estimado:** 2 horas

---

## Checklist de Segurança

Antes de colocar o formulário público no ar:

### Obrigatório
- [ ] Tokens gerados com `crypto.randomUUID()` (não `Math.random()`)
- [ ] Políticas RLS corrigidas OU funções RPC implementadas
- [ ] Validação de posse do token na leitura
- [ ] WhatsApp validado no frontend (formato correto)
- [ ] Rate limiting no servidor (via middleware ou Supabase)

### Recomendado
- [ ] Logs de solicitações (para debug e auditoria)
- [ ] Notificação para admin quando nova solicitação chega
- [ ] Mensagem de confirmação via WhatsApp (integração futura)
- [ ] Captcha ou honeypot (anti-spam)

### Opcional
- [ ] Validação de horário comercial no backend
- [ ] Limite de solicitações por WhatsApp por dia
- [ ] Blacklist de números conhecidos (spam)

---

## Pontos de Decisão Pendentes

### 🔴 Decisão Crítica 1: Segurança RLS

**Pergunta:** Como resolver as vulnerabilidades identificadas?

**Opções:**

**A) Funções RPC com SECURITY DEFINER (Recomendado)**
- ✅ Segurança robusta (lógica no banco)
- ✅ Impossível bypassar via cliente
- ❌ Mais SQL para escrever
- ❌ Precisa reescrever `docs/migracoes-mvp-rls.sql`

**B) Corrigir Políticas RLS Atuais**
- ✅ Menos código SQL
- ⚠️ Mais complexo de validar
- ⚠️ Dependente de headers HTTP ou session

**C) Implementar MVP com Vulnerabilidades (NÃO RECOMENDADO)**
- ✅ Rápido para testar
- ❌ Risco de vazamento de dados
- ❌ Refatoração custosa depois

**Recomendação:** **Opção A** (funções RPC)

**Status:** ⏳ AGUARDANDO DECISÃO

---

### 🟡 Decisão 2: Validação de Horários

**Pergunta:** Quando integrar bloqueios na validação?

**Opções:**

**A) Fase 3 (junto com formulário público)**
- ✅ Melhor experiência do usuário
- ❌ Mais complexo de testar
- ❌ Atrasa entrega do formulário

**B) Fase 2.5 (entre bloqueios e formulário)**
- ✅ Bloqueios testados antes do público
- ✅ Permite validação incremental
- ⏳ Tempo de desenvolvimento equilibrado

**C) Pós-MVP (depois de tudo funcionando)**
- ✅ MVP mais rápido
- ⚠️ Admin precisa recusar manualmente
- ✅ Simplicidade inicial

**Recomendação:** **Opção C** (pós-MVP)

**Status:** ✅ APROVADO (decisão anterior)

---

## Próximos Passos Imediatos

### Antes de Continuar:

1. **Decisão sobre segurança RLS** (Opção A, B ou C)
2. **Executar migrações no Supabase** (com ou sem RLS corrigido)
3. **Validar migrações** (queries de verificação incluídas nos arquivos)

### Depois de Migrações Executadas:

1. **Fase 1:** Criar `src/lib/tokens.ts` e atualizar `middleware.ts`
2. **Fase 2:** Implementar CRUD de bloqueios (admin)
3. **Fase 3:** Criar formulário público (após RLS corrigido)
4. **Fase 4:** Painel de aprovação (admin)
5. **Fase 5:** Testes finais

---

## Resumo Executivo

| Fase | Arquivos Novos | Arquivos Alterados | Risco | Tempo Estimado |
|------|----------------|-------------------|-------|----------------|
| 0 - Preparação | 2 | 0 | 🟢 | ✅ Concluído |
| 1 - Infraestrutura | 1 | 2 | 🟢 | 30min |
| 2 - Bloqueios | 2-4 | 0 | 🟢 | 2-3h |
| 3 - Formulário | 3-5 | 0 | 🔴 | 4-5h |
| 4 - Aprovação | 2-4 | 0 | 🟢 | 3-4h |
| 5 - Testes | 0 | 0 | 🟢 | 2h |
| **TOTAL** | **10-16** | **2** | - | **12-15h** |

**Bloqueadores Atuais:**
1. 🔴 Decisão sobre correção de vulnerabilidades RLS
2. 🔴 Execução das migrações no Supabase

**Riscos Mitigados:**
- ✅ Sistema atual não será quebrado
- ✅ Implementação incremental testável
- ✅ Tipos TypeScript preparados
- ⚠️ Segurança depende de decisão pendente

---

**Última atualização:** 2026-09-28
**Autor:** Sistema de agendamento - Preparação MVP
