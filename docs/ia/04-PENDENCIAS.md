# 04 — PENDÊNCIAS E TAREFAS

> Lista viva de tarefas organizadas por prioridade.

**Última atualização:** 2026-10-01

---

## 🔴 Alta Prioridade

### 1. Atualizar RPC para retornar `status_confirmacao`

**Descrição:**

Atualmente `fn_buscar_atendimento_publico` não retorna o campo `status_confirmacao`. Há um workaround (busca secundária), mas o ideal é incluir na RPC.

**Impacto:**

- Duas queries em vez de uma (impacto mínimo, mas não ideal)

**Solução:**

Criar migration que altera a RPC:

```sql
-- Arquivo: supabase/migrations/YYYYMMDDHHMMSS_adicionar_status_confirmacao_rpc.sql

DROP FUNCTION IF EXISTS fn_buscar_atendimento_publico(text);

CREATE OR REPLACE FUNCTION fn_buscar_atendimento_publico(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT row_to_json(t)
  INTO v_result
  FROM (
    SELECT
      a.id AS atendimento_id,
      a.modo,
      a.status,
      a.status_confirmacao,  -- ← ADICIONAR ESTE CAMPO
      a.horario_agendado,
      a.ordem_fila,
      a.criado_em,
      a.duracao_trabalhada_seg,
      a.pausado_desde,
      c.nome AS cliente_nome,
      c.sobrenome AS cliente_sobrenome,
      p.nome AS procedimento_nome,
      p.duracao_estimada_min
    FROM atendimentos a
    JOIN clientes c ON a.cliente_id = c.id
    JOIN procedimentos p ON a.procedimento_id = p.id
    WHERE a.token_acesso = p_token
  ) t;

  RETURN v_result;
END;
$$;
```

**Depois:**

Remover busca secundária em `src/app/acompanhar/[token]/page.tsx`.

**Estimativa:** 30 minutos

**Bloqueio:** usuário pediu para NÃO alterar banco neste momento

---

## 🟡 Média Prioridade

### 2. Contador do menu lateral divergente da página de solicitações

**Descrição:**

Badge do contador no menu lateral do admin (`src/app/admin/layout.tsx`) mostra número diferente da página `/admin/solicitacoes`.

**Problema:**

- Menu lateral pode estar contando atendimentos de forma diferente da query que lista solicitações pendentes
- Causa confusão visual: badge mostra 5, mas página tem apenas 3 itens

**Solução:**

Investigar a lógica de contagem no menu e padronizar com a query de `/admin/solicitacoes` (filtrar por `status_confirmacao = 'pendente'`).

**Estimativa:** 30 minutos

---

### 3. Filtrar próximo atendimento por `status_confirmacao`

**Descrição:**

Widget "Próximo atendimento" em `src/app/admin/atendimentos/proximo-atendimento.tsx` pode sugerir agendamentos pendentes de aprovação.

**Arquivo:** `src/app/admin/atendimentos/proximo-atendimento.tsx`

**Solução:**

Adicionar filtro na query:

```ts
const { data } = await supabase
  .from('atendimentos')
  .select('*')
  .eq('status', 'aguardando')
  .eq('modo', 'agendamento')
  .neq('status_confirmacao', 'pendente')  // ← ADICIONAR
  .gte('horario_agendado', now)
  .order('horario_agendado', { ascending: true })
  .limit(1)
  .single();
```

**Estimativa:** 15 minutos

---

### 4. Atendimentos passados permanecendo em status aguardando

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

### 5. Padronizar contador de pendentes no dashboard

**Descrição:**

Contador de "Solicitações pendentes" em `/admin` usa lógica mista que pode confundir.

**Arquivo:** `src/app/admin/page.tsx:99`

**Código atual:**

```ts
pendentes: listaHoje.filter((x) =>
  x.status === 'aguardando' || (x as any).status_confirmacao === 'pendente'
).length
```

**Problema:**

Conta atendimentos operacionalmente aguardando + pendentes de aprovação. Número pode diferir da página `/admin/solicitacoes`.

**Solução:**

Contar apenas pendentes de aprovação:

```ts
pendentes: listaHoje.filter((x) =>
  (x as any).status_confirmacao === 'pendente'
).length
```

Ou, melhor ainda, buscar direto da tabela:

```ts
const { count } = await supabase
  .from('atendimentos')
  .select('*', { count: 'exact', head: true })
  .eq('status_confirmacao', 'pendente');
```

**Estimativa:** 20 minutos

---

### 6. Consolidar `docs/migracoes-mvp-rls.sql` em migrations ordenadas

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

### 7. Adicionar testes E2E

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

### 8. Melhorar tratamento de erros na página de acompanhamento

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

### 9. Adicionar loading skeleton na página de acompanhamento

**Descrição:**

Ao carregar `/acompanhar/[token]`, página mostra spinner genérico. Um skeleton seria mais elegante.

**Sugestão:**

Mostrar cards vazios pulsantes enquanto carrega, em vez de spinner central.

**Estimativa:** 1 hora

---

### 10. Adicionar notificação push/WhatsApp quando agendamento for aprovado

**Descrição:**

Cliente só descobre que foi aprovado se abrir a página. Seria melhor enviar notificação.

**Opções:**

1. **WhatsApp** — via API do WhatsApp Business ou Twilio
2. **Web Push** — notificação do navegador (requer service worker)
3. **E-mail** — se cliente fornecer e-mail

**Estimativa:** 4+ horas (depende da integração escolhida)

---

### 11. Exportar relatório de atendimentos (CSV/PDF)

**Descrição:**

Admin pode querer exportar lista de atendimentos para análise externa.

**Funcionalidade:**

- Botão "Exportar" em `/admin/atendimentos`
- Escolher período (data início/fim)
- Formato: CSV ou PDF
- Campos: cliente, procedimento, data/hora, status, duração

**Estimativa:** 3 horas

---

### 12. Adicionar campo "observações" em atendimento

**Descrição:**

Admin pode querer anotar observações sobre um atendimento (ex: "cliente chegou 10 min atrasado", "pediu trocar cor").

**Implementação:**

- Migration: `ALTER TABLE atendimentos ADD COLUMN observacoes text;`
- UI: textarea em modal no painel admin
- Não mostrar para cliente (interno)

**Estimativa:** 2 horas

**Bloqueio:** usuário pediu para NÃO alterar banco neste momento

---

## 📋 Tarefas Concluídas Recentemente

### ✅ Fix: status_confirmacao não aparecendo no acompanhamento (2026-10-01)

**Descrição:**

Cliente via `/acompanhar/[token]` sempre recebia `status_confirmacao = null`, mesmo após aprovação.

**Solução aplicada:**

- Busca secundária via `.eq('token_acesso', token)` para pegar `status_confirmacao`
- Lógica de resolução: se `status = 'aguardando'` e há `statusConfirmacao`, usa o segundo
- Adicionadas entradas em `STATUS_CONFIG` para `pendente`, `confirmado`, `recusado`

**Arquivos alterados:**

- `src/app/acompanhar/[token]/page.tsx`

---

### ✅ Fix: warning TypeScript de variável não usada (2026-10-01)

**Descrição:**

Callback Realtime tinha parâmetro `payload` não usado, gerando warning.

**Solução:**

Renomeado de `(payload) =>` para `(_payload) =>`.

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
