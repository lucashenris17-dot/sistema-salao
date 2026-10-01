# 02 — DECISÕES DE ARQUITETURA E HISTÓRICO

> Registra **por que** as escolhas foram feitas, não apenas **o que** foi feito.

---

## Índice

1. [Decisões Iniciais de Arquitetura](#decisões-iniciais-de-arquitetura)
2. [Dois Campos de Status](#dois-campos-de-status)
3. [Token de Acompanhamento](#token-de-acompanhamento)
4. [RPC vs Consulta Direta](#rpc-vs-consulta-direta)
5. [Realtime para Cliente](#realtime-para-cliente)
6. [Server Actions vs API Routes](#server-actions-vs-api-routes)
7. [Problema da RPC Não Retornar status_confirmacao](#problema-da-rpc-não-retornar-status_confirmacao)
8. [Mudanças Importantes](#mudanças-importantes)

---

## Decisões Iniciais de Arquitetura

### Por que Next.js App Router?

- **React Server Components** — permite Server Actions nativos, sem API routes adicionais
- **Streaming SSR** — melhor performance inicial
- **Layouts aninhados** — shell admin (`/admin/layout.tsx`) reutilizado em todas as subpáginas
- **File-based routing** — convenção clara para rotas

### Por que Supabase?

- **PostgreSQL** — banco relacional robusto
- **RLS nativo** — segurança no nível de banco, não só no código
- **Realtime** — WebSocket gerenciado, sem servidor adicional
- **Auth integrado** — autenticação pronta para admin
- **Hospedagem gerenciada** — menos infraestrutura para gerenciar

### Por que TypeScript Strict?

- **Type safety** — erros detectados em tempo de desenvolvimento
- **IntelliSense** — autocompletar melhor nas IDEs
- **Refatoração segura** — mudanças em tipos propagam erros para usos incorretos
- **Documentação viva** — tipos servem como documentação

---

## Dois Campos de Status

### Decisão: `status` + `status_confirmacao`

**Por quê?**

Inicialmente havia apenas `status`. O problema:

- Cliente fazia agendamento → `status = 'aguardando'`
- Admin aprovava → `status = 'confirmado'`
- Admin iniciava → `status = 'em_andamento'`

Mas "confirmado" não é um estado operacional, é um portão de aprovação.

Quando o atendimento está confirmado mas ainda não começou, ele deveria estar "aguardando", não "confirmado".

**Solução:** separar em dois eixos

| Campo | Responsabilidade |
|-------|------------------|
| `status` | Ciclo operacional: aguardando → em_andamento → pausado → finalizado/cancelado/no_show |
| `status_confirmacao` | Portão de aprovação: pendente → confirmado/recusado |

Agora:

- Cliente agenda → `status = 'aguardando'`, `status_confirmacao = 'pendente'`
- Admin aprova → `status_confirmacao = 'confirmado'` (status permanece 'aguardando')
- Admin inicia → `status = 'em_andamento'`

**Vantagens:**

- Estados operacionais claros e ortogonais
- Queries ficam mais simples (filtrar por aprovação vs filtrar por andamento)
- Lógica de negócio fica explícita no schema

---

## Token de Acompanhamento

### Decisão: campo `token_acesso` único por atendimento

**Problema:** como dar acesso somente leitura ao cliente sem exigir login?

**Alternativas consideradas:**

1. Login com WhatsApp → complexo, exige SMS ou auth extra
2. Usar `id` do atendimento → UUID previsível expõe todos os atendimentos
3. Token opaco → gerado uma vez, imprevisível, sem state server-side

**Escolha:** Token opaco

**Implementação:**

- Gerado por `gerarTokenAcompanhamento()` (baseado em random + timestamp)
- Salvo em `atendimentos.token_acesso` (UNIQUE)
- URL pública: `/acompanhar/[token]`
- RLS permite SELECT em `atendimentos` quando filtrado por `token_acesso`

**Vantagens:**

- Zero autenticação para cliente
- Zero gestão de sessões
- Link único e seguro (token tem ~20 chars aleatórios)
- Cliente pode compartilhar o link (ex: com acompanhante)

---

## RPC vs Consulta Direta

### Decisão: usar RPC `fn_buscar_atendimento_publico` para acesso anônimo

**Por quê?**

Clientes (anon) precisam ler dados de atendimento, cliente e procedimento.

**Alternativa 1:** liberar RLS para anon em todas as tabelas

- ❌ Expõe mais dados do que necessário
- ❌ Risco de vazamento se RLS for mal configurado

**Alternativa 2:** RPC com SECURITY DEFINER

- ✅ Controle explícito sobre o que é retornado
- ✅ Anon chama a função, não acessa tabelas diretamente
- ✅ Menor superfície de ataque

**Implementação:**

```sql
CREATE FUNCTION fn_buscar_atendimento_publico(p_token text)
RETURNS json
SECURITY DEFINER
```

- Valida token
- Faz JOIN entre `atendimentos`, `clientes`, `procedimentos`
- Retorna apenas campos seguros (sem IDs de cliente, sem dados sensíveis)

**Trade-off:**

- ⚠️ RPC não retorna `status_confirmacao` (ver próxima seção)

---

## Realtime para Cliente

### Decisão: usar Supabase Realtime em `/acompanhar/[token]`

**Por quê?**

Cliente precisa ver atualizações sem recarregar a página:

- Admin aprova → mostra "Confirmado" instantaneamente
- Admin inicia → mostra "Em atendimento"
- Previsão muda → atualiza horários

**Alternativas:**

1. **Polling** — `setInterval` a cada X segundos
   - ❌ Overhead de requisições
   - ❌ Atraso de até X segundos
   - ✅ Funciona em qualquer backend

2. **WebSocket customizado**
   - ❌ Precisa gerenciar servidor WebSocket
   - ❌ Precisa broadcast manual
   - ✅ Controle total

3. **Supabase Realtime**
   - ✅ Já incluído no Supabase
   - ✅ Subscreve `postgres_changes` nativamente
   - ✅ Broadcast automático para clientes conectados
   - ⚠️ Necessita habilitar Realtime na tabela

**Implementação:**

```ts
const channel = supabase
  .channel('atendimento-atualizado')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'atendimentos',
  }, (_payload) => {
    carregar(); // Recarrega dados
  })
  .subscribe();
```

**Nota:** não filtramos por `token` no Realtime porque o broadcast é global. A função `carregar()` já filtra pelo token correto.

---

## Server Actions vs API Routes

### Decisão: usar Server Actions para mutações admin

**Por quê?**

Next.js App Router oferece duas formas de fazer mutações server-side:

1. **API Routes** (`app/api/...`)
   - Endpoint HTTP tradicional
   - Precisa validar autenticação manualmente
   - Retorna JSON via `Response`

2. **Server Actions** (`'use server'`)
   - Função TypeScript chamada diretamente do cliente
   - Cookies (auth) passados automaticamente
   - Type-safe (mesmo tipo no cliente e servidor)
   - Sem boilerplate de fetch/axios

**Escolha:** Server Actions

**Vantagens:**

- Menos código
- Autenticação via cookies automática
- Type safety ponta a ponta
- Menos endpoints HTTP expostos

**Exemplo:**

```ts
// src/app/actions/solicitacoes.ts
'use server';
export async function aprovarSolicitacao(id: string) {
  const supabase = await createSupabaseClient(); // cookies incluídos
  // ...
}

// src/app/admin/solicitacoes/page.tsx
'use client';
import { aprovarSolicitacao } from '@/app/actions/solicitacoes';

async function handleAprovar(id: string) {
  const resultado = await aprovarSolicitacao(id); // chamada direta
}
```

---

## Problema da RPC Não Retornar status_confirmacao

### Contexto

A RPC `fn_buscar_atendimento_publico` foi criada antes do campo `status_confirmacao` existir.

Quando adicionamos `status_confirmacao`, **não atualizamos a RPC**.

### Impacto

Cliente via `/acompanhar/[token]` sempre recebia `status_confirmacao = null`, mesmo após aprovação.

Página mostrava "Aguardando confirmação" eternamente.

### Soluções Consideradas

1. **Atualizar a RPC** (adicionar campo no SELECT)
   - ✅ Solução definitiva
   - ❌ Requer migration
   - ❌ Usuário pediu para NÃO alterar banco neste momento

2. **Busca secundária direta em `atendimentos`**
   - ✅ Sem migration
   - ✅ RLS já permite SELECT com filtro `token_acesso`
   - ⚠️ Uma query extra por carregamento

**Escolha:** Busca secundária (solução 2)

### Implementação (2026-10-01)

Em `src/app/acompanhar/[token]/page.tsx`:

```ts
// Busca via RPC (não retorna status_confirmacao)
const { data } = await supabase
  .rpc('fn_buscar_atendimento_publico', { p_token: token })
  .single();

// Busca secundária para pegar status_confirmacao
const { data: confirmData } = await supabase
  .from('atendimentos')
  .select('status_confirmacao')
  .eq('token_acesso', token)
  .single();

setStatusConfirmacao(confirmData?.status_confirmacao ?? null);
```

Depois, ao renderizar:

```ts
const statusKey =
  atendimento.status === 'aguardando' && statusConfirmacao
    ? statusConfirmacao  // usa status_confirmacao se presente
    : atendimento.status;
```

**Por que isso funciona?**

Política RLS `anon_atendimentos_select_proprio_token` permite:

```sql
CREATE POLICY anon_atendimentos_select_proprio_token
ON atendimentos FOR SELECT TO anon
USING (token_acesso = current_setting('request.jwt.claim.token', true));
```

Cliente pode fazer SELECT em `atendimentos` desde que filtre por `token_acesso`.

---

## Mudanças Importantes

### 2026-10-01: Fix status_confirmacao não aparecendo no acompanhamento

**Problema:** após aprovação, cliente continuava vendo "Aguardando confirmação"

**Causa:** RPC não retornava `status_confirmacao`

**Solução:**

1. Adicionado estado `statusConfirmacao` em `src/app/acompanhar/[token]/page.tsx`
2. Busca secundária para pegar `status_confirmacao` via RLS
3. Lógica de resolução: se `status = 'aguardando'` e há `statusConfirmacao`, usa o segundo
4. Adicionadas entradas em `STATUS_CONFIG` para `pendente`, `confirmado`, `recusado`
5. Corrigido warning TypeScript: `(payload) =>` → `(_payload) =>`

**Arquivos alterados:**

- `src/app/acompanhar/[token]/page.tsx`

**Teste:**

```bash
npx tsc --noEmit
# 0 erros
```

---

### 2026-09-14: Adicionar Realtime público

**Migration:** `20260914000000_broadcast_publico_realtime.sql`

Habilitou Realtime na tabela `atendimentos` para usuários anônimos.

---

### 2026-09-11: RPC com duração

**Migration:** `20260911000002_fn_atendimento_publico_duracao.sql`

Adicionou campos `duracao_trabalhada_seg` e `pausado_desde` na RPC pública.

---

### 2026-09-10: Fundação + RLS

**Migrations:**

- `20260910000000_fundacao.sql` — schema inicial
- `20260910000001_seguranca_rls.sql` — primeiras políticas RLS
- `20260910000002_corrigir_rls.sql` — correções de RLS

---

## Problemas Conhecidos Documentados

### 1. RPC não retorna `status_confirmacao`

**Status:** Workaround implementado (busca secundária)

**Solução definitiva:** atualizar RPC em migration futura

### 2. `proximo-atendimento.tsx` não filtra por `status_confirmacao`

**Descrição:** widget "próximo atendimento" no admin pode sugerir agendamentos ainda pendentes de aprovação

**Impacto:** baixo (admin vê visualmente que está pendente na lista)

**Solução futura:** adicionar filtro `.neq('status_confirmacao', 'pendente')` na query

### 3. Badge contador no dashboard conta pendentes incorretamente

**Descrição:** lógica de contagem mistura `status = 'aguardando'` com `status_confirmacao = 'pendente'`

**Impacto:** badge pode mostrar número diferente da lista em `/admin/solicitacoes`

**Solução futura:** padronizar contagem para usar apenas `status_confirmacao = 'pendente'`

---

## Lições Aprendidas

1. **Sempre adicionar campos novos na RPC junto com a migration** — evita workarounds
2. **Documentar decisões no momento** — facilita manutenção futura
3. **RLS é poderoso mas exige atenção** — testar com `anon` e `authenticated` sempre
4. **Separar concerns** (status operacional vs aprovação) simplifica lógica
5. **TypeScript strict ajuda** — erros de tipo evitaram bugs em produção
