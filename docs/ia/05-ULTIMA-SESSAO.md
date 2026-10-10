# 05 — DIÁRIO DA ÚLTIMA SESSÃO

> Atualizado a cada sessão de desenvolvimento. Registra o que foi feito, problemas encontrados e próximo passo recomendado.

---

## Sessão: 2026-10-04 (Correção lógica /admin/bloqueios — 3 modelos de regra)

**Contexto:** Modelo anterior criava 5 registros para "Almoço de segunda a sexta". Corrigido para regras únicas.

**O que foi feito:**
- Migration `supabase/migrations/20261004000000_bloqueios_regras.sql`: `tipo`, `dias_semana`, `data_inicio`/`fim`, `hora_inicio`/`fim`.
- `src/app/admin/bloqueios/page.tsx`: 3 abas (Fixo semanal / Temporário / Data específica); cards listam uma regra; seleção múltipla de dias.
- `src/app/actions/bloqueios.ts`: salva uma regra única (não registros repetidos); preenche `inicio`/`fim` de referência para compatibilidade.
- `src/lib/types.ts`: tipos atualizados.

**Análise de tabela:** `bloqueios_agenda` (id, inicio, fim, descricao) não suportava 3 modelos sem repetição → migration necessária e feita.

**Restrição cumprida:** Nenhum arquivo de `agendar/` ou fila alterado. Nenhum impacto em atendimento.

**Verificações:**
- ✅ `npx tsc --noEmit` — 0 erros
- ✅ `npm run build` — passa (14 rotas)

---

## Sessão: 2026-10-10 (Conflito bloqueios × atendimentos — aviso + WhatsApp + Manter/Cancelar)

### Contexto

Implementar verificação de conflito ao criar bloqueio (`/admin/bloqueios`): comparar com atendimentos ativos (`aguardando`/`em_andamento`/`pausado`); se conflito, alertar com WhatsApp e botões Manter/Cancelar; sem auto-cancelar.

### O que foi feito

1. `src/app/actions/bloqueios.ts`:
   - `BloqueioRegraInput` recebeu `ignorarConflito?: boolean`.
   - `criarBloqueio`: calcula `bloqueioInicio`/`bloqueioFim` (semanal/temporário/específico); busca atendimentos ativos; compara conflito (`atInicio <= bloqueioFim && atFim > bloqueioInicio`); retorna `{sucesso:false, dados:{conflito:true, atendimentos:[...]}}` quando há conflito e `ignorarConflito` é falso.
   - Removidas validações duplicadas (linhas repetidas 191–200).
2. `src/app/admin/bloqueios/page.tsx`:
   - Estado `mostrarConflito`, `conflitosData`, `manterConflito`.
   - Quando `resultado.dados?.conflito`: exibe modal com cards de conflito (cliente, procedimento, horário, link WhatsApp `wa.me/<numero>`), botões "Manter bloqueio" (reenvia com `ignorarConflito:true`) e "Cancelar".
3. Documentação: `docs/ia/03-ESTADO-ATUAL.md` (data atualizada), `docs/ia/04-PENDENCIAS.md` (seção de conflito adicionada), `docs/ia/05-ULTIMA-SESSAO.md` (esta seção).
4. Memória: `memory/conflito-bloqueios-atendimentos.md` registrada; `MEMORY.md` atualizado.

### Restrições cumpridas

- Nenhuma alteração em banco (`atendimentos`, `clientes`, `procedimentos`, `bloqueios_agenda` suficientes).
- Nenhuma alteração em `/agendar`, fila, auth.
- Nenhum auto-cancelar — decisão só da Inácia.

### Verificações

- ✅ `npx tsc --noEmit` — 0 erros.
- ✅ `npm run build` — passa (14 rotas, incluindo `/admin/bloqueios`).

---

## Sessão: 2026-10-03 (Correção do fluxo inteligente do /agendar — WhatsApp primeiro)

### Contexto

Após implementar o cadastro inteligente por WhatsApp na ação server, a versão inicial do `/agendar` ainda pede nome antes de reconhecer o cliente, violando a regra de que o WhatsApp é a primeira etapa.

