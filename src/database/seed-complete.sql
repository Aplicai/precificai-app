-- ============================================================
-- SEED COMPLETO - Confeitaria "Doce Sabor"
-- Para teste@teste.com.br - DADOS REALISTAS para testes
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute PRIMEIRO o bloco de limpeza (Part 0)
-- 2. Depois execute o bloco de inserção (Part 1)
-- ============================================================

-- ============================================================
-- PART 0: LIMPAR DADOS EXISTENTES DO USUÁRIO
-- ============================================================
DO $$
DECLARE uid UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'teste@teste.com.br' LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'User teste@teste.com.br not found'; END IF;

  -- Deletar na ordem correta (foreign keys)
  DELETE FROM delivery_combo_itens WHERE user_id = uid;
  DELETE FROM delivery_combos WHERE user_id = uid;
  DELETE FROM delivery_produto_itens WHERE user_id = uid;
  DELETE FROM delivery_produtos WHERE user_id = uid;
  DELETE FROM delivery_adicionais WHERE user_id = uid;
  DELETE FROM delivery_config WHERE user_id = uid;
  DELETE FROM vendas WHERE user_id = uid;
  DELETE FROM produto_embalagens WHERE user_id = uid;
  DELETE FROM produto_preparos WHERE user_id = uid;
  DELETE FROM produto_ingredientes WHERE user_id = uid;
  DELETE FROM produtos WHERE user_id = uid;
  DELETE FROM preparo_ingredientes WHERE user_id = uid;
  DELETE FROM preparos WHERE user_id = uid;
  DELETE FROM embalagens WHERE user_id = uid;
  DELETE FROM historico_precos WHERE user_id = uid;
  DELETE FROM materias_primas WHERE user_id = uid;
  DELETE FROM categorias_produtos WHERE user_id = uid;
  DELETE FROM categorias_preparos WHERE user_id = uid;
  DELETE FROM categorias_embalagens WHERE user_id = uid;
  DELETE FROM categorias_insumos WHERE user_id = uid;
  DELETE FROM despesas_fixas WHERE user_id = uid;
  DELETE FROM despesas_variaveis WHERE user_id = uid;
  DELETE FROM faturamento_mensal WHERE user_id = uid;

  RAISE NOTICE 'Dados limpos para user %', uid;
END $$;

