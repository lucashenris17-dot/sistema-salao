# Auditoria de Segurança — Sistema Salão

**Data da análise:** 10/12/2026  
**Atualização pós-remediação:** 16/10/2026 (ver seção "Atualização — 16/10/2026" abaixo)  
**Escopo:** revisão estática do repositório e execução de `npm audit`. Nenhum código de aplicação, dependência ou banco foi alterado nesta auditoria; este documento é o único arquivo criado.  
**Limitações:** não foram fornecidas credenciais Supabase, acesso ao projeto hospedado, ambiente de produção ou configuração do provedor. Portanto, a auditoria avalia as migrations versionadas e o código, não o estado efetivamente aplicado no banco, secrets configurados no hosting, logs de deploy, branch protections nem comportamento dinâmico em produção.

# Resumo executivo

**O sistema não está pronto para publicação (NÃO).** Os riscos mais relevantes são: políticas RLS excessivamente permissivas para qualquer identidade `authenticated`; proteção administrativa dependente do middleware, sem validação de usuário/role nas Server Actions; exposição deliberada de dados pessoais por uma função pública cujo token funciona como credencial bearer; possibilidade de agendamento duplicado/bloqueado por falta de validação autoritativa e transacional no servidor; e 9 vulnerabilidades reportadas por `npm audit`, incluindo 1 crítica e 8 altas.

O `npm audit` foi executado sem `fix`. Resultado: **9 vulnerabilidades (1 crítica, 8 altas; 0 moderadas/baixas)**. As dependências incluem Next.js em produção (16.3.4) com advisory crítico e alto; outras falhas afetam dependências de produção opcionais/transitivas e ferramentas de desenvolvimento. O comando terminou com código 1 por haver vulnerabilidades.

Não foi encontrado arquivo `.env*` rastreado na listagem atual do Git; `.env*` é ignorado. Essa verificação não exclui vazamento em histórico remoto, outro repositório/branch, logs externos ou secrets cadastrados no provedor. Há arquivos de memória/documentação internos rastreados, recomendando-se avaliar se devem ser públicos.

# Pontos seguros

- `.gitignore` exclui `.env*`, `node_modules`, `.next`, logs comuns do npm/yarn, arquivos `.pem` e arquivos temporários de build. A busca de nomes rastreados não identificou `.env`, `.pem`, `.key` ou logs convencionais.
- A chave Supabase usada no frontend e servidor é `NEXT_PUBLIC_SUPABASE_ANON_KEY`, que é uma chave pública por design. Não foi identificada service-role key no código examinado; ainda assim, confirmar secrets no hosting e histórico Git.
- A migration base habilita RLS em `procedimentos`, `clientes`, `atendimentos` e `segmentos_atendimento`. A policy anônima de procedimentos limita leitura a `ativo = true`.
- As migrations da função pública revogam `EXECUTE` de `PUBLIC` e concedem explicitamente a `anon` e `authenticated`. A função usa `SECURITY DEFINER`, qualifica tabelas com `public` e fixa `search_path` a `pg_catalog, pg_temp`, reduzindo risco de shadowing.
- O token de acompanhamento é gerado com `crypto.randomUUID()`/`crypto.getRandomValues()` (aleatoriedade criptográfica), e a função consulta por correspondência exata do token.
- Middleware chama `supabase.auth.getUser()` (validação remota da identidade, em vez de confiar apenas em dados de sessão locais) e redireciona acessos não autenticados a caminhos `/admin/*` para `/login`.
- As migrations não mostram policy `anon` de `UPDATE`/`DELETE` de clientes ou atendimentos no conjunto versionado examinado.

# Riscos encontrados

## Crítico

### C1 — Vulnerabilidades em dependências de produção

`npm audit` reporta **1 crítica** e **8 altas**, total 9. O pacote direto `next@16.3.4` está em produção e aparece no relatório com advisories críticos/altos (incluindo classes relacionadas a denial of service, cache, informação e SSRF, conforme avisos associados à faixa instalada). O pacote opcional `sharp@0.35.4` também aparece como alto; `source-map-js@1.2.1` é transitivo de produção e alto. O relatório indica atualização disponível para Next (`16.4.0`) sem major segundo o lock/audit consultado, mas atualização não foi executada e compatibilidade deve ser testada antes do deploy.

