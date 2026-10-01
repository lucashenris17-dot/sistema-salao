# 06 — COMANDO INICIAL PARA IA

> Use este prompt para inicializar qualquer IA (Claude, GPT, etc.) neste projeto.

---

## Prompt de Inicialização

Cole o texto abaixo ao iniciar uma nova sessão com IA:

```
Você é um assistente especializado em desenvolvimento do projeto "Sistema Salão da Inácia".

Antes de fazer qualquer coisa, leia OBRIGATORIAMENTE estes arquivos na ordem:

1. docs/ia/00-MEMORIA-PRINCIPAL.md — arquitetura completa do sistema
2. docs/ia/01-REGRAS-PARA-IA.md — regras que você DEVE seguir
3. docs/ia/03-ESTADO-ATUAL.md — snapshot do que está funcionando

Após ler, confirme que você:
- Entendeu a arquitetura (Next.js App Router + Supabase)
- Entendeu que status e status_confirmacao são campos SEPARADOS
- Entendeu que NÃO deve alterar banco/migrations/RLS sem autorização
- Entendeu que deve rodar `npx tsc --noEmit` antes de concluir qualquer alteração

Depois, me diga o que preciso fazer e vamos começar.
```

---

## Comandos Úteis para o Desenvolvedor

### Desenvolvimento

```bash
# Instalar dependências
npm install

# Rodar em modo dev
npm run dev

# Compilar TypeScript (verificar erros)
npx tsc --noEmit

# Build de produção
npm run build

# Rodar build localmente
npm start
```

### Supabase

```bash
# Iniciar Supabase local
npx supabase start

# Parar Supabase local
npx supabase stop

# Aplicar migrations
npx supabase db push

# Resetar banco (CUIDADO: apaga tudo)
npx supabase db reset

# Ver status do Supabase
npx supabase status
```

### Git

```bash
# Ver status
git status

# Adicionar arquivos
git add <arquivo>

# Commit
git commit -m "mensagem"

# Ver histórico
git log --oneline

# Ver diff de arquivo modificado
git diff <arquivo>
```

---

## Checklist Antes de Pedir Ajuda à IA

- [ ] Li a documentação em `docs/ia/`?
- [ ] Sei qual arquivo precisa ser alterado?
- [ ] Sei qual o comportamento esperado?
- [ ] Tenho mensagem de erro? (copie e cole)
- [ ] Rodei `npx tsc --noEmit` para ver se há erros TypeScript?
- [ ] Sei se a mudança requer alteração no banco? (se sim, perguntar antes)

---

## Perguntas Frequentes (para a IA responder)

### Como funciona o fluxo de aprovação?

1. Cliente agenda → `status = 'aguardando'`, `status_confirmacao = 'pendente'`
2. Admin aprova → `status_confirmacao = 'confirmado'` (status permanece 'aguardando')
3. Admin inicia → `status = 'em_andamento'`

### Por que há dois campos de status?

- `status` = ciclo operacional (aguardando → em_andamento → finalizado)
- `status_confirmacao` = portão de aprovação (pendente → confirmado/recusado)

São ortogonais. Um atendimento pode estar "aguardando" (operacional) e "confirmado" (aprovado) ao mesmo tempo.

### Como o cliente acompanha sem login?

Via token opaco no URL: `/acompanhar/[token]`

- Token gerado ao criar agendamento
- RLS permite SELECT em `atendimentos` quando filtrado por `token_acesso`
- Realtime atualiza página automaticamente

### Por que a RPC não retorna status_confirmacao?

A RPC foi criada antes do campo existir. Há um workaround (busca secundária), mas o ideal seria atualizar a RPC (requer migration).

### Posso alterar migrations existentes?

**NÃO.** Migrations já aplicadas nunca devem ser alteradas. Se errou, crie uma nova migration que corrija.

### Como adicionar um novo campo na tabela?

1. Pergunte ao usuário se pode criar migration
2. Crie arquivo `supabase/migrations/YYYYMMDDHHMMSS_descricao.sql`
3. Escreva SQL: `ALTER TABLE <tabela> ADD COLUMN <campo> <tipo>;`
4. Rode `npx supabase db push` (ou `supabase db reset` em dev)
5. Atualize tipos TypeScript em `src/lib/types.ts` se necessário

### Como testar se RLS está funcionando?

1. Acesse Supabase Studio → SQL Editor
2. Rode query como `anon`:
   ```sql
   SET ROLE anon;
   SELECT * FROM atendimentos;
   ```
3. Deve retornar vazio ou apenas dados permitidos pela política

### Onde estão as variáveis de ambiente?

- `.env.local` — local (não commitado)
- `.env.example` — template (commitado)

Nunca commitar `.env.local` no Git.

---

## Atalhos de Navegação no Código

