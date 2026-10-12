ALTER TABLE atendimentos ADD COLUMN procedimento_ids UUID[] DEFAULT NULL;

CREATE TABLE IF NOT EXISTS atendimento_procedimentos (
  atendimento_id UUID NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  procedimento_id UUID NOT NULL REFERENCES procedimentos(id) ON DELETE RESTRICT,
  PRIMARY KEY (atendimento_id, procedimento_id)
);
