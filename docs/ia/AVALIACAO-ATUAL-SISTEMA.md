# Avaliação Atual — Sistema Salão Inácia

**Data da avaliação:** 2026-11-10  
**Escopo:** análise documental e inspeção estática do código existente. Nenhum código, banco ou migration foi alterado nesta avaliação. Os fluxos não foram executados contra um ambiente real, portanto itens classificados como funcionando refletem implementação e documentação, não um aceite E2E independente.

## 1. RESUMO EXECUTIVO

O sistema está em estágio de **MVP funcional com operações centrais implementadas e estabilização ainda necessária**. Há um fluxo público de solicitação de agendamento, acompanhamento por token e um painel administrativo para aprovar solicitações, gerir atendimentos, clientes, procedimentos e bloqueios. A base usa Supabase, autenticação administrativa e RLS; a documentação registra builds e checagens de tipos aprovados em sessões recentes.

**O que já está pronto:** fluxo público em etapas, seleção de procedimentos, cálculo de disponibilidade, gravação de solicitação, acompanhamento com previsão e atualização Realtime; operação administrativa com solicitações, atendimentos, status, painel e CRUDs; regras de bloqueio semanal, temporário e específico; alertas de conflito entre bloqueios e atendimentos, com decisão manual da administradora.

**Pode ser usado no dia a dia?** Sim, de forma **operacional assistida**, desde que a responsável confira solicitações, conflitos e agenda antes de confirmar e que sejam realizados testes manuais dos cenários críticos. Não há evidência, neste levantamento, de uma rodada recente de testes E2E completa em ambiente de produção. Não é prudente tratar a agenda como totalmente autônoma ou dispensar conferência humana.

**Riscos principais:** lógica de horário/bloqueio teve alterações recentes e validação reportada não é uniforme; múltiplos procedimentos foram introduzidos em partes do sistema e precisam de validação ponta a ponta; consultas de disponibilidade e previsão devem interpretar durações múltiplas consistentemente; há solução temporária de duas consultas para o status público e anotações pendentes/desatualizadas. O working tree já contém alterações locais em diversos arquivos; esta avaliação não as atribui a esta tarefa.

## 2. AVALIAÇÃO POR MÓDULO

### Agendamento público

| Aspecto | Estado | Avaliação |
|---|---|---|
| Seleção de procedimentos | 🟢 Funcionando | Página pública carrega procedimentos ativos e permite seleção; o código mantém IDs selecionados. |
| Múltiplos procedimentos | 🟡 Atenção | Há suporte recente a até dois procedimentos e a documentação registra alterações de schema/RPC. Validar persistência, exibição, duração total e compatibilidade com registros antigos no fluxo inteiro. |
| Duração | 🟡 Atenção | A grade recebe uma duração e dados de atendimentos incluem campos multi; confirmar que a duração total selecionada e a duração ocupada consultada são as mesmas em todas as rotas. |
| Cálculo de horários | 🟡 Atenção | `src/lib/horarios.ts` centraliza grade de 30 minutos, horários passados, conflitos e bloqueios com fuso do salão. Houve ajustes recentes de bordas e múltiplos bloqueios; requer regressão dirigida. Expediente permanece fixo em 08:00–19:00. |
| Salvamento | 🟢 Funcionando | Existe Server Action para criar solicitação e validar dados; o fluxo público encaminha os dados selecionados. Testar conflito entre duas submissões concorrentes e múltiplos serviços. |
| Confirmação | 🟢 Funcionando | A confirmação administrativa é separada do envio: o cliente envia solicitação, recebe token e acompanha; a aprovação/recusa é feita no admin. Não confundir envio com confirmação do horário. |

**Leitura operacional:** disponibilidade exibida é uma verificação de interface baseada nos dados carregados. Reconfirmar conflitos no salvamento e em situações concorrentes é importante para evitar dupla reserva.

### Acompanhamento do cliente

| Aspecto | Estado | Avaliação |
|---|---|---|
| Acesso por token | 🟢 Funcionando | Token de acesso opaco é usado na rota `/acompanhar/[token]`; documentação registra RPC e proteção por RLS. |
| Informações exibidas | 🟢 Funcionando | Exibe status, data/horário e dados do atendimento conforme a documentação e a tela inspecionada. |
| Procedimentos | 🟡 Atenção | Há alterações recentes para múltiplos procedimentos. Confirmar apresentação dos nomes e compatibilidade de atendimento legado com um único procedimento. |
| Duração | 🟡 Atenção | Duração total precisa ser validada junto ao multi-procedimento e à previsão. |
| Previsão | 🟡 Atenção | `calcularPrevisao()` existe e há casos de teste embutidos/documentados, mas a implementação e tipos observados incluem caminhos baseados em procedimento singular. Confirmar cenário com mais de um procedimento e estados operacionais. |