-- ============================================================
-- PART 1: INSERIR DADOS COMPLETOS
-- ============================================================
DO $$
DECLARE
  uid UUID;
  -- Category IDs - Insumos
  cat_lac BIGINT; cat_far BIGINT; cat_acu BIGINT; cat_gor BIGINT; cat_fru BIGINT;
  cat_ovo BIGINT; cat_cho BIGINT; cat_esp BIGINT; cat_lat BIGINT; cat_fri BIGINT;
  cat_gra BIGINT; cat_dec BIGINT;
  -- Category IDs - Embalagens
  ecat_cx BIGINT; ecat_sac BIGINT; ecat_pot BIGINT; ecat_dec BIGINT;
  -- Category IDs - Preparos
  pcat_mas BIGINT; pcat_rec BIGINT; pcat_cal BIGINT; pcat_cob BIGINT;
  -- Category IDs - Produtos
  prcat_bol BIGINT; prcat_doc BIGINT; prcat_sal BIGINT; prcat_tor BIGINT; prcat_pot BIGINT;
  -- Insumo IDs
  i_leite BIGINT; i_manteiga BIGINT; i_creme BIGINT; i_creamcheese BIGINT; i_requeijao BIGINT;
  i_iogurte BIGINT; i_leitempo BIGINT;
  i_ftrigo BIGINT; i_frosca BIGINT; i_amido BIGINT; i_polvilho BIGINT; i_fintegral BIGINT;
  i_acucar BIGINT; i_acuconf BIGINT; i_acudemer BIGINT; i_mel BIGINT; i_leitecond BIGINT; i_glucose BIGINT;
  i_oleo BIGINT; i_azeite BIGINT; i_margarina BIGINT;
  i_morango BIGINT; i_banana BIGINT; i_limao BIGINT; i_maracuja BIGINT; i_coco BIGINT; i_abacaxi BIGINT; i_manga BIGINT;
  i_ovo BIGINT;
  i_chmeioamargo BIGINT; i_chbranco BIGINT; i_cacau BIGINT; i_chaoLeite BIGINT;
  i_baunilha BIGINT; i_canela BIGINT; i_fermento BIGINT; i_sal BIGINT; i_bicarbonato BIGINT;
  i_nozmoscada BIGINT; i_cravo BIGINT; i_gengibre BIGINT;
  i_leitecoco BIGINT; i_milhoverde BIGINT; i_palmito BIGINT;
  i_presunto BIGINT; i_queijo BIGINT; i_frango BIGINT; i_bacon BIGINT;
  i_granulado BIGINT; i_confeitos BIGINT; i_corante BIGINT;
  i_aveia BIGINT; i_castanha BIGINT; i_nozes BIGINT; i_amendoim BIGINT;
  -- Embalagem IDs
  e_cx15 BIGINT; e_cx20 BIGINT; e_cx10 BIGINT; e_mini BIGINT; e_cx25 BIGINT;
  e_sac100 BIGINT; e_sac250 BIGINT; e_saccelof BIGINT; e_saccraft BIGINT;
  e_pote200 BIGINT; e_pote500 BIGINT; e_potevid BIGINT; e_pote100 BIGINT;
  e_fitadec BIGINT; e_etiqueta BIGINT; e_forma BIGINT; e_papel BIGINT;
  e_tag BIGINT; e_lacre BIGINT;
  -- Preparo IDs
  pr_massachoc BIGINT; pr_massavaun BIGINT; pr_massacenoura BIGINT; pr_massaredvelvet BIGINT;
  pr_ganache BIGINT; pr_ganachebranco BIGINT; pr_buttercream BIGINT; pr_merengue BIGINT;
  pr_caldacaramelo BIGINT; pr_caldamorango BIGINT;
  pr_brigadeiro BIGINT; pr_beijinho BIGINT; pr_crembelga BIGINT; pr_cremconfeiteiro BIGINT;
  pr_massasalgada BIGINT; pr_recheiofrango BIGINT; pr_massaquiche BIGINT;
  -- Produto IDs
  p_id BIGINT;
  -- Produto IDs salvos para uso nos combos
  p_bolo_choc BIGINT; p_brigadeiro BIGINT; p_brownie BIGINT; p_cookie BIGINT;
  p_bolo_pote_choc BIGINT; p_trufa BIGINT; p_cheesecake BIGINT; p_coxinha BIGINT;
  p_quiche BIGINT; p_beijinho BIGINT;
  -- Delivery IDs
  d_ifood BIGINT; d_rappi BIGINT; d_uber BIGINT; d_direta BIGINT;
  -- Combo IDs
  c_id BIGINT;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'teste@teste.com.br' LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'User teste@teste.com.br not found'; END IF;

  -- ============================================================
  -- PERFIL
  -- ============================================================
  UPDATE perfil SET
    nome_negocio = 'Doce Sabor Confeitaria',
    segmento = 'Confeitaria',
    telefone = '(11) 99999-1234'
  WHERE user_id = uid;

  -- ============================================================
  -- FINANCEIRO
  -- ============================================================
  UPDATE configuracao SET
    lucro_desejado = 0.20,
    margem_seguranca = 0.05,
    faturamento_mensal = 15000
  WHERE user_id = uid;

  INSERT INTO faturamento_mensal (user_id, mes, valor) VALUES
    (uid, 'Jan', 12500), (uid, 'Fev', 11800), (uid, 'Mar', 13200),
    (uid, 'Abr', 14500), (uid, 'Mai', 13800), (uid, 'Jun', 15200),
    (uid, 'Jul', 14000), (uid, 'Ago', 16500), (uid, 'Set', 15800),
    (uid, 'Out', 17200), (uid, 'Nov', 18500), (uid, 'Dez', 22000);

  INSERT INTO despesas_fixas (user_id, descricao, valor) VALUES
    (uid, 'Aluguel', 2200),
    (uid, 'Energia elétrica', 450),
    (uid, 'Água', 120),
    (uid, 'Internet', 130),
    (uid, 'Contador', 350),
    (uid, 'Seguro do imóvel', 180),
    (uid, 'INSS/MEI', 75),
    (uid, 'Gás', 95),
    (uid, 'Manutenção equipamentos', 200),
    (uid, 'Software/Sistemas', 49.90);

  INSERT INTO despesas_variaveis (user_id, descricao, percentual) VALUES
    (uid, 'Impostos (Simples Nacional)', 6.0),
    (uid, 'Embalagens delivery', 3.5),
    (uid, 'Taxa maquininha cartão', 2.5),
    (uid, 'Perdas e desperdícios', 2.0),
    (uid, 'Taxa PIX recebimento', 0.99),
    (uid, 'Comissão vendedoras', 3.0);

  -- ============================================================
  -- CATEGORIAS DE INSUMOS (12)
  -- ============================================================
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Laticínios', '🥛') RETURNING id INTO cat_lac;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Farinhas e Amidos', '🌾') RETURNING id INTO cat_far;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Açúcares e Adoçantes', '🍬') RETURNING id INTO cat_acu;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Gorduras e Óleos', '🧈') RETURNING id INTO cat_gor;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Frutas', '🍓') RETURNING id INTO cat_fru;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Ovos', '🥚') RETURNING id INTO cat_ovo;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Chocolates', '🍫') RETURNING id INTO cat_cho;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Especiarias e Fermentos', '🧂') RETURNING id INTO cat_esp;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Enlatados e Conservas', '🥫') RETURNING id INTO cat_lat;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Frios e Carnes', '🥩') RETURNING id INTO cat_fri;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Grãos e Oleaginosas', '🥜') RETURNING id INTO cat_gra;
  INSERT INTO categorias_insumos (user_id, nome, icone) VALUES (uid, 'Decoração', '✨') RETURNING id INTO cat_dec;

  -- ============================================================
  -- INSUMOS (55+) com preços reais Brasil 2025
  -- ============================================================
  -- Laticínios
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Leite Integral', 'Italac', cat_lac, 1000, 1000, 1.0, 'Mililitro(s)', 5.49, 5.49) RETURNING id INTO i_leite;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Manteiga sem sal', 'Président', cat_lac, 200, 200, 1.0, 'Grama(s)', 15.90, 79.50) RETURNING id INTO i_manteiga;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Creme de leite fresco', 'Nestlé', cat_lac, 200, 200, 1.0, 'Grama(s)', 6.90, 34.50) RETURNING id INTO i_creme;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Cream Cheese', 'Philadelphia', cat_lac, 150, 150, 1.0, 'Grama(s)', 12.90, 86.00) RETURNING id INTO i_creamcheese;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Requeijão cremoso', 'Catupiry', cat_lac, 220, 220, 1.0, 'Grama(s)', 9.50, 43.18) RETURNING id INTO i_requeijao;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Iogurte natural', 'Nestlé', cat_lac, 170, 170, 1.0, 'Grama(s)', 3.50, 20.59) RETURNING id INTO i_iogurte;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Leite em pó integral', 'Ninho', cat_lac, 400, 400, 1.0, 'Grama(s)', 24.90, 62.25) RETURNING id INTO i_leitempo;

  -- Farinhas e Amidos
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Farinha de trigo', 'Dona Benta', cat_far, 1000, 1000, 1.0, 'Grama(s)', 6.20, 6.20) RETURNING id INTO i_ftrigo;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Farinha de rosca', 'Yoki', cat_far, 500, 500, 1.0, 'Grama(s)', 5.90, 11.80) RETURNING id INTO i_frosca;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Amido de milho', 'Maizena', cat_far, 500, 500, 1.0, 'Grama(s)', 8.50, 17.00) RETURNING id INTO i_amido;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Polvilho azedo', 'Yoki', cat_far, 500, 500, 1.0, 'Grama(s)', 7.90, 15.80) RETURNING id INTO i_polvilho;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Farinha integral', 'Dona Benta', cat_far, 1000, 1000, 1.0, 'Grama(s)', 8.90, 8.90) RETURNING id INTO i_fintegral;

  -- Açúcares e Adoçantes
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Açúcar refinado', 'União', cat_acu, 1000, 1000, 1.0, 'Grama(s)', 5.80, 5.80) RETURNING id INTO i_acucar;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Açúcar confeiteiro', 'Glaçúcar', cat_acu, 500, 500, 1.0, 'Grama(s)', 7.50, 15.00) RETURNING id INTO i_acuconf;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Açúcar demerara', 'União', cat_acu, 1000, 1000, 1.0, 'Grama(s)', 7.90, 7.90) RETURNING id INTO i_acudemer;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Mel puro', 'Baldoni', cat_acu, 500, 500, 1.0, 'Grama(s)', 29.90, 59.80) RETURNING id INTO i_mel;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Leite condensado', 'Moça', cat_acu, 395, 395, 1.0, 'Grama(s)', 7.90, 20.00) RETURNING id INTO i_leitecond;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Glucose de milho', 'Arcólor', cat_acu, 350, 350, 1.0, 'Grama(s)', 12.90, 36.86) RETURNING id INTO i_glucose;

  -- Gorduras e Óleos
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Óleo de soja', 'Liza', cat_gor, 900, 900, 1.0, 'Mililitro(s)', 8.90, 9.89) RETURNING id INTO i_oleo;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Azeite extra virgem', 'Gallo', cat_gor, 500, 500, 1.0, 'Mililitro(s)', 32.90, 65.80) RETURNING id INTO i_azeite;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Margarina culinária', 'Primor', cat_gor, 500, 500, 1.0, 'Grama(s)', 7.90, 15.80) RETURNING id INTO i_margarina;

  -- Frutas
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Morango fresco', 'Hortifruti', cat_fru, 300, 250, 1.2, 'Grama(s)', 12.90, 51.60) RETURNING id INTO i_morango;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Banana prata', 'Hortifruti', cat_fru, 1000, 700, 1.43, 'Grama(s)', 7.90, 11.29) RETURNING id INTO i_banana;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Limão tahiti', 'Hortifruti', cat_fru, 1000, 500, 2.0, 'Grama(s)', 8.90, 17.80) RETURNING id INTO i_limao;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Polpa de maracujá', 'DeMarchi', cat_fru, 400, 400, 1.0, 'Grama(s)', 9.90, 24.75) RETURNING id INTO i_maracuja;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Coco ralado', 'Sococo', cat_fru, 100, 100, 1.0, 'Grama(s)', 5.50, 55.00) RETURNING id INTO i_coco;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Abacaxi', 'Hortifruti', cat_fru, 1500, 900, 1.67, 'Grama(s)', 8.90, 9.89) RETURNING id INTO i_abacaxi;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Manga palmer', 'Hortifruti', cat_fru, 500, 350, 1.43, 'Grama(s)', 6.90, 19.71) RETURNING id INTO i_manga;

  -- Ovos
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Ovos (dúzia)', 'Granja Mantiqueira', cat_ovo, 12, 12, 1.0, 'Unidades', 14.90, 1.24) RETURNING id INTO i_ovo;

  -- Chocolates
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Chocolate meio amargo 50%', 'Sicao', cat_cho, 1000, 1000, 1.0, 'Grama(s)', 42.90, 42.90) RETURNING id INTO i_chmeioamargo;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Chocolate branco', 'Sicao', cat_cho, 1000, 1000, 1.0, 'Grama(s)', 45.90, 45.90) RETURNING id INTO i_chbranco;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Cacau em pó', 'Nestlé', cat_cho, 200, 200, 1.0, 'Grama(s)', 12.90, 64.50) RETURNING id INTO i_cacau;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Chocolate ao leite', 'Sicao', cat_cho, 1000, 1000, 1.0, 'Grama(s)', 39.90, 39.90) RETURNING id INTO i_chaoLeite;

  -- Especiarias e Fermentos
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Essência de baunilha', 'Dr. Oetker', cat_esp, 30, 30, 1.0, 'Mililitro(s)', 6.90, 230.00) RETURNING id INTO i_baunilha;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Canela em pó', 'Kitano', cat_esp, 50, 50, 1.0, 'Grama(s)', 5.90, 118.00) RETURNING id INTO i_canela;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Fermento químico', 'Royal', cat_esp, 100, 100, 1.0, 'Grama(s)', 5.50, 55.00) RETURNING id INTO i_fermento;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Sal refinado', 'Cisne', cat_esp, 1000, 1000, 1.0, 'Grama(s)', 3.20, 3.20) RETURNING id INTO i_sal;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Bicarbonato de sódio', 'Royal', cat_esp, 80, 80, 1.0, 'Grama(s)', 4.50, 56.25) RETURNING id INTO i_bicarbonato;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Noz-moscada', 'Kitano', cat_esp, 30, 30, 1.0, 'Grama(s)', 6.50, 216.67) RETURNING id INTO i_nozmoscada;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Cravo-da-índia', 'Kitano', cat_esp, 20, 20, 1.0, 'Grama(s)', 5.20, 260.00) RETURNING id INTO i_cravo;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Gengibre em pó', 'Kitano', cat_esp, 30, 30, 1.0, 'Grama(s)', 4.90, 163.33) RETURNING id INTO i_gengibre;

  -- Enlatados e Conservas
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Leite de coco', 'Sococo', cat_lat, 200, 200, 1.0, 'Mililitro(s)', 5.90, 29.50) RETURNING id INTO i_leitecoco;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Milho verde em conserva', 'Quero', cat_lat, 200, 200, 1.0, 'Grama(s)', 4.50, 22.50) RETURNING id INTO i_milhoverde;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Palmito em conserva', 'Hemmer', cat_lat, 300, 300, 1.0, 'Grama(s)', 14.90, 49.67) RETURNING id INTO i_palmito;

  -- Frios e Carnes
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Presunto fatiado', 'Sadia', cat_fri, 200, 200, 1.0, 'Grama(s)', 9.90, 49.50) RETURNING id INTO i_presunto;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Queijo mussarela', 'Tirolez', cat_fri, 500, 500, 1.0, 'Grama(s)', 29.90, 59.80) RETURNING id INTO i_queijo;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Peito de frango', 'Sadia', cat_fri, 1000, 850, 1.18, 'Grama(s)', 19.90, 23.41) RETURNING id INTO i_frango;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Bacon em cubos', 'Sadia', cat_fri, 250, 250, 1.0, 'Grama(s)', 12.90, 51.60) RETURNING id INTO i_bacon;

  -- Grãos e Oleaginosas
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Aveia em flocos', 'Quaker', cat_gra, 200, 200, 1.0, 'Grama(s)', 5.90, 29.50) RETURNING id INTO i_aveia;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Castanha de caju', 'Nutty Bavarian', cat_gra, 150, 150, 1.0, 'Grama(s)', 18.90, 126.00) RETURNING id INTO i_castanha;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Nozes', 'Nutty Bavarian', cat_gra, 100, 100, 1.0, 'Grama(s)', 14.90, 149.00) RETURNING id INTO i_nozes;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Amendoim torrado', 'Dori', cat_gra, 500, 500, 1.0, 'Grama(s)', 9.90, 19.80) RETURNING id INTO i_amendoim;

  -- Decoração
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Granulado chocolate', 'Mavalério', cat_dec, 500, 500, 1.0, 'Grama(s)', 8.90, 17.80) RETURNING id INTO i_granulado;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Confeitos coloridos', 'Mavalério', cat_dec, 150, 150, 1.0, 'Grama(s)', 6.50, 43.33) RETURNING id INTO i_confeitos;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Corante gel vermelho', 'Mix', cat_dec, 12, 12, 1.0, 'Grama(s)', 9.90, 825.00) RETURNING id INTO i_corante;

  -- ============================================================
  -- HISTÓRICO DE PREÇOS (variações realistas últimos 3 meses)
  -- ============================================================
  INSERT INTO historico_precos (user_id, materia_prima_id, valor_pago, preco_por_kg, data) VALUES
    -- Leite (subiu)
    (uid, i_leite, 4.99, 4.99, NOW() - INTERVAL '90 days'),
    (uid, i_leite, 5.29, 5.29, NOW() - INTERVAL '60 days'),
    (uid, i_leite, 5.49, 5.49, NOW() - INTERVAL '30 days'),
    -- Manteiga (oscilou)
    (uid, i_manteiga, 14.50, 72.50, NOW() - INTERVAL '90 days'),
    (uid, i_manteiga, 16.90, 84.50, NOW() - INTERVAL '60 days'),
    (uid, i_manteiga, 15.90, 79.50, NOW() - INTERVAL '30 days'),
    -- Ovos (sazonal)
    (uid, i_ovo, 12.90, 1.08, NOW() - INTERVAL '90 days'),
    (uid, i_ovo, 13.90, 1.16, NOW() - INTERVAL '60 days'),
    (uid, i_ovo, 14.90, 1.24, NOW() - INTERVAL '30 days'),
    -- Açúcar (estável)
    (uid, i_acucar, 5.50, 5.50, NOW() - INTERVAL '90 days'),
    (uid, i_acucar, 5.60, 5.60, NOW() - INTERVAL '60 days'),
    (uid, i_acucar, 5.80, 5.80, NOW() - INTERVAL '30 days'),
    -- Morango (sazonal, variou bastante)
    (uid, i_morango, 9.90, 39.60, NOW() - INTERVAL '90 days'),
    (uid, i_morango, 15.90, 63.60, NOW() - INTERVAL '60 days'),
    (uid, i_morango, 12.90, 51.60, NOW() - INTERVAL '30 days'),
    -- Chocolate (importado, subiu)
    (uid, i_chmeioamargo, 38.90, 38.90, NOW() - INTERVAL '90 days'),
    (uid, i_chmeioamargo, 40.90, 40.90, NOW() - INTERVAL '60 days'),
    (uid, i_chmeioamargo, 42.90, 42.90, NOW() - INTERVAL '30 days'),
    -- Farinha (estável)
    (uid, i_ftrigo, 5.90, 5.90, NOW() - INTERVAL '90 days'),
    (uid, i_ftrigo, 6.10, 6.10, NOW() - INTERVAL '60 days'),
    (uid, i_ftrigo, 6.20, 6.20, NOW() - INTERVAL '30 days'),
    -- Frango (oscilou)
    (uid, i_frango, 17.90, 21.06, NOW() - INTERVAL '90 days'),
    (uid, i_frango, 21.90, 25.76, NOW() - INTERVAL '60 days'),
    (uid, i_frango, 19.90, 23.41, NOW() - INTERVAL '30 days');

  -- ============================================================
  -- CATEGORIAS E EMBALAGENS
  -- ============================================================
  INSERT INTO categorias_embalagens (user_id, nome, icone) VALUES (uid, 'Caixas', '📦') RETURNING id INTO ecat_cx;
  INSERT INTO categorias_embalagens (user_id, nome, icone) VALUES (uid, 'Sacos e Sacolas', '🛍️') RETURNING id INTO ecat_sac;
  INSERT INTO categorias_embalagens (user_id, nome, icone) VALUES (uid, 'Potes e Formas', '🥡') RETURNING id INTO ecat_pot;
  INSERT INTO categorias_embalagens (user_id, nome, icone) VALUES (uid, 'Acessórios', '🎀') RETURNING id INTO ecat_dec;

  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Caixa kraft 15x15', 'Cromus', ecat_cx, 25, 'Unidades', 32.50, 1.30) RETURNING id INTO e_cx15;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Caixa kraft 20x20', 'Cromus', ecat_cx, 25, 'Unidades', 45.00, 1.80) RETURNING id INTO e_cx20;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Caixa mini doces 10x10', 'Festcolor', ecat_cx, 50, 'Unidades', 35.00, 0.70) RETURNING id INTO e_cx10;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Caixa mini individual', 'Festcolor', ecat_cx, 100, 'Unidades', 28.00, 0.28) RETURNING id INTO e_mini;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Caixa kraft 25x25', 'Cromus', ecat_cx, 10, 'Unidades', 25.00, 2.50) RETURNING id INTO e_cx25;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Saco plástico 100g', 'Cromus', ecat_sac, 100, 'Unidades', 12.00, 0.12) RETURNING id INTO e_sac100;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Saco plástico 250g', 'Cromus', ecat_sac, 100, 'Unidades', 18.00, 0.18) RETURNING id INTO e_sac250;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Saco celofane decorado', 'Cromus', ecat_sac, 50, 'Unidades', 15.00, 0.30) RETURNING id INTO e_saccelof;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Saco craft com visor', 'Cromus', ecat_sac, 50, 'Unidades', 22.00, 0.44) RETURNING id INTO e_saccraft;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Pote plástico 100ml', 'Galvanotek', ecat_pot, 50, 'Unidades', 15.00, 0.30) RETURNING id INTO e_pote100;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Pote plástico 200ml', 'Galvanotek', ecat_pot, 50, 'Unidades', 22.00, 0.44) RETURNING id INTO e_pote200;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Pote plástico 500ml', 'Galvanotek', ecat_pot, 25, 'Unidades', 18.00, 0.72) RETURNING id INTO e_pote500;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Pote vidro 250ml', 'Invicta', ecat_pot, 12, 'Unidades', 36.00, 3.00) RETURNING id INTO e_potevid;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Forma alumínio redonda', 'Wyda', ecat_pot, 10, 'Unidades', 12.90, 1.29) RETURNING id INTO e_forma;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Papel manteiga rolo', 'Wyda', ecat_pot, 1, 'Unidades', 9.90, 9.90) RETURNING id INTO e_papel;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Fita de cetim', 'Progresso', ecat_dec, 10, 'Metro(s)', 8.90, 0.89) RETURNING id INTO e_fitadec;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Etiqueta adesiva', 'Pimaco', ecat_dec, 100, 'Unidades', 15.00, 0.15) RETURNING id INTO e_etiqueta;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Tag personalizada', 'Gráfica Express', ecat_dec, 200, 'Unidades', 30.00, 0.15) RETURNING id INTO e_tag;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Lacre de segurança', 'Adesivos Brasil', ecat_dec, 500, 'Unidades', 25.00, 0.05) RETURNING id INTO e_lacre;

  -- ============================================================
  -- CATEGORIAS E PREPAROS (17 preparos)
  -- ============================================================
  INSERT INTO categorias_preparos (user_id, nome, icone) VALUES (uid, 'Massas', '🧁') RETURNING id INTO pcat_mas;
  INSERT INTO categorias_preparos (user_id, nome, icone) VALUES (uid, 'Recheios', '🍰') RETURNING id INTO pcat_rec;
  INSERT INTO categorias_preparos (user_id, nome, icone) VALUES (uid, 'Caldas e Cremes', '🍯') RETURNING id INTO pcat_cal;
  INSERT INTO categorias_preparos (user_id, nome, icone) VALUES (uid, 'Coberturas', '🎂') RETURNING id INTO pcat_cob;

  -- Massa de Chocolate
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Massa de chocolate', pcat_mas, 1200, 'Grama(s)', 18.50, 15.42) RETURNING id INTO pr_massachoc;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_massachoc, i_ftrigo, 300, 1.86), (uid, pr_massachoc, i_cacau, 80, 5.16),
    (uid, pr_massachoc, i_acucar, 250, 1.45), (uid, pr_massachoc, i_ovo, 4, 4.96),
    (uid, pr_massachoc, i_oleo, 120, 1.19), (uid, pr_massachoc, i_leite, 200, 1.10),
    (uid, pr_massachoc, i_fermento, 15, 0.83), (uid, pr_massachoc, i_sal, 3, 0.01);

  -- Massa de Baunilha
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Massa de baunilha', pcat_mas, 1100, 'Grama(s)', 16.80, 15.27) RETURNING id INTO pr_massavaun;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_massavaun, i_ftrigo, 350, 2.17), (uid, pr_massavaun, i_acucar, 200, 1.16),
    (uid, pr_massavaun, i_ovo, 4, 4.96), (uid, pr_massavaun, i_manteiga, 100, 7.95),
    (uid, pr_massavaun, i_baunilha, 5, 1.15), (uid, pr_massavaun, i_fermento, 12, 0.66);

  -- Massa de Cenoura
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Massa de cenoura', pcat_mas, 1000, 'Grama(s)', 12.40, 12.40) RETURNING id INTO pr_massacenoura;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_massacenoura, i_ftrigo, 300, 1.86), (uid, pr_massacenoura, i_acucar, 200, 1.16),
    (uid, pr_massacenoura, i_ovo, 3, 3.72), (uid, pr_massacenoura, i_oleo, 200, 1.98),
    (uid, pr_massacenoura, i_fermento, 15, 0.83);

  -- Massa Red Velvet
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Massa red velvet', pcat_mas, 1100, 'Grama(s)', 19.20, 17.45) RETURNING id INTO pr_massaredvelvet;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_massaredvelvet, i_ftrigo, 300, 1.86), (uid, pr_massaredvelvet, i_cacau, 30, 1.94),
    (uid, pr_massaredvelvet, i_acucar, 200, 1.16), (uid, pr_massaredvelvet, i_ovo, 3, 3.72),
    (uid, pr_massaredvelvet, i_oleo, 150, 1.48), (uid, pr_massaredvelvet, i_iogurte, 170, 3.50),
    (uid, pr_massaredvelvet, i_corante, 5, 4.13), (uid, pr_massaredvelvet, i_bicarbonato, 5, 0.28);

  -- Ganache Meio Amargo
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Ganache meio amargo', pcat_cob, 600, 'Grama(s)', 19.20, 32.00) RETURNING id INTO pr_ganache;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_ganache, i_chmeioamargo, 300, 12.87), (uid, pr_ganache, i_creme, 300, 10.35);

  -- Ganache Branco
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Ganache branco', pcat_cob, 500, 'Grama(s)', 18.60, 37.20) RETURNING id INTO pr_ganachebranco;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_ganachebranco, i_chbranco, 300, 13.77), (uid, pr_ganachebranco, i_creme, 200, 6.90);

  -- Buttercream Baunilha
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Buttercream baunilha', pcat_cob, 800, 'Grama(s)', 22.50, 28.13) RETURNING id INTO pr_buttercream;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_buttercream, i_manteiga, 250, 19.88), (uid, pr_buttercream, i_acuconf, 300, 4.50),
    (uid, pr_buttercream, i_baunilha, 5, 1.15);

  -- Merengue Suíço
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Merengue suíço', pcat_cob, 600, 'Grama(s)', 12.80, 21.33) RETURNING id INTO pr_merengue;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_merengue, i_ovo, 4, 4.96), (uid, pr_merengue, i_acucar, 200, 1.16),
    (uid, pr_merengue, i_baunilha, 3, 0.69);

  -- Calda de Caramelo
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Calda de caramelo', pcat_cal, 500, 'Grama(s)', 5.80, 11.60) RETURNING id INTO pr_caldacaramelo;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_caldacaramelo, i_acucar, 300, 1.74), (uid, pr_caldacaramelo, i_creme, 100, 3.45),
    (uid, pr_caldacaramelo, i_manteiga, 20, 1.59);

  -- Calda de Morango
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Calda de morango', pcat_cal, 400, 'Grama(s)', 11.20, 28.00) RETURNING id INTO pr_caldamorango;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_caldamorango, i_morango, 250, 12.90), (uid, pr_caldamorango, i_acucar, 100, 0.58),
    (uid, pr_caldamorango, i_limao, 20, 0.36);

  -- Brigadeiro Gourmet
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Brigadeiro gourmet', pcat_rec, 600, 'Grama(s)', 15.90, 26.50) RETURNING id INTO pr_brigadeiro;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_brigadeiro, i_leitecond, 395, 7.90), (uid, pr_brigadeiro, i_cacau, 50, 3.23),
    (uid, pr_brigadeiro, i_manteiga, 30, 2.39);

  -- Beijinho Gourmet
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Beijinho gourmet', pcat_rec, 500, 'Grama(s)', 14.20, 28.40) RETURNING id INTO pr_beijinho;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_beijinho, i_leitecond, 395, 7.90), (uid, pr_beijinho, i_coco, 60, 3.30),
    (uid, pr_beijinho, i_manteiga, 20, 1.59);

  -- Creme Belga Branco
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Creme belga branco', pcat_rec, 500, 'Grama(s)', 20.80, 41.60) RETURNING id INTO pr_crembelga;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_crembelga, i_chbranco, 200, 9.18), (uid, pr_crembelga, i_creme, 200, 6.90),
    (uid, pr_crembelga, i_leitecond, 200, 4.00);

  -- Creme Confeiteiro
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Creme confeiteiro', pcat_cal, 800, 'Grama(s)', 10.50, 13.13) RETURNING id INTO pr_cremconfeiteiro;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_cremconfeiteiro, i_leite, 500, 2.75), (uid, pr_cremconfeiteiro, i_acucar, 150, 0.87),
    (uid, pr_cremconfeiteiro, i_amido, 40, 0.68), (uid, pr_cremconfeiteiro, i_ovo, 3, 3.72),
    (uid, pr_cremconfeiteiro, i_baunilha, 5, 1.15);

  -- Massa Salgada (Coxinha)
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Massa salgada (coxinha)', pcat_mas, 1500, 'Grama(s)', 11.20, 7.47) RETURNING id INTO pr_massasalgada;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_massasalgada, i_ftrigo, 500, 3.10), (uid, pr_massasalgada, i_margarina, 100, 1.58),
    (uid, pr_massasalgada, i_leite, 500, 2.75), (uid, pr_massasalgada, i_sal, 10, 0.03);

  -- Recheio de Frango
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Recheio de frango desfiado', pcat_rec, 800, 'Grama(s)', 16.50, 20.63) RETURNING id INTO pr_recheiofrango;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_recheiofrango, i_frango, 500, 11.71), (uid, pr_recheiofrango, i_requeijao, 100, 4.32),
    (uid, pr_recheiofrango, i_sal, 5, 0.02);

  -- Massa de Quiche
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Massa de quiche', pcat_mas, 500, 'Grama(s)', 9.80, 19.60) RETURNING id INTO pr_massaquiche;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_massaquiche, i_ftrigo, 250, 1.55), (uid, pr_massaquiche, i_manteiga, 100, 7.95),
    (uid, pr_massaquiche, i_sal, 3, 0.01);

  -- ============================================================
  -- CATEGORIAS E PRODUTOS (30 produtos)
  -- ============================================================
  INSERT INTO categorias_produtos (user_id, nome, icone) VALUES (uid, 'Bolos', '🎂') RETURNING id INTO prcat_bol;
  INSERT INTO categorias_produtos (user_id, nome, icone) VALUES (uid, 'Doces', '🍬') RETURNING id INTO prcat_doc;
  INSERT INTO categorias_produtos (user_id, nome, icone) VALUES (uid, 'Salgados', '🥟') RETURNING id INTO prcat_sal;
  INSERT INTO categorias_produtos (user_id, nome, icone) VALUES (uid, 'Tortas', '🥧') RETURNING id INTO prcat_tor;
  INSERT INTO categorias_produtos (user_id, nome, icone) VALUES (uid, 'Potes e Potinhos', '🍮') RETURNING id INTO prcat_pot;

  -- ===== BOLOS =====

  -- 1. Bolo de Chocolate com Ganache
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda, modo_preparo, observacoes) VALUES
    (uid, 'Bolo de Chocolate com Ganache', prcat_bol, 1800, 12, 89.90,
    'Assar massa 180°C por 35min. Cortar ao meio. Rechear e cobrir com ganache.',
    'Produto mais vendido. Rende 12 fatias.') RETURNING id INTO p_id;
  p_bolo_choc := p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massachoc, 1200), (uid, p_id, pr_ganache, 400);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 18), (uid, p_id, '2025-02', 15), (uid, p_id, '2025-03', 22);

  -- 2. Bolo Red Velvet com Cream Cheese
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda, modo_preparo) VALUES
    (uid, 'Bolo Red Velvet com Cream Cheese', prcat_bol, 1600, 10, 110.00,
    'Assar massa 170°C por 30min. Rechear e cobrir com cream cheese frosting.') RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massaredvelvet, 1100);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_creamcheese, 300), (uid, p_id, i_acuconf, 100), (uid, p_id, i_manteiga, 50);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 8), (uid, p_id, '2025-02', 10), (uid, p_id, '2025-03', 12);

  -- 3. Bolo de Cenoura com Cobertura
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda, modo_preparo) VALUES
    (uid, 'Bolo de Cenoura com Cobertura', prcat_bol, 1200, 8, 55.00,
    'Assar massa 180°C por 40min. Cobrir com ganache quente.') RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massacenoura, 1000), (uid, p_id, pr_ganache, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_forma, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 12), (uid, p_id, '2025-02', 10), (uid, p_id, '2025-03', 14);

  -- 4. Bolo de Baunilha com Buttercream
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo de Baunilha com Buttercream', prcat_bol, 1600, 10, 85.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massavaun, 1100), (uid, p_id, pr_buttercream, 500);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 6), (uid, p_id, '2025-02', 5), (uid, p_id, '2025-03', 7);

  -- 5. Naked Cake de Morango
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Naked Cake de Morango', prcat_bol, 1800, 12, 130.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massavaun, 1100), (uid, p_id, pr_buttercream, 400);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES (uid, p_id, i_morango, 250);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx25, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 5), (uid, p_id, '2025-02', 7), (uid, p_id, '2025-03', 9);

  -- 6. Bolo Prestígio
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo Prestígio', prcat_bol, 1600, 10, 95.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massachoc, 1000), (uid, p_id, pr_beijinho, 300), (uid, p_id, pr_ganache, 300);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 4), (uid, p_id, '2025-02', 6), (uid, p_id, '2025-03', 5);

  -- 7. Bolo de Banana com Canela e Caramelo
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo de Banana com Canela', prcat_bol, 1200, 10, 48.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massavaun, 800), (uid, p_id, pr_caldacaramelo, 200);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_banana, 400), (uid, p_id, i_canela, 5);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_forma, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 3), (uid, p_id, '2025-02', 2), (uid, p_id, '2025-03', 4);

  -- 8. Bolo de Coco com Leite Condensado
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo de Coco', prcat_bol, 1200, 8, 52.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massavaun, 900);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_coco, 80), (uid, p_id, i_leitecond, 200), (uid, p_id, i_leitecoco, 100);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_forma, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 2), (uid, p_id, '2025-02', 3), (uid, p_id, '2025-03', 2);

  -- ===== DOCES =====

  -- 9. Brigadeiro Gourmet (cento)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Brigadeiro Gourmet (cento)', prcat_doc, 600, 100, 85.00) RETURNING id INTO p_id;
  p_brigadeiro := p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_brigadeiro, 600);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_mini, 100);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 8), (uid, p_id, '2025-02', 12), (uid, p_id, '2025-03', 15);

  -- 10. Beijinho Gourmet (cento)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Beijinho Gourmet (cento)', prcat_doc, 500, 100, 85.00) RETURNING id INTO p_id;
  p_beijinho := p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_beijinho, 500);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_mini, 100);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 6), (uid, p_id, '2025-02', 8), (uid, p_id, '2025-03', 10);

  -- 11. Docinho de Leite Ninho (cento)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Docinho de Leite Ninho (cento)', prcat_doc, 500, 100, 95.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_crembelga, 500);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_mini, 100);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 5), (uid, p_id, '2025-02', 7), (uid, p_id, '2025-03', 9);

  -- 12. Brownie Chocolate
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Brownie Chocolate', prcat_doc, 800, 16, 6.50) RETURNING id INTO p_id;
  p_brownie := p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massachoc, 600);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES (uid, p_id, i_chmeioamargo, 150);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_saccelof, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 45), (uid, p_id, '2025-02', 50), (uid, p_id, '2025-03', 60);

  -- 13. Palha Italiana (pote 200g)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Palha Italiana (pote 200g)', prcat_doc, 800, 4, 18.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_brigadeiro, 500);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES (uid, p_id, i_frosca, 100);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 20), (uid, p_id, '2025-02', 25), (uid, p_id, '2025-03', 30);

  -- 14. Trufa de Maracujá
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Trufa de Maracujá (unidade)', prcat_doc, 400, 20, 5.50) RETURNING id INTO p_id;
  p_trufa := p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_crembelga, 300);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES (uid, p_id, i_maracuja, 100);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_sac100, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 40), (uid, p_id, '2025-02', 35), (uid, p_id, '2025-03', 50);

  -- 15. Cookie Gotas de Chocolate
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Cookie Gotas de Chocolate', prcat_doc, 600, 20, 5.00) RETURNING id INTO p_id;
  p_cookie := p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_ftrigo, 250), (uid, p_id, i_manteiga, 120),
    (uid, p_id, i_acucar, 80), (uid, p_id, i_acudemer, 50),
    (uid, p_id, i_ovo, 1), (uid, p_id, i_chmeioamargo, 80), (uid, p_id, i_baunilha, 3);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_saccraft, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 60), (uid, p_id, '2025-02', 55), (uid, p_id, '2025-03', 70);

  -- 16. Alfajor Artesanal
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Alfajor Artesanal', prcat_doc, 400, 12, 6.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_amido, 200), (uid, p_id, i_manteiga, 80), (uid, p_id, i_acuconf, 60);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_brigadeiro, 100);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_saccelof, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 30), (uid, p_id, '2025-02', 25), (uid, p_id, '2025-03', 35);

  -- 17. Brigadeiro de Pistache (Premium - margem baixa de propósito)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Brigadeiro de Pistache (cento)', prcat_doc, 600, 100, 120.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_brigadeiro, 500);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_castanha, 100);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_mini, 100);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 2), (uid, p_id, '2025-02', 3), (uid, p_id, '2025-03', 2);

  -- ===== POTES E POTINHOS =====

  -- 18. Bolo no Pote Chocolate
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo no Pote Chocolate', prcat_pot, 200, 1, 15.00) RETURNING id INTO p_id;
  p_bolo_pote_choc := p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massachoc, 120), (uid, p_id, pr_ganache, 80);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 25), (uid, p_id, '2025-02', 30), (uid, p_id, '2025-03', 35);

  -- 19. Bolo no Pote Prestígio
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo no Pote Prestígio', prcat_pot, 200, 1, 16.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massachoc, 100), (uid, p_id, pr_beijinho, 60), (uid, p_id, pr_ganache, 40);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 20), (uid, p_id, '2025-02', 22), (uid, p_id, '2025-03', 28);

  -- 20. Bolo no Pote Red Velvet
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo no Pote Red Velvet', prcat_pot, 200, 1, 18.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massaredvelvet, 120);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_creamcheese, 50), (uid, p_id, i_acuconf, 15);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 15), (uid, p_id, '2025-02', 18), (uid, p_id, '2025-03', 20);

  -- 21. Brigadeiro no Pote 200g
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Brigadeiro no Pote 200g', prcat_pot, 200, 1, 14.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_brigadeiro, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 15), (uid, p_id, '2025-02', 20), (uid, p_id, '2025-03', 18);

  -- 22. Mousse de Maracujá no Pote
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Mousse de Maracujá', prcat_pot, 150, 1, 12.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_maracuja, 80), (uid, p_id, i_leitecond, 100), (uid, p_id, i_creme, 80);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 10), (uid, p_id, '2025-02', 12), (uid, p_id, '2025-03', 15);

  -- ===== TORTAS =====

  -- 23. Cheesecake de Frutas Vermelhas
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Cheesecake de Frutas Vermelhas', prcat_tor, 1200, 10, 110.00) RETURNING id INTO p_id;
  p_cheesecake := p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_creamcheese, 450), (uid, p_id, i_acucar, 150),
    (uid, p_id, i_ovo, 3), (uid, p_id, i_creme, 200), (uid, p_id, i_morango, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx25, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 4), (uid, p_id, '2025-02', 5), (uid, p_id, '2025-03', 6);

  -- 24. Torta de Limão
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Torta de Limão', prcat_tor, 1000, 8, 75.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_leitecond, 395), (uid, p_id, i_limao, 200),
    (uid, p_id, i_creme, 200), (uid, p_id, i_ftrigo, 150), (uid, p_id, i_manteiga, 80);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_merengue, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 6), (uid, p_id, '2025-02', 5), (uid, p_id, '2025-03', 8);

  -- 25. Pudim de Leite Condensado
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Pudim de Leite Condensado', prcat_tor, 800, 8, 45.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_leitecond, 395), (uid, p_id, i_leite, 400),
    (uid, p_id, i_ovo, 4), (uid, p_id, i_acucar, 150);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_forma, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 8), (uid, p_id, '2025-02', 6), (uid, p_id, '2025-03', 10);

  -- ===== SALGADOS =====

  -- 26. Coxinha de Frango (cento)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Coxinha de Frango (cento)', prcat_sal, 2300, 100, 120.00) RETURNING id INTO p_id;
  p_coxinha := p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massasalgada, 1500), (uid, p_id, pr_recheiofrango, 800);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES (uid, p_id, i_frosca, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx15, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 6), (uid, p_id, '2025-02', 8), (uid, p_id, '2025-03', 10);

  -- 27. Quiche de Presunto e Queijo
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Quiche de Presunto e Queijo', prcat_sal, 900, 8, 55.00) RETURNING id INTO p_id;
  p_quiche := p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massaquiche, 400);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_presunto, 150), (uid, p_id, i_queijo, 150),
    (uid, p_id, i_creme, 200), (uid, p_id, i_ovo, 3);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_forma, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 4), (uid, p_id, '2025-02', 5), (uid, p_id, '2025-03', 6);

  -- 28. Pão de Queijo (kg)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Pão de Queijo (kg)', prcat_sal, 1000, 1, 45.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_polvilho, 500), (uid, p_id, i_queijo, 200),
    (uid, p_id, i_ovo, 3), (uid, p_id, i_oleo, 100), (uid, p_id, i_leite, 150);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_sac250, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 10), (uid, p_id, '2025-02', 12), (uid, p_id, '2025-03', 15);

  -- 29. Empada de Palmito (unidade)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Empada de Palmito (unidade)', prcat_sal, 80, 1, 7.50) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massaquiche, 40);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_palmito, 30), (uid, p_id, i_creme, 15);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_sac100, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 35), (uid, p_id, '2025-02', 30), (uid, p_id, '2025-03', 40);

  -- 30. Mini Bolo Chocolate (individual)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Mini Bolo Chocolate', prcat_doc, 200, 1, 22.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES
    (uid, p_id, pr_massachoc, 150), (uid, p_id, pr_ganache, 50);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx10, 1);
  INSERT INTO vendas (user_id, produto_id, data, quantidade) VALUES
    (uid, p_id, '2025-01', 10), (uid, p_id, '2025-02', 12), (uid, p_id, '2025-03', 15);

  -- ============================================================
  -- DELIVERY CONFIG (4 plataformas)
  -- ============================================================
  INSERT INTO delivery_config (user_id, plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES
    (uid, 'iFood', 0, 5.99, 12.0, 0, 1) RETURNING id INTO d_ifood;
  INSERT INTO delivery_config (user_id, plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES
    (uid, 'Rappi', 0, 7.99, 15.0, 5, 1) RETURNING id INTO d_rappi;
  INSERT INTO delivery_config (user_id, plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES
    (uid, 'Uber Eats', 0, 6.99, 18.0, 0, 1) RETURNING id INTO d_uber;
  INSERT INTO delivery_config (user_id, plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES
    (uid, 'Venda Direta (WhatsApp)', 0, 0, 0, 0, 1) RETURNING id INTO d_direta;

  INSERT INTO delivery_adicionais (user_id, nome, custo, preco_cobrado) VALUES
    (uid, 'Cobertura extra chocolate', 1.50, 4.00),
    (uid, 'Calda de caramelo extra', 0.80, 3.00),
    (uid, 'Granulado belga', 2.00, 5.00),
    (uid, 'Morango fresco (50g)', 2.60, 6.00),
    (uid, 'Chantilly extra', 0.90, 3.50);

  -- ============================================================
  -- DELIVERY COMBOS (5) - with items referencing regular products
  -- ============================================================
  -- Combo 1: Kit Festa Doces (100 brigadeiros + 100 beijinhos)
  INSERT INTO delivery_combos (user_id, nome, preco_venda) VALUES
    (uid, 'Kit Festa - 100 Brigadeiros + 100 Beijinhos', 150.00) RETURNING id INTO c_id;
  INSERT INTO delivery_combo_itens (user_id, combo_id, tipo, item_id, quantidade) VALUES
    (uid, c_id, 'produto', p_brigadeiro, 1),
    (uid, c_id, 'produto', p_beijinho, 1);

  -- Combo 2: Kit Bolo + Potes
  INSERT INTO delivery_combos (user_id, nome, preco_venda) VALUES
    (uid, 'Kit Aniversário - Bolo Chocolate + 4 Potes', 130.00) RETURNING id INTO c_id;
  INSERT INTO delivery_combo_itens (user_id, combo_id, tipo, item_id, quantidade) VALUES
    (uid, c_id, 'produto', p_bolo_choc, 1),
    (uid, c_id, 'produto', p_bolo_pote_choc, 4);

  -- Combo 3: Kit Café da Tarde (6 brownies + 6 cookies)
  INSERT INTO delivery_combos (user_id, nome, preco_venda) VALUES
    (uid, 'Kit Café da Tarde - 6 Brownies + 6 Cookies', 55.00) RETURNING id INTO c_id;
  INSERT INTO delivery_combo_itens (user_id, combo_id, tipo, item_id, quantidade) VALUES
    (uid, c_id, 'produto', p_brownie, 6),
    (uid, c_id, 'produto', p_cookie, 6);

  -- Combo 4: Kit Salgados (100 coxinhas + quiche)
  INSERT INTO delivery_combos (user_id, nome, preco_venda) VALUES
    (uid, 'Kit Salgados - 100 Coxinhas + Quiche', 160.00) RETURNING id INTO c_id;
  INSERT INTO delivery_combo_itens (user_id, combo_id, tipo, item_id, quantidade) VALUES
    (uid, c_id, 'produto', p_coxinha, 1),
    (uid, c_id, 'produto', p_quiche, 1);

  -- Combo 5: Kit Sobremesa Premium (cheesecake + 4 trufas)
  INSERT INTO delivery_combos (user_id, nome, preco_venda) VALUES
    (uid, 'Kit Premium - Cheesecake + 4 Trufas', 130.00) RETURNING id INTO c_id;
  INSERT INTO delivery_combo_itens (user_id, combo_id, tipo, item_id, quantidade) VALUES
    (uid, c_id, 'produto', p_cheesecake, 1),
    (uid, c_id, 'produto', p_trufa, 4);

  RAISE NOTICE 'Seed completo inserido para user %', uid;
END $$;