### O que foi feito

1. **ETAPA 1 reformulada** em `src/app/agendar/page.tsx`:
   - Novo estado `etapa1Sub: 'whatsapp' | 'cadastro' | 'reconhecido'` controla três sub-etapas dentro da etapa 1.
   - Inicialmente mostra **somente o campo WhatsApp** (Nome e Sobrenome foram removidos da tela inicial).
   - Ao completar 11 dígitos, busca em `clients` por `whatsapp` normalizado:
     - **Cliente encontrado** → `etapa1Sub = 'reconhecido'`:
       - Exibe "Olá, [nome]! Encontramos seu cadastro."
       - Busca o último atendimento `status = 'finalizado'` com `.order('criado_em', { ascending: false }).limit(1)` e resolve o `procedimento_id` via `procedimentos`.
       - Se houver histórico: mostra "Seu último atimento foi: [Procedimento]" com botões `[Repetir procedimento]` (mantém `procedimento_id` e avança para etapa 2) e `[Escolher outro procedimento]` (vai para etapa 2 com lista completa de ativos).
       - Se não houver histórico: mensagem convidando a marcar um novo atendimento.
     - **Cliente não encontrado** → `etapa1Sub = 'cadastro'`:
       - Mostra os campos Nome (obrigatório) e Sobrenome (opcional).
       - O cliente é criado em `clients` apenas no momento do envio (ação server `criarSolicitacaoAgendamento` já faz a checagem por WhatsApp).
2. **`handleEtapa1Continuar` corrigido:**
   - Validação de nome agora só é aplicada quando `etapa1Sub === 'cadastro'`.
   - Cliente reconhecido passa direto para etapa 2 sem pedir nome.
3. **Regra preservada:** `criarSolicitacaoAgendamento` continua como ponto único de criação; nenhuma duplicação.

### Problemas encontrados durante a sessão

