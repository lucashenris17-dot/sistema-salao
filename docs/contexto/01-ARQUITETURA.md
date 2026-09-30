# Arquitetura do Sistema

Tecnologias:

- Next.js App Router
- TypeScript
- Supabase
- Tailwind CSS

Principais áreas:

Cliente:

src/app/agendar

Responsável pelo agendamento público.

Admin:

src/app/admin

Responsável pela gestão do salão.

Actions:

src/app/actions

Responsáveis pelas operações no servidor.

Banco:

Supabase

Principais tabelas:

- atendimentos
- clientes
- procedimentos
- bloqueios_agenda


Fluxo de agendamento:

Cliente cria solicitação:

modo = agendamento

status = aguardando

status_confirmacao = pendente


Admin aprova:

status_confirmacao = confirmado


Após aprovado:

entra na fila normal de atendimento.