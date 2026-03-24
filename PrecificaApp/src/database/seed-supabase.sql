-- ============================================================
-- SEED DATA - Confeitaria Exemplo
-- Execute no SQL Editor do Supabase
-- ============================================================

DO $$
DECLARE
  uid UUID;
  -- Category IDs
  cat_lac BIGINT; cat_far BIGINT; cat_acu BIGINT; cat_gor BIGINT; cat_fru BIGINT;
  cat_ovo BIGINT; cat_cho BIGINT; cat_esp BIGINT; cat_lat BIGINT; cat_out BIGINT;
  -- Embalagem category IDs
  ecat_cx BIGINT; ecat_sac BIGINT; ecat_pot BIGINT;
  -- Preparo category IDs
  pcat_mas BIGINT; pcat_rec BIGINT; pcat_cal BIGINT;
  -- Produto category IDs
  prcat_bol BIGINT; prcat_doc BIGINT; prcat_sal BIGINT; prcat_beb BIGINT;
  -- Insumo IDs
  i_leite BIGINT; i_manteiga BIGINT; i_creme BIGINT; i_requeijao BIGINT;
  i_ftrigo BIGINT; i_frosca BIGINT; i_amido BIGINT; i_polvilho BIGINT;
  i_acucar BIGINT; i_acuconf BIGINT; i_mel BIGINT; i_leitecond BIGINT;
  i_oleo BIGINT; i_azeite BIGINT; i_margarina BIGINT;
  i_morango BIGINT; i_banana BIGINT; i_limao BIGINT; i_maracuja BIGINT; i_coco BIGINT;
  i_ovo BIGINT;
  i_chpobarra BIGINT; i_chbranco BIGINT; i_cacau BIGINT;
  i_baunilha BIGINT; i_canela BIGINT; i_fermento BIGINT; i_sal BIGINT;
  i_leitecoco BIGINT; i_creamcheese BIGINT;
  i_presunto BIGINT; i_queijo BIGINT;
  -- Embalagem IDs
  e_cx15 BIGINT; e_cx20 BIGINT; e_cx10 BIGINT; e_mini BIGINT;
  e_sac100 BIGINT; e_sac250 BIGINT; e_saccelof BIGINT;
  e_pote200 BIGINT; e_pote500 BIGINT; e_potevid BIGINT;
  e_fitadec BIGINT; e_etiqueta BIGINT; e_forma BIGINT; e_papel BIGINT;
  -- Preparo IDs
  pr_massachoc BIGINT; pr_massavaun BIGINT; pr_massacenoura BIGINT;
  pr_ganache BIGINT; pr_buttercream BIGINT; pr_caldacaramelo BIGINT;
  pr_brigadeiro BIGINT; pr_beijinho BIGINT; pr_crembelga BIGINT;
  pr_massasalgada BIGINT; pr_recheiofrango BIGINT;
  -- Produto IDs
  p_id BIGINT;