**Limitação conhecida:** a RPC pública não retorna nativamente `status_confirmacao`; a página usa uma busca secundária filtrada pelo token. Funciona segundo a documentação, mas mantém duas consultas e dependência de política RLS específica.

### Dashboard administrativo

| Aspecto | Estado | Avaliação |
|---|---|---|
| Atendimentos do dia | 🟢 Funcionando | Card e lista operacional existem; a documentação relata exclusão de finalizados/cancelados/no-show em contagens operacionais. |
| Filtros | 🟡 Atenção | Existem períodos no resumo do salão e telas próprias com hoje/semana/finalizados. Conferir consistência de datas e timezone (há referências a `America/Recife` e `America/Sao_Paulo` no código). |
| Contadores | 🟡 Atenção | Há contadores e resumo por período. A documentação registra correções, mas o resumo pode divergir da lista conforme status/período; validar com dados conhecidos. |
| Próximos horários | 🟡 Atenção | Lista principal e widget de próximo atendimento não têm documentação perfeitamente alinhada sobre filtros de confirmação pendente. Conferir se solicitações não aprovadas aparecem como agenda confirmada. |

### Tela de atendimentos

| Aspecto | Estado | Avaliação |
|---|---|---|
| Hoje | 🟢 Funcionando | Aba documentada com comparação de data local do salão. |
| Esta semana | 🟢 Funcionando | Aba documentada; conferir regra de início/fim da semana em uso real. |
| Finalizados | 🟢 Funcionando | Aba separa atendimentos finalizados conforme a sessão registrada. |
| Status | 🟢 Funcionando | Ações de iniciar, pausar, retomar, finalizar, cancelar e no-show estão documentadas. |
| Confirmação | 🟡 Atenção | Há status operacional (`status`) e de confirmação (`status_confirmacao`); legado pode ter confirmação nula. Widgets e listagens precisam tratar ambos sem misturar “solicitação pendente” com atendimento confirmado. |

### Bloqueios

| Aspecto | Estado | Avaliação |
|---|---|---|
| Criação | 🟡 Atenção | Formulário tem modelos semanal, temporário e específico. A action valida dados e alerta sobre atendimentos ativos conflitantes; confirmação para prosseguir é decisão manual. |
| Edição | 🟡 Atenção | Edição preenchida e action de atualização estão registradas. Validar edição de cada tipo, a detecção de conflitos e os dados derivados gravados. |
| Exclusão | 🟢 Funcionando | A action remove pelo ID; validar que o horário volta a aparecer na agenda após atualização. |
| Temporário | 🟡 Atenção | Modelo por intervalo de datas e horas está implementado/documentado. Validar aplicação em todos os dias do intervalo e conversão de fuso. |
| Data específica | 🟢 Funcionando | Modelo de data única existe e é considerado pelo cálculo de horários. |
| Fixo semanal | 🟡 Atenção | Regra com dias da semana e faixa horária é suportada; avaliar recorrência futura, múltiplos dias selecionados e conversão de dia/fuso. |
| Múltiplos bloqueios | 🟡 Atenção | Motor avalia bloqueios individualmente e preserva intervalos livres. Ajustes recentes reportam esse comportamento, mas a borda final mudou entre sessões e uma nota de validação aparece como pendente. |
| Conflito com agenda | 🟡 Atenção | Há verificação e modal com dados/WhatsApp; não cancela atendimentos automaticamente. A consulta e duração usada para detectar conflito devem ser conferidas para multi-procedimento. |

**Diagnóstico registrado para horários vermelhos:** um horário vermelho pode indicar bloqueio, atendimento confirmado ocupando a janela (incluída a duração) ou horário já passado. Portanto, a cor não prova por si só que exista registro em `bloqueios_agenda`; investigar também atendimentos, duração e data/fuso. A documentação da memória adverte expressamente contra diagnosticar olhando apenas bloqueios.

