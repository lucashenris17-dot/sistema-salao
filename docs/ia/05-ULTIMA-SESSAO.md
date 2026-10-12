## Sessão: 2026-12-10 (Validação autoritativa da solicitação de agendamento)

- **Problema encontrado:** a action pública não revalidava os procedimentos, duração, bloqueios, limites do expediente ou conflitos antes de inserir a solicitação; também podia expor mensagens internas do Supabase ao cliente.
- **Correção:** `src/app/actions/agendamento.ts` agora valida IDs UUID únicos, busca procedimentos ativos e suas durações oficiais, soma duração de múltiplos procedimentos, valida ISO/data passada/grade e limite até 19:00, carrega bloqueios e atendimentos ativos e invoca `calcularGradeHorario` no servidor antes do insert. Erros de infraestrutura são registrados no servidor e as respostas ao cliente são amigáveis.
- **Arquivos alterados:** `src/app/actions/agendamento.ts`, `docs/ia/05-ULTIMA-SESSAO.md`.
- **Impacto:** mantém aprovação pendente e fluxo/layout atual; solicitações inválidas, bloqueadas ou sobrepostas são recusadas com a mesma regra de horários do cliente.
- **Concorrência:** a consulta e o insert continuam sendo operações Supabase separadas. Sem RPC/transação/constraint no banco não é possível garantir ausência de corrida simultânea. Nenhuma migration ou alteração do banco foi feita, conforme solicitado; garantia atômica requer autorização para propor/aplicar mudança de banco.
- **Testes:** `npx tsc --noEmit` passou; `npm run build` passou. `git diff --check` passou. Cenários contra o banco hospedado não puderam ser exercitados nesta execução; dependem de ambiente Supabase acessível. Build emite apenas o aviso preexistente de depreciação de `middleware`.

---

## Sessão: 2026-11-10 (Borda final inclusiva dos bloqueios)

- Separada a regra de disponibilidade dos bloqueios da regra entre atendimentos em `src/lib/horarios.ts`: horários que começam exatamente no fim do bloqueio agora ficam bloqueados (`inicioMin <= b.fim`).
- O limite inicial permanece semiaberto, permitindo que um atendimento termine exatamente quando o bloqueio começa. A comparação atendimento x atendimento permanece inalterada, mantendo horários consecutivos permitidos.
- Nenhuma alteração em banco, migrations, criação/edição/exclusão de bloqueios ou múltiplos procedimentos.

**Validação:** `npx tsc --noEmit` passou (exit 0); `npm run build` passou (14 rotas). O build exibiu o aviso de depreciação existente sobre a convenção `middleware` em favor de `proxy`.

## Sessão: 2026-11-10 (Bloqueio noturno iniciando às 17:30)

- Corrigida `src/lib/horarios.ts`: o conflito com bloqueios usa intervalos semiabertos (`inicioSlot < fimBloqueio && fimSlot > inicioBloqueio`), igual à regra de conflito entre atendimentos.
- Um atendimento que termina exatamente no início do bloqueio (ex.: 17:00–17:30 antes de bloqueio 17:30–19:00) permanece disponível; horários que sobrepõem o bloqueio continuam bloqueados.
- Removida a instrumentação temporária `?diagnostico-bloqueio-real`. Nenhuma outra regra ou fluxo foi alterado.

**Validação:** pendente nesta sessão.

---
## Sessão: 2026-11-10 (Correção de múltiplos bloqueios fixos semanais)

- Padronizado o cálculo de `src/lib/horarios.ts` para ler `hora_inicio` e `hora_fim`, como retornados pela consulta de `/agendar`; mantido fallback para os horários dos campos legados `inicio`/`fim`.
- A comparação de intervalos de bloqueio agora usa limites sem sobreposição quando um intervalo termina exatamente no início do outro. Ex.: atendimento encerrado às 17:30 não conflita com bloqueio iniciado às 17:30.
- Múltiplos bloqueios no mesmo dia continuam sendo avaliados individualmente e todos são respeitados; para 08:00–13:00 e 17:30–19:00, a faixa entre esses bloqueios permanece disponível, sujeita à duração do procedimento e à grade de 30 minutos.
- Nenhuma alteração em banco, migrations, criação/edição/exclusão de bloqueios ou múltiplos procedimentos.

**Validação:** `npx tsc --noEmit` passou (exit 0); `npm run build` passou (14 rotas). O build exibiu somente o aviso existente de depreciação da convenção `middleware` em favor de `proxy`.

---

## Sess?o: 2026-11-10 (Apresenta??o visual dos cards de bloqueios)

- Ajustada somente a apresenta??o dos cards em /admin/bloqueios: bloqueios fixos semanais mostram dias e repeti??o, sem datas de refer?ncia; datas espec?ficas e tempor?rias s?o exibidas em DD/MM/YYYY, com hor?rios HH:mm.
- Nenhuma regra de neg?cio, action, banco, fluxo de cria??o/edi??o/exclus?o ou conflito foi alterado.

**Valida??o:** npx tsc --noEmit e npm run build executados ap?s a altera??o.

---

## Sessão: 2026-11-10 (Edição de bloqueios em /admin/bloqueios)

**O que foi feito:**
- Botão Editar nos cards abre o formulário existente preenchido com tipo, datas/dias, horários e motivo.
- Criada a Server Action atualizarBloqueio(id, input), com validação, verificação de conflitos ativos e atualização do registro existente.
- A confirmação reutiliza o modal de conflito, links WhatsApp e opção de prosseguir, sem criar novo registro.
- Criação e exclusão foram preservadas. Sem alterações em agenda, atendimentos, agendamento, múltiplos procedimentos ou banco.

**Validação:** npx tsc --noEmit e npm run build executados após implementação.

**Arquivos alterados nesta tarefa:** src/app/admin/bloqueios/page.tsx, src/app/actions/bloqueios.ts, docs/ia/05-ULTIMA-SESSAO.md.

---

tendimentos`)

**O que foi feito:**
- `src/app/admin/atendimentos/page.tsx`: a lista da query inicial permanece ampla o suficiente para fornecer dados às abas; `atendimentosDaAba` filtra a lista usada na contagem, estado vazio e cards.
- `Hoje` compara a data de `horario_agendado` com a data atual em `America/Recife`; `Esta semana` inclui hoje até sábado da semana local; `Finalizados` inclui exclusivamente `status === 'finalizado'`. Atendimentos sem horário/cancelados/no-show não entram nas abas temporais.
- Não foram alterados criação, agendamento, bloqueios nem múltiplos procedimentos.

**Validação:** `npx tsc --noEmit` passou; `npm run build` passou com o aviso existente de depreciação da convenção `middleware` em favor de `proxy`.

**Arquivos alterados nesta tarefa:** `src/app/admin/atendimentos/page.tsx`, `docs/ia/05-ULTIMA-SESSAO.md`.

---
# 05 ÔÇö DI├üRIO DA ├ÜLTIMA SESS├âO

> Atualizado a cada sess├úo de desenvolvimento. Registra o que foi feito, problemas encontrados e pr├│ximo passo recomendado.

---

## Sess├úo: 2026-10-04 (Corre├º├úo l├│gica /admin/bloqueios ÔÇö 3 modelos de regra)

**Contexto:** Modelo anterior criava 5 registros para "Almo├ºo de segunda a sexta". Corrigido para regras ├║nicas.

**O que foi feito:**
- Migration `supabase/migrations/20261004000000_bloqueios_regras.sql`: `tipo`, `dias_semana`, `data_inicio`/`fim`, `hora_inicio`/`fim`.
- `src/app/admin/bloqueios/page.tsx`: 3 abas (Fixo semanal / Tempor├írio / Data espec├¡fica); cards listam uma regra; sele├º├úo m├║ltipla de dias.
- `src/app/actions/bloqueios.ts`: salva uma regra ├║nica (n├úo registros repetidos); preenche `inicio`/`fim` de refer├¬ncia para compatibilidade.
- `src/lib/types.ts`: tipos atualizados.

**An├ílise de tabela:** `bloqueios_agenda` (id, inicio, fim, descricao) n├úo suportava 3 modelos sem repeti├º├úo ÔåÆ migration necess├íria e feita.

**Restri├º├úo cumprida:** Nenhum arquivo de `agendar/` ou fila alterado. Nenhum impacto em atendimento.

**Verifica├º├Áes:**
- Ô£à `npx tsc --noEmit` ÔÇö 0 erros
- Ô£à `npm run build` ÔÇö passa (14 rotas)

---

## Sess├úo: 2026-10-10 (Conflito bloqueios ├ù atendimentos ÔÇö aviso + WhatsApp + Manter/Cancelar)

### Contexto

Implementar verifica├º├úo de conflito ao criar bloqueio (`/admin/bloqueios`): comparar com atendimentos ativos (`aguardando`/`em_andamento`/`pausado`); se conflito, alertar com WhatsApp e bot├Áes Manter/Cancelar; sem auto-cancelar.

### O que foi feito

1. `src/app/actions/bloqueios.ts`:
   - `BloqueioRegraInput` recebeu `ignorarConflito?: boolean`.
   - `criarBloqueio`: calcula `bloqueioInicio`/`bloqueioFim` (semanal/tempor├írio/espec├¡fico); busca atendimentos ativos; compara conflito (`atInicio <= bloqueioFim && atFim > bloqueioInicio`); retorna `{sucesso:false, dados:{conflito:true, atendimentos:[...]}}` quando h├í conflito e `ignorarConflito` ├® falso.
   - Removidas valida├º├Áes duplicadas (linhas repetidas 191ÔÇô200).
2. `src/app/admin/bloqueios/page.tsx`:
   - Estado `mostrarConflito`, `conflitosData`, `manterConflito`.
   - Quando `resultado.dados?.conflito`: exibe modal com cards de conflito (cliente, procedimento, hor├írio, link WhatsApp `wa.me/<numero>`), bot├Áes "Manter bloqueio" (reenvia com `ignorarConflito:true`) e "Cancelar".
3. Documenta├º├úo: `docs/ia/03-ESTADO-ATUAL.md` (data atualizada), `docs/ia/04-PENDENCIAS.md` (se├º├úo de conflito adicionada), `docs/ia/05-ULTIMA-SESSAO.md` (esta se├º├úo).
4. Mem├│ria: `memory/conflito-bloqueios-atendimentos.md` registrada; `MEMORY.md` atualizado.

### Restri├º├Áes cumpridas

- Nenhuma altera├º├úo em banco (`atendimentos`, `clientes`, `procedimentos`, `bloqueios_agenda` suficientes).
- Nenhuma altera├º├úo em `/agendar`, fila, auth.
- Nenhum auto-cancelar ÔÇö decis├úo s├│ da In├ícia.

### Verifica├º├Áes

- Ô£à `npx tsc --noEmit` ÔÇö 0 erros.
- Ô£à `npm run build` ÔÇö passa (14 rotas, incluindo `/admin/bloqueios`).
- Ô£à Link WhatsApp montado via `process.env.NEXT_PUBLIC_URL || 'http://localhost:8080'` (fallback seguro). `.env.local` com `NEXT_PUBLIC_URL=http://localhost:8080` (dev) e coment├írio `# Produ├º├úo: https://dominio-real.com`. URL n├úo hardcoded no c├│digo.

---

## Sess├úo: 2026-10-10 (Padroniza├º├úo visual /admin/bloqueios ÔÇö GradeHorario + cards)

**Contexto:** Ap├│s concluir conflito + WhatsApp + URL, a interface de `/admin/bloqueios` ainda usava `<select>` para horas e bot├Áes b├ísicos para dias, enquanto `/agendar` j├í usava `GradeHorario` (cards 30min) e cards de dias.

**O que foi feito:**
- `src/app/admin/bloqueios/page.tsx`: 6 `<select>` de horas substitu├¡dos por `<GradeHorario>` (3 abas ├ù 2 hor├írios); `opcoesGrade` gerado via `gerarGradeHorarios()`; cards de dias mantidos no padr├úo existente (`rounded-xl`, estados selecionado/n├úo-selecionado).
- Valida├º├úo adicionada: `hora_fim > hora_inicio` (compara├º├úo em minutos) antes de `criarBloqueio`; retorna erro se fim Ôëñ in├¡cio.
- C├│digo morto removido: `horas` useMemo (apenas usado nos selects antigos) substitu├¡do por `opcoesGrade`.
- Nenhuma altera├º├úo em banco, actions, `/agendar`, conflito, WhatsApp ou `NEXT_PUBLIC_URL`.

**Restri├º├Áes cumpridas:**
- Nenhum arquivo de `agendar/` alterado.
- Nenhum auto-cancelar de conflito.
- `process.env.NEXT_PUBLIC_URL || 'http://localhost:8080'` preservado no link WhatsApp.
- Nenhuma migration / RLS / banco alterado.

**Verifica├º├Áes:**
- Ô£à `npx tsc --noEmit` ÔÇö 0 erros.
- Ô£à `npm run build` ÔÇö passa (14 rotas, incluindo `/admin/bloqueios`).

**Arquivos alterados:**
- `src/app/admin/bloqueios/page.tsx`
- `docs/ia/05-ULTIMA-SESSAO.md` (esta entrada)

---

## Sess├úo: 2026-10-03 (Corre├º├úo do fluxo inteligente do /agendar ÔÇö WhatsApp primeiro)

### Contexto

Ap├│s implementar o cadastro inteligente por WhatsApp na a├º├úo server, a vers├úo inicial do `/agendar` ainda pede nome antes de reconhecer o cliente, violando a regra de que o WhatsApp ├® a primeira etapa.

### O que foi feito

1. **ETAPA 1 reformulada** em `src/app/agendar/page.tsx`:
   - Novo estado `etapa1Sub: 'whatsapp' | 'cadastro' | 'reconhecido'` controla tr├¬s sub-etapas dentro da etapa 1.
   - Inicialmente mostra **somente o campo WhatsApp** (Nome e Sobrenome foram removidos da tela inicial).
   - Ao completar 11 d├¡gitos, busca em `clients` por `whatsapp` normalizado:
     - **Cliente encontrado** ÔåÆ `etapa1Sub = 'reconhecido'`:
       - Exibe "Ol├í, [nome]! Encontramos seu cadastro."
       - Busca o ├║ltimo atendimento `status = 'finalizado'` com `.order('criado_em', { ascending: false }).limit(1)` e resolve o `procedimento_id` via `procedimentos`.
       - Se houver hist├│rico: mostra "Seu ├║ltimo atimento foi: [Procedimento]" com bot├Áes `[Repetir procedimento]` (mant├®m `procedimento_id` e avan├ºa para etapa 2) e `[Escolher outro procedimento]` (vai para etapa 2 com lista completa de ativos).
       - Se n├úo houver hist├│rico: mensagem convidando a marcar um novo atendimento.
     - **Cliente n├úo encontrado** ÔåÆ `etapa1Sub = 'cadastro'`:
       - Mostra os campos Nome (obrigat├│rio) e Sobrenome (opcional).
       - O cliente ├® criado em `clients` apenas no momento do envio (a├º├úo server `criarSolicitacaoAgendamento` j├í faz a checagem por WhatsApp).
2. **`handleEtapa1Continuar` corrigido:**
   - Valida├º├úo de nome agora s├│ ├® aplicada quando `etapa1Sub === 'cadastro'`.
   - Cliente reconhecido passa direto para etapa 2 sem pedir nome.
3. **Regra preservada:** `criarSolicitacaoAgendamento` continua como ponto ├║nico de cria├º├úo; nenhuma duplica├º├úo.

### Problemas encontrados durante a sess├úo

- **Edit n├úo encontrou o texto** ao tentar substituir o bloco do onChange do WhatsApp (o Read mostrava `from('clients')` mas o Edit matchava `from('clients')` ÔÇö a causa foi a quebra de linha interna do `if (c)`. Corrigido dividindo a substitui├º├úo em duas partes.
- **TS 1109 "Express├úo esperada"** ao tentar escrever `const v =.validarWhatsApp(...)` ÔÇö typo de digita├º├úo. Corrigido para `const v = validarWhatsApp(...)`.

### Verifica├º├Áes

- Ô£à `npx tsc --noEmit` ÔÇö 0 erros.
- Ô£à `npm run build` ÔÇö passa, todas as 14 rotas geradas.
- Ô£à Zero modifica├º├Áes em banco, migrations, RLS, fluxo de atendimento, solicita├º├Áes ou autentica├º├úo.
- Ô£à Apenas organiza├º├úo do fluxo de cadastro no `/agendar`.

### Arquivos alterados

- `src/app/agendar/page.tsx` ÔÇö ETAPA 1 reformulada com sub-etapas, busca do ├║ltimo atendimento finalizado, bot├Áes de repetir/escolher outro.
- `docs/ia/04-PENDENCIAS.md` ÔÇö Nova tarefa conclu├¡da registrada.
- `docs/ia/05-ULTIMA-SESSAO.md` ÔÇö Di├írio da sess├úo atualizado.

---

## Sess├úo: 2026-10-03 (Reformula├º├úo do dashboard /admin ÔÇö central operacional)

### Contexto

Ap├│s a primeira reformula├º├úo, a an├ílise visual identificou excesso de repeti├º├úo: as fun├º├Áes Solicita├º├Áes e Atendimentos apareciam no menu lateral, nos bot├Áes superiores, nos cards de resumo e nas a├º├Áes r├ípidas. O `/admin` precisava virar um centro operacional simples, n├úo um segundo menu.

### O que foi feito

1. **Removidos bot├Áes duplicados do topo:** Solicita├º├Áes e Atendimentos sumiram do cabe├ºalho (j├í existem no menu lateral).
2. **Mantidos apenas cards informativos:**
   - Solicita├º├Áes pendentes (destaque)
   - Atendimentos do dia
   - Bloqueios da agenda
3. **"Pr├│ximos atendimentos" como foco principal:**
   - Pr├│ximo atendimento em destaque (card preto com hor├írio, cliente, procedimento, dura├º├úo, badge "Em andamento").
   - Demais hor├írios do dia em lista vertical.
   - Cada item mostra hor├írio, cliente, procedimento e dura├º├úo.
4. **Nova se├º├úo "Resumo do sal├úo":**
   - Seletor de per├¡odo: Hoje / Esta semana / Este m├¬s.
   - Cards: Clientes atendidos, total de procedimentos, finalizados, cancelados.
   - Procedimentos realizados por tipo, calculados a partir das tabelas existentes (`atendimentos`, ` clientes`, `procedimentos`).
5. **Removidas a├º├Áes r├ípidas repetitivas** (Solicita├º├Áes/Atendimentos j├í existem no menu).

### Problemas encontrados durante a sess├úo

- **Estrutura JSX quebrada:** Ao remover a coluna direita de "A├º├Áes r├ípidas", o `<div>` wrapper principal perdeu o fechamento. Corrigido adicionando `</div>` na linha 726.
- **Aviso TS80006:** fun├º├úo `carregarContador` no layout pode ser ass├¡ncrona ÔÇö apenas informativo, n├úo corrigido (n├úo afeta o build).

### Verifica├º├Áes

- Ô£à `npx tsc --noEmit` ÔÇö 0 erros.
- Ô£à Zero modifica├º├Áes em banco, migrations, RLS, fluxo de atendimento, solicita├º├Áes ou autentica├º├úo.
- Ô£à Apenas organiza├º├úo visual, componentes do dashboard e consultas para indicadores.

### Arquivos alterados

- `src/app/admin/page.tsx` ÔÇö Estrutura JSX reformulada, novo componente `ResumoSalao` com seletor de per├¡odo.
- `docs/ia/04-PENDENCIAS.md` ÔÇö Nova tarefa conclu├¡da registrada.
- `docs/ia/05-ULTIMA-SESSAO.md` ÔÇö Di├írio da sess├úo atualizado.

---

## Sess├úo: 2026-10-03 (Hist├│rico e estat├¡sticas por cliente ÔÇö Etapa 2)

### Contexto

Ap├│s garantir identifica├º├úo por WhatsApp (Etapa 1), implementar visualiza├º├úo de hist├│rico individual na aba `/admin/clientes`.

### O que foi feito

- Adicionado bot├úo "Ver hist├│rico" em cada card de cliente.
- Componento de perfil: nome, WhatsApp, total, primeiro, ├║ltimo atendimento.
- Filtros de per├¡odo: 7 dias / 30 dias / Este ano / Todos.
- Estat├¡sticas: agrupamento por procedimento (`Record<string, number>`).
- Hist├│rico: lista de `finalizado`, ordenado do mais recente ao antigo.
- Nenhuma tabela nova; consulta direta em `atendimentos` por `cliente_id`.
- Nenhuma altera├º├úo no banco.

### Arquivos alterados

- `src/app/admin/clientes/page.tsx`
- `src/lib/historico-cliente.ts`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`
- `docs/ia/03-ESTADO-ATUAL.md`

---

## Sess├úo: 2026-10-03 (Cadastro inteligente por WhatsApp ÔÇö chave principal)

### Contexto

Evitar duplica├º├úo de clientes usando WhatsApp como identificador principal (n├úo nome).

### O que foi feito

- Normaliza├º├úo do WhatsApp: `whatsapp.replace(/\D/g, '')` (remove tudo que n├úo ├® d├¡gito).
- `(81) 99999-9999` e `81999999999` tratadas como o mesmo cliente.
- Busca por `whatsapp` normalizado antes de criar (`.eq('whatsapp', whatsappLimpo)`).
- Se existente: reutiliza `clienteId`; se n├úo: cria com `insert`.
- Nenhuma altera├º├úo em banco, migrations ou RLS.
- Tabela `clientes` j├í usa `whatsapp` como chave natural.

### Verifica├º├Áes

- Ô£à `npx tsc --noEmit` ÔÇö 0 erros
- Ô£à Nenhuma migration necess├íria
- Ô£à Fluxo de agendamento preservado

### Arquivos alterados

- `src/app/actions/agendamento.ts`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`

---

## Sess├úo: 2026-10-03 (Previs├úo inteligente de atendimento ÔÇö sem expor fila de clientes)

### Contexto

Cliente na p├ígina `/acompanhar/[token]` precisava de uma previs├úo de atendimento simples, sem expor a posi├º├úo na fila ou quantidade de pessoas na frente.

### O que foi feito

- Removido bloco de posi├º├úo na fila (`ordem_fila`, texto "Tem X pessoas na sua frente").
- Adicionado bloco "Previs├úo de atendimento" com mensagem simples baseada em `calcularPrevisao` (`previsao.inicio_previsto`).
- Nenhum dado de outros clientes exposto.
- Realtime existente (`atendimento-atualizado`) continua atualizando automaticamente.
- Nenhuma altera├º├úo em banco.

### Verifica├º├Áes

- Ô£à `npx tsc --noEmit` ÔÇö 0 erros
- Ô£à `npm run build` ÔÇö passa
- Ô£à Nenhum dado de fila exposto ao cliente

### Arquivos alterados

- `src/app/acompanhar/[token]/page.tsx`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`
- `docs/ia/03-ESTADO-ATUAL.md`

---

## Sess├úo: 2026-10-03 (Melhoria 1 ÔÇö Ordena├º├úo dos atendimentos / Melhoria 2 ÔÇö Badge fixo de solicita├º├Áes)

### Melhoria 1: Ordena├º├úo dos atendimentos por hor├írio

**Arquivo:** `src/app/admin/atendimentos/page.tsx`

**Mudan├ºa:** Substitu├¡do `.order('criado_em', { ascending: false })` por:

```ts
.order('horario_agendado', { ascending: true, nullsFirst: false })
.order('ordem_fila', { ascending: true, nullsFirst: false })
```

- `modo = 'agendamento'`: ordena por `horario_agendado ASC` (09:00 ÔåÆ 12:00 ÔåÆ 15:00)
- `modo = 'fila'`: ordena por `ordem_fila ASC`
- Nenhum atendimento ├® removido (aguardando, em_andamento, pausado, finalizado, cancelado, no_show continuam vis├¡veis)
- Nenhuma altera├º├úo no banco (sem migration)

### Melhoria 2: Notifica├º├úo flutuante de solicita├º├Áes

**Arquivo:** `src/app/admin/layout.tsx`

**Mudan├ºa:**
- Cliente Supabase memoizado (`useMemo`) no layout para evitar recria├º├úo a cada render.
- Novo canal Realtime `badge-pendentes-realtime` escutando eventos `*` na tabela `atendimentos`.
- Estado `badgeContador` atualizado via `useCallback` (`carregarBadge`).
- Componente fixo na tela (`position: fixed`, `top-4 right-4`, `z-50`, `bg-red-600`, `rounded-xl`) que aparece apenas quando `badgeContador > 0`, com n├║mero branco no quadrado vermelho.
- Clicar leva para `/admin/solicitacoes`.
- Aparece em todas as p├íginas do admin (`/admin`, `/admin/atendimentos`, `/admin/solicitacoes`, `/admin/clientes`, `/admin/procedimentos`, `/admin/bloqueios`).
- Atualiza automaticamente quando nova solicita├º├úo chega, ├® aprovada ou recusada.

### Verifica├º├Áes executadas

- Ô£à `npx tsc --noEmit` ÔÇö 0 erros (excluindo avisos existentes de c├│digo legado)
- Ô£à `npm run build` ÔÇö passa sem erros
- Ô£à Nenhuma altera├º├úo em banco, migrations, RLS, fluxo ou autentica├º├úo
- Ô£à Componentes apenas visuais e organizacionais

---

## Sess├úo: 2026-10-03 (Fix: atendimento finalizado sumindo do dashboard /admin)

### Contexto

Ap├│s finalizar um atendimento na aba `/admin/atendimentos`, ele continuava aparecendo no card "Atendimentos do dia" e na lista "Pr├│ximos atendimentos" do dashboard `/admin`.

### Problema Identificado

Em `src/app/admin/page.tsx`, dentro da fun├º├úo `carregar()`:

**Bug 1 ÔÇö Contador "Atendimentos do dia":**
- `total: listaHoje.length` contava todos os atendimentos do dia sem filtragem de status, incluindo `finalizado`, `cancelado`, `no_show`.

**Bug 2 ÔÇö Lista "Pr├│ximos atendimentos":**
- Filtro com `x.status === 'confirmado'` era inv├ílido (`confirmado` ├® valor de `status_confirmacao`, n├úo de `status`).
- Inclu├¡a `x.status === 'em_andamento'` sem exigir `status_confirmacao === 'confirmado'`, expondo agendamentos pendentes de aprova├º├úo.

### Solu├º├úo Aplicada

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

2. **Lista "Pr├│ximos atendimentos":**
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

   Dashboard agora exclui `finalizado`, `cancelado`, `no_show` e atendimentos pendentes de aprova├º├úo.

### Verifica├º├Áes e Testes Executados

- Ô£à `npx tsc --noEmit` ÔÇö 0 erros.
- Ô£à Zero modifica├º├Áes no banco de dados, migrations ou RLS.
- Ô£à Regra principal preservada: `/admin/atendimentos` continua mostrando hist├│rico completo.

### Fluxo esperado ap├│s o fix

1. Cliente agenda ÔåÆ Admin aprova ÔåÆ Aparece nos "Pr├│ximos atendimentos" Ô£à
2. Admin inicia ÔåÆ Continua aparecendo (em_andamento ainda ├® operacional) Ô£à
3. Admin finaliza ÔåÆ Some do dashboard imediatamente (Realtime triggera `carregar()`) Ô£à
4. Admin acessa `/admin/atendimentos` ÔåÆ Finalizado ainda aparece na lista Ô£à

### Arquivos Alterados

- `src/app/admin/page.tsx` ÔÇö Dois blocos de filtragem corrigidos dentro de `carregar()`.
- `docs/ia/04-PENDENCIAS.md` ÔÇö Nova tarefa conclu├¡da registrada.
- `docs/ia/05-ULTIMA-SESSAO.md` ÔÇö Di├írio da sess├úo atualizado.

---

## Sess├úo: 2026-10-04 (Simplifica├º├úo /admin/bloqueios ÔÇö 2 modelos)

**Contexto:** Continuar simplifica├º├úo de `/admin/bloqueios` em 2 modelos (recorrente semanal vs data espec├¡fica) com abas, sem alterar banco.

**O que foi feito:**
- Reescrito `src/app/admin/bloqueios/page.tsx`: abas Semanal / Data espec├¡fica, formul├írio por aba, listagem em cards, excluir, descricao.
- Modelo semanal deriva registro de bloqueio tradicional a partir de dia/hora usando tabela existente (`bloqueios_agenda`).
- Nenhum campo novo no banco; nenhuma migration; nenhuma altera├º├úo em RLS/fluxo.

**Verifica├º├Áes:**
- Ô£à `npx tsc --noEmit` ÔÇö 0 erros
- Ô£à `npm run build` ÔÇö passa (14 rotas geradas, incluindo `/admin/bloqueios`)
- Ô£à Nenhuma altera├º├úo em banco/migrations/fluxo

**Arquivos alterados:**
- `src/app/admin/bloqueios/page.tsx`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`

---

## Sess├úo: 2026-10-01 (Realtime no Card "Solicita├º├Áes pendentes" do Dashboard /admin)

### Contexto

O badge do menu lateral atualizava em tempo real, por├®m o card "Solicita├º├Áes pendentes" no dashboard (`/admin`) permanecia desatualizado at├® refresh manual (F5).

### Problema Identificado

No `src/app/admin/page.tsx`:
- `createBrowserClient` era instanciado diretamente no render do componente sem `useMemo`.
- O `useEffect` executava a busca de dados `carregar()` apenas uma vez ao montar o componente (`[]`).
- N├úo havia uma subscri├º├úo Supabase Realtime para a tabela `atendimentos` no dashboard.

### Solu├º├úo Aplicada

1. **Inst├óncia Est├ível do Supabase Client:**
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

2. **Supabase Realtime Pr├│prio no Dashboard:**
   Adicionado canal `admin-dashboard-realtime` no `useEffect` escutando eventos `'*'` (INSERT, UPDATE, DELETE) na tabela `atendimentos`:
   ```tsx
   const carregar = useCallback(async () => {
     // ... busca de atendimentos e c├ílculo do total de pendentes
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

3. **Manuten├º├úo da Regra de Neg├│cio:**
   - O card continua filtrando o total de solicita├º├Áes com `status_confirmacao = 'pendente'`.
   - Nenhuma altera├º├úo em banco, migrations ou RLS.

### Verifica├º├Áes e Testes Executados

- Ô£à `npx tsc --noEmit` ÔÇö 0 erros.
- Ô£à Zero modifica├º├Áes no banco de dados, migrations ou RLS.

### Arquivos Alterados

- `src/app/admin/page.tsx` ÔÇö Adicionada memoiza├º├úo do Supabase client, callback `carregar` e canal Realtime pr├│prio.
- `docs/ia/04-PENDENCIAS.md` ÔÇö Atualizada pend├¬ncia resolvida.
- `docs/ia/05-ULTIMA-SESSAO.md` ÔÇö Di├írio da sess├úo atualizado.

---

## Sess├úo: 2026-10-01 (Diagn├│stico e Fix: Realtime Inst├ível em /admin/solicitacoes)

### Contexto

P├ígina `/admin/solicitacoes` ainda necessitava de F5 manual em alguns cen├írios para exibir novas solicita├º├Áes, apesar de ter o canal Realtime configurado.

### Problema Identificado

Causa raiz encontrada:
- A chamada `createBrowserClient(...)` estava sendo executada diretamente no corpo do componente React `SolicitacoesPage`.
- A cada altera├º├úo de estado (`loading`, `solicitacoes`, etc.), a re-renderiza├º├úo criava um novo objeto de cliente Supabase.
- Isso tornava a refer├¬ncia do objeto `supabase` inst├ível e desestabilizava o ciclo de vida do `useEffect` respons├ível pela subscri├º├úo Realtime.

### Solu├º├úo Aplicada

1. **Estabiliza├º├úo do Cliente Supabase com `useMemo`:**
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

2. **Adicionados Logs Diagn├│sticos no Realtime:**
   - Log do status da conex├úo do canal (`[Realtime] Status do canal: SUBSCRIBED`).
   - Log ao receber payload de evento (`[Realtime] Evento recebido: INSERT/UPDATE`).

### Verifica├º├Áes e Testes Executados

- Ô£à `npx tsc --noEmit` ÔÇö 0 erros.
- Ô£à Nenhuma altera├º├úo em banco, migrations ou RLS.
- Ô£à Regra preservada: `status_confirmacao = 'pendente'`.

### Arquivos Alterados

- `src/app/admin/solicitacoes/page.tsx` ÔÇö Memoiza├º├úo do Supabase client via `useMemo` e inclus├úo de logs diagn├│sticos.
- `docs/ia/04-PENDENCIAS.md` ÔÇö Atualiza├º├úo da lista viva de tarefas.
- `docs/ia/05-ULTIMA-SESSAO.md` ÔÇö Registro desta sess├úo.

---

## Sess├úo: 2026-10-10 (Restaura├º├úo /admin/bloqueios ÔÇö 3 abas funcionando)

**Contexto:** A p├ígina `src/app/admin/bloqueios/page.tsx` estava no formato simples (data/hora in├¡cio+fim, sem abas de tipo de regra), apesar do backend (`criarBloqueio`) e types (`BloqueioAgenda`) j├í suportarem `semanal_fixo`, `temporario`, `especifico` desde a migration 20261004.

**O que foi feito:**
- Reconstru├¡do o formul├írio com 3 abas: `Fixo semanal`, `Tempor├írio`, `Data espec├¡fica`.
- Cada aba coleta os dados corretos (`dias_semana` + horas / `data_inicio`/`data_fim` + horas / `data_especifica` + horas) e envia via `criarBloqueio` com payload completo.
- Cards de listagem agora exibem o tipo de regra, dias fixos (quando aplic├ível), per├¡odo/tempor├írio e dura├º├úo.
- Nenhuma altera├º├úo no banco, migrations, RLS ou fluxo de agendamento.

**Problemas encontrados / resolvidos:**
- A vers├úo anterior do arquivo n├úo tinha abas (apenas formul├írio simples); recuperado da documenta├º├úo (`04-PENDENCIAS.md` se├º├úo 287-301) e reconstru├¡do para rodar certo com a action existente.

**Verifica├º├Áes:**
- Ô£à `npx tsc --noEmit` ÔÇö 0 erros.
- Ô£à `npm run build` ÔÇö passa.
- Ô£à `/admin/bloqueios` lista bloqueios com tipo correto.

**Arquivos alterados:**
- `src/app/admin/bloqueios/page.tsx`
- `docs/ia/04-PENDENCIAS.md`
- `docs/ia/05-ULTIMA-SESSAO.md`

**Nota:** A a├º├úo server (`criarBloqueio`) e a migration (`20261004000000_bloqueios_regras.sql`) n├úo foram alteradas ÔÇö j├í estavam corretas. Apenas o front foi restaurado.

## Correção final - Motor de bloqueios de agenda

Data: 12/10/2026

Status: CONCLUÍDO ✅

### Problema identificado

Os bloqueios de agenda apresentavam inconsistências:

- horários sendo bloqueados 30 minutos antes do configurado;
- bloqueios específicos sem associação correta à data;
- diferença de comportamento entre bloqueios semanais e temporários;
- limite final do bloqueio permitindo horários indevidos.

### Causa

Foram identificados dois pontos principais:

1. Conversão incorreta de timestamps ISO salvos em UTC para o fuso local.
2. Consulta de `/agendar` sem carregar todos os campos necessários para validar a data do bloqueio.

### Correções aplicadas

Arquivos alterados:

- `src/lib/horarios.ts`
- `src/app/agendar/page.tsx`

Alterações:

- ajuste da interpretação de horários no fuso correto (`America/Sao_Paulo`);
- inclusão de `data_inicio` e `data_fim` na consulta de bloqueios;
- correção da regra de limite final do bloqueio;
- separação das regras entre:
  - conflito de atendimento;
  - bloqueio de disponibilidade.

### Testes realizados

✅ Bloqueio 08:00 → 12:30

Resultado:
- 12:30 bloqueado;
- 13:00 disponível.

✅ Bloqueio 18:00 → 19:00

Resultado:
- 18:00 bloqueado;
- 18:30 bloqueado;
- 19:00 bloqueado.

✅ Horários consecutivos de atendimento continuam funcionando.

### Validação técnica

- `npx tsc --noEmit` ✅
- `git diff --check` ✅
- testes direcionados de horários ✅

### Próximo passo

Realizar teste completo do fluxo de agendamento antes de novas funcionalidades.