BEGIN
  -- Get user ID
  SELECT id INTO uid FROM auth.users WHERE email = 'teste@teste.com.br' LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- ============================================================
  -- FINANCEIRO
  -- ============================================================
  UPDATE configuracao SET lucro_desejado = 0.20, margem_seguranca = 0.05 WHERE user_id = uid;

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
    (uid, 'Seguro', 180),
    (uid, 'INSS/MEI', 75);

  INSERT INTO despesas_variaveis (user_id, descricao, percentual) VALUES
    (uid, 'Impostos (Simples)', 6.0),
    (uid, 'Embalagens delivery', 3.5),
    (uid, 'Taxa maquininha', 2.5),
    (uid, 'Perdas e desperdícios', 2.0);

  -- ============================================================
  -- CATEGORIAS DE INSUMOS
  -- ============================================================
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Laticínios') RETURNING id INTO cat_lac;
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Farinhas') RETURNING id INTO cat_far;
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Açúcares') RETURNING id INTO cat_acu;
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Gorduras') RETURNING id INTO cat_gor;
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Frutas') RETURNING id INTO cat_fru;
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Ovos') RETURNING id INTO cat_ovo;
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Chocolates') RETURNING id INTO cat_cho;
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Especiarias') RETURNING id INTO cat_esp;
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Enlatados') RETURNING id INTO cat_lat;
  INSERT INTO categorias_insumos (user_id, nome) VALUES (uid, 'Frios') RETURNING id INTO cat_out;

  -- ============================================================
  -- INSUMOS (30+)
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

  -- Farinhas
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Farinha de trigo', 'Dona Benta', cat_far, 1000, 1000, 1.0, 'Grama(s)', 6.20, 6.20) RETURNING id INTO i_ftrigo;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Farinha de rosca', 'Yoki', cat_far, 500, 500, 1.0, 'Grama(s)', 5.90, 11.80) RETURNING id INTO i_frosca;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Amido de milho', 'Maizena', cat_far, 500, 500, 1.0, 'Grama(s)', 8.50, 17.00) RETURNING id INTO i_amido;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Polvilho azedo', 'Yoki', cat_far, 500, 500, 1.0, 'Grama(s)', 7.90, 15.80) RETURNING id INTO i_polvilho;

  -- Açúcares
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Açúcar refinado', 'União', cat_acu, 1000, 1000, 1.0, 'Grama(s)', 5.80, 5.80) RETURNING id INTO i_acucar;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Açúcar confeiteiro', 'Glaçúcar', cat_acu, 500, 500, 1.0, 'Grama(s)', 7.50, 15.00) RETURNING id INTO i_acuconf;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Mel puro', 'Baldoni', cat_acu, 500, 500, 1.0, 'Grama(s)', 29.90, 59.80) RETURNING id INTO i_mel;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Leite condensado', 'Moça', cat_acu, 395, 395, 1.0, 'Grama(s)', 7.90, 20.00) RETURNING id INTO i_leitecond;

  -- Gorduras
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

  -- Ovos
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Ovos (dúzia)', 'Granja', cat_ovo, 12, 12, 1.0, 'Unidades', 14.90, 1.24) RETURNING id INTO i_ovo;

  -- Chocolates
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Chocolate meio amargo 50%', 'Sicao', cat_cho, 1000, 1000, 1.0, 'Grama(s)', 42.90, 42.90) RETURNING id INTO i_chpobarra;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Chocolate branco', 'Sicao', cat_cho, 1000, 1000, 1.0, 'Grama(s)', 45.90, 45.90) RETURNING id INTO i_chbranco;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Cacau em pó', 'Nestlé', cat_cho, 200, 200, 1.0, 'Grama(s)', 12.90, 64.50) RETURNING id INTO i_cacau;

  -- Especiarias
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Essência de baunilha', 'Dr. Oetker', cat_esp, 30, 30, 1.0, 'Mililitro(s)', 6.90, 230.00) RETURNING id INTO i_baunilha;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Canela em pó', 'Kitano', cat_esp, 50, 50, 1.0, 'Grama(s)', 5.90, 118.00) RETURNING id INTO i_canela;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Fermento químico', 'Royal', cat_esp, 100, 100, 1.0, 'Grama(s)', 5.50, 55.00) RETURNING id INTO i_fermento;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Sal refinado', 'Cisne', cat_esp, 1000, 1000, 1.0, 'Grama(s)', 3.20, 3.20) RETURNING id INTO i_sal;

  -- Enlatados
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Leite de coco', 'Sococo', cat_lat, 200, 200, 1.0, 'Mililitro(s)', 5.90, 29.50) RETURNING id INTO i_leitecoco;

  -- Frios
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Presunto fatiado', 'Sadia', cat_out, 200, 200, 1.0, 'Grama(s)', 9.90, 49.50) RETURNING id INTO i_presunto;
  INSERT INTO materias_primas (user_id, nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES
    (uid, 'Queijo mussarela', 'Tirolez', cat_out, 500, 500, 1.0, 'Grama(s)', 29.90, 59.80) RETURNING id INTO i_queijo;

  -- ============================================================
  -- CATEGORIAS E EMBALAGENS
  -- ============================================================
  INSERT INTO categorias_embalagens (user_id, nome) VALUES (uid, 'Caixas') RETURNING id INTO ecat_cx;
  INSERT INTO categorias_embalagens (user_id, nome) VALUES (uid, 'Sacos e Sacolas') RETURNING id INTO ecat_sac;
  INSERT INTO categorias_embalagens (user_id, nome) VALUES (uid, 'Potes e Formas') RETURNING id INTO ecat_pot;

  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Caixa kraft 15x15', 'Cromus', ecat_cx, 25, 'Unidades', 32.50, 1.30) RETURNING id INTO e_cx15;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Caixa kraft 20x20', 'Cromus', ecat_cx, 25, 'Unidades', 45.00, 1.80) RETURNING id INTO e_cx20;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Caixa mini doces 10x10', 'Festcolor', ecat_cx, 50, 'Unidades', 35.00, 0.70) RETURNING id INTO e_cx10;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Caixa mini individual', 'Festcolor', ecat_cx, 100, 'Unidades', 28.00, 0.28) RETURNING id INTO e_mini;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Saco plástico 100g', 'Cromus', ecat_sac, 100, 'Unidades', 12.00, 0.12) RETURNING id INTO e_sac100;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Saco plástico 250g', 'Cromus', ecat_sac, 100, 'Unidades', 18.00, 0.18) RETURNING id INTO e_sac250;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Saco celofane decorado', 'Cromus', ecat_sac, 50, 'Unidades', 15.00, 0.30) RETURNING id INTO e_saccelof;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Pote plástico 200ml', 'Galvanotek', ecat_pot, 50, 'Unidades', 22.00, 0.44) RETURNING id INTO e_pote200;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Pote plástico 500ml', 'Galvanotek', ecat_pot, 25, 'Unidades', 18.00, 0.72) RETURNING id INTO e_pote500;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Pote vidro 250ml', 'Invicta', ecat_pot, 12, 'Unidades', 36.00, 3.00) RETURNING id INTO e_potevid;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Fita decorativa', 'Progresso', ecat_sac, 10, 'Unidades', 8.90, 0.89) RETURNING id INTO e_fitadec;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Etiqueta adesiva', 'Pimaco', ecat_sac, 100, 'Unidades', 15.00, 0.15) RETURNING id INTO e_etiqueta;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Forma alumínio redonda', 'Wyda', ecat_pot, 10, 'Unidades', 12.90, 1.29) RETURNING id INTO e_forma;
  INSERT INTO embalagens (user_id, nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES
    (uid, 'Papel manteiga', 'Wyda', ecat_pot, 1, 'Unidades', 9.90, 9.90) RETURNING id INTO e_papel;

  -- ============================================================
  -- CATEGORIAS E PREPAROS
  -- ============================================================
  INSERT INTO categorias_preparos (user_id, nome) VALUES (uid, 'Massas') RETURNING id INTO pcat_mas;
  INSERT INTO categorias_preparos (user_id, nome) VALUES (uid, 'Recheios e Coberturas') RETURNING id INTO pcat_rec;
  INSERT INTO categorias_preparos (user_id, nome) VALUES (uid, 'Caldas e Cremes') RETURNING id INTO pcat_cal;

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

  -- Ganache
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Ganache meio amargo', pcat_rec, 600, 'Grama(s)', 19.20, 32.00) RETURNING id INTO pr_ganache;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_ganache, i_chpobarra, 300, 12.87), (uid, pr_ganache, i_creme, 300, 10.35);

  -- Buttercream
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Buttercream baunilha', pcat_rec, 800, 'Grama(s)', 22.50, 28.13) RETURNING id INTO pr_buttercream;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_buttercream, i_manteiga, 250, 19.88), (uid, pr_buttercream, i_acuconf, 300, 4.50),
    (uid, pr_buttercream, i_baunilha, 5, 1.15);

  -- Calda de caramelo
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Calda de caramelo', pcat_cal, 500, 'Grama(s)', 5.80, 11.60) RETURNING id INTO pr_caldacaramelo;

  -- Brigadeiro
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Brigadeiro gourmet', pcat_rec, 600, 'Grama(s)', 15.90, 26.50) RETURNING id INTO pr_brigadeiro;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_brigadeiro, i_leitecond, 395, 7.90), (uid, pr_brigadeiro, i_cacau, 50, 3.23),
    (uid, pr_brigadeiro, i_manteiga, 30, 2.39);

  -- Beijinho
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Beijinho gourmet', pcat_rec, 500, 'Grama(s)', 14.20, 28.40) RETURNING id INTO pr_beijinho;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_beijinho, i_leitecond, 395, 7.90), (uid, pr_beijinho, i_coco, 60, 3.30),
    (uid, pr_beijinho, i_manteiga, 20, 1.59);

  -- Creme belga
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Creme belga branco', pcat_rec, 500, 'Grama(s)', 20.80, 41.60) RETURNING id INTO pr_crembelga;
  INSERT INTO preparo_ingredientes (user_id, preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES
    (uid, pr_crembelga, i_chbranco, 200, 9.18), (uid, pr_crembelga, i_creme, 200, 6.90),
    (uid, pr_crembelga, i_leitecond, 200, 4.00);

  -- Massa salgada
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Massa salgada (coxinha)', pcat_mas, 1500, 'Grama(s)', 11.20, 7.47) RETURNING id INTO pr_massasalgada;

  -- Recheio de frango
  INSERT INTO preparos (user_id, nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES
    (uid, 'Recheio de frango', pcat_rec, 800, 'Grama(s)', 16.50, 20.63) RETURNING id INTO pr_recheiofrango;

  -- ============================================================
  -- CATEGORIAS E PRODUTOS
  -- ============================================================
  INSERT INTO categorias_produtos (user_id, nome) VALUES (uid, 'Bolos') RETURNING id INTO prcat_bol;
  INSERT INTO categorias_produtos (user_id, nome) VALUES (uid, 'Doces') RETURNING id INTO prcat_doc;
  INSERT INTO categorias_produtos (user_id, nome) VALUES (uid, 'Salgados') RETURNING id INTO prcat_sal;
  INSERT INTO categorias_produtos (user_id, nome) VALUES (uid, 'Bebidas') RETURNING id INTO prcat_beb;

  -- BOLO DE CHOCOLATE
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda, modo_preparo) VALUES
    (uid, 'Bolo de Chocolate com Ganache', prcat_bol, 1800, 12, 89.90, 'Assar massa 180°C por 35min, rechear com ganache') RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massachoc, 1200);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_ganache, 400);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);

  -- BOLO RED VELVET
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo Red Velvet', prcat_bol, 1600, 10, 95.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massavaun, 1100);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_buttercream, 500);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);

  -- BOLO DE CENOURA
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo de Cenoura com Cobertura', prcat_bol, 1200, 8, 55.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massacenoura, 1000);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_ganache, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_forma, 1);

  -- BOLO DE BAUNILHA
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo de Baunilha com Buttercream', prcat_bol, 1600, 10, 85.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massavaun, 1100);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_buttercream, 500);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);

  -- NAKED CAKE MORANGO
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Naked Cake de Morango', prcat_bol, 1800, 12, 120.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massavaun, 1100);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_buttercream, 400);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES (uid, p_id, i_morango, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);

  -- BRIGADEIRO (cento)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Brigadeiro Gourmet (cento)', prcat_doc, 600, 100, 85.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_brigadeiro, 600);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_mini, 100);

  -- BEIJINHO (cento)
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Beijinho Gourmet (cento)', prcat_doc, 500, 100, 85.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_beijinho, 500);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_mini, 100);

  -- BROWNIE
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Brownie Chocolate', prcat_doc, 800, 16, 6.50) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massachoc, 600);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES (uid, p_id, i_chpobarra, 150);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_saccelof, 1);

  -- PALHA ITALIANA
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Palha Italiana (pote 200g)', prcat_doc, 800, 4, 18.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_brigadeiro, 500);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);

  -- TRUFA DE MARACUJÁ
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Trufa de Maracujá (unidade)', prcat_doc, 400, 20, 5.50) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_crembelga, 300);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES (uid, p_id, i_maracuja, 100);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_sac100, 1);

  -- COXINHA
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Coxinha de Frango (cento)', prcat_sal, 2300, 100, 120.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massasalgada, 1500);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_recheiofrango, 800);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES (uid, p_id, i_frosca, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx15, 1);

  -- EMPADA
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Empada de Palmito (unidade)', prcat_sal, 60, 1, 7.50) RETURNING id INTO p_id;
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_sac100, 1);

  -- PÃO DE QUEIJO
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Pão de Queijo (kg)', prcat_sal, 1000, 40, 45.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_polvilho, 500), (uid, p_id, i_queijo, 200),
    (uid, p_id, i_ovo, 3), (uid, p_id, i_oleo, 100);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_sac250, 1);

  -- QUICHE
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Quiche de Presunto e Queijo', prcat_sal, 900, 8, 55.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_ftrigo, 250), (uid, p_id, i_manteiga, 100),
    (uid, p_id, i_presunto, 150), (uid, p_id, i_queijo, 150),
    (uid, p_id, i_creme, 200), (uid, p_id, i_ovo, 3);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_forma, 1);

  -- BOLO NO POTE
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo no Pote Chocolate', prcat_doc, 200, 1, 15.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massachoc, 120);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_ganache, 80);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);

  -- BOLO NO POTE PRESTÍGIO
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo no Pote Prestígio', prcat_doc, 200, 1, 16.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massachoc, 100);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_beijinho, 60);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_ganache, 40);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);

  -- COOKIE
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Cookie Gotas de Chocolate', prcat_doc, 600, 20, 5.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_ftrigo, 250), (uid, p_id, i_manteiga, 120),
    (uid, p_id, i_acucar, 100), (uid, p_id, i_ovo, 1),
    (uid, p_id, i_chpobarra, 80), (uid, p_id, i_baunilha, 3);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_sac100, 1);

  -- CHEESECAKE
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Cheesecake de Frutas Vermelhas', prcat_bol, 1200, 10, 110.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_creamcheese, 450), (uid, p_id, i_acucar, 150),
    (uid, p_id, i_ovo, 3), (uid, p_id, i_creme, 200),
    (uid, p_id, i_morango, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);

  -- TORTA LIMÃO
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Torta de Limão', prcat_bol, 1000, 8, 75.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_leitecond, 395), (uid, p_id, i_limao, 200),
    (uid, p_id, i_creme, 200), (uid, p_id, i_ftrigo, 150), (uid, p_id, i_manteiga, 80);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);

  -- PUDIM
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Pudim de Leite Condensado', prcat_doc, 800, 8, 45.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_leitecond, 395), (uid, p_id, i_leite, 400),
    (uid, p_id, i_ovo, 4), (uid, p_id, i_acucar, 150);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_forma, 1);

  -- BOLO PRESTÍGIO
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo Prestígio', prcat_bol, 1600, 10, 85.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massachoc, 1000);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_beijinho, 300);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_ganache, 300);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx20, 1);

  -- DOCINHO DE LEITE NINHO
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Docinho de Leite Ninho (cento)', prcat_doc, 500, 100, 90.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_crembelga, 500);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_mini, 100);

  -- MINI BOLO
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Mini Bolo Chocolate', prcat_doc, 200, 1, 22.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massachoc, 150);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_ganache, 50);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_cx10, 1);

  -- BOLO BANANA
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Bolo de Banana com Canela', prcat_bol, 1200, 10, 48.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_massavaun, 800);
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_banana, 400), (uid, p_id, i_canela, 5);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_caldacaramelo, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_forma, 1);

  -- BRIGADEIRO NO POTE
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Brigadeiro no Pote 200g', prcat_doc, 200, 1, 14.00) RETURNING id INTO p_id;
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_brigadeiro, 200);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_pote200, 1);

  -- ALFAJOR
  INSERT INTO produtos (user_id, nome, categoria_id, rendimento_total, rendimento_unidades, preco_venda) VALUES
    (uid, 'Alfajor Artesanal', prcat_doc, 400, 12, 6.00) RETURNING id INTO p_id;
  INSERT INTO produto_ingredientes (user_id, produto_id, materia_prima_id, quantidade_utilizada) VALUES
    (uid, p_id, i_amido, 200), (uid, p_id, i_manteiga, 80), (uid, p_id, i_acuconf, 60);
  INSERT INTO produto_preparos (user_id, produto_id, preparo_id, quantidade_utilizada) VALUES (uid, p_id, pr_brigadeiro, 100);
  INSERT INTO produto_embalagens (user_id, produto_id, embalagem_id, quantidade_utilizada) VALUES (uid, p_id, e_saccelof, 1);

  -- ============================================================
  -- DELIVERY
  -- ============================================================
  INSERT INTO delivery_config (user_id, plataforma, taxa_plataforma, taxa_entrega, comissao_app, ativo) VALUES
    (uid, 'iFood', 0, 5.99, 12.0, 1),
    (uid, 'Rappi', 0, 7.99, 15.0, 1),
    (uid, 'Venda Direta', 0, 0, 0, 1);

  INSERT INTO delivery_adicionais (user_id, nome, custo, preco_cobrado) VALUES
    (uid, 'Cobertura extra chocolate', 1.50, 4.00),
    (uid, 'Calda de caramelo', 0.80, 3.00),
    (uid, 'Granulado belga', 2.00, 5.00);

  -- Perfil
  UPDATE perfil SET nome_negocio = 'Doce Sabor Confeitaria', segmento = 'Confeitaria', telefone = '(11) 99999-1234' WHERE user_id = uid;

  RAISE NOTICE 'Seed data inserted for user %', uid;
END $$;
