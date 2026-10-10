ALTER TABLE bloqueios_agenda
ADD COLUMN tipo text DEFAULT 'especifico' CHECK (tipo IN ('semanal_fixo','temporario','especifico')),
ADD COLUMN dias_semana int[],
ADD COLUMN data_inicio date,
ADD COLUMN data_fim date,
ADD COLUMN hora_inicio text,
ADD COLUMN hora_fim text;

COMMENT ON COLUMN bloqueios_agenda.tipo IS 'semanal_fixo: recorrente por dias; temporario: período com data inicial/final; especifico: uma data única';
COMMENT ON COLUMN bloqueios_agenda.dias_semana IS 'Dias da semana para semanal_fixo (0=dom, 1=seg ... 6=sab), array';
COMMENT ON COLUMN bloqueios_agenda.data_inicio IS 'Data inicial do bloqueio (temporario ou especifico)';
COMMENT ON COLUMN bloqueios_agenda.data_fim IS 'Data final do bloqueio (temporario)';
COMMENT ON COLUMN bloqueios_agenda.hora_inicio IS 'Horário de início (HH:MM) para regra';
COMMENT ON COLUMN bloqueios_agenda.hora_fim IS 'Horário de fim (HH:MM) para regra';
