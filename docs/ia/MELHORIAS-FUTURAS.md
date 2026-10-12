# Melhorias Futuras

## Horários de Atendimento (Disponibilidade)

- **Problema atual:** Não há uma configuração central e simples para definir os horários em que o salão atende. A disponibilidade pode depender de regras espalhadas pela aplicação, dificultando ajustar a agenda à rotina real do salão.
- **Solução proposta:** Criar uma configuração de disponibilidade por dia da semana, permitindo definir horários de abertura e encerramento e, futuramente, intervalos. Usar essa configuração como referência para apresentar e validar os horários oferecidos no agendamento, respeitando também bloqueios e atendimentos existentes.
- **Impacto:** Facilita a administração da agenda e reduz a oferta de horários fora do expediente. A implementação futura poderá envolver tela administrativa, persistência e integração com a disponibilidade do agendamento; deverá preservar as regras existentes de bloqueios e conflitos.
- **Status:** Planejado — não implementado.
# Assistente IA para Atendimento e Agendamento (Futuro)

Status: Planejado — não implementado

## Objetivo

Criar um robô de atendimento integrado ao sistema do salão, capaz de conversar com clientes automaticamente, entender solicitações e realizar agendamentos.

## Funcionamento esperado

Fluxo:

Cliente → WhatsApp → IA → Sistema Salão → Agenda → Confirmação

## Funções do robô

### Atendimento automático

O robô deverá:

- Responder dúvidas dos clientes;
- Informar serviços disponíveis;
- Informar valores;
- Explicar procedimentos;
- Informar horários disponíveis;
- Orientar clientes antes do atendimento.

### Agendamento automático

O robô deverá:

- Entender pedidos de agendamento;
- Consultar disponibilidade real da agenda;
- Verificar bloqueios;
- Verificar duração dos procedimentos;
- Criar agendamento no sistema;
- Confirmar horário com o cliente.

Exemplo:

Cliente:
"Quero fazer corte e escova sábado à tarde"

IA:

- identifica os procedimentos;
- calcula duração;
- consulta horários livres;
- oferece opções;
- cria a solicitação.

## Atendimento por áudio

O robô deverá aceitar mensagens de voz.

Fluxo:

Cliente envia áudio → IA transforma voz em texto → entende pedido → consulta sistema → responde por áudio.

Funções:

- Receber áudio;
- Interpretar fala natural;
- Responder com voz;
- Avisar o salão quando necessário.

## Avisos para o responsável

A IA deverá enviar avisos:

- novo agendamento;
- cancelamento;
- alteração de horário;
- cliente aguardando confirmação;
- dúvidas que precisam de atendimento humano.

Exemplo:

"Cliente Maria solicitou corte e escova para sábado às 14:00. Aguardando confirmação."

## Integrações futuras

Possíveis integrações:

- WhatsApp Business API;
- Modelo de Inteligência Artificial;
- Sistema de voz;
- Notificações.

## Regras importantes

A IA nunca deve:

- criar horários sem consultar a agenda;
- ignorar bloqueios;
- confirmar horários inexistentes;
- alterar dados sem validação.

Toda ação deve passar pelo sistema principal de agenda.

## Prioridade futura

Alta.

Essa funcionalidade transforma o Sistema Salão em um assistente de atendimento 24 horas.