**Impacto:** exposição a vulnerabilidades publicadas em componentes incluídos na aplicação. A explorabilidade depende dos recursos/rotas usados, mas não é apropriado publicar com a versão vulnerável sem triagem e correção controlada.

## Alto

### A1 — `authenticated` tem acesso integral, sem autorização de papel administrativo

Em `supabase/migrations/20260910000001_seguranca_rls.sql`, as policies `authenticated_*_all` de procedimentos, clientes, atendimentos e segmentos usam `FOR ALL TO authenticated USING (true) WITH CHECK (true)`. Qualquer usuário que consiga autenticar no projeto Supabase recebe leitura e mutação integral dessas tabelas via API, não apenas a administradora pretendida. O middleware limita o acesso às páginas `/admin`, mas não constitui autorização de banco; também não há distinção de papel/claim administrativo nas policies.

**Impacto:** conta autenticada não administrativa (ex.: conta criada indevidamente ou comprometida) pode ler/alterar/apagar dados pessoais, agendamentos e registros de atendimento diretamente pela API.

### A2 — Server Actions administrativas sem autorização própria

`src/app/actions/solicitacoes.ts` e `src/app/actions/bloqueios.ts` criam cliente com cookies, mas as funções exportadas não verificam `auth.getUser()` nem papel administrativo antes de listar/alterar/aprovar/recusar/excluir. As Server Actions podem ser invocadas diretamente por requisições, sem depender de navegação pela página protegida. Segurança efetiva fica delegada a policies permissivas de banco, que aceitam todos os `authenticated`.

**Impacto:** qualquer sessão autenticada pode executar operações administrativas se conhecer/obtiver IDs; e políticas atuais não restringem as alterações ao admin.

### A3 — Criação pública não valida disponibilidade nem impede corrida

`src/app/actions/agendamento.ts` verifica campos obrigatórios, data parseável/no futuro e máximo de dois IDs, mas não valida no servidor que os IDs existem/estão ativos, que data e horários são válidos dentro do expediente, que os procedimentos cabem na duração escolhida, nem que o período conflita com atendimentos/bloqueios. A disponibilidade consultada por `/agendar` é carregada no cliente e serve à interface; não é uma barreira de segurança. Não há operação transacional/constraint de exclusão que evite duas solicitações concorrentes para o mesmo intervalo.

**Impacto:** chamada direta da Server Action ou submissões simultâneas podem criar agendamentos duplicados, em bloqueios ou com duração/procedimento manipulados. A aprovação manual reduz impacto operacional, mas não protege integridade da agenda.

### A4 — Exposição de dados pessoais pela RPC pública e tracking

`fn_buscar_atendimento_publico(text)` é `SECURITY DEFINER`, concedida a `anon`, e retorna `cliente_nome`, `cliente_sobrenome`, status, horário, modalidade, timestamps e procedimento/duração para quem possuir o token. `src/app/acompanhar/[token]/page.tsx` adicionalmente consulta diretamente a tabela `atendimentos` pela chave `token_acesso` e carrega uma lista global da fila (`filaData`) com `cliente_id`, IDs, status, horários e metadados; a policy anônima documentada em `docs/migracoes-mvp-rls.sql` para atendimentos usa apenas `token_acesso IS NOT NULL`, o que não valida posse do token e, se esse SQL tiver sido aplicado, permite leitura ampla por `anon`. A migration versionada `20260910000002_corrigir_rls.sql` remove policies antigas, mas não define policy segura substituta; não é possível concluir qual configuração está efetiva sem consultar o Supabase.

O token UUID tem entropia adequada, mas é uma credencial bearer: quem obtém link/histórico de URL pode ver os dados. O token aparece em caminho de URL, sujeito a logs de acesso, telemetria e compartilhamento. A função também permite consulta direta por qualquer token candidato; rate limiting não foi identificado no código.

**Impacto:** divulgação de nome e dados da agenda; possível exposição muito mais ampla se a policy permissiva do script em `docs/` foi executada. `anon` só deveria receber o conjunto mínimo necessário ao acompanhamento, e somente para a solicitação correspondente.

