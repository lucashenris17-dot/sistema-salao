# Sistema Salão da Inácia

Sistema de gerenciamento de salão desenvolvido com:

- Next.js
- TypeScript
- Supabase
- Tailwind CSS

Objetivo:
Criar um sistema completo para o salão, permitindo:

- cliente realizar agendamento pelo celular;
- administradora controlar solicitações;
- aprovação de horários;
- fila de atendimento;
- cadastro de clientes;
- procedimentos;
- bloqueios de agenda;
- gestão diária do salão.

Fluxos principais:

Cliente:
 /agendar
 ↓
escolhe procedimento
 ↓
escolhe data e horário
 ↓
envia solicitação
 ↓
aguarda aprovação
 ↓
acompanha pelo token


Administradora:
 /admin
 ↓
controla agenda
 ↓
aprova ou recusa
 ↓
gerencia atendimentos