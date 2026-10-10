# 04 — PENDÊNCIAS E TAREFAS

> Lista viva de tarefas organizadas por prioridade.

**Última atualização:** 2026-10-10

---

## 🔴 Alta Prioridade

Nenhuma pendência de alta prioridade no momento.

---

### ✅ Reformulação do dashboard `/admin` — central operacional (2026-10-03)

**Descrição:**

Segunda reformulação do dashboard administrativo. Objetivo: eliminar repetição de funções (Solicitações/Atendimentos apareciam no menu, botões superiores, cards de resumo e ações rápidas) e transformar o `/admin` em um centro operacional simples.

**O que foi alterado:**

- Removidos botões duplicados de Solicitações e Atendimentos do topo (já existem no menu lateral).
- Mantidos apenas cards informativos: Solicitações pendentes (destaque), Atendimentos do dia, Bloqueios da agenda.
- "Próximos atendimentos" passa a ser o foco principal: lista com horário, cliente, procedimento, duração e status.
  - Próximo atendimento em destaque (card preto com horário, cliente, procedimento, duração, badge "Em andamento").
  - Demais horários do dia em lista vertical.
- Adicionada seção "Resumo do salão" com seletor de período (Hoje / Esta semana / Este mês):
  - Clientes atendidos, total de procedimentos, finalizados, cancelados.
  - Procedimentos realizados por tipo (Cortes/Pinturas/Escovas/Outros), calculados a partir das tabelas existentes (`atendimentos`, ` clientes`, `procedimentos`).
- Removidas ações rápidas repetitivas (Solicitações/Atendimentos já existem no menu).

**Restrições cumpridas:**

- Nenhuma alteração em banco, migrations, RLS, fluxo de atendimento, solicitações ou autenticação.
- Apenas organização visual, componentes do dashboard e consultas necessárias para os indicadores.

**Arquivo alterado:**

- `src/app/admin/page.tsx` — Estrutura JSX reformulada, novo componente `ResumoSalao` com seletor de período e cards de indicadores.

---

### ✅ Atendimento finalizado sumindo do dashboard `/admin` (2026-10-03)

**Descrição:**

Após um atendimento ser finalizado, ele continuava aparecendo no card "Atendimentos do dia" e na lista "Próximos atendimentos" do dashboard.

**Status:** ✅ **RESOLVIDO em 2026-10-03**

**Solução aplicada:**

- Contador "Atendimentos do dia": passa a filtrar apenas statuses operacionais (`aguardando`, `em_andamento`, `pausado`), excluindo `finalizado`, `cancelado`, `no_show`.
- Lista "Próximos atendimentos": corrigido filtro — exigia `status === 'confirmado'` (valor inexistente em `status`) e incluía `em_andamento` indevidamente. Novo filtro: `status === 'aguardando'` ou `status === 'em_andamento'` **E** `status_confirmacao === 'confirmado'`.

**Arquivo alterado:**
- `src/app/admin/page.tsx` — Dois blocos de filtragem corrigidos dentro de `carregar()`.

---

## 🟡 Média Prioridade

### 1. ~~Realtime no card "Solicitações pendentes" do dashboard `/admin`~~ ✅ CONCLUÍDO

**Descrição:**

O badge do menu lateral atualizava em tempo real, mas o card "Solicitações pendentes" no dashboard (`/admin`) ficava estático até ser feito F5 manual.

**Status:** ✅ **RESOLVIDO em 2026-10-01**

**Solução aplicada:**

- Adicionado cliente Supabase memoizado via `useMemo`.
- Adicionado canal Supabase Realtime (`admin-dashboard-realtime`) escutando eventos `'*'` na tabela `atendimentos`.
- Disparo de `carregar()` a cada evento em tempo real para recalcular o total de pendentes (`status_confirmacao = 'pendente'`) e os próximos horários.

