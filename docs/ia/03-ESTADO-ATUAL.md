# 03 — ESTADO ATUAL DO SISTEMA

> Snapshot do que está funcionando, o que está em progresso e o que está quebrado **agora**.

**Última atualização:** 2026-10-10

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
- ✅ Dashboard `/admin` reformulado como central operacional (2026-10-03, 2ª reformulação):
  - Cards de resumo: Solicitações pendentes (destaque), Atendimentos do dia, Bloqueios da agenda
  - Próximos atendimentos como foco principal: próximo em destaque (card preto com horário, cliente, procedimento, duração, status) + demais horários do dia
  - Nova seção "Resumo do salão" com seletor de período (Hoje / Esta semana / Este mês): clientes atendidos, total de procedimentos, finalizados, cancelados, procedimentos por tipo
  - Removidos: botões duplicados de Solicitações/Atendimentos do topo, ações rápidas repetitivas, pills de status
  - Removidos da tela inicial: Clientes, Procedimentos, Bloqueios (já existem no menu)
- ✅ Listagem de solicitações pendentes em `/admin/solicitacoes`
- ✅ **Realtime em /admin/solicitacoes** — atualiza automaticamente quando cliente cria nova solicitação
- ✅ Aprovar solicitação → `status_confirmacao = 'confirmado'`
- ✅ Recusar solicitação → `status = 'cancelado'` + `status_confirmacao = 'recusado'`
- ✅ Gestão de atendimentos em `/admin/atendimentos`
- ✅ Ações: iniciar, pausar, retomar, finalizar, cancelar, no_show
- ✅ CRUD de clientes em `/admin/clientes`
- ✅ CRUD de procedimentos em `/admin/procedimentos`
- ✅ **Melhoria 1 (2026-10-03):** Atendimentos ordenados por horário (`horario_agendado ASC` para agendamento, `ordem_fila ASC` para fila) — nenhum status removido
- ✅ **Melhoria 2 (2026-10-03):** Badge flutuante vermelho no layout admin (`layout.tsx`) — mostra `status_confirmacao = 'pendente'` em tempo real, link para `/admin/solicitacoes`
- ✅ `/admin/bloqueios` simplificado com 2 modelos: Semanal (recorrente) e Data específica (cards listáveis, excluir, descricao) — nenhuma migração no banco (`bloqueios_agenda` mantida)
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

### 3. ~~Contador de pendentes no dashboard usa lógica mista~~ ✅ RESOLVIDO (2026-10-03)

**Arquivo:** `src/app/admin/page.tsx`

**Era:** `total: listaHoje.length` (contava todos os statuses)

**Agora:** Filtra apenas `aguardando`, `em_andamento`, `pausado` — excluindo `finalizado`, `cancelado`, `no_show`.

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
│   │   ├── page.tsx                        ✅ OK (reformulado 2026-10-03)
│   │   ├── layout.tsx                      ✅ OK
│   │   ├── atendimentos/
│   │   │   ├── page.tsx                    ✅ OK
│   │   │   └── proximo-atendimento.tsx     ✅ OK (filtra status_confirmacao)
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

---

## Atualização de auditoria — 2026-10-10

**Itens verificados e registrados:**
- Janela de 15 dias (`/agendar`) — registrado no código (`Array.from({length:15})`); documentação atualizada.
- Filtros de atendimentos (tabs "Hoje" / "Esta semana" / "Finalizados") — implementados no admin; documento atualizado.
- Conflito bloqueios × atendimentos (aviso + WhatsApp `wa.me`, botões Manter/Cancelar, sem auto-cancelar) — memória `conflito-bloqueios-atendimentos.md` criada; ponteiro em `MEMORY.md`; docs atualizados.
- Nenhum arquivo `src/` alterado; apenas documentação/memória conforme instrução.