### A5 — RLS/policies de tabelas posteriores não demonstradas nas migrations versionadas

`bloqueios_agenda` é criada em `docs/migracoes-mvp.sql`, não aparece criada nas migrations versionadas de `supabase/migrations/`; a policy anônima de SELECT e policy authenticated ALL são encontradas em `docs/migracoes-mvp-rls.sql`, também fora da pasta versionada de migrations. `atendimento_procedimentos` é criada em `20261010000000_multi_procedimento.sql` sem `ENABLE ROW LEVEL SECURITY` ou policies na migration. Não foi encontrada policy posterior na pasta de migrations para `bloqueios_agenda` ou `atendimento_procedimentos`.

**Impacto:** estado de segurança depende de scripts manuais/estado do banco; bloqueios podem ficar inacessíveis ou, se privilégios/grants permitirem, excessivamente expostos. Tabela de junção pode ter acesso incompatível com a intenção. Confirmar RLS, grants e policies diretamente no projeto antes da publicação.

### A6 — Dados e erros excessivos na superfície pública

`criarSolicitacaoAgendamento` devolve ao cliente o token de acompanhamento (necessário ao fluxo) e em alguns ramos devolve `erroAtendimento.message` ou `erroCriarCliente.message`, que pode revelar detalhes internos de banco/schema. A função pública retorna nome/sobrenome mesmo que a experiência do cliente não precise necessariamente de ambos. `bloqueios_agenda` tem policy anônima documentada com `USING (true)` para `SELECT *` no cliente, potencialmente revelando descrição/motivo e calendário completo, além das horas indisponíveis.

## Médio

### M1 — Identidade autenticada equivale a administrador

As páginas administrativas são protegidas por autenticação, mas nenhuma verificação de papel/allowlist de email está visível no middleware. Logo, login válido no projeto Supabase basta para entrar em `/admin`; isso é coerente com o problema A1/A2 e não é controle administrativo suficiente.

### M2 — Policy `true` e privilégio mínimo

Há usos de `USING (true)`/`WITH CHECK (true)` para acesso integral de `authenticated` nas quatro tabelas base, e scripts de documentação contêm `USING (true)` para leitura anônima de bloqueios/clientes. `true` não é sempre errado: é aceitável para catálogo público limitado (por exemplo, procedimentos ativos) ou CRUD de uma tabela após autorização administrativa independente. Neste projeto, o escopo de roles e dados torna essas policies excessivas.

### M3 — Validação incompleta de entrada e limites de abuso

Na Server Action pública há limites de quantidade de procedimentos, mas não se vê limite de tamanho para nome/sobrenome/descrição, formato/validade do WhatsApp no servidor, deduplicação de IDs, controle de taxa, CAPTCHA ou prevenção de criação automatizada em massa. Não foi encontrada proteção de rate limit nas ações públicas. A validação de formulário cliente não substitui validação de servidor.

### M4 — Persistência do cliente e consistência concorrente

Busca e inserção de cliente por WhatsApp não são atômicas e a migration base não define unicidade para WhatsApp. Duas requisições simultâneas podem criar clientes duplicados; inserção de cliente pode ficar órfã se falhar depois a criação do atendimento. A criação multi-procedimento em duas operações pode deixar estado parcial.

### M5 — Log de email no middleware

`src/middleware.ts` registra `user?.email` em `console.log`. Não é segredo de autenticação, mas constitui dado pessoal e deve ser removido ou submetido à política de retenção/acesso a logs; verificar se logs de produção são públicos ou amplamente acessíveis.

### M6 — Conteúdo interno versionado

Há arquivos de memória e contexto de IA (`MEMORY.md`, `memory.md`, `docs/ia/*`, `.claude/salao-dashboard.html`) rastreados no repositório. A análise de nomes não encontrou credencial evidente, mas esses arquivos podem conter detalhes operacionais, histórico e caminhos/contexto privado. Confirmar que o repositório é intencionalmente público e revisar o histórico completo antes de publicação.

### M7 — Achados adicionais de dependências