**Arquivo alterado:**
- `src/app/admin/page.tsx` — Memoização do Supabase client, subscrição Realtime no `useEffect` e callback `carregar` memoizado via `useCallback`.

---

### 2. Atualizar RPC para retornar `status_confirmacao`

**Descrição:**

Atualmente `fn_buscar_atendimento_publico` não retorna o campo `status_confirmacao`. Há um workaround (busca secundária), mas o ideal é incluir na RPC.

**Impacto:**

- Duas queries em vez de uma (impacto mínimo, mas não ideal)

**Solução:**

Criar migration que altera a RPC para incluir `status_confirmacao` no SELECT.

**Estimativa:** 30 minutos

**Bloqueio:** usuário pediu para NÃO alterar banco neste momento

---

### 3. Atendimentos passados permanecendo em status aguardando

**Descrição:**

Agendamentos cujo horário já passou (no passado) permanecem com `status = 'aguardando'` indefinidamente, poluindo a lista de atendimentos ativos.

**Problema:**

- Não há processo automático ou manual claro para marcar atendimentos passados como `no_show` ou `cancelado`
- Admin precisa limpar manualmente agendamentos que o cliente não compareceu
- Lista de atendimentos fica poluída com horários antigos

**Impacto:**

- Previsão de horários pode incluir agendamentos passados
- Dashboard conta atendimentos antigos como "pendentes"
- Experiência do admin prejudicada (precisa filtrar visualmente)

**Soluções Possíveis:**

**Opção A (automática):** Job/cron que marca atendimentos passados (horário_agendado < now - 1 hour, status = 'aguardando') como 'no_show'

**Opção B (manual melhorada):** Botão/ação em massa no admin para "Limpar atendimentos passados"

**Opção C (filtro):** Filtrar views do admin para ocultar agendamentos com horário_agendado no passado

**Estimativa:** 2-4 horas (depende da solução escolhida)

---

### 4. Consolidar `docs/migracoes-mvp-rls.sql` em migrations ordenadas

**Descrição:**

Arquivo `docs/migracoes-mvp-rls.sql` contém DDL importante mas está fora de `supabase/migrations/`, então não é aplicado automaticamente pelo CLI.

**Conteúdo:**

- `ALTER TABLE atendimentos ADD COLUMN status_confirmacao text;`
- Política RLS `anon_atendimentos_select_proprio_token`

**Solução:**

1. Criar migration ordenada: `supabase/migrations/20260915000000_adicionar_status_confirmacao.sql`
2. Copiar conteúdo de `docs/migracoes-mvp-rls.sql`
3. Testar em ambiente de dev: `supabase db reset`
4. Deletar `docs/migracoes-mvp-rls.sql` após confirmar

**Estimativa:** 30 minutos

**Bloqueio:** usuário pediu para NÃO alterar banco neste momento

---

## 🟢 Baixa Prioridade

### 5. Adicionar testes E2E

**Descrição:**

Sistema não tem testes automatizados. Testes manuais são executados a cada mudança.

**Sugestão:** Playwright

**Casos de teste:**

1. Fluxo completo de agendamento (cliente agenda → admin aprova → cliente vê confirmação)
2. Recusa de agendamento
3. Iniciar/pausar/retomar atendimento
4. Cancelar atendimento
5. Cliente não compareceu (no_show)

**Estimativa:** 4 horas

---

### 6. Melhorar tratamento de erros na página de acompanhamento

**Descrição:**

Página `/acompanhar/[token]` mostra mensagem genérica "Erro ao carregar" quando algo falha.

**Melhoria:**

Diferenciar tipos de erro:

- Token inválido → "Link inválido ou expirado"
- Erro de rede → "Sem conexão. Tentando reconectar..."
- Erro no servidor → "Erro temporário. Tente novamente em instantes."

**Arquivo:** `src/app/acompanhar/[token]/page.tsx`

**Estimativa:** 1 hora

---

### 7. Adicionar loading skeleton na página de acompanhamento