| Quero... | Arquivo |
|----------|---------|
| Alterar formulário de agendamento | `src/app/agendar/page.tsx` |
| Alterar página de acompanhamento | `src/app/acompanhar/[token]/page.tsx` |
| Alterar aprovação de solicitações | `src/app/admin/solicitacoes/page.tsx` |
| Alterar listagem de atendimentos | `src/app/admin/atendimentos/page.tsx` |
| Alterar dashboard admin | `src/app/admin/page.tsx` |
| Alterar algoritmo de previsão | `src/lib/previsao.ts` |
| Ver tipos TypeScript | `src/lib/types.ts` |
| Ver Server Actions | `src/app/actions/*.ts` |
| Ver migrations | `supabase/migrations/*.sql` |

---

## Estrutura da Documentação

```
docs/ia/
├── 00-MEMORIA-PRINCIPAL.md       # Leia PRIMEIRO
├── 01-REGRAS-PARA-IA.md          # Leia SEGUNDO
├── 02-DECISOES-E-HISTORICO.md    # Por que escolhas foram feitas
├── 03-ESTADO-ATUAL.md            # Leia TERCEIRO — o que está funcionando
├── 04-PENDENCIAS.md              # Tarefas por prioridade
├── 05-ULTIMA-SESSAO.md           # Diário da última sessão
└── 06-COMANDO-INICIAL-IA.md      # Este arquivo
```

---

## Exemplo de Interação Ideal

**Usuário:** "O cliente não está vendo o status de confirmado"

**IA (boa resposta):**

> Entendi. Deixe-me verificar o fluxo de status_confirmacao.
>
> [Lê `src/app/acompanhar/[token]/page.tsx`]
>
> Identifiquei o problema: a página usa apenas `atendimento.status` para determinar o card, mas deveria verificar `status_confirmacao` quando `status = 'aguardando'`.
>
> Solução: alterar a lógica de resolução de status para:
> ```ts
> const statusKey =
>   atendimento.status === 'aguardando' && atendimento.status_confirmacao
>     ? atendimento.status_confirmacao
>     : atendimento.status;
> ```
>
> Também preciso adicionar entradas em `STATUS_CONFIG` para `pendente`, `confirmado`, `recusado`.
>
> Posso fazer essas alterações somente em `src/app/acompanhar/[token]/page.tsx`?

---

## Exemplo de Interação RUIM (não fazer)

**Usuário:** "O cliente não está vendo o status de confirmado"

**IA (resposta ruim):**

> Vou criar uma migration para adicionar o campo `status_display` na tabela...

❌ **ERRADO:** IA está criando migration sem autorização e sem diagnosticar o problema real.

---

## Mensagens de Erro Comuns

### `error TS2339: Property 'status_confirmacao' does not exist on type...`

**Causa:** campo não está tipado em `src/lib/types.ts`

**Solução:** adicionar campo na interface TypeScript correspondente

### `RLS policy violation`

**Causa:** query tentando acessar dados bloqueados por RLS

**Solução:** verificar políticas RLS ou adicionar filtro correto na query

### `relation "public.atendimentos" does not exist`

**Causa:** migrations não foram aplicadas

**Solução:** `npx supabase db push` ou `supabase db reset`

### `NEXT_PUBLIC_SUPABASE_URL is not defined`

**Causa:** `.env.local` não existe ou está incompleto

**Solução:** copiar `.env.example` para `.env.local` e preencher valores

---

## Fluxo de Trabalho Recomendado

1. **Usuário pede mudança**
2. **IA lê arquivos relevantes** (não adivinhar)
3. **IA diagnostica** problema ou plano de implementação
4. **IA propõe solução** e pede confirmação se envolver banco/RLS
5. **IA implementa** (Edit/Write)
6. **IA roda `npx tsc --noEmit`** para verificar
7. **IA atualiza `docs/ia/05-ULTIMA-SESSAO.md`** com o que foi feito
8. **IA sugere próximo passo** (se houver)

---

## Boas Práticas

### ✅ Fazer

- Ler arquivos antes de propor mudanças
- Fazer mudanças cirúrgicas (menor alteração possível)
- Rodar `npx tsc --noEmit` antes de concluir
- Atualizar documentação em `docs/ia/` após mudanças
- Perguntar quando em dúvida

### ❌ NÃO Fazer

- Adivinhar estrutura de código sem ler
- Criar migrations sem autorização
- Alterar RLS sem analisar impacto
- Usar `any` em TypeScript sem justificativa
- Commitar `.env.local` no Git
- Alterar múltiplos arquivos se usuário pediu "somente este arquivo"

---

## Recursos Externos

- [Next.js App Router Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

---

## Contato e Suporte

**Usuário/Proprietário:** LUCAS

Se encontrar algo que não está documentado ou não faz sentido, pergunte ao usuário diretamente.

**Lembre-se:** Esta é uma aplicação real em produção. Toda mudança tem impacto. Seja cuidadoso e metódico.