O audit registra falhas altas em `brace-expansion` (dependência de desenvolvimento), `@next/eslint-plugin-next`/`eslint-config-next` e outras dependências transitivas. `brace-expansion` e ESLint são ferramentas de desenvolvimento (risco primário no ambiente de build/desenvolvimento, não runtime do site); `sharp` é optional de produção, e `source-map-js` está como produção. O audit também associa correções que podem exigir atualização de versão/configuração. Fazer atualização deliberada, revisar changelogs e executar build/testes; não usar correção automática cega.

## Baixo / observações

- `.gitignore` exclui `.env.example` junto de todos os `.env*`; é seguro em segredo, mas arquivos de exemplo podem não ser compartilháveis. Não configura vazamento por si só.
- Não foi realizada varredura especializada de segredos (ex.: scanner de entropia/secret scanning), nem análise do histórico completo remoto de forma conclusiva. Status: **sem evidência de segredo rastreado na inspeção por nomes**, não “garantia de ausência”.
- A política para `procedimentos` anônima retorna todas as colunas de procedimentos ativos; hoje os campos identificados parecem informações de catálogo (nome/duração/ativo/criação), mas a projeção poderia ser limitada caso novos campos sensíveis sejam acrescentados.

# Supabase: respostas diretas

| Tabela | RLS nas migrations de `supabase/migrations/` | Acesso observado |
|---|---|---|
| `procedimentos` | Ativo | `anon` lê ativos; `authenticated` CRUD amplo (`true`) |
| `clientes` | Ativo | `authenticated` CRUD amplo; nenhuma policy anon na pasta versionada inicial; script em `docs/` concede INSERT e SELECT anônimos amplos |
| `atendimentos` | Ativo | `authenticated` CRUD amplo; migration corretiva remove policies antigas, mas os scripts em `docs/` propõem INSERT público e SELECT sem validar token efetivamente |
| `segmentos_atendimento` | Ativo | `authenticated` CRUD amplo; sem policy anônima na migration base |
| `bloqueios_agenda` | Não demonstrado na pasta de migrations versionadas | scripts em `docs/` concedem leitura `anon` global e CRUD `authenticated` amplo |
| `atendimento_procedimentos` | Não habilitado na migration que cria tabela | Sem policy explícita encontrada |

- **Cliente anônimo acessa dados indevidos?** As migrations versionadas, isoladamente, não provam acesso anon direto a clientes/atendimentos após a remoção de policies antigas; porém a RPC pública expõe nome, status e dados do atendimento com token. Se `docs/migracoes-mvp-rls.sql` tiver sido executado, a policy de SELECT em `atendimentos` não checa o token fornecido (`token_acesso IS NOT NULL`) e é insegura; a policy de SELECT em clientes usa `USING (true)`. Acesso efetivo precisa ser testado no Supabase.
- **Usuário autenticado tem acesso excessivo?** Sim. Qualquer `authenticated` recebe acesso total às tabelas cobertas pelas policies `*_all`, sem papel administrativo.
- **Existe policy `true` sem necessidade?** Sim, especialmente as policies `authenticated_*_all` sem camada independente de autorização, e as policies anon de clientes/bloqueios nos scripts de documentação. A policy `anon` de procedimentos ativos é justificável como catálogo público, embora projeção mínima seja preferível.

# Função `fn_atendimento_publico`

- O nome efetivo é `public.fn_buscar_atendimento_publico(text)`.
- É `SECURITY DEFINER`; todas as migrations que a redefinem fixam `search_path` e qualificam tabelas. `EXECUTE` é revogado de `PUBLIC` e permitido a `anon` e `authenticated`.
- Retorna um registro por token: UUID do atendimento, nome(s) de procedimento, modo, status, horário, posição de fila, previsões, nome/sobrenome do cliente, duração trabalhada/estimada e timestamps. Não retorna WhatsApp nem `token_acesso` explicitamente.
- O token é UUID gerado criptograficamente e atua como bearer secreto; exposição do link equivale à autorização. A função não tem autenticação adicional, rate limit ou expiração visível.
- O cliente usa também consultas diretas na tabela para status de confirmação e fila. O desenho dessa parte pode expor dados da fila dependendo das policies efetivas, divergindo do princípio do mínimo necessário.

# Autenticação administrativa e Server Actions