**Evolução recente da regra:** as sessões de 10/11/2026 registram correção de múltiplos bloqueios semanais, intervalos semiabertos, um ajuste para bloqueio noturno e depois mudança para borda final inclusiva especificamente no cálculo de bloqueios. Como são alterações próximas e uma delas registra validação pendente, a regra de término/início exato deve ser testada explicitamente antes de considerar o módulo estabilizado.

## 3. PENDÊNCIAS ATUAIS

### 🔴 Alta prioridade

| Prioridade | Pendência | Impacto | Situação |
|---|---|---|---|
| 🔴 Alta | Revisão final de horários e bloqueios, especialmente limites exatos, múltiplos bloqueios no mesmo dia, timezone e horários vermelhos | Pode ocultar horário válido ou oferecer horário ocupado; afeta diretamente a agenda | Ajustes recentes registrados; regressão operacional ainda necessária, com validações não uniformes nas notas |
| 🔴 Alta | Validar ponta a ponta agendamento com dois procedimentos (salvar, duração, conflito, acompanhamento, admin e previsão) | Duração ou lista incorreta pode permitir sobreposição e informar o cliente errado | Suporte recente implementado; cobertura E2E não comprovada nesta análise |
| 🔴 Alta | Confirmar filtragem de solicitações pendentes na lista/widget “próximo atendimento” | Admin pode interpretar solicitação não aprovada como compromisso confirmado | Documentos divergem: snapshot aponta limitação no widget; registros posteriores citam filtros no dashboard. Requer conferência no estado executável atual |

### 🟠 Média prioridade

| Prioridade | Pendência | Impacto | Situação |
|---|---|---|---|
| 🟠 Média | Definir tratamento de atendimentos passados que continuam `aguardando` (no-show, limpeza manual ou filtro) | Polui lista e pode afetar contadores/previsões | Pendente na lista de tarefas; sem rotina automática documentada |
| 🟠 Média | Validar conflito bloqueio × atendimento também em edição e regras recorrentes/multi-procedimento | Pode permitir bloqueio sobre horário ocupado ou alerta incompleto | Fluxo de alerta existe; revisão por cenários necessária |
| 🟠 Média | Revisar modelo de duração/identificação multi-procedimento em todas as consultas e telas | Divergência entre grade, previsão, cards e dados salvos | Implementação recente parcialmente registrada; validação transversal pendente |
| 🟠 Média | Resolver workaround do status público e confirmar consistência dos registros legados | Duas consultas e dependência de RLS; status incorreto prejudica cliente | Workaround funcional documentado; solução nativa depende de mudança de RPC/migration, fora do escopo desta avaliação |

### 🟡 Baixa prioridade

| Prioridade | Pendência | Impacto | Situação |
|---|---|---|---|
| 🟡 Baixa | Adicionar testes automatizados E2E para fluxos críticos | Regressões podem passar despercebidas | Pacote não declara script/ferramenta E2E; diretório `src` não apresentou arquivos convencionais `.test`/`.spec` na busca realizada |
| 🟡 Baixa | Consolidar e manter atualizados memória, estado atual, pendências e diário | Decisões e limitações antigas podem induzir ações incorretas | Documentação existe, mas há diferenças entre snapshots, sessões e implementação atual |

## 4. MELHORIAS FUTURAS

As melhorias abaixo são **planejamento futuro, não correções desta avaliação**. Priorizar estabilidade da operação atual antes de implementá-las.

- **Módulo Horários de Atendimento / disponibilidade semanal:** definir abertura e encerramento por dia, com intervalos; hoje o motor usa grade fixa de 08:00–19:00.
- **Disponibilidade semanal configurável:** administrar expediente sem depender de regras espalhadas e integrá-lo com bloqueios e atendimentos.
- **Relatórios e indicadores:** ampliar o resumo existente com métricas operacionais confiáveis e períodos customizados.
- **Histórico de clientes:** visão longitudinal de atendimentos e preferências.
- **Fidelidade:** benefícios e recorrência, após definir regras comerciais.
- **Múltiplos profissionais:** agenda, disponibilidade e conflitos independentes por profissional; hoje a previsão descreve um profissional.
- **Pagamentos:** registrar valores e estados financeiros somente após definir processo e requisitos de segurança.
- **Indicadores:** taxa de comparecimento, cancelamentos, ocupação e desempenho, com definições consistentes.

## 5. RISCOS ATUAIS

