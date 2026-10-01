# 01 — REGRAS OBRIGATÓRIAS PARA QUALQUER IA

> **ATENÇÃO:** Siga estas regras em TODAS as modificações no projeto.

---

## 1. Leia Primeiro Estes Arquivos

Antes de fazer qualquer alteração:

1. `docs/ia/00-MEMORIA-PRINCIPAL.md` — entenda a arquitetura completa
2. `docs/ia/03-ESTADO-ATUAL.md` — saiba o que está funcionando e o que não está
3. `docs/ia/02-DECISOES-E-HISTORICO.md` — conheça o histórico de decisões

---

## 2. Mudanças Pequenas e Cirúrgicas

- **Sempre prefira a menor alteração possível**
- Se o usuário pede "corrija somente este arquivo", NÃO altere outros arquivos
- Alterações cirúrgicas reduzem risco de regressões
- Documente o porquê de cada mudança

---

## 3. Banco de Dados e Migrations

### 🔴 NUNCA faça migrations sem autorização explícita

- Migrations alteram a estrutura de produção
- Migrations são irreversíveis (ou muito difíceis de reverter)
- **Sempre pergunte antes** de criar/alterar uma migration
- Se o usuário disser "NÃO altere banco", obedeça literalmente

### ⚠️ Se precisar alterar o banco

1. Pergunte ao usuário antes
2. Explique o que será alterado e por quê
3. Mostre o SQL que será executado
4. Aguarde aprovação explícita
5. Crie a migration com timestamp correto: `YYYYMMDDHHMMSS_descricao.sql`

---

## 4. RLS (Row Level Security)

### 🔴 NUNCA altere políticas RLS sem análise completa

- RLS controla acesso aos dados (segurança crítica)
- Uma política mal feita expõe dados privados ou bloqueia operações legítimas
- **Sempre analise o impacto** antes de propor mudanças

### ⚠️ Se precisar alterar RLS

1. Documente a política atual
2. Explique o problema que ela causa
3. Mostre a política proposta
4. Liste o que ela permitirá e o que bloqueará
5. Aguarde aprovação

---

## 5. Não Quebre Funcionalidades Existentes

- Teste mentalmente o fluxo completo antes de alterar
- Se mudar `status`, considere todos os lugares que o leem
- Se mudar uma API, verifique quem a consome
- Se mudar um tipo TypeScript, compile depois: `npx tsc --noEmit`

### Checklist antes de concluir uma alteração:

- [ ] `npx tsc --noEmit` — zero erros
- [ ] `npm run build` — build passa
- [ ] Fluxo do cliente ainda funciona?
- [ ] Fluxo do admin ainda funciona?
- [ ] Acompanhamento em tempo real funciona?

---

## 6. TypeScript Strict Mode

- O projeto usa `strict: true`
- Nunca use `any` sem justificativa
- Sempre tipar parâmetros e retornos
- Resolver warnings de variáveis não usadas (prefixar com `_` se necessário)

---

## 7. Supabase: Client vs Server

| Contexto | Cliente Supabase |
|----------|-----------------|
| Componente cliente (`'use client'`) | `createBrowserClient` |
| Server Action (`'use server'`) | `createServerClient` com cookies |
| Página pública | `createBrowserClient` (anon key) |

- **NUNCA use `createServerClient` em componente cliente**
- **NUNCA use `createBrowserClient` em Server Action**

---

## 8. Fuso Horário (Brasília UTC-3)

- Sempre salvar como `timestamptz` no banco
- Usar `.toISOString()` ao salvar datas do JavaScript
- Sempre exibir com `toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })`
- A função `parseBrasiliaDateTime()` em `previsao.ts` lida com UTC vs local

---

## 9. Status vs Status Confirmação

⚠️ **CRÍTICO:** São campos separados com propósitos diferentes

| Campo | Propósito |
|-------|-----------|
| `status` | Ciclo operacional: aguardando → em_andamento → finalizado |
| `status_confirmacao` | Aprovação do admin: pendente → confirmado/recusado |

- `status = 'aguardando'` pode coexistir com `status_confirmacao = 'confirmado'`
- Aprovar muda SÓ `status_confirmacao`, `status` continua 'aguardando'
- Recusar muda AMBOS: `status = 'cancelado'` + `status_confirmacao = 'recusado'`

---

## 10. RPC vs Consulta Direta

- `fn_buscar_atendimento_publico(p_token)` — NÃO retorna `status_confirmacao`
- Workaround atual: busca secundária via `.eq('token_acesso', token)` (permitida por RLS)
- Se precisar adicionar campo na RPC, isso é uma **migration** → pedir autorização

---

## 11. Realtime

- Usado em `/acompanhar/[token]` para atualização automática
- Subscreve `postgres_changes` na tabela `atendimentos`
- **Sempre remova o canal** no cleanup: `return () => supabase.removeChannel(channel)`

---

## 12. Tokens de Acompanhamento

- Gerados por `gerarTokenAcompanhamento()` em `src/lib/tokens.ts`
- São únicos e opacos
- Dão acesso somente leitura ao atendimento (via RLS)
- **NUNCA exponha o token em logs ou mensagens de erro**

---

## 13. Atualizar Documentação Após Mudanças

Depois de qualquer alteração de estado, tipos ou fluxo:

1. Atualize `docs/ia/03-ESTADO-ATUAL.md` se o estado mudou
2. Registre a mudança em `docs/ia/02-DECISOES-E-HISTORICO.md`
3. Atualize `docs/ia/05-ULTIMA-SESSAO.md` com o que foi feito

---

## 14. Verificação de Build e Tipos

Sempre rode antes de considerar a tarefa concluída:

```bash
npx tsc --noEmit
npm run build
```

Se qualquer um falhar, corrija antes de entregar.

---

## 15. Manter Dashboard Sincronizado

⚠️ **IMPORTANTE:** Todo desenvolvimento deve manter o `dashboard-executivo.html` sincronizado com o estado atual do projeto.

Após qualquer mudança significativa:

1. Atualize `docs/ia/05-ULTIMA-SESSAO.md` com o que foi feito
2. Se houver novas pendências, adicione em `docs/ia/04-PENDENCIAS.md`
3. Se algo mudar no estado, atualize `docs/ia/03-ESTADO-ATUAL.md`
4. O dashboard em `docs/dashboard-executivo.html` lê automaticamente esses arquivos

**Não é necessário editar o HTML do dashboard manualmente** — ele está conectado aos arquivos `.md` do cérebro do projeto.

---

## 16. Pergunte Quando em Dúvida

- Não adivinhe a intenção do usuário
- Se a solicitação for ambígua, pergunte
- Se houver múltiplas abordagens, liste opções e deixe o usuário escolher
- Nunca altere o escopo sem confirmar

---

## Resumo das Regras de Ouro

1. ✅ Leia a documentação antes de alterar
2. ✅ Mudanças pequenas e cirúrgicas
3. 🔴 NUNCA altere banco/migrations sem autorização
4. 🔴 NUNCA altere RLS sem análise de impacto
5. ✅ Rode `npx tsc --noEmit` antes de concluir
6. ✅ Atualize a documentação após mudanças
7. ✅ Pergunte quando em dúvida
