-- Sessão 28.7 (rev2) — relaxa policy: anon TAMBÉM pode inserir feedback
-- (com user_id NULL). Útil para testes e para usuários não logados.

DROP POLICY IF EXISTS "auth_insert_feedback" ON feedback;
DROP POLICY IF EXISTS "anon_insert_feedback" ON feedback;

-- Authenticated: insere com seu próprio user_id ou NULL
CREATE POLICY "auth_insert_feedback"
  ON feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Anon: pode inserir, mas user_id deve ser NULL (não pode forjar id de outra conta)
CREATE POLICY "anon_insert_feedback"
  ON feedback
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);
