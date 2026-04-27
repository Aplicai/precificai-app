-- Sessão 28.7 — Tabela de feedback/sugestões enviadas via Suporte.
-- O usuário escreve uma sugestão na Central de Suporte; o app insere
-- aqui com user_id, email, nome do negócio e a mensagem. O dev consulta
-- a tabela no dashboard ou configura uma webhook/email forwarder.

CREATE TABLE IF NOT EXISTS feedback (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  nome_negocio TEXT,
  segmento TEXT,
  mensagem TEXT NOT NULL CHECK (length(mensagem) > 0 AND length(mensagem) <= 5000),
  app_versao TEXT,
  plataforma TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index para consulta por data
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);

-- RLS: usuário autenticado pode INSERT. Apenas service_role pode SELECT/UPDATE/DELETE.
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Política: qualquer usuário autenticado pode inserir feedback (vinculado ao próprio user_id ou anônimo)
DROP POLICY IF EXISTS "auth_insert_feedback" ON feedback;
CREATE POLICY "auth_insert_feedback"
  ON feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

-- Política: usuário pode ver apenas o próprio feedback enviado
DROP POLICY IF EXISTS "auth_select_own_feedback" ON feedback;
CREATE POLICY "auth_select_own_feedback"
  ON feedback
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE feedback IS 'Sugestões enviadas pela Central de Suporte. Service-role lê tudo; usuário só vê o próprio.';