- **Edit não encontrou o texto** ao tentar substituir o bloco do onChange do WhatsApp (o Read mostrava `from('clients')` mas o Edit matchava `from('clients')` — a causa foi a quebra de linha interna do `if (c)`. Corrigido dividindo a substituição em duas partes.
- **TS 1109 "Expressão esperada"** ao tentar escrever `const v =.validarWhatsApp(...)` — typo de digitação. Corrigido para `const v = validarWhatsApp(...)`.

### Verificações

- ✅ `npx tsc --noEmit` — 0 erros.
- ✅ `npm run build` — passa, todas as 14 rotas geradas.
- ✅ Zero modificações em banco, migrations, RLS, fluxo de atendimento, solicitações ou autenticação.
- ✅ Apenas organização do fluxo de cadastro no `/agendar`.

### Arquivos alterados

- `src/app/agendar/page.tsx` — ETAPA 1 reformulada com sub-etapas, busca do último atendimento finalizado, botões de repetir/escolher outro.
- `docs/ia/04-PENDENCIAS.md` — Nova tarefa concluída registrada.
- `docs/ia/05-ULTIMA-SESSAO.md` — Diário da sessão atualizado.

---

## Sessão: 2026-10-03 (Reformulação do dashboard /admin — central operacional)

### Contexto

Após a primeira reformulação, a análise visual identificou excesso de repetição: as funções Solicitações e Atendimentos apareciam no menu lateral, nos botões superiores, nos cards de resumo e nas ações rápidas. O `/admin` precisava virar um centro operacional simples, não um segundo menu.

### O que foi feito

1. **Removidos botões duplicados do topo:** Solicitações e Atendimentos sumiram do cabeçalho (já existem no menu lateral).
2. **Mantidos apenas cards informativos:**
   - Solicitações pendentes (destaque)
   - Atendimentos do dia
   - Bloqueios da agenda
3. **"Próximos atendimentos" como foco principal:**
   - Próximo atendimento em destaque (card preto com horário, cliente, procedimento, duração, badge "Em andamento").
   - Demais horários do dia em lista vertical.
   - Cada item mostra horário, cliente, procedimento e duração.
4. **Nova seção "Resumo do salão":**
   - Seletor de período: Hoje / Esta semana / Este mês.
   - Cards: Clientes atendidos, total de procedimentos, finalizados, cancelados.
   - Procedimentos realizados por tipo, calculados a partir das tabelas existentes (`atendimentos`, ` clientes`, `procedimentos`).
5. **Removidas ações rápidas repetitivas** (Solicitações/Atendimentos já existem no menu).

### Problemas encontrados durante a sessão

- **Estrutura JSX quebrada:** Ao remover a coluna direita de "Ações rápidas", o `<div>` wrapper principal perdeu o fechamento. Corrigido adicionando `</div>` na linha 726.
- **Aviso TS80006:** função `carregarContador` no layout pode ser assíncrona — apenas informativo, não corrigido (não afeta o build).

### Verificações

- ✅ `npx tsc --noEmit` — 0 erros.
- ✅ Zero modificações em banco, migrations, RLS, fluxo de atendimento, solicitações ou autenticação.
- ✅ Apenas organização visual, componentes do dashboard e consultas para indicadores.

### Arquivos alterados

- `src/app/admin/page.tsx` — Estrutura JSX reformulada, novo componente `ResumoSalao` com seletor de período.
- `docs/ia/04-PENDENCIAS.md` — Nova tarefa concluída registrada.
- `docs/ia/05-ULTIMA-SESSAO.md` — Diário da sessão atualizado.

---

## Sessão: 2026-10-03 (Histórico e estatísticas por cliente — Etapa 2)

### Contexto

Após garantir identificação por WhatsApp (Etapa 1), implementar visualização de histórico individual na aba `/admin/clientes`.

### O que foi feito

- Adicionado botão "Ver histórico" em cada card de cliente.
- Componento de perfil: nome, WhatsApp, total, primeiro, último atendimento.
- Filtros de período: 7 dias / 30 dias / Este ano / Todos.
- Estatísticas: agrupamento por procedimento (`Record<string, number>`).
- Histórico: lista de `finalizado`, ordenado do mais recente ao antigo.
- Nenhuma tabela nova; consulta direta em `atendimentos` por `cliente_id`.
- Nenhuma alteração no banco.

### Arquivos alterados

- `src/app/admin/clientes/page.tsx`
- `src/lib/historico-cliente.ts`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`
- `docs/ia/03-ESTADO-ATUAL.md`

---

## Sessão: 2026-10-03 (Cadastro inteligente por WhatsApp — chave principal)

### Contexto

Evitar duplicação de clientes usando WhatsApp como identificador principal (não nome).

### O que foi feito

- Normalização do WhatsApp: `whatsapp.replace(/\D/g, '')` (remove tudo que não é dígito).
- `(81) 99999-9999` e `81999999999` tratadas como o mesmo cliente.
- Busca por `whatsapp` normalizado antes de criar (`.eq('whatsapp', whatsappLimpo)`).
- Se existente: reutiliza `clienteId`; se não: cria com `insert`.
- Nenhuma alteração em banco, migrations ou RLS.
- Tabela `clientes` já usa `whatsapp` como chave natural.

### Verificações

- ✅ `npx tsc --noEmit` — 0 erros
- ✅ Nenhuma migration necessária
- ✅ Fluxo de agendamento preservado

### Arquivos alterados

- `src/app/actions/agendamento.ts`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`

---

## Sessão: 2026-10-03 (Previsão inteligente de atendimento — sem expor fila de clientes)

### Contexto

Cliente na página `/acompanhar/[token]` precisava de uma previsão de atendimento simples, sem expor a posição na fila ou quantidade de pessoas na frente.

### O que foi feito

- Removido bloco de posição na fila (`ordem_fila`, texto "Tem X pessoas na sua frente").
- Adicionado bloco "Previsão de atendimento" com mensagem simples baseada em `calcularPrevisao` (`previsao.inicio_previsto`).
- Nenhum dado de outros clientes exposto.
- Realtime existente (`atendimento-atualizado`) continua atualizando automaticamente.
- Nenhuma alteração em banco.

### Verificações

- ✅ `npx tsc --noEmit` — 0 erros
- ✅ `npm run build` — passa
- ✅ Nenhum dado de fila exposto ao cliente

### Arquivos alterados

- `src/app/acompanhar/[token]/page.tsx`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`
- `docs/ia/03-ESTADO-ATUAL.md`

---

## Sessão: 2026-10-03 (Melhoria 1 — Ordenação dos atendimentos / Melhoria 2 — Badge fixo de solicitações)

### Melhoria 1: Ordenação dos atendimentos por horário

**Arquivo:** `src/app/admin/atendimentos/page.tsx`

**Mudança:** Substituído `.order('criado_em', { ascending: false })` por:

```ts
.order('horario_agendado', { ascending: true, nullsFirst: false })
.order('ordem_fila', { ascending: true, nullsFirst: false })
```

- `modo = 'agendamento'`: ordena por `horario_agendado ASC` (09:00 → 12:00 → 15:00)
- `modo = 'fila'`: ordena por `ordem_fila ASC`
- Nenhum atendimento é removido (aguardando, em_andamento, pausado, finalizado, cancelado, no_show continuam visíveis)
- Nenhuma alteração no banco (sem migration)

### Melhoria 2: Notificação flutuante de solicitações

**Arquivo:** `src/app/admin/layout.tsx`

**Mudança:**
- Cliente Supabase memoizado (`useMemo`) no layout para evitar recriação a cada render.
- Novo canal Realtime `badge-pendentes-realtime` escutando eventos `*` na tabela `atendimentos`.
- Estado `badgeContador` atualizado via `useCallback` (`carregarBadge`).
- Componente fixo na tela (`position: fixed`, `top-4 right-4`, `z-50`, `bg-red-600`, `rounded-xl`) que aparece apenas quando `badgeContador > 0`, com número branco no quadrado vermelho.
- Clicar leva para `/admin/solicitacoes`.
- Aparece em todas as páginas do admin (`/admin`, `/admin/atendimentos`, `/admin/solicitacoes`, `/admin/clientes`, `/admin/procedimentos`, `/admin/bloqueios`).
- Atualiza automaticamente quando nova solicitação chega, é aprovada ou recusada.

### Verificações executadas

- ✅ `npx tsc --noEmit` — 0 erros (excluindo avisos existentes de código legado)
- ✅ `npm run build` — passa sem erros
- ✅ Nenhuma alteração em banco, migrations, RLS, fluxo ou autenticação
- ✅ Componentes apenas visuais e organizacionais

---

## Sessão: 2026-10-03 (Fix: atendimento finalizado sumindo do dashboard /admin)

### Contexto

Após finalizar um atendimento na aba `/admin/atendimentos`, ele continuava aparecendo no card "Atendimentos do dia" e na lista "Próximos atendimentos" do dashboard `/admin`.

### Problema Identificado

Em `src/app/admin/page.tsx`, dentro da função `carregar()`:

**Bug 1 — Contador "Atendimentos do dia":**
- `total: listaHoje.length` contava todos os atendimentos do dia sem filtragem de status, incluindo `finalizado`, `cancelado`, `no_show`.

**Bug 2 — Lista "Próximos atendimentos":**
- Filtro com `x.status === 'confirmado'` era inválido (`confirmado` é valor de `status_confirmacao`, não de `status`).
- Incluía `x.status === 'em_andamento'` sem exigir `status_confirmacao === 'confirmado'`, expondo agendamentos pendentes de aprovação.

### Solução Aplicada

1. **Contador "Atendimentos do dia":**
   ```tsx
   const statusOperacionais = ['aguardando', 'em_andamento', 'pausado'];
   const listaHojeOperacional = listaHoje.filter((x) =>
     statusOperacionais.includes(x.status)
   );
   setDados({
     total: listaHojeOperacional.length,
     // ...
   });
   ```

2. **Lista "Próximos atendimentos":**
   ```tsx
   const proximos = lista.filter((x) => {
     if (x.modo === 'agendamento' && x.horario_agendado) {
       return (
         x.horario_agendado.startsWith(hoje) &&
         (x.status === 'aguardando' || x.status === 'em_andamento') &&
         (x as any).status_confirmacao === 'confirmado'
       );
     }
     return false;
   });
   ```

   Dashboard agora exclui `finalizado`, `cancelado`, `no_show` e atendimentos pendentes de aprovação.

### Verificações e Testes Executados

- ✅ `npx tsc --noEmit` — 0 erros.
- ✅ Zero modificações no banco de dados, migrations ou RLS.
- ✅ Regra principal preservada: `/admin/atendimentos` continua mostrando histórico completo.

### Fluxo esperado após o fix

1. Cliente agenda → Admin aprova → Aparece nos "Próximos atendimentos" ✅
2. Admin inicia → Continua aparecendo (em_andamento ainda é operacional) ✅
3. Admin finaliza → Some do dashboard imediatamente (Realtime triggera `carregar()`) ✅
4. Admin acessa `/admin/atendimentos` → Finalizado ainda aparece na lista ✅

### Arquivos Alterados

- `src/app/admin/page.tsx` — Dois blocos de filtragem corrigidos dentro de `carregar()`.
- `docs/ia/04-PENDENCIAS.md` — Nova tarefa concluída registrada.
- `docs/ia/05-ULTIMA-SESSAO.md` — Diário da sessão atualizado.

---

## Sessão: 2026-10-04 (Simplificação /admin/bloqueios — 2 modelos)

**Contexto:** Continuar simplificação de `/admin/bloqueios` em 2 modelos (recorrente semanal vs data específica) com abas, sem alterar banco.

**O que foi feito:**
- Reescrito `src/app/admin/bloqueios/page.tsx`: abas Semanal / Data específica, formulário por aba, listagem em cards, excluir, descricao.
- Modelo semanal deriva registro de bloqueio tradicional a partir de dia/hora usando tabela existente (`bloqueios_agenda`).
- Nenhum campo novo no banco; nenhuma migration; nenhuma alteração em RLS/fluxo.

**Verificações:**
- ✅ `npx tsc --noEmit` — 0 erros
- ✅ `npm run build` — passa (14 rotas geradas, incluindo `/admin/bloqueios`)
- ✅ Nenhuma alteração em banco/migrations/fluxo

**Arquivos alterados:**
- `src/app/admin/bloqueios/page.tsx`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`

---

## Sessão: 2026-10-01 (Realtime no Card "Solicitações pendentes" do Dashboard /admin)

### Contexto

O badge do menu lateral atualizava em tempo real, porém o card "Solicitações pendentes" no dashboard (`/admin`) permanecia desatualizado até refresh manual (F5).

### Problema Identificado

No `src/app/admin/page.tsx`:
- `createBrowserClient` era instanciado diretamente no render do componente sem `useMemo`.
- O `useEffect` executava a busca de dados `carregar()` apenas uma vez ao montar o componente (`[]`).
- Não havia uma subscrição Supabase Realtime para a tabela `atendimentos` no dashboard.

### Solução Aplicada

1. **Instância Estável do Supabase Client:**
   ```tsx
   const supabase = useMemo(
     () =>
       createBrowserClient(
         process.env.NEXT_PUBLIC_SUPABASE_URL!,
         process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
       ),
     []
   );
   ```

2. **Supabase Realtime Próprio no Dashboard:**
   Adicionado canal `admin-dashboard-realtime` no `useEffect` escutando eventos `'*'` (INSERT, UPDATE, DELETE) na tabela `atendimentos`:
   ```tsx
   const carregar = useCallback(async () => {
     // ... busca de atendimentos e cálculo do total de pendentes
   }, [supabase]);

   useEffect(() => {
     carregar();

     const channel = supabase
       .channel('admin-dashboard-realtime')
       .on(
         'postgres_changes',
         {
           event: '*',
           schema: 'public',
           table: 'atendimentos',
         },
         () => {
           carregar();
         }
       )
       .subscribe();

     return () => {
       supabase.removeChannel(channel);
     };
   }, [supabase, carregar]);
   ```

3. **Manutenção da Regra de Negócio:**
   - O card continua filtrando o total de solicitações com `status_confirmacao = 'pendente'`.
   - Nenhuma alteração em banco, migrations ou RLS.

### Verificações e Testes Executados

- ✅ `npx tsc --noEmit` — 0 erros.
- ✅ Zero modificações no banco de dados, migrations ou RLS.

### Arquivos Alterados

- `src/app/admin/page.tsx` — Adicionada memoização do Supabase client, callback `carregar` e canal Realtime próprio.
- `docs/ia/04-PENDENCIAS.md` — Atualizada pendência resolvida.
- `docs/ia/05-ULTIMA-SESSAO.md` — Diário da sessão atualizado.

---

## Sessão: 2026-10-01 (Diagnóstico e Fix: Realtime Instável em /admin/solicitacoes)

### Contexto

Página `/admin/solicitacoes` ainda necessitava de F5 manual em alguns cenários para exibir novas solicitações, apesar de ter o canal Realtime configurado.

### Problema Identificado

Causa raiz encontrada:
- A chamada `createBrowserClient(...)` estava sendo executada diretamente no corpo do componente React `SolicitacoesPage`.
- A cada alteração de estado (`loading`, `solicitacoes`, etc.), a re-renderização criava um novo objeto de cliente Supabase.
- Isso tornava a referência do objeto `supabase` instável e desestabilizava o ciclo de vida do `useEffect` responsável pela subscrição Realtime.

### Solução Aplicada

1. **Estabilização do Cliente Supabase com `useMemo`:**
   Em `src/app/admin/solicitacoes/page.tsx`:
   ```tsx
   const supabase = useMemo(
     () =>
       createBrowserClient(
         process.env.NEXT_PUBLIC_SUPABASE_URL!,
         process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
       ),
     []
   );
   ```

2. **Adicionados Logs Diagnósticos no Realtime:**
   - Log do status da conexão do canal (`[Realtime] Status do canal: SUBSCRIBED`).
   - Log ao receber payload de evento (`[Realtime] Evento recebido: INSERT/UPDATE`).

### Verificações e Testes Executados

- ✅ `npx tsc --noEmit` — 0 erros.
- ✅ Nenhuma alteração em banco, migrations ou RLS.
- ✅ Regra preservada: `status_confirmacao = 'pendente'`.

### Arquivos Alterados

- `src/app/admin/solicitacoes/page.tsx` — Memoização do Supabase client via `useMemo` e inclusão de logs diagnósticos.
- `docs/ia/04-PENDENCIAS.md` — Atualização da lista viva de tarefas.
- `docs/ia/05-ULTIMA-SESSAO.md` — Registro desta sessão.

---

## Sessão: 2026-10-10 (Restauração /admin/bloqueios — 3 abas funcionando)

**Contexto:** A página `src/app/admin/bloqueios/page.tsx` estava no formato simples (data/hora início+fim, sem abas de tipo de regra), apesar do backend (`criarBloqueio`) e types (`BloqueioAgenda`) já suportarem `semanal_fixo`, `temporario`, `especifico` desde a migration 20261004.

**O que foi feito:**
- Reconstruído o formulário com 3 abas: `Fixo semanal`, `Temporário`, `Data específica`.
- Cada aba coleta os dados corretos (`dias_semana` + horas / `data_inicio`/`data_fim` + horas / `data_especifica` + horas) e envia via `criarBloqueio` com payload completo.
- Cards de listagem agora exibem o tipo de regra, dias fixos (quando aplicável), período/temporário e duração.
- Nenhuma alteração no banco, migrations, RLS ou fluxo de agendamento.

**Problemas encontrados / resolvidos:**
- A versão anterior do arquivo não tinha abas (apenas formulário simples); recuperado da documentação (`04-PENDENCIAS.md` seção 287-301) e reconstruído para rodar certo com a action existente.

**Verificações:**
- ✅ `npx tsc --noEmit` — 0 erros.
- ✅ `npm run build` — passa.
- ✅ `/admin/bloqueios` lista bloqueios com tipo correto.

**Arquivos alterados:**
- `src/app/admin/bloqueios/page.tsx`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`

**Nota:** A ação server (`criarBloqueio`) e a migration (`20261004000000_bloqueios_regras.sql`) não foram alteradas — já estavam corretas. Apenas o front foi restaurado.