1. **Regressão em horário/bloqueio:** alterações recentes sucessivas em `src/lib/horarios.ts` mudaram limites de conflito. A agenda é função central compartilhada e um erro afeta cliente e operação.
2. **Duração e multi-procedimento:** caminhos novos coexistem com campos singulares e registros legados. Código de previsão e consultas precisa concordar sobre duração total e sequência dos serviços.
3. **Regras de status misturadas:** `status` representa etapa operacional e `status_confirmacao` representa aprovação; confundi-los altera filas, contagens e “próximo atendimento”.
4. **Código/consultas duplicados:** cálculos de período, timezone, conflito e apresentação aparecem em módulos diferentes; divergência entre admin, agendamento e acompanhamento é risco de manutenção.
5. **Fuso horário:** há uso de `America/Recife` e `America/Sao_Paulo`, além de conversões locais/UTC. Datas próximas à meia-noite e limites de dia exigem casos de teste explícitos.
6. **RPC/RLS e dados públicos:** acompanhamento depende de RPC mais consulta secundária com token. Mudanças de política ou schema podem quebrar o status mesmo se a tela carregar os demais dados.
7. **Estado documental/working tree:** os documentos têm snapshots e descrições que não estão perfeitamente alinhados às sessões posteriores. Na inspeção inicial já havia modificações e arquivos não rastreados no working tree em vários arquivos de aplicação, migrations e docs; não é possível atribuir ou validar a origem dessas mudanças nesta tarefa. Fazer revisão de diff e confirmar ambiente/branch antes de qualquer implantação.
8. **Dependência de serviços externos:** Supabase (dados, Auth, RLS, RPC e Realtime) sustenta os fluxos críticos; falha de configuração, política ou conectividade afeta agendamento, admin e acompanhamento.

## 6. TESTES NECESSÁRIOS

- [ ] Novo agendamento simples: seleção, horário disponível, envio, token e registro criado.
- [ ] Novo agendamento com dois procedimentos: duração total, grade, conflitos, gravação e exibição em todas as telas.
- [ ] Atendimento confirmado: solicitação pendente → aprovação → status correto para cliente, dashboard e widget.
- [ ] Cancelamento: status, liberação do horário e atualização das telas/Realtime.
- [ ] Bloqueio específico: horário atingido fica indisponível; exclusão o libera.
- [ ] Bloqueio semanal: verificar cada dia configurado, inclusive vários dias e semanas futuras.
- [ ] Dois bloqueios no mesmo dia: verificar ambos e garantir que o intervalo livre permaneça disponível.
- [ ] Limites de bloqueio: atendimento que termina exatamente no início e atendimento que começa exatamente no fim; confirmar regra intencional atual.
- [ ] Bloqueio temporário com mais de um dia: confirmar todas as datas do intervalo.
- [ ] Criar/editar bloqueio que conflita com atendimento: alerta correto, sem cancelamento automático, e decisão explícita da administradora.
- [ ] Cliente acompanhando atendimento: token válido/inválido, status antes/depois da confirmação, procedimentos, duração, previsão e Realtime.
- [ ] Dashboard: cards, contadores, período e ordenação comparados com conjunto conhecido, incluindo pendentes, finalizados, cancelados e passados.
- [ ] Tela de atendimentos: Hoje / Esta semana / Finalizados, fuso, status e compatibilidade de registros antigos.

## 7. RECOMENDAÇÃO DE PRÓXIMOS PASSOS

1. **Estabilizar e validar agenda/bloqueios** com os casos de limite, recorrência, múltiplos bloqueios, conflito e fuso; registrar o comportamento esperado de cada borda.
2. **Executar fluxo completo de multi-procedimento** em ambiente seguro, incluindo salvamento, duração, confirmação, acompanhamento, previsão e admin; corrigir discrepâncias somente após reproduzi-las.
3. **Auditar estados e visões administrativas** (pendências versus confirmados, atendimentos passados, abas e contadores) e decidir regra operacional para no-show/limpeza.
4. **Atualizar documentação e planejar cobertura automatizada**, reconciliando snapshot, pendências e diário com o código efetivamente validado; então priorizar melhorias futuras sem misturá-las à estabilização.

---

**Limite desta avaliação:** não foram realizados testes E2E contra Supabase/produção nem inspeção de dados remotos. As referências a funcionamento e risco devem ser lidas à luz desse limite e das alterações preexistentes no working tree.