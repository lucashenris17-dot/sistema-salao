# 00 — MEMÓRIA PRINCIPAL DO PROJETO

> Leia este arquivo primeiro. Ele é o ponto de entrada para qualquer IA que trabalhe neste projeto.

---

## Objetivo do Sistema

Sistema de gestão de salão de beleza para **Inácia** (proprietária). Permite que clientes agendem horários online e acompanhem o atendimento em tempo real, enquanto a Inácia gerencia tudo pelo painel admin.

---

## Descrição do Negócio

- **Salão da Inácia** — salão de beleza individual (profissional autônoma)
- **Dois modos de atendimento:**
  1. **Agendamento** — cliente escolhe data/hora online; Inácia confirma ou recusa
  2. **Fila** — cliente entra na fila presencial; ordem determinada por `ordem_fila`
- **Fluxo de aprovação:** agendamentos começam como `pendente`, Inácia aprova ou recusa manualmente
- **Acompanhamento público:** cada atendimento tem um token único; cliente acessa `/acompanhar/[token]` para ver status em tempo real

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16.3.4 (App Router) |
| Linguagem | TypeScript (strict mode) |
| UI Library | React 19.2.8 |
| Estilo | Tailwind CSS |
| Banco de dados | Supabase (PostgreSQL) |
| Auth | Supabase Auth (apenas admin) |
| Realtime | Supabase Realtime (`postgres_changes`) |
| Cliente Supabase | `@supabase/ssr` — `createBrowserClient` (client) / `createServerClient` (server) |
| Hospedagem | Vercel (pressuposto) |

---

## Arquitetura Geral

```
src/
├── app/
│   ├── agendar/             # Formulário público (clientes)
│   ├── acompanhar/[token]/  # Acompanhamento público (clientes)
│   ├── login/               # Login admin
│   ├── admin/               # Painel administrativo (protegido)
│   │   ├── page.tsx             # Dashboard
│   │   ├── layout.tsx           # Shell (nav, header, logout)
│   │   ├── atendimentos/        # Gestão da fila/agenda
│   │   ├── solicitacoes/        # Aprovar/recusar agendamentos
│   │   ├── clientes/            # CRUD clientes
│   │   ├── procedimentos/       # CRUD procedimentos
│   │   └── bloqueios/           # Bloqueios de agenda
│   └── actions/             # Server Actions ('use server')
│       ├── agendamento.ts       # criarSolicitacaoAgendamento
│       └── solicitacoes.ts      # listar/aprovar/recusar
├── lib/
│   ├── previsao.ts          # Algoritmo de previsão de tempo (puro TS)
│   ├── tokens.ts            # Geração de token de acompanhamento
│   └── types.ts             # Tipos compartilhados
supabase/
├── migrations/              # SQL aplicados pelo CLI
└── ...
docs/
└── ia/                      # Esta pasta — documentação para IA
```

---

## Rotas Principais

| Rota | Quem acessa | Descrição |
|------|------------|-----------|
| `/` | Público | Redireciona para `/agendar` |
| `/agendar` | Clientes | Formulário de agendamento (4 etapas) |
| `/acompanhar/[token]` | Clientes | Acompanhamento em tempo real |
| `/login` | Admin | Autenticação |
| `/admin` | Admin (auth) | Dashboard geral |
| `/admin/atendimentos` | Admin | Gestão de atendimentos (fila + agenda) |
| `/admin/solicitacoes` | Admin | Aprovação de agendamentos online |
| `/admin/clientes` | Admin | Cadastro de clientes |
| `/admin/procedimentos` | Admin | Cadastro de procedimentos |
| `/admin/bloqueios` | Admin | Bloqueios de horário |

---

## Módulos e Responsabilidades

### `src/app/agendar/page.tsx`
- Formulário público de 4 etapas para o cliente
- Etapa 1: Nome, sobrenome (opcional), WhatsApp
- Etapa 2: Selecionar procedimento
- Etapa 3: Selecionar data (próximos 14 dias) e horário (08:00–19:00, slots de 30 min)
- Etapa 4: Revisão → chama `criarSolicitacaoAgendamento` → redireciona para `/acompanhar/[token]`
- Filtra horários: exclui passados, períodos bloqueados, sobreposições com `status_confirmacao = 'confirmado'`
- Fuso horário: adiciona offset `-03:00` e converte com `toISOString()` antes de salvar

### `src/app/acompanhar/[token]/page.tsx`
- Página pública de acompanhamento em tempo real
- Busca atendimento via RPC `fn_buscar_atendimento_publico(p_token)`
- **Busca separada** de `status_confirmacao` direto na tabela (RPC não retorna esse campo)
- Resolve status visual: se `status = 'aguardando'` e há `status_confirmacao`, usa o segundo
- Atualiza automaticamente via Supabase Realtime (`postgres_changes` na tabela `atendimentos`)
- Mostra previsão de horário calculada por `calcularPrevisao()`

### `src/app/admin/atendimentos/page.tsx`
- Listagem e gestão de todos os atendimentos
- Ações: iniciar, pausar, retomar, finalizar, cancelar, no_show
- Adicionar novo atendimento (fila ou agendamento manual pelo admin)
- Integra componente `ProximoAtendimento`

### `src/app/admin/atendimentos/proximo-atendimento.tsx`
- Sugere o próximo atendimento a iniciar
- ⚠️ **ATENÇÃO:** Não filtra por `status_confirmacao` — pode exibir agendamentos pendentes como "próximos"

### `src/app/admin/solicitacoes/page.tsx`
- Lista solicitações com `status_confirmacao = 'pendente'`
- Botão Aprovar: `aprovarSolicitacao(id)` → só atualiza `status_confirmacao = 'confirmado'`, `status` fica `'aguardando'`
- Botão Recusar: `recusarSolicitacao(id)` → `status = 'cancelado'` + `status_confirmacao = 'recusado'`

### `src/app/actions/agendamento.ts`
- `criarSolicitacaoAgendamento(input)`: valida, busca/cria cliente por WhatsApp, gera token, insere atendimento com `status = 'aguardando'` + `status_confirmacao = 'pendente'`

### `src/app/actions/solicitacoes.ts`
- `listarSolicitacoesPendentes()`: `.eq('status_confirmacao', 'pendente')`
- `aprovarSolicitacao(id)`: `{ status_confirmacao: 'confirmado' }`
- `recusarSolicitacao(id)`: `{ status: 'cancelado', status_confirmacao: 'recusado' }`

### `src/lib/previsao.ts`
- Algoritmo puro TypeScript (sem dependências externas)
- Calcula `inicio_previsto`, `fim_previsto`, `minutos_restantes` para cada atendimento na fila
- Lida com: em_andamento, pausado, agendamento futuro, fila sequencial, atrasado
- `parseBrasiliaDateTime()`: strings com 'Z' (UTC) são subtraídas 3h; strings locais usadas como estão

### `src/lib/tokens.ts`
- `gerarTokenAcompanhamento()`: gera token seguro único para cada atendimento

### `src/lib/types.ts`
- Tipos TypeScript compartilhados: `SolicitacaoAgendamentoInput`, `SolicitacaoAgendamentoResponse`, `SolicitacaoPendente`, `AcaoResponse<T>`, etc.

---

## Fluxo do Cliente (Agendamento)

```
1. Cliente acessa /agendar
2. Preenche formulário (nome, WhatsApp, procedimento, data/hora)
3. Sistema cria atendimento com:
   status = 'aguardando'
   status_confirmacao = 'pendente'
   modo = 'agendamento'
   token_acesso = <token único gerado>
4. Cliente é redirecionado para /acompanhar/[token]
5. Página mostra "Aguardando confirmação"
6. Admin aprova → status_confirmacao = 'confirmado'
7. Página mostra "Agendamento confirmado"
8. No dia: Admin inicia → status = 'em_andamento'
9. Admin finaliza → status = 'finalizado'
```

---

## Fluxo Admin (Atendimento)

```
Admin vê solicitações pendentes em /admin/solicitacoes
→ Aprova: status_confirmacao = 'confirmado' (status permanece 'aguardando')
→ Recusa: status = 'cancelado', status_confirmacao = 'recusado'

No painel /admin/atendimentos:
→ Iniciar: status = 'em_andamento', registra horário de início
→ Pausar: status = 'pausado', registra pausado_desde
→ Retomar: status = 'em_andamento', acumula duracao_trabalhada_seg
→ Finalizar: status = 'finalizado'
→ Cancelar: status = 'cancelado', salva motivo_cancelamento
→ No-show: status = 'no_show'
```

---

## Modelo de Dados (Tabelas Principais)

### `clientes`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| nome | text | NOT NULL |
| sobrenome | text | NOT NULL (pode ser '' vazio) |
| whatsapp | text | NOT NULL, UNIQUE |
| criado_em | timestamptz | DEFAULT now() |

### `procedimentos`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| nome | text | NOT NULL |
| duracao_estimada_min | integer | |
| ativo | boolean | DEFAULT true |

### `atendimentos`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| cliente_id | uuid | FK → clientes |
| procedimento_id | uuid | FK → procedimentos |
| modo | text | 'agendamento' ou 'fila' |
| status | text | Ver estados abaixo |
| status_confirmacao | text | 'pendente', 'confirmado', 'recusado' |
| horario_agendado | timestamptz | Apenas modo agendamento |
| ordem_fila | integer | Apenas modo fila |
| token_acesso | text | UNIQUE — token público do cliente |
| motivo_cancelamento | text | Preenchido ao cancelar |
| duracao_trabalhada_seg | integer | Tempo acumulado em atendimento |
| pausado_desde | timestamptz | Quando pausado, data da pausa |
| criado_em | timestamptz | DEFAULT now() |

### `bloqueios_agenda`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| inicio | timestamptz | |
| fim | timestamptz | |
| motivo | text | |
| criado_em | timestamptz | |

---

## Regras de Negócio Críticas

1. **`status_confirmacao` é independente de `status`**
   - `status` = ciclo operacional do atendimento
   - `status_confirmacao` = portão de aprovação do agendamento
   - Aprovação muda só `status_confirmacao`, status fica 'aguardando'

2. **Clientes identificados por WhatsApp**
   - Se o número já existe, reutiliza o `cliente_id`
   - Se não existe, cria novo cliente

3. **Agendamentos com conflito**
   - Formulário `/agendar` exclui slots que já têm agendamento confirmado no mesmo horário
   - Considera `status_confirmacao = 'confirmado'` para detectar conflito

4. **Token de acompanhamento**
   - Gerado uma vez, nunca muda
   - Dá acesso somente leitura ao atendimento via RLS

5. **Fuso horário**
   - Brasília (UTC-3)
   - Datas salvas como timestamptz com offset `-03:00`
   - `parseBrasiliaDateTime()` em `previsao.ts` trata string UTC subtraindo 3h

---

## Estados do Atendimento

```
aguardando   → em_andamento → finalizado
     │              │
     │            pausado → em_andamento
     │
     └──→ cancelado
     └──→ no_show
```

| Status | Descrição |
|--------|-----------|
| `aguardando` | Na fila ou agendamento confirmado aguardando ser iniciado |
| `em_andamento` | Atendimento em curso |
| `pausado` | Atendimento temporariamente parado |
| `finalizado` | Concluído com sucesso |
| `cancelado` | Cancelado (admin ou recusa) |
| `no_show` | Cliente não compareceu |

### `status_confirmacao` (só agendamentos)

| Valor | Descrição |
|-------|-----------|
| `pendente` | Aguardando decisão da admin |
| `confirmado` | Aprovado pela admin |
| `recusado` | Recusado pela admin |

---

## Integração Supabase

### RPC Function
```
fn_buscar_atendimento_publico(p_token text)
```
- SECURITY DEFINER — acessível a `anon`
- Retorna dados do atendimento pelo token
- **NÃO retorna `status_confirmacao`** (limitação conhecida)
- Workaround: busca secundária direto em `atendimentos` via `.eq('token_acesso', token)`

### Realtime
- Canal: `postgres_changes` na tabela `atendimentos`
- Evento: `UPDATE`
- Usado em `/acompanhar/[token]` para atualização automática

### Auth
- Só admin usa autenticação Supabase
- Clientes acessam páginas públicas sem login
- RLS controla acesso anônimo

---

## Políticas RLS Relevantes

| Política | Descrição |
|---------|-----------|
| `anon_atendimentos_select_proprio_token` | anon pode SELECT em `atendimentos` filtrando por `token_acesso` |
| `anon_atendimentos_insert_pendente` | anon pode INSERT com `status_confirmacao = 'pendente'` |

---

## Decisões de Arquitetura

- **Server Actions** para mutações admin — garante autenticação server-side
- **RPC para leitura pública** — controla exatamente o que o anon vê
- **Token opaco** — cliente não precisa de login, apenas o token no URL
- **`status` + `status_confirmacao`** — separação clara entre ciclo operacional e aprovação
- **Realtime** — UX de acompanhamento sem polling manual

---

## Padrões Visuais (Tailwind)

- Paleta: zinc (neutro), amber (destaque/admin), emerald (sucesso), red (erro/recusa)
- Border radius padrão: `rounded-2xl`
- Cards: `bg-white border border-zinc-200 shadow-sm`
- Mobile-first, max-width `max-w-sm` para páginas de cliente, `max-w-6xl` para admin
- Tipografia: `font-bold tracking-tight` para títulos, `text-zinc-500` para secundário
