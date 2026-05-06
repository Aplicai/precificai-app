-- ============================================================
-- PrecificaApp - Supabase Schema
-- Execute este SQL no SQL Editor do Supabase Dashboard
-- ============================================================

-- 1. CONFIGURAÇÃO (singleton por usuário)
CREATE TABLE configuracao (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lucro_desejado REAL DEFAULT 0.15,
  faturamento_mensal REAL DEFAULT 0,
  margem_seguranca REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. PERFIL (singleton por usuário)
CREATE TABLE perfil (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_negocio TEXT DEFAULT '',
  segmento TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  UNIQUE(user_id)
);

-- 3. DESPESAS FIXAS
CREATE TABLE despesas_fixas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor REAL DEFAULT 0
);

-- 4. DESPESAS VARIÁVEIS
CREATE TABLE despesas_variaveis (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  percentual REAL DEFAULT 0
);

-- 5. FATURAMENTO MENSAL
CREATE TABLE faturamento_mensal (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes TEXT NOT NULL,
  valor REAL DEFAULT 0
);

-- 6. CATEGORIAS DE INSUMOS
CREATE TABLE categorias_insumos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  icone TEXT DEFAULT '🍽️'
);

-- 7. MATÉRIAS PRIMAS (INSUMOS)
CREATE TABLE materias_primas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  marca TEXT DEFAULT '',
  categoria_id BIGINT REFERENCES categorias_insumos(id) ON DELETE SET NULL,
  quantidade_bruta REAL DEFAULT 0,
  quantidade_liquida REAL DEFAULT 0,
  fator_correcao REAL DEFAULT 1,
  unidade_medida TEXT DEFAULT 'Grama(s)',
  valor_pago REAL DEFAULT 0,
  preco_por_kg REAL DEFAULT 0,
  favorito SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. CATEGORIAS DE EMBALAGENS
CREATE TABLE categorias_embalagens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  icone TEXT DEFAULT '📦'
);

-- 9. EMBALAGENS
CREATE TABLE embalagens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  marca TEXT DEFAULT '',
  categoria_id BIGINT REFERENCES categorias_embalagens(id) ON DELETE SET NULL,
  quantidade REAL DEFAULT 0,
  unidade_medida TEXT DEFAULT 'Unidades',
  preco_embalagem REAL DEFAULT 0,
  preco_unitario REAL DEFAULT 0,
  favorito SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. CATEGORIAS DE PREPAROS
CREATE TABLE categorias_preparos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  icone TEXT DEFAULT '🍽️'
);

-- 11. PREPAROS
CREATE TABLE preparos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  categoria_id BIGINT REFERENCES categorias_preparos(id) ON DELETE SET NULL,
  rendimento_total REAL DEFAULT 0,
  unidade_medida TEXT DEFAULT 'Grama(s)',
  custo_total REAL DEFAULT 0,
  custo_por_kg REAL DEFAULT 0,
  favorito SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. INGREDIENTES DO PREPARO
CREATE TABLE preparo_ingredientes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preparo_id BIGINT NOT NULL REFERENCES preparos(id) ON DELETE CASCADE,
  materia_prima_id BIGINT NOT NULL REFERENCES materias_primas(id) ON DELETE CASCADE,
  quantidade_utilizada REAL DEFAULT 0,
  custo REAL DEFAULT 0
);

-- 13. CATEGORIAS DE PRODUTOS
CREATE TABLE categorias_produtos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  icone TEXT DEFAULT '🍽️'
);

-- 14. PRODUTOS
CREATE TABLE produtos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  categoria_id BIGINT REFERENCES categorias_produtos(id) ON DELETE SET NULL,
  rendimento_total REAL DEFAULT 0,
  unidade_rendimento TEXT DEFAULT 'Grama(s)',
  rendimento_unidades REAL DEFAULT 1,
  tempo_preparo REAL DEFAULT 0,
  preco_venda REAL DEFAULT 0,
  margem_lucro_produto REAL,
  validade_dias REAL DEFAULT 0,
  temp_congelado TEXT DEFAULT '',
  tempo_congelado TEXT DEFAULT '',
  temp_refrigerado TEXT DEFAULT '',
  tempo_refrigerado TEXT DEFAULT '',
  temp_ambiente TEXT DEFAULT '',
  tempo_ambiente TEXT DEFAULT '',
  modo_preparo TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  favorito SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. INGREDIENTES DO PRODUTO
CREATE TABLE produto_ingredientes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  materia_prima_id BIGINT NOT NULL REFERENCES materias_primas(id) ON DELETE CASCADE,
  quantidade_utilizada REAL DEFAULT 0
);

-- 16. PREPAROS DO PRODUTO
CREATE TABLE produto_preparos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  preparo_id BIGINT NOT NULL REFERENCES preparos(id) ON DELETE CASCADE,
  quantidade_utilizada REAL DEFAULT 0
);

-- 17. EMBALAGENS DO PRODUTO
CREATE TABLE produto_embalagens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  embalagem_id BIGINT NOT NULL REFERENCES embalagens(id) ON DELETE CASCADE,
  quantidade_utilizada REAL DEFAULT 0
);

-- 18. VENDAS
CREATE TABLE vendas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  quantidade REAL DEFAULT 0
);

-- 19. DELIVERY CONFIG (plataformas)
CREATE TABLE delivery_config (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plataforma TEXT NOT NULL,
  taxa_plataforma REAL DEFAULT 0,
  taxa_entrega REAL DEFAULT 0,
  embalagem_extra REAL DEFAULT 0,
  comissao_app REAL DEFAULT 0,
  desconto_promocao REAL DEFAULT 0,
  outros_perc REAL DEFAULT 0, -- 28.27: outras taxas embutidas em %
  ativo INTEGER DEFAULT 1
);

-- 20. DELIVERY ADICIONAIS
CREATE TABLE delivery_adicionais (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  custo REAL DEFAULT 0,
  preco_cobrado REAL DEFAULT 0
);

-- 21. DELIVERY PRODUTOS
CREATE TABLE delivery_produtos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  preco_venda REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 22. DELIVERY PRODUTO ITENS
CREATE TABLE delivery_produto_itens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivery_produto_id BIGINT NOT NULL REFERENCES delivery_produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  item_id BIGINT NOT NULL,
  quantidade REAL DEFAULT 1
);

-- 23. DELIVERY COMBOS
CREATE TABLE delivery_combos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  preco_venda REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 24. DELIVERY COMBO ITENS
CREATE TABLE delivery_combo_itens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  combo_id BIGINT NOT NULL REFERENCES delivery_combos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  item_id BIGINT NOT NULL,
  quantidade REAL DEFAULT 1
);

-- 25. ASSINATURAS
CREATE TABLE subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'essencial', 'profissional')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  UNIQUE(user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (cada usuário vê só seus dados)
-- ============================================================

ALTER TABLE configuracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfil ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas_fixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas_variaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturamento_mensal ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE materias_primas ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_embalagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE embalagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_preparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE preparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE preparo_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_preparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_embalagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_adicionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_produto_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_combo_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies: cada usuário acessa apenas seus próprios dados
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'configuracao', 'perfil', 'despesas_fixas', 'despesas_variaveis',
    'faturamento_mensal', 'categorias_insumos', 'materias_primas',
    'categorias_embalagens', 'embalagens', 'categorias_preparos',
    'preparos', 'preparo_ingredientes', 'categorias_produtos',
    'produtos', 'produto_ingredientes', 'produto_preparos',
    'produto_embalagens', 'vendas', 'delivery_config',
    'delivery_adicionais', 'delivery_produtos', 'delivery_produto_itens',
    'delivery_combos', 'delivery_combo_itens', 'subscriptions'
  ] LOOP
    EXECUTE format('
      CREATE POLICY "users_own_data_select" ON %I FOR SELECT USING (auth.uid() = user_id);
      CREATE POLICY "users_own_data_insert" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id);
      CREATE POLICY "users_own_data_update" ON %I FOR UPDATE USING (auth.uid() = user_id);
      CREATE POLICY "users_own_data_delete" ON %I FOR DELETE USING (auth.uid() = user_id);
    ', t, t, t, t);
  END LOOP;
END $$;

-- ============================================================
-- TRIGGER: Setup automático ao criar novo usuário
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan, status) VALUES (NEW.id, 'free', 'active');
  INSERT INTO configuracao (user_id, lucro_desejado) VALUES (NEW.id, 0.15);
  INSERT INTO perfil (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: Auto-update de updated_at em listas principais (P3-I)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_materias_primas_set_updated_at ON public.materias_primas;
CREATE TRIGGER trg_materias_primas_set_updated_at
  BEFORE UPDATE ON public.materias_primas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_embalagens_set_updated_at ON public.embalagens;
CREATE TRIGGER trg_embalagens_set_updated_at
  BEFORE UPDATE ON public.embalagens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_preparos_set_updated_at ON public.preparos;
CREATE TRIGGER trg_preparos_set_updated_at
  BEFORE UPDATE ON public.preparos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_produtos_set_updated_at ON public.produtos;
CREATE TRIGGER trg_produtos_set_updated_at
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Índices para sort por favorito e updated_at
CREATE INDEX IF NOT EXISTS idx_materias_primas_user_favorito ON public.materias_primas(user_id, favorito DESC);
CREATE INDEX IF NOT EXISTS idx_embalagens_user_favorito      ON public.embalagens(user_id, favorito DESC);
CREATE INDEX IF NOT EXISTS idx_preparos_user_favorito        ON public.preparos(user_id, favorito DESC);
CREATE INDEX IF NOT EXISTS idx_produtos_user_favorito        ON public.produtos(user_id, favorito DESC);

CREATE INDEX IF NOT EXISTS idx_materias_primas_user_updated  ON public.materias_primas(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_embalagens_user_updated       ON public.embalagens(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_preparos_user_updated         ON public.preparos(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_produtos_user_updated         ON public.produtos(user_id, updated_at DESC);
