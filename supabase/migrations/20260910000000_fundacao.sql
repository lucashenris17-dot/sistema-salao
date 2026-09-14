-- =============================================================
-- Fundação do banco de dados — sistema-salao
-- Migration: 20260910000000_fundacao
-- =============================================================

-- -----------------------------------------------------------------
-- PROCEDIMENTOS
-- -----------------------------------------------------------------
create table procedimentos (
  id                    uuid         primary key default gen_random_uuid(),
  nome                  text         not null,
  duracao_estimada_min  integer      not null check (duracao_estimada_min > 0),
  ativo                 boolean      not null default true,
  criado_em             timestamptz  not null default now()
);

-- -----------------------------------------------------------------
-- CLIENTES
-- -----------------------------------------------------------------
create table clientes (
  id         uuid        primary key default gen_random_uuid(),
  nome       text        not null,
  sobrenome  text        not null,
  whatsapp   text        not null,
  criado_em  timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- ATENDIMENTOS
-- -----------------------------------------------------------------
create type atendimento_modo   as enum ('agendamento', 'fila');
create type atendimento_status as enum (
  'aguardando',
  'em_andamento',
  'pausado',
  'finalizado',
  'cancelado',
  'no_show'
);

create table atendimentos (
  id                    uuid                 primary key default gen_random_uuid(),
  cliente_id            uuid                 not null references clientes(id)     on delete restrict,
  procedimento_id       uuid                 not null references procedimentos(id) on delete restrict,
  modo                  atendimento_modo     not null,
  status                atendimento_status   not null default 'aguardando',

  -- campos de agendamento (nulos quando modo = 'fila')
  horario_agendado      timestamptz,

  -- campos de fila (nulo quando modo = 'agendamento')
  ordem_fila            integer              check (ordem_fila > 0),

  -- previsões calculadas
  previsao_inicio       timestamptz,
  previsao_fim          timestamptz,

  -- controle de tempo trabalhado
  duracao_trabalhada_seg integer             not null default 0 check (duracao_trabalhada_seg >= 0),
  pausado_desde         timestamptz,

  -- acesso do cliente (link único por atendimento)
  token_acesso          text                 not null unique default gen_random_uuid()::text,

  -- cancelamento
  motivo_cancelamento   text,

  criado_em             timestamptz          not null default now(),
  atualizado_em         timestamptz          not null default now(),

  -- regras de consistência entre modo e campos exclusivos
  constraint ck_agendamento_horario
    check (modo <> 'agendamento' or (horario_agendado is not null and ordem_fila is null)),

  constraint ck_fila_ordem
    check (modo <> 'fila' or (ordem_fila is not null and horario_agendado is null)),

  -- cancelamento exige motivo
  constraint ck_cancelamento_motivo
    check (status not in ('cancelado', 'no_show') or motivo_cancelamento is not null),

  -- pausado_desde só faz sentido no status 'pausado'
  constraint ck_pausado_desde
    check (status = 'pausado' or pausado_desde is null)
);

-- -----------------------------------------------------------------
-- SEGMENTOS DE ATENDIMENTO
-- -----------------------------------------------------------------
create type segmento_tipo as enum ('ativo', 'pausado');

create table segmentos_atendimento (
  id              uuid          primary key default gen_random_uuid(),
  atendimento_id  uuid          not null references atendimentos(id) on delete cascade,
  tipo            segmento_tipo not null,
  inicio          timestamptz   not null,
  fim             timestamptz,

  constraint ck_segmento_fim_apos_inicio
    check (fim is null or fim > inicio)
);

-- =============================================================
-- ÍNDICES
-- =============================================================

-- procedimentos
create index idx_procedimentos_ativo on procedimentos(ativo);

-- clientes
create index idx_clientes_whatsapp on clientes(whatsapp);

-- atendimentos — campos de filtro frequentes
create index idx_atendimentos_cliente_id      on atendimentos(cliente_id);
create index idx_atendimentos_procedimento_id on atendimentos(procedimento_id);
create index idx_atendimentos_status          on atendimentos(status);
create index idx_atendimentos_modo            on atendimentos(modo);
create index idx_atendimentos_horario         on atendimentos(horario_agendado) where horario_agendado is not null;
create index idx_atendimentos_ordem_fila      on atendimentos(ordem_fila)       where ordem_fila is not null;
create index idx_atendimentos_token           on atendimentos(token_acesso);

-- segmentos — busca por atendimento + janela de tempo
create index idx_segmentos_atendimento_id on segmentos_atendimento(atendimento_id);
create index idx_segmentos_inicio         on segmentos_atendimento(inicio);