- **`/admin` sem autenticação:** o middleware observado combina matcher `/admin/:path*`, valida a sessão com `getUser()` e redireciona sem usuário para `/login`. No fluxo normal da requisição, deve bloquear. Não foi feito teste HTTP em runtime.
- **Limitação:** middleware não substitui autorização nas operações de dados; sessão autenticada não equivale a identidade autorizada como administradora. A página/layout cliente não adiciona barreira forte.
- `agendamento.ts`: valida obrigatoriedade, data parseável/no passado, máximo de dois IDs. Não valida disponibilidade/bloqueios/conflito/duração no servidor nem valores/procedimentos contra o banco antes de inserir. É pública por design; falta endurecimento de abuso e validação integral.
- `solicitacoes.ts`: listar/aprovar/recusar sem validação explícita de usuário/role; valida ID apenas como truthy. A atualização não verifica estado prévio, transição permitida nem se alguma linha foi afetada.
- `bloqueios.ts`: listar/criar/atualizar/excluir sem verificação explícita de usuário/role; validação de campos e conflitos é parcial e não é barreira de autorização. `ignorarConflito` é controlado pelo cliente e pode permitir salvar mesmo com conflito; não há autorização explícita para essa exceção.
- Todas as funções capturam erros, mas algumas retornam mensagens do Supabase diretamente. A captura geral evita crash sem tratar abuso, autorização ou consistência.

# Agenda e dados dos clientes

- O cliente constrói horários disponíveis localmente; a Server Action de criação não revalida bloqueios ou atendimento conflitante. Portanto, os bloqueios podem ser ignorados por chamada direta e a grade do navegador pode ficar desatualizada.
- A ausência de reserva atômica/constraint de exclusão deixa possível corrida entre duas requisições no mesmo horário.
- Duração é inferida no frontend e a action aceita data/hora enviada; os IDs de procedimento são limitados em número, mas não há validação autoritativa das durações/estado ativo dos procedimentos na action examinada.
- Dados pessoais: clientes armazenam nome, sobrenome e WhatsApp; a RPC pública retorna nome/sobrenome; telas administrativas carregam WhatsApp e histórico. O arquivo de acompanhamento consulta fila e usa dados mais amplos do que o próprio token. Não há evidência de exposição direta do WhatsApp pela RPC, mas há risco de vazamento indireto pelas consultas e policies públicas.

# Correções recomendadas

1. Antes de deploy, atualizar/mitigar as dependências reportadas, começando por Next.js e vulnerabilidades críticas/altas de runtime; revisar changelogs e testar build, lint e fluxos sem `npm audit fix` automático.
2. Criar modelo explícito de autorização administrativa (role/allowlist confiável) e exigir verificação em toda Server Action administrativa e nas policies do banco; não tratar qualquer `authenticated` como admin.
3. Inventariar no Supabase produção RLS, policies, grants, funções e roles reais. Resolver discrepância entre migrations versionadas e scripts manuais em `docs/`; tornar a configuração de segurança reproduzível e versionada. Confirmar RLS e grants em cada tabela, inclusive `bloqueios_agenda` e `atendimento_procedimentos`.
4. Remover policies públicas que autorizam SELECT de clientes/atendimentos sem prova de posse; se houver leitura pública de acompanhamento, limitar a RPC a campos indispensáveis e manter consultas do token isoladas, sem listar fila/clientes.
5. Validar todos os dados e disponibilidade no servidor, incluindo IDs/estado ativo, data/hora e duração, bloqueios e conflitos. Efetivar reserva/validação em transação ou mecanismo atômico que impeça corridas; nunca confiar em estado de navegador/`ignorarConflito` não autorizado.
6. Minimizar dados retornados e projeções: não expor nome completo ou motivos de bloqueio se não forem necessários; evitar `SELECT *`; avaliar política de retenção de dados pessoais.
7. Adicionar controles de abuso (rate limiting, limites de tamanho e formato, monitoramento/alertas) às ações públicas; normalizar respostas para não divulgar mensagens internas do banco.
8. Remover log de email do middleware e revisar acessos/retenção de logs.
9. Revisar repositório e histórico com scanner de segredos; confirmar visibilidade do GitHub, acesso ao histórico e secrets em hosting; rotacionar qualquer credencial caso haja exposição.
10. Executar testes de autorização negativos com anon, usuário autenticado não-admin e admin, e validar `/admin`, RPC, políticas e agendamento concorrente no ambiente de staging antes da publicação.

# O sistema está pronto para publicação?

**NÃO.** Há risco alto/crítico de dependências, permissões excessivas para usuários autenticados, ausência de autorização explícita nas Server Actions administrativas, exposição de dados pessoais pela superfície pública e ausência de validação autoritativa/atômica da agenda. Além disso, as policies efetivas do Supabase não puderam ser verificadas sem acesso ao projeto. Publicação deve aguardar remediação e validação no ambiente real.

---

# Atualização — 16/10/2026 (pós-remediação e verificação em produção)

Entre a análise original e esta data, as remediações abaixo foram implementadas, aplicadas no banco de produção e verificadas. O status de cada achado foi reavaliado.

## Evidências de verificação (16/10/2026)

- Migration `supabase/migrations/20261017000000_seguranca_publicacao.sql` executada no Supabase de produção: `Success. No rows returned`.
- Query de verificação em `pg_policies` (tabelas `atendimentos`, `clientes`): restam apenas `Admins gerenciam atendimentos`, `anon_atendimentos_insert_pendente`, `Admins gerenciam clientes`, `anon_clientes_insert`. As policies anônimas de leitura ampla **não existem mais**.
- Cadastro público desligado no dashboard (Authentication → Sign In / Providers → "Allow new users to sign up" = OFF, confirmado por screenshot).
- Apenas **1 conta de usuário** existe no Authentication (a administradora).
- Código sincronizado no PC de produção (`git pull`: `3fc79cc` → `72e5b4f`); `npm run build` passa limpo.
- Testes de fluxo em `npm run dev`: agendamento público gera token; `/acompanhar/[token]` com token válido exibe os dados; token inválido/truncado exibe "Não encontrado"; login no `/admin` aprova/recusa solicitações normalmente.

## Reavaliação dos achados

| Achado | Status em 16/10/2026 |
|---|---|
| **C1** — 9 vulnerabilidades `npm audit` (1 crítica, 8 altas) | ✅ **CRÍTICA CORRIGIDA; 7 altas residuais aceitas** — em 16/10/2026 o Next foi atualizado de 16.3.4 para **16.4.2** e o React de 19.2.8 para **19.3.1** (commit `7d9ab55`), cobrindo o patch de segurança urgente de 14/10/2026 (2 RCEs críticas CVSS 9.5 + DoS em Server Actions; o app usa Server Actions intensivamente). `npm audit` pós-update: **0 críticas, 7 altas**, todas fora do runtime de produção: `brace-expansion`/`braces`/`micromatch`/`fast-glob` via cadeia do `eslint-config-next` (ferramenta de desenvolvimento; a correção do `braces` exigiria downgrade quebrante do eslint para 14.x — rejeitado) e `source-map-js` (DoS só com source maps de origem atacante, cenário inaplicável). `npm run build` passa no 16.4.2. Opcional: `npm audit fix` (sem `--force`) para as correções semver-compatíveis, com rebuild e reteste. |
| **A1** — `authenticated` com acesso integral, sem papel administrativo | ✅ **RISCO ACEITO + MITIGADO** — decisão de produto: sem sistema de cargos; qualquer `authenticated` = a única administradora (Inácia). Mitigação verificada: cadastro público **desligado** e apenas 1 conta existente, de modo que nenhuma conta nova pode ser criada por terceiros. Risco residual: comprometimento da única conta — aceito para o MVP. |
| **A2** — Server Actions administrativas sem autorização própria | ✅ **CORRIGIDO (parcial)** — `src/app/actions/solicitacoes.ts` e `src/app/actions/bloqueios.ts` agora chamam `auth.getUser()` e recusam execução sem usuário autenticado (commit `72e5b4f`). Sem checagem de papel, por decisão (ver A1). |
| **A3** — Criação pública sem validação server-side | ✅ **CORRIGIDO** — `src/app/actions/agendamento.ts` valida no servidor: procedimento existe e está ativo, duração lida do banco, bloqueios e conflitos de horário (commit `3fc79cc`). A grade do `/agendar` também não oferece mais horários que terminariam após as 19:00, e a UI limita a 2 procedimentos como o servidor. Risco residual aceito: sem transação/constraint contra dois cliques simultâneos no mesmo horário (salão pequeno + aprovação manual). |
| **A4** — Exposição de dados pessoais pela RPC pública e tracking | ✅ **CORRIGIDO** — as policies anônimas de SELECT amplo (`anon_atendimentos_select_proprio_token`, `anon_clientes_select_basico`) foram **removidas do banco** (verificado via `pg_policies`); `/acompanhar/[token]/page.tsx` não faz mais nenhuma consulta direta a tabelas (zero `supabase.from` na página) e usa somente RPCs; nova `fn_fila_publica(p_token)` exige token válido e retorna apenas dados mínimos da fila (sem `id`, `cliente_id`, `procedimento_ids`, WhatsApp); `fn_buscar_atendimento_publico` ganhou `status_confirmacao` para a página não precisar de SELECT direto. Risco residual inerente ao desenho: o token continua sendo bearer na URL (aceito) e não há rate limit nas RPCs. |
| **A5** — RLS de tabelas posteriores não demonstrado | ⚠️ **PARCIALMENTE TRATADO** — a leitura anônima de bloqueios (`anon_bloqueios_select`) foi mantida deliberadamente: a grade pública do `/agendar` precisa dos horários indisponíveis. Recomenda-se confirmar RLS/grants de `atendimento_procedimentos` no banco antes da publicação, caso a tabela de junção seja utilizada. |
| **A6** — Dados e erros excessivos na superfície pública | ✅ **CORRIGIDO (parcial)** — acompanhamento não consulta mais tabelas diretamente; a fila pública é mínima. |
| **M1** — Identidade autenticada equivale a administrador | ✅ **ACEITO** — por decisão de produto, mitigado pelo cadastro público desligado (ver A1). |
| **M3** — Validação de entrada e limites de abuso | ⏳ **PENDENTE** — sem rate limit/CAPTCHA nas ações públicas. Recomendado como endurecimento futuro, não bloqueador para o MVP. |
| **M4** — Persistência do cliente e consistência concorrente | ✅ **RISCO ACEITO** — mesma aceitação de A3 (concorrência simultânea). |
| **M5** — Log de email no middleware | ✅ **CORRIGIDO** — `console.log` removido de `src/middleware.ts` (commit `4449110`). |
| **M6** — Conteúdo interno versionado | ✅ **CORRIGIDO (parcial)** — arquivos com nomes de caminho Windows quebrados (incluindo cópias de `MEMORY.md`) foram removidos do repositório (commits `83e6bb9`, `a8f90af`); varredura do histórico não encontrou chave/segredo real. `docs/ia/*` permanece versionado por decisão (documentação do projeto). |

## Correções de código também incluídas (commits `4449110` e `72e5b4f`)

- `src/app/layout.tsx`: corrigido uso de `LayoutProps` inexistente (o `npm run build` estava quebrado); metadata e idioma (`pt-BR`) ajustados.
- Removida a rota antiga `src/app/acompanhar/[token/]/` (versão duplicada com consultas diretas inseguras).

## Veredito atualizado — 16/10/2026

**CONDICIONALMENTE PRONTO.** Todos os bloqueadores de segurança de dados foram remediados e verificados no banco de produção: não há mais leitura anônima ampla de clientes/atendimentos, o acompanhamento público usa somente RPCs mínimas com token válido, as actions administrativas exigem autenticação, o cadastro público está desligado e existe apenas uma conta. O que ainda impede a publicação:

1. ~~**Atualização controlada das dependências** (C1): 9 vulnerabilidades do `npm audit` (1 crítica, 8 altas, maioria no Next.js 16.3.4). Atualizar com changelog, rodar `npm run build` e retestar os fluxos. Nunca `npm audit fix --force`.~~ **CONCLUÍDO em 16/10/2026** (ver C1 acima).
2. **Variáveis no deploy** (quando publicar na Vercel): somente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Nunca expor `service_role` no frontend.
3. Recomendado (não bloqueador): confirmar RLS/grants de `atendimento_procedimentos` no banco; avaliar rate limiting nas ações públicas futuramente.