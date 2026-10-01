# 03 — ESTADO ATUAL DO SISTEMA

> Snapshot do que está funcionando, o que está em progresso e o que está quebrado **agora**.

**Última atualização:** 2026-10-01

---

## ✅ Funcionando Corretamente

### Fluxo do Cliente (Agendamento)

- ✅ Formulário `/agendar` com 4 etapas funciona
- ✅ Validação de horários (exclui passados, bloqueados, conflitantes)
- ✅ Criação de cliente automática por WhatsApp
- ✅ Geração de token de acompanhamento
- ✅ Redirecionamento para `/acompanhar/[token]`
- ✅ Página de acompanhamento carrega via RPC + busca secundária
- ✅ **Fix aplicado (2026-10-01):** status_confirmacao agora aparece corretamente
- ✅ Realtime atualiza página do cliente automaticamente
- ✅ Previsão de horário calculada por `calcularPrevisao()`

### Fluxo Admin (Gestão)

- ✅ Login com Supabase Auth
- ✅ Dashboard `/admin` com contadores e próximos horários
- ✅ Listagem de solicitações pendentes em `/admin/solicitacoes`
- ✅ Aprovar solicitação → `status_confirmacao = 'confirmado'`
- ✅ Recusar solicitação → `status = 'cancelado'` + `status_confirmacao = 'recusado'`
- ✅ Gestão de atendimentos em `/admin/atendimentos`
- ✅ Ações: iniciar, pausar, retomar, finalizar, cancelar, no_show
- ✅ CRUD de clientes em `/admin/clientes`
- ✅ CRUD de procedimentos em `/admin/procedimentos`
- ✅ Gestão de bloqueios de agenda em `/admin/bloqueios`
- ✅ Logout funciona

### Banco de Dados

- ✅ Schema criado com migrations aplicadas
- ✅ RLS configurado para anon e authenticated
- ✅ RPC `fn_buscar_atendimento_publico` funciona (com workaround para status_confirmacao)
- ✅ Realtime habilitado na tabela `atendimentos`
- ✅ Políticas RLS testadas e seguras

### Build e Tipos

- ✅ `npx tsc --noEmit` — zero erros
- ✅ `npm run build` — passa sem erros
- ✅ TypeScript strict mode ativo
- ✅ Todos os tipos definidos em `src/lib/types.ts`

---

## 🟡 Funcionando com Limitações Conhecidas

### 1. RPC não retorna `status_confirmacao` nativamente

**Status:** Workaround implementado ✅

**Como funciona agora:**

- RPC retorna dados principais
- Busca secundária via `.eq('token_acesso', token)` busca `status_confirmacao`
- Funciona porque RLS permite SELECT em `atendimentos` quando filtrado por token

**Limitação:**

- Duas queries em vez de uma (impacto mínimo de performance)

**Solução definitiva futura:**

- Atualizar RPC para incluir `status_confirmacao` no SELECT
- Requer migration

### 2. Widget "Próximo atendimento" não filtra por `status_confirmacao`

**Arquivo:** `src/app/admin/atendimentos/proximo-atendimento.tsx`

**Problema:**

Função `selecionarProximoAtendimento()` filtra apenas:

```ts
.eq('status', 'aguardando')
.eq('modo', 'agendamento')
.gte('horario_agendado', now)
```

**Falta:** `.neq('status_confirmacao', 'pendente')`

**Impacto:**

- Admin pode ver agendamento pendente de aprovação como "próximo"
- Baixo impacto: admin vê visualmente que está pendente na lista principal

**Solução futura:**

Adicionar filtro:

```ts
.neq('status_confirmacao', 'pendente')
```

### 3. Contador de pendentes no dashboard usa lógica mista

**Arquivo:** `src/app/admin/page.tsx:99`

**Código atual:**

```ts
pendentes: listaHoje.filter((x) =>
  x.status === 'aguardando' || (x as any).status_confirmacao === 'pendente'
).length
```

**Problema:**

- Conta atendimentos `aguardando` (operacional) + pendentes (aprovação)
- Pode mostrar número diferente da página `/admin/solicitacoes` (que filtra só por `status_confirmacao`)

**Impacto:**

- Badge no dashboard pode mostrar 5, mas página de solicitações tem só 3
- Confuso para admin

**Solução futura:**

Padronizar para contar apenas:

```ts
pendentes: listaHoje.filter((x) =>
  (x as any).status_confirmacao === 'pendente'
).length
```

---

## 🔴 Problemas Conhecidos (Não Bloqueantes)

### 1. `docs/migracoes-mvp-rls.sql` fora de `supabase/migrations/`

**Descrição:**

- Arquivo `docs/migracoes-mvp-rls.sql` contém DDL importante:
  - Adição da coluna `status_confirmacao`
  - Política RLS `anon_atendimentos_select_proprio_token`
- **NÃO está em `supabase/migrations/`** → não é aplicado automaticamente pelo CLI

**Impacto:**

- Se rodar `supabase db reset` em ambiente novo, essas alterações não são aplicadas
- Produção está OK (foi aplicado manualmente)

**Solução futura:**

- Mover conteúdo para migration ordenada em `supabase/migrations/`
- Ou aplicar manualmente em novos ambientes

### 2. Variável não usada em callback Realtime

**Status:** ✅ Resolvido (2026-10-01)

Foi renomeada de `(payload)` para `(_payload)` em `src/app/acompanhar/[token]/page.tsx:184`

---

## 🚧 Em Progresso

**Nenhuma funcionalidade em progresso no momento.**

---

## 📋 Checklist de Saúde do Sistema

| Item | Status |
|------|--------|
| Build passa | ✅ |
| TypeScript sem erros | ✅ |
| Cliente consegue agendar | ✅ |
| Cliente vê status correto | ✅ |
| Admin consegue aprovar/recusar | ✅ |
| Admin consegue gerenciar fila | ✅ |
| Realtime funciona | ✅ |
| Previsão de tempo calcula corretamente | ✅ |
| RLS protege dados sensíveis | ✅ |
| Autenticação admin funciona | ✅ |

---

## 🔬 Testes Manuais Recomendados

### Teste 1: Fluxo Completo de Agendamento

1. Acesse `/agendar`
2. Preencha formulário (nome, WhatsApp, procedimento, data/hora)
3. Confirme → deve redirecionar para `/acompanhar/[token]`
4. Verifique: mostra "Aguardando confirmação"
5. Admin: acesse `/admin/solicitacoes`
6. Aprove o agendamento
7. Volte à página do cliente → deve atualizar automaticamente para "Agendamento confirmado"

**Esperado:** cliente vê mudança sem recarregar página (Realtime)

### Teste 2: Iniciar e Pausar Atendimento

1. Admin: `/admin/atendimentos`
2. Clique "Iniciar" em um agendamento confirmado
3. Verifique: status muda para "Em atendimento"
4. Cliente vê atualização em tempo real
5. Admin: clique "Pausar"
6. Cliente vê "Pausado"
7. Admin: clique "Retomar"
8. Cliente vê "Em atendimento" novamente

**Esperado:** todas as mudanças refletem em tempo real na página do cliente

### Teste 3: Recusar Agendamento

1. Cliente agenda horário
2. Admin: `/admin/solicitacoes`
3. Clique "Recusar" → confirma
4. Volte à página do cliente
5. Verifique: mostra "Solicitação recusada"

**Esperado:** cliente vê recusa automaticamente

---

## 🗂️ Estrutura de Arquivos (Principais)

```
src/
├── app/
│   ├── agendar/page.tsx                    ✅ OK
│   ├── acompanhar/[token]/page.tsx         ✅ OK (com fix 2026-10-01)
│   ├── login/page.tsx                      ✅ OK
│   ├── admin/
│   │   ├── page.tsx                        🟡 Contador misto (não bloqueante)
│   │   ├── layout.tsx                      ✅ OK
│   │   ├── atendimentos/
│   │   │   ├── page.tsx                    ✅ OK
│   │   │   └── proximo-atendimento.tsx     🟡 Não filtra status_confirmacao
│   │   ├── solicitacoes/page.tsx           ✅ OK
│   │   ├── clientes/page.tsx               ✅ OK
│   │   ├── procedimentos/page.tsx          ✅ OK
│   │   └── bloqueios/page.tsx              ✅ OK
│   └── actions/
│       ├── agendamento.ts                  ✅ OK
│       └── solicitacoes.ts                 ✅ OK
├── lib/
│   ├── previsao.ts                         ✅ OK (algoritmo testado)
│   ├── tokens.ts                           ✅ OK
│   └── types.ts                            ✅ OK
supabase/
├── migrations/                             ✅ 7 migrations aplicadas
│   ├── 20260910000000_fundacao.sql
│   ├── 20260910000001_seguranca_rls.sql
│   ├── 20260910000002_corrigir_rls.sql
│   ├── 20260911000000_fn_atendimento_publico.sql
│   ├── 20260911000001_corrigir_fn_atendimento_publico.sql
│   ├── 20260911000002_fn_atendimento_publico_duracao.sql
│   └── 20260914000000_broadcast_publico_realtime.sql
docs/
├── migracoes-mvp-rls.sql                   🔴 Fora de migrations/ (não aplicado automaticamente)
└── ia/                                     ✅ Documentação para IA
```

---

## 🔐 Segurança

- ✅ RLS ativo em todas as tabelas críticas
- ✅ Anon só acessa via RPC ou com filtro `token_acesso`
- ✅ Admin requer autenticação Supabase
- ✅ Tokens de acompanhamento são opacos e únicos
- ✅ Sem exposição de IDs internos para cliente
- ✅ CORS configurado corretamente
- ✅ Variáveis de ambiente segregadas (`.env.local` não commitado)

---

## 📊 Métricas de Código

| Métrica | Valor |
|---------|-------|
| Arquivos TypeScript | ~25 |
| Linhas de código (src/) | ~3000 |
| Migrations SQL | 7 |
| Componentes React | ~15 |
| Server Actions | 8 |
| Tabelas no banco | 4 principais (atendimentos, clientes, procedimentos, bloqueios_agenda) |
| Políticas RLS | ~10 |
| Funções RPC | 1 (fn_buscar_atendimento_publico) |

---

## 🎯 Próximos Passos Recomendados

1. **Melhorar contador do dashboard** — filtrar só por `status_confirmacao = 'pendente'`
2. **Filtrar próximo atendimento** — adicionar `.neq('status_confirmacao', 'pendente')`
3. **Atualizar RPC** — incluir `status_confirmacao` no retorno (migration)
4. **Mover DDL para migrations/** — consolidar `docs/migracoes-mvp-rls.sql`
5. **Testes automatizados** — adicionar testes E2E com Playwright

---

## 📝 Notas Importantes

- Sistema está **pronto para produção** nos fluxos principais
- Problemas conhecidos são **não bloqueantes** e têm workarounds
- Documentação está **atualizada e completa**
- Código está **limpo e tipado**