**Descrição:**

Ao carregar `/acompanhar/[token]`, página mostra spinner genérico. Um skeleton seria mais elegante.

**Sugestão:**

Mostrar cards vazios pulsantes enquanto carrega, em vez de spinner central.

**Estimativa:** 1 hora

---

### 8. Adicionar notificação push/WhatsApp quando agendamento for aprovado

**Descrição:**

Cliente só descobre que foi aprovado se abrir a página. Seria melhor enviar notificação.

**Opções:**

1. **WhatsApp** — via API do WhatsApp Business ou Twilio
2. **Web Push** — notificação do navegador (requer service worker)
3. **E-mail** — se cliente fornecer e-mail

**Estimativa:** 4+ horas (depende da integração escolhida)

---

### 9. Exportar relatório de atendimentos (CSV/PDF)

**Descrição:**

Admin pode querer exportar lista de atendimentos para análise externa.

**Funcionalidade:**

- Botão "Exportar" em `/admin/atendimentos`
- Escolher período (data início/fim)
- Formato: CSV ou PDF
- Campos: cliente, procedimento, data/hora, status, duração

**Estimativa:** 3 horas

---

### 10. Adicionar campo "observações" em atendimento

**Descrição:**

Admin pode querer anotar observações sobre um atendimento (ex: "cliente chegou 10 min atrasado", "pediu trocar cor").

**Implementação:**

- Migration: `ALTER TABLE atendimentos ADD COLUMN observacoes text;`
- UI: textarea em modal no painel admin
- Não mostrar para cliente (interno)

**Estimativa:** 2 horas

**Bloqueio:** usuário pediu para NÃO alterar banco neste momento

---

## ✅ Simplificação /admin/bloqueios — 2 modelos com abas (2026-10-04)

**Descrição:** Interface simplificada com abas Semanal / Data específica; cards listáveis; sem migration/banco.

**O que foi feito:**
- Reescrita `src/app/admin/bloqueios/page.tsx` com abas (`semanal` / `especifica`).
- Formulário Semanal: dia da semana, hora inicial/final, motivo. Salva como bloqueio derivado (próxima ocorrência) usando tabela `bloqueios_agenda` existente (`inicio`/`fim`/`descricao`).
- Formulário Data específica: data, hora inicial/final, motivo. Salva direto.
- Listagem de cards com descrição + período formatado e botões Excluir / Editar.
- Nenhuma alteração em banco, migrations, RLS.

**Restrições cumpridas:**
- Tabela `bloqueios_agenda` mantida (id, inicio TIMESTAMPTZ, fim, descricao).
- Nenhum campo novo adicionado ao banco.
- UI deriva registros tradicionais a partir dos inputs semanais/específicos.

**Arquivos alterados:**
- `src/app/admin/bloqueios/page.tsx`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`

---

## ✅ Correção /admin/bloqueios — 3 modelos de regra sem repetição (2026-10-04)

**Descrição:** Modelo corrigido para trabalhar com regras únicas (não registros repetidos): Fixo semanal (múltiplos dias), Temporário (período), Específico (data única).

**O que foi feito:**
- Migration `supabase/migrations/20261004000000_bloqueios_regras.sql`: campos `tipo`, `dias_semana`, `data_inicio`/`fim`, `hora_inicio`/`fim`.
- `src/lib/types.ts`: `BloqueioAgenda` e `BloqueioAgendaInput` atualizados.
- `src/app/actions/bloqueios.ts`: `criarBloqueio` salva uma regra única (não gera 5 registros para semanal).
- `src/app/admin/bloqueios/page.tsx`: abas Fixo semanal / Temporário / Data específica; cards listam uma regra só; seleção de múltiplos dias.
- Nenhum arquivo de agendamento (`agendar`) alterado; bloqueios existentes ainda funcionam via `inicio`/`fim`.

**Restrições:**
- Nenhuma alteração em `atendimentos`, fila, solicitações, autenticação.
- `agendar/page.tsx` não alterado (não tocado conforme instrução).

---

## ✅ Conflito bloqueios × atendimentos — aviso + WhatsApp + Manter/Cancelar (2026-10-10)

**Descrição:** Ao salvar bloqueio, verificar atendimentos ativos (`aguardando`/`em_andamento`/`pausado`) no período; se conflito, retornar para front sem salvar automaticamente; front exibe modal com cliente, horário, procedimento, link WhatsApp (`wa.me/<numero>`), botões "Manter bloqueio" / "Cancelar"; decisão sempre da Inácia.

**O que foi feito:**
- `src/app/actions/bloqueios.ts`: `criarBloqueio` calcula período, busca `.in('status', statusAtivos)`, compara conflito (`atInicio <= bloqueioFim && atFim > bloqueioInicio`), retorna `{sucesso:false, dados:{conflito:true, atendimentos:[...]}}`; aceita `ignorarConflito` para forçar quando usuário confirma.
- `src/app/admin/bloqueios/page.tsx`: recebe conflito, exibe modal (cards com cliente/procedimento/horário + botão WhatsApp + botões Manter/Cancelar).
- Nenhuma alteração em banco, `/agendar`, fila, auth.

**Restrições cumpridas:**
- Não alterar banco (`bloqueios_agenda` já existe).
- Não alterar `/agendar`.
- Nenhum auto-cancelar — só Inácia decide.

**Verificações:**
- ✅ `npx tsc --noEmit` — 0 erros.
- ✅ `npm run build` — passa.

---

## ✅ Restauração do formulário /admin/bloqueios — 3 abas funcionando (2026-10-10)

**Contexto:** A página de bloqueios estava no formato simples (data/hora início+fim, sem abas), apesar do backend (`criarBloqueio`) e types já suportarem os 3 modelos de regra.

**O que foi feito:**
- Restaurado `src/app/admin/bloqueios/page.tsx` com 3 abas (`Fixo semanal` / `Temporário` / `Data específica`).
- Formulário por aba: seleção de dias da semana (botões) + horas; ou datas + horas; descrição obrigatória.
- Cards de listagem mostram tipo de regra, dias fixos (quando aplicado), período temporário ou data específica, horário e duração.
- `criarBloqueio` chamado com payload completo (`tipo`, `dias_semana`, `data_inicio`/`fim`, `hora_inicio`/`fim`, `descricao`) — compatível com a action existente (não alterada).
- Nenhuma alteração no banco, migrations, RLS, fluxo de agendamento ou fila.

**Verificações:**
- ✅ `npx tsc --noEmit` — 0 erros.
- ✅ `npm run build` — passa (14 rotas, incluindo `/admin/bloqueios`).
- ✅ Página funciona com os 3 modelos conforme documentado em 04-PENDENCIAS.md (seção 287-301).

**Arquivos alterados:**
- `src/app/admin/bloqueios/page.tsx` — restaurado com abas.

---

## ✅ Melhoria 2 — Notificação flutuante de solicitações (2026-10-03)

**Descrição:**

Indicador global no layout do admin (`layout.tsx`) que mostra um quadrado vermelho fixo (`fixed`, `z-50`, `top-4 right-4`) com o número de solicitações pendentes (`status_confirmacao = 'pendente'`).

**Como funciona:**

- Quadrado vermelho (`bg-red-600`) com número branco.
- Só aparece quando `contagem > 0`.
- Ao clicar, redireciona para `/admin/solicitacoes`.
- Atualiza automaticamente via Realtime (`badge-pendentes-realtime`) quando novas solicitações chegam, são aprovadas ou recusadas.

**Arquivo alterado:**
- `src/app/admin/layout.tsx`

---

## ✅ Melhoria 1 — Ordenação dos atendimentos por horário (2026-10-03)

**Descrição:**

A listagem `/admin/atendimentos` agora ordena atendimentos por horário marcado, não por data de criação.

**Regra aplicada:**

```ts
.order('horario_agendado', { ascending: true, nullsFirst: false })
.order('ordem_fila', { ascending: true, nullsFirst: false })
```

- `agendamento`: ordena por `horario_agendado ASC` (09:00 → 12:00 → 15:00)
- `fila`: ordena por `ordem_fila ASC`
- Nenhum status removido: todos permanecem visíveis (aguardando, em_andamento, pausado, finalizado, cancelado, no_show)

**Arquivo alterado:**
- `src/app/admin/atendimentos/page.tsx`

---

### ✅ Previsão inteligente de atendimento — sem exposição da fila (2026-10-03)

**Descrição:**

Página `/acompanhar/[token]` agora mostra previsão de horário simples (baseada em `calcularPrevisao`) sem expor quantidade de clientes na frente ou lista de outros clientes.

**O que foi feito:**

- Removido bloco que mostrava posição na fila (`ordem_fila` e texto "Tem X pessoas na sua frente").
- Adicionado bloco "Previsão de atendimento" com mensagem simples: "Seu horário está mantido." ou hora estimada baseada em `previsao.inicio_previsto`.
- Continue usando Realtime existente (`atendimento-atualizado`) para atualização automática.
- Nenhum dado de outros clientes exposto.

**Arquivo alterado:**
- `src/app/acompanhar/[token]/page.tsx`

---

### ✅ Histórico e estatísticas por cliente (2026-10-03)

**Descrição:**

Na aba `/admin/clientes`, ao clicar "Ver histórico" de um cliente, exibe:

- Perfil: nome, WhatsApp
- Resumo: total de atendimentos, primeiro, último
- Filtros: 7 dias / 30 dias / Este ano / Todos
- Estatísticas: quantidade por procedimento
- Histórico ordenado: atendimentos `status = 'finalizado'`, do mais recente ao mais antigo

**Regras cumpridas:**

- Usa tabelas existentes (`clientes`, `atendimentos`, `procedimentos`)
- Nenhuma tabela nova criada
- Nenhuma migration
- Identificação pelo WhatsApp normalizado (Etapa 1 preservada)
- Nenhum dado de outros clientes exposto no perfil

**Arquivo alterado:**
- `src/app/admin/clientes/page.tsx`
- `src/lib/historico-cliente.ts` (tipos auxiliares)

---

## 📋 Tarefas Concluídas Recentemente

### ✅ Realtime no card "Solicitações pendentes" do dashboard `/admin` (2026-10-01)

Adicionada subscrição Realtime própria em `src/app/admin/page.tsx` com `useMemo` e canal `admin-dashboard-realtime` escutando alterações em `atendimentos` e mantendo a contagem `status_confirmacao = 'pendente'` em tempo real.

---

### ✅ Realtime na página de solicitações `/admin/solicitacoes` (2026-10-01)

Implementado cliente memoizado e canal Realtime `solicitacoes-realtime` em `src/app/admin/solicitacoes/page.tsx`.

---

### ✅ Fix: status_confirmacao não aparecendo no acompanhamento (2026-10-01)

Busca secundária por token para resolver `status_confirmacao` em `/acompanhar/[token]/page.tsx`.

---

## ✅ Cadastro inteligente de clientes por WhatsApp (2026-10-03)

**Descrição:**

Antes de criar cliente, o WhatsApp é normalizado (`replace(/\D/g, '')`) e buscado por `whatsapp`. Se encontrado, reutiliza o cadastro existente; se não, cria novo.

**Regra aplicada:**

- WhatsApp é chave principal (não nome).
- `(81) 99999-9999` e `81999999999` são tratados como o mesmo número.
- Nenhuma alteração no banco (tabela já tem `whatsapp text not null`).
- Nenhuma migration criada.

**Arquivo alterado:**
- `src/app/actions/agendamento.ts` — normalização `whatsapp.replace(/\D/g, '')` antes de buscar/insert.

---

## ✅ WhatsApp como primeira etapa do agendamento + reconhecimento automático (2026-10-03)

**Descrição:**

Correção do fluxo inteligente do `/agendar`. A primeira versão pedia nome antes de reconhecer o cliente, violando a regra de que o WhatsApp é a primeira etapa.

**Novo fluxo (etapa 1):**

1. **Somente WhatsApp** — a tela inicial mostra apenas o campo de WhatsApp. Nome e sobrenome saíram do formulário inicial.
2. **Ao completar 11 dígitos**, busca em `clients` por `whatsapp` normalizado:
   - **Cliente encontrado** → `etapa1Sub = 'reconhecido'`: mostra "Olá, [nome]! Encontramos seu cadastro." e busca o último atendimento `status = 'finalizado'` (order `criado_em DESC`). Se houver, exibe "Seu último atimento foi: [Procedimento]" com botões `[Repetir procedimento]` (mantém `procedimento_id` e vai para etapa 2) e `[Escolher outro procedimento]` (vai para etapa 2 com lista completa de ativos). Se não houver histórico, mostra mensagem convidando a marcar.
   - **Cliente não encontrado** → `etapa1Sub = 'cadastro'`: mostra os campos Nome (obrigatório) e Sobrenome (opcional). O cliente é criado em `clients` apenas no momento do envio (ação server `criarSolicitacaoAgendamento` já faz a checagem por WhatsApp).
3. **Regra:** cliente existente nunca passa pelo campo nome; não há duplicação; o `criarSolicitacaoAgendamento` continua como ponto único de criação.

**Regras cumpridas:**
- Nenhuma alteração em banco, migrations ou RLS.
- Fluxo de aprovação/atendimento intacto.
- WhatsApp continua sendo a chave principal.

**Arquivo alterado:**
- `src/app/agendar/page.tsx` — ETAPA 1 reformulada (sub-etapas `whatsapp`/`cadastro`/`reconhecido`), busca do último atendimento finalizado, botões de repetir/escolher outro.

---

## 🗂️ Como Usar Esta Lista

1. **Priorizar** — trabalhe em 🔴 Alta antes de 🟡 Média
2. **Estimar** — use as estimativas como guia, não como prazo rígido
3. **Atualizar** — ao completar uma tarefa, mova para "Concluídas Recentemente"
4. **Adicionar** — ao encontrar novo problema ou melhoria, adicione aqui
5. **Deletar** — após 30 dias, mova tarefas concluídas para `02-DECISOES-E-HISTORICO.md`

---

## 📌 Notas

- Tarefas marcadas com **Bloqueio** só devem ser feitas após autorização do usuário
- Estimativas são para desenvolvedor familiarizado com o projeto
- Sempre rodar `npx tsc --noEmit` e `npm run build` após mudanças

---

## ✅ Correção /agendar — erro Runtime NotFoundError e bloqueios em vermelho (2026-10-04)

**Problema:** `useMemo` (`todosHorarios`) usava variáveis duplicadas (`horariosFiltrados` antigo), causando erro React (`NotFoundError` no `useRef`) e duplicação de código na página.

**Solução aplicada:**
- Removido código duplicado no `useMemo` (restos de `horariosFiltrados`).
- `todosHorarios` agora retorna `{ horaStr, disponivel, bloqueado, ... }` completo.
- JSX atualizado: usa `todosHorarios` diretamente; horários bloqueados (`!disponivel`) aparecem em vermelho (`bg-red-50 border-red-200 text-red-400`) e são não-clicáveis (`disabled`).
- `tsc --noEmit` passa limpo; 3 modelos de bloqueio (semanal fixo, temporário, específico) sem repetição.

**Arquivo alterado:** `src/app/agendar/page.tsx`
