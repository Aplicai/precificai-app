import { getDatabase } from './database';

export async function seedDatabase() {
  const db = await getDatabase();

  // Check if seed flag exists
  try {
    await db.runAsync('CREATE TABLE IF NOT EXISTS _seed_flag (id INTEGER PRIMARY KEY DEFAULT 1)');
    const flag = await db.getFirstAsync('SELECT * FROM _seed_flag WHERE id = 1');
    if (flag) return; // already seeded
  } catch(e) {}

  // Clear existing data and seed fresh
  await db.execAsync(`
    DELETE FROM delivery_combo_itens;
    DELETE FROM delivery_combos;
    DELETE FROM delivery_produto_itens;
    DELETE FROM delivery_produtos;
    DELETE FROM delivery_adicionais;
    DELETE FROM delivery_config;
    DELETE FROM produto_embalagens;
    DELETE FROM produto_preparos;
    DELETE FROM produto_ingredientes;
    DELETE FROM produtos;
    DELETE FROM preparo_ingredientes;
    DELETE FROM preparos;
    DELETE FROM embalagens;
    DELETE FROM materias_primas;
    DELETE FROM categorias_insumos;
    DELETE FROM categorias_embalagens;
    DELETE FROM categorias_preparos;
    DELETE FROM categorias_produtos;
    DELETE FROM despesas_fixas;
    DELETE FROM despesas_variaveis;
    DELETE FROM faturamento_mensal;
    DELETE FROM configuracao;
    DELETE FROM perfil;
  `);

  // ========== CATEGORIAS INSUMOS ==========
  const catInsumos = [
    'Farinhas e Grãos', 'Laticínios', 'Açúcares e Adoçantes', 'Óleos e Gorduras',
    'Ovos e Proteínas', 'Frutas', 'Chocolates', 'Temperos e Condimentos',
  ];
  const catInsumoIds = {};
  for (const nome of catInsumos) {
    const r = await db.runAsync('INSERT INTO categorias_insumos (nome, icone) VALUES (?, ?)', [nome, 'tag']);
    catInsumoIds[nome] = r.lastInsertRowId;
  }

  // ========== INSUMOS (30+) ==========
  const insumos = [
    // Farinhas
    { nome: 'Farinha de Trigo', marca: 'Dona Benta', cat: 'Farinhas e Grãos', qb: 1000, ql: 1000, un: 'g', valor: 6.50 },
    { nome: 'Farinha de Amêndoas', marca: '', cat: 'Farinhas e Grãos', qb: 500, ql: 500, un: 'g', valor: 32.00 },
    { nome: 'Amido de Milho', marca: 'Maizena', cat: 'Farinhas e Grãos', qb: 500, ql: 500, un: 'g', valor: 7.90 },
    { nome: 'Aveia em Flocos', marca: 'Quaker', cat: 'Farinhas e Grãos', qb: 500, ql: 500, un: 'g', valor: 8.50 },
    // Laticínios
    { nome: 'Leite Integral', marca: 'Italac', cat: 'Laticínios', qb: 1000, ql: 1000, un: 'mL', valor: 5.90 },
    { nome: 'Creme de Leite', marca: 'Nestlé', cat: 'Laticínios', qb: 200, ql: 200, un: 'g', valor: 4.50 },
    { nome: 'Leite Condensado', marca: 'Moça', cat: 'Laticínios', qb: 395, ql: 395, un: 'g', valor: 7.90 },
    { nome: 'Manteiga sem Sal', marca: 'Président', cat: 'Laticínios', qb: 200, ql: 200, un: 'g', valor: 14.90 },
    { nome: 'Cream Cheese', marca: 'Philadelphia', cat: 'Laticínios', qb: 150, ql: 150, un: 'g', valor: 12.90 },
    { nome: 'Queijo Mussarela', marca: '', cat: 'Laticínios', qb: 500, ql: 500, un: 'g', valor: 29.90 },
    // Açúcares
    { nome: 'Açúcar Refinado', marca: 'União', cat: 'Açúcares e Adoçantes', qb: 1000, ql: 1000, un: 'g', valor: 5.20 },
    { nome: 'Açúcar Confeiteiro', marca: '', cat: 'Açúcares e Adoçantes', qb: 500, ql: 500, un: 'g', valor: 6.50 },
    { nome: 'Mel', marca: '', cat: 'Açúcares e Adoçantes', qb: 500, ql: 500, un: 'g', valor: 22.00 },
    // Óleos
    { nome: 'Óleo de Soja', marca: 'Liza', cat: 'Óleos e Gorduras', qb: 900, ql: 900, un: 'mL', valor: 8.90 },
    { nome: 'Azeite Extra Virgem', marca: 'Gallo', cat: 'Óleos e Gorduras', qb: 500, ql: 500, un: 'mL', valor: 28.90 },
    // Ovos
    { nome: 'Ovos (dúzia)', marca: '', cat: 'Ovos e Proteínas', qb: 12, ql: 12, un: 'un', valor: 12.00 },
    { nome: 'Peito de Frango', marca: '', cat: 'Ovos e Proteínas', qb: 1000, ql: 850, un: 'g', valor: 18.90 },
    { nome: 'Carne Moída', marca: '', cat: 'Ovos e Proteínas', qb: 1000, ql: 900, un: 'g', valor: 32.90 },
    // Frutas
    { nome: 'Morango', marca: '', cat: 'Frutas', qb: 500, ql: 400, un: 'g', valor: 12.00 },
    { nome: 'Banana', marca: '', cat: 'Frutas', qb: 1000, ql: 700, un: 'g', valor: 6.90 },
    { nome: 'Limão', marca: '', cat: 'Frutas', qb: 1000, ql: 500, un: 'g', valor: 8.00 },
    { nome: 'Maçã', marca: '', cat: 'Frutas', qb: 1000, ql: 850, un: 'g', valor: 9.90 },
    // Chocolates
    { nome: 'Chocolate ao Leite', marca: 'Callebaut', cat: 'Chocolates', qb: 1000, ql: 1000, un: 'g', valor: 65.00 },
    { nome: 'Chocolate Meio Amargo', marca: 'Callebaut', cat: 'Chocolates', qb: 1000, ql: 1000, un: 'g', valor: 72.00 },
    { nome: 'Cacau em Pó', marca: 'Mavalério', cat: 'Chocolates', qb: 500, ql: 500, un: 'g', valor: 18.00 },
    // Temperos
    { nome: 'Sal', marca: '', cat: 'Temperos e Condimentos', qb: 1000, ql: 1000, un: 'g', valor: 3.50 },
    { nome: 'Fermento em Pó', marca: 'Royal', cat: 'Temperos e Condimentos', qb: 250, ql: 250, un: 'g', valor: 8.90 },
    { nome: 'Essência de Baunilha', marca: '', cat: 'Temperos e Condimentos', qb: 100, ql: 100, un: 'mL', valor: 6.50 },
    { nome: 'Canela em Pó', marca: '', cat: 'Temperos e Condimentos', qb: 100, ql: 100, un: 'g', valor: 7.00 },
    { nome: 'Molho de Tomate', marca: 'Heinz', cat: 'Temperos e Condimentos', qb: 340, ql: 340, un: 'g', valor: 6.90 },
  ];

  const insumoIds = {};
  for (const ins of insumos) {
    const fc = ins.qb / ins.ql;
    // preço por kg/L, ou preço por unidade para 'un'
    const precoBase = ins.un === 'un' ? ins.valor / ins.ql : (ins.valor / ins.ql) * 1000;
    const r = await db.runAsync(
      'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
      [ins.nome, ins.marca, catInsumoIds[ins.cat], ins.qb, ins.ql, fc, ins.un, ins.valor, precoBase]
    );
    insumoIds[ins.nome] = r.lastInsertRowId;
  }

  // ========== CATEGORIAS EMBALAGENS ==========
  const catEmbs = ['Caixas', 'Potes', 'Descartáveis', 'Sacos e Sacolas'];
  const catEmbIds = {};
  for (const nome of catEmbs) {
    const r = await db.runAsync('INSERT INTO categorias_embalagens (nome, icone) VALUES (?, ?)', [nome, 'tag']);
    catEmbIds[nome] = r.lastInsertRowId;
  }

  // ========== EMBALAGENS (10+) ==========
  const embalagens = [
    { nome: 'Caixa Kraft P', cat: 'Caixas', qtd: 50, un: 'un', preco: 35.00 },
    { nome: 'Caixa Kraft M', cat: 'Caixas', qtd: 50, un: 'un', preco: 45.00 },
    { nome: 'Caixa Kraft G', cat: 'Caixas', qtd: 25, un: 'un', preco: 38.00 },
    { nome: 'Pote Redondo 250ml', cat: 'Potes', qtd: 100, un: 'un', preco: 42.00 },
    { nome: 'Pote Redondo 500ml', cat: 'Potes', qtd: 50, un: 'un', preco: 35.00 },
    { nome: 'Marmitex Alumínio 500ml', cat: 'Descartáveis', qtd: 100, un: 'un', preco: 55.00 },
    { nome: 'Marmitex Alumínio 750ml', cat: 'Descartáveis', qtd: 100, un: 'un', preco: 65.00 },
    { nome: 'Sacola Kraft P', cat: 'Sacos e Sacolas', qtd: 100, un: 'un', preco: 28.00 },
    { nome: 'Filme PVC (rolo)', cat: 'Descartáveis', qtd: 1, un: 'un', preco: 12.00 },
    { nome: 'Papel Manteiga (rolo)', cat: 'Descartáveis', qtd: 1, un: 'un', preco: 9.50 },
    { nome: 'Forminha Brigadeiro (100un)', cat: 'Descartáveis', qtd: 100, un: 'un', preco: 5.00 },
  ];

  const embIds = {};
  for (const emb of embalagens) {
    const pu = emb.preco / emb.qtd;
    const r = await db.runAsync(
      'INSERT INTO embalagens (nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES (?,?,?,?,?,?,?)',
      [emb.nome, '', catEmbIds[emb.cat], emb.qtd, emb.un, emb.preco, pu]
    );
    embIds[emb.nome] = r.lastInsertRowId;
  }

  // ========== CATEGORIAS PREPAROS ==========
  const catPreps = ['Massas', 'Recheios', 'Coberturas', 'Bases'];
  const catPrepIds = {};
  for (const nome of catPreps) {
    const r = await db.runAsync('INSERT INTO categorias_preparos (nome, icone) VALUES (?, ?)', [nome, 'tag']);
    catPrepIds[nome] = r.lastInsertRowId;
  }

  // ========== PREPAROS (8) ==========
  const preparos = [
    { nome: 'Massa de Bolo de Chocolate', cat: 'Massas', rend: 1200, un: 'g',
      ings: [
        { nome: 'Farinha de Trigo', qtd: 300 },
        { nome: 'Açúcar Refinado', qtd: 250 },
        { nome: 'Cacau em Pó', qtd: 80 },
        { nome: 'Ovos (dúzia)', qtd: 4 },
        { nome: 'Leite Integral', qtd: 240 },
        { nome: 'Óleo de Soja', qtd: 120 },
        { nome: 'Fermento em Pó', qtd: 15 },
      ]},
    { nome: 'Massa de Bolo de Baunilha', cat: 'Massas', rend: 1100, un: 'g',
      ings: [
        { nome: 'Farinha de Trigo', qtd: 300 },
        { nome: 'Açúcar Refinado', qtd: 200 },
        { nome: 'Ovos (dúzia)', qtd: 4 },
        { nome: 'Leite Integral', qtd: 200 },
        { nome: 'Manteiga sem Sal', qtd: 100 },
        { nome: 'Essência de Baunilha', qtd: 10 },
        { nome: 'Fermento em Pó', qtd: 15 },
      ]},
    { nome: 'Ganache de Chocolate', cat: 'Coberturas', rend: 500, un: 'g',
      ings: [
        { nome: 'Chocolate Meio Amargo', qtd: 300 },
        { nome: 'Creme de Leite', qtd: 200 },
      ]},
    { nome: 'Brigadeiro (massa)', cat: 'Recheios', rend: 600, un: 'g',
      ings: [
        { nome: 'Leite Condensado', qtd: 395 },
        { nome: 'Cacau em Pó', qtd: 50 },
        { nome: 'Manteiga sem Sal', qtd: 30 },
      ]},
    { nome: 'Calda de Morango', cat: 'Coberturas', rend: 400, un: 'g',
      ings: [
        { nome: 'Morango', qtd: 300 },
        { nome: 'Açúcar Refinado', qtd: 100 },
        { nome: 'Limão', qtd: 30 },
      ]},
    { nome: 'Creme de Confeiteiro', cat: 'Recheios', rend: 800, un: 'g',
      ings: [
        { nome: 'Leite Integral', qtd: 500 },
        { nome: 'Açúcar Refinado', qtd: 120 },
        { nome: 'Amido de Milho', qtd: 50 },
        { nome: 'Ovos (dúzia)', qtd: 3 },
        { nome: 'Essência de Baunilha', qtd: 5 },
        { nome: 'Manteiga sem Sal', qtd: 30 },
      ]},
    { nome: 'Molho Bolonhesa', cat: 'Bases', rend: 800, un: 'g',
      ings: [
        { nome: 'Carne Moída', qtd: 400 },
        { nome: 'Molho de Tomate', qtd: 340 },
        { nome: 'Sal', qtd: 5 },
        { nome: 'Azeite Extra Virgem', qtd: 20 },
      ]},
    { nome: 'Cobertura de Cream Cheese', cat: 'Coberturas', rend: 500, un: 'g',
      ings: [
        { nome: 'Cream Cheese', qtd: 300 },
        { nome: 'Açúcar Confeiteiro', qtd: 150 },
        { nome: 'Manteiga sem Sal', qtd: 50 },
      ]},
  ];

  const prepIds = {};
  for (const prep of preparos) {
    let custoTotal = 0;
    const r = await db.runAsync(
      'INSERT INTO preparos (nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES (?,?,?,?,0,0)',
      [prep.nome, catPrepIds[prep.cat], prep.rend, prep.un]
    );
    const prepId = r.lastInsertRowId;
    prepIds[prep.nome] = prepId;

    for (const ing of prep.ings) {
      const mpId = insumoIds[ing.nome];
      if (!mpId) continue;
      const mp = insumos.find(i => i.nome === ing.nome);
      const precoBase = mp.un === 'un' ? mp.valor / mp.ql : (mp.valor / mp.ql) * 1000;
      let custo;
      if (mp.un === 'un') {
        custo = ing.qtd * precoBase;
      } else {
        custo = (ing.qtd / 1000) * precoBase;
      }
      custoTotal += custo;
      await db.runAsync(
        'INSERT INTO preparo_ingredientes (preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES (?,?,?,?)',
        [prepId, mpId, ing.qtd, custo]
      );
    }

    const cpk = (custoTotal / prep.rend) * 1000;
    await db.runAsync('UPDATE preparos SET custo_total=?, custo_por_kg=? WHERE id=?', [custoTotal, cpk, prepId]);
  }

  // ========== CATEGORIAS PRODUTOS ==========
  const catProds = ['Bolos', 'Doces', 'Salgados', 'Bebidas', 'Marmitas'];
  const catProdIds = {};
  for (const nome of catProds) {
    const r = await db.runAsync('INSERT INTO categorias_produtos (nome, icone) VALUES (?, ?)', [nome, 'tag']);
    catProdIds[nome] = r.lastInsertRowId;
  }

  // ========== PRODUTOS (40) ==========
  const produtos = [
    // Bolos
    { nome: 'Bolo de Chocolate P', cat: 'Bolos', rend: 1200, rendUn: 1, preco: 45.00, preps: [{ nome: 'Massa de Bolo de Chocolate', qtd: 600 }, { nome: 'Ganache de Chocolate', qtd: 250 }], embs: [{ nome: 'Caixa Kraft P', qtd: 1 }] },
    { nome: 'Bolo de Chocolate M', cat: 'Bolos', rend: 2000, rendUn: 1, preco: 75.00, preps: [{ nome: 'Massa de Bolo de Chocolate', qtd: 1200 }, { nome: 'Ganache de Chocolate', qtd: 500 }], embs: [{ nome: 'Caixa Kraft M', qtd: 1 }] },
    { nome: 'Bolo de Baunilha P', cat: 'Bolos', rend: 1100, rendUn: 1, preco: 42.00, preps: [{ nome: 'Massa de Bolo de Baunilha', qtd: 550 }, { nome: 'Creme de Confeiteiro', qtd: 200 }], embs: [{ nome: 'Caixa Kraft P', qtd: 1 }] },
    { nome: 'Bolo de Baunilha M', cat: 'Bolos', rend: 2000, rendUn: 1, preco: 70.00, preps: [{ nome: 'Massa de Bolo de Baunilha', qtd: 1100 }, { nome: 'Creme de Confeiteiro', qtd: 400 }], embs: [{ nome: 'Caixa Kraft M', qtd: 1 }] },
    { nome: 'Bolo Red Velvet', cat: 'Bolos', rend: 1500, rendUn: 1, preco: 85.00, preps: [{ nome: 'Massa de Bolo de Baunilha', qtd: 800 }, { nome: 'Cobertura de Cream Cheese', qtd: 400 }], embs: [{ nome: 'Caixa Kraft M', qtd: 1 }] },
    { nome: 'Bolo de Morango', cat: 'Bolos', rend: 1500, rendUn: 1, preco: 80.00, preps: [{ nome: 'Massa de Bolo de Baunilha', qtd: 700 }, { nome: 'Creme de Confeiteiro', qtd: 300 }, { nome: 'Calda de Morango', qtd: 200 }], embs: [{ nome: 'Caixa Kraft M', qtd: 1 }] },
    { nome: 'Naked Cake Chocolate', cat: 'Bolos', rend: 2500, rendUn: 1, preco: 120.00, preps: [{ nome: 'Massa de Bolo de Chocolate', qtd: 1200 }, { nome: 'Ganache de Chocolate', qtd: 500 }, { nome: 'Brigadeiro (massa)', qtd: 300 }], embs: [{ nome: 'Caixa Kraft G', qtd: 1 }] },
    { nome: 'Bolo no Pote Chocolate', cat: 'Bolos', rend: 250, rendUn: 1, preco: 14.00, preps: [{ nome: 'Massa de Bolo de Chocolate', qtd: 120 }, { nome: 'Brigadeiro (massa)', qtd: 80 }], embs: [{ nome: 'Pote Redondo 250ml', qtd: 1 }] },
    { nome: 'Bolo no Pote Morango', cat: 'Bolos', rend: 250, rendUn: 1, preco: 15.00, preps: [{ nome: 'Massa de Bolo de Baunilha', qtd: 100 }, { nome: 'Creme de Confeiteiro', qtd: 80 }, { nome: 'Calda de Morango', qtd: 50 }], embs: [{ nome: 'Pote Redondo 250ml', qtd: 1 }] },
    { nome: 'Fatia de Bolo Chocolate', cat: 'Bolos', rend: 200, rendUn: 1, preco: 12.00, preps: [{ nome: 'Massa de Bolo de Chocolate', qtd: 100 }, { nome: 'Ganache de Chocolate', qtd: 60 }], embs: [{ nome: 'Caixa Kraft P', qtd: 1 }] },
    // Doces
    { nome: 'Brigadeiro Tradicional (un)', cat: 'Doces', rend: 25, rendUn: 25, preco: 2.50, preps: [{ nome: 'Brigadeiro (massa)', qtd: 25 }], embs: [{ nome: 'Forminha Brigadeiro (100un)', qtd: 1 }] },
    { nome: 'Caixa Brigadeiro 25un', cat: 'Doces', rend: 625, rendUn: 1, preco: 55.00, preps: [{ nome: 'Brigadeiro (massa)', qtd: 625 }], embs: [{ nome: 'Caixa Kraft P', qtd: 1 }, { nome: 'Forminha Brigadeiro (100un)', qtd: 25 }] },
    { nome: 'Brownie', cat: 'Doces', rend: 100, rendUn: 1, preco: 8.00, ings: [{ nome: 'Chocolate Meio Amargo', qtd: 50 }, { nome: 'Manteiga sem Sal', qtd: 30 }, { nome: 'Ovos (dúzia)', qtd: 1 }, { nome: 'Açúcar Refinado', qtd: 40 }, { nome: 'Farinha de Trigo', qtd: 20 }], embs: [{ nome: 'Sacola Kraft P', qtd: 1 }] },
    { nome: 'Cookie Chocolate', cat: 'Doces', rend: 80, rendUn: 1, preco: 6.00, ings: [{ nome: 'Farinha de Trigo', qtd: 30 }, { nome: 'Manteiga sem Sal', qtd: 20 }, { nome: 'Açúcar Refinado', qtd: 25 }, { nome: 'Chocolate ao Leite', qtd: 20 }, { nome: 'Ovos (dúzia)', qtd: 1 }], embs: [{ nome: 'Sacola Kraft P', qtd: 1 }] },
    { nome: 'Palha Italiana (un)', cat: 'Doces', rend: 30, rendUn: 1, preco: 4.00, preps: [{ nome: 'Brigadeiro (massa)', qtd: 20 }], ings: [{ nome: 'Aveia em Flocos', qtd: 10 }] },
    { nome: 'Torta de Morango Inteira', cat: 'Doces', rend: 1500, rendUn: 1, preco: 95.00, preps: [{ nome: 'Massa de Bolo de Baunilha', qtd: 500 }, { nome: 'Creme de Confeiteiro', qtd: 500 }, { nome: 'Calda de Morango', qtd: 200 }], ings: [{ nome: 'Morango', qtd: 200 }], embs: [{ nome: 'Caixa Kraft G', qtd: 1 }] },
    { nome: 'Pudim', cat: 'Doces', rend: 800, rendUn: 8, preco: 8.00, ings: [{ nome: 'Leite Condensado', qtd: 395 }, { nome: 'Leite Integral', qtd: 400 }, { nome: 'Ovos (dúzia)', qtd: 5 }, { nome: 'Açúcar Refinado', qtd: 150 }] },
    { nome: 'Mousse de Maracujá', cat: 'Doces', rend: 250, rendUn: 1, preco: 12.00, ings: [{ nome: 'Creme de Leite', qtd: 200 }, { nome: 'Leite Condensado', qtd: 200 }], embs: [{ nome: 'Pote Redondo 250ml', qtd: 1 }] },
    { nome: 'Trufa de Chocolate', cat: 'Doces', rend: 30, rendUn: 1, preco: 5.00, preps: [{ nome: 'Ganache de Chocolate', qtd: 30 }] },
    { nome: 'Bolo de Banana', cat: 'Bolos', rend: 800, rendUn: 1, preco: 35.00, ings: [{ nome: 'Banana', qtd: 300 }, { nome: 'Farinha de Trigo', qtd: 200 }, { nome: 'Açúcar Refinado', qtd: 150 }, { nome: 'Ovos (dúzia)', qtd: 3 }, { nome: 'Canela em Pó', qtd: 5 }, { nome: 'Fermento em Pó', qtd: 10 }], embs: [{ nome: 'Caixa Kraft P', qtd: 1 }] },
    // Salgados
    { nome: 'Coxinha (un)', cat: 'Salgados', rend: 80, rendUn: 1, preco: 5.00, ings: [{ nome: 'Farinha de Trigo', qtd: 30 }, { nome: 'Peito de Frango', qtd: 30 }, { nome: 'Sal', qtd: 2 }] },
    { nome: 'Empada de Frango (un)', cat: 'Salgados', rend: 60, rendUn: 1, preco: 6.00, ings: [{ nome: 'Farinha de Trigo', qtd: 25 }, { nome: 'Manteiga sem Sal', qtd: 10 }, { nome: 'Peito de Frango', qtd: 20 }] },
    { nome: 'Quiche de Queijo', cat: 'Salgados', rend: 400, rendUn: 1, preco: 28.00, ings: [{ nome: 'Farinha de Trigo', qtd: 150 }, { nome: 'Manteiga sem Sal', qtd: 50 }, { nome: 'Queijo Mussarela', qtd: 100 }, { nome: 'Ovos (dúzia)', qtd: 3 }, { nome: 'Creme de Leite', qtd: 100 }], embs: [{ nome: 'Caixa Kraft P', qtd: 1 }] },
    { nome: 'Pão de Queijo (un)', cat: 'Salgados', rend: 40, rendUn: 1, preco: 3.50, ings: [{ nome: 'Amido de Milho', qtd: 15 }, { nome: 'Queijo Mussarela', qtd: 10 }, { nome: 'Ovos (dúzia)', qtd: 1 }, { nome: 'Óleo de Soja', qtd: 5 }] },
    { nome: 'Torta Salgada de Frango', cat: 'Salgados', rend: 1200, rendUn: 1, preco: 45.00, ings: [{ nome: 'Farinha de Trigo', qtd: 200 }, { nome: 'Ovos (dúzia)', qtd: 4 }, { nome: 'Leite Integral', qtd: 200 }, { nome: 'Peito de Frango', qtd: 300 }, { nome: 'Sal', qtd: 5 }], embs: [{ nome: 'Caixa Kraft M', qtd: 1 }] },
    // Marmitas
    { nome: 'Marmita Frango Grelhado', cat: 'Marmitas', rend: 500, rendUn: 1, preco: 22.00, ings: [{ nome: 'Peito de Frango', qtd: 200 }, { nome: 'Sal', qtd: 3 }, { nome: 'Azeite Extra Virgem', qtd: 10 }], embs: [{ nome: 'Marmitex Alumínio 500ml', qtd: 1 }] },
    { nome: 'Marmita Carne Moída', cat: 'Marmitas', rend: 500, rendUn: 1, preco: 25.00, preps: [{ nome: 'Molho Bolonhesa', qtd: 250 }], ings: [{ nome: 'Sal', qtd: 3 }], embs: [{ nome: 'Marmitex Alumínio 500ml', qtd: 1 }] },
    { nome: 'Marmita Fit Frango', cat: 'Marmitas', rend: 400, rendUn: 1, preco: 24.00, ings: [{ nome: 'Peito de Frango', qtd: 180 }, { nome: 'Azeite Extra Virgem', qtd: 5 }, { nome: 'Sal', qtd: 2 }], embs: [{ nome: 'Marmitex Alumínio 500ml', qtd: 1 }] },
    // Bebidas
    { nome: 'Suco de Morango 500ml', cat: 'Bebidas', rend: 500, rendUn: 1, preco: 12.00, ings: [{ nome: 'Morango', qtd: 200 }, { nome: 'Açúcar Refinado', qtd: 30 }], embs: [{ nome: 'Pote Redondo 500ml', qtd: 1 }] },
    { nome: 'Suco de Limão 500ml', cat: 'Bebidas', rend: 500, rendUn: 1, preco: 8.00, ings: [{ nome: 'Limão', qtd: 150 }, { nome: 'Açúcar Refinado', qtd: 50 }], embs: [{ nome: 'Pote Redondo 500ml', qtd: 1 }] },
    { nome: 'Chocolate Quente 300ml', cat: 'Bebidas', rend: 300, rendUn: 1, preco: 10.00, ings: [{ nome: 'Leite Integral', qtd: 250 }, { nome: 'Cacau em Pó', qtd: 20 }, { nome: 'Açúcar Refinado', qtd: 20 }] },
    // Mais bolos
    { nome: 'Mini Bolo Chocolate', cat: 'Bolos', rend: 300, rendUn: 1, preco: 18.00, preps: [{ nome: 'Massa de Bolo de Chocolate', qtd: 200 }, { nome: 'Ganache de Chocolate', qtd: 80 }], embs: [{ nome: 'Caixa Kraft P', qtd: 1 }] },
    { nome: 'Bolo Cenoura c/ Chocolate', cat: 'Bolos', rend: 1000, rendUn: 1, preco: 40.00, ings: [{ nome: 'Farinha de Trigo', qtd: 250 }, { nome: 'Açúcar Refinado', qtd: 200 }, { nome: 'Ovos (dúzia)', qtd: 3 }, { nome: 'Óleo de Soja', qtd: 100 }], preps: [{ nome: 'Ganache de Chocolate', qtd: 150 }], embs: [{ nome: 'Caixa Kraft P', qtd: 1 }] },
    // Mais doces
    { nome: 'Bombom de Morango', cat: 'Doces', rend: 30, rendUn: 1, preco: 6.00, preps: [{ nome: 'Ganache de Chocolate', qtd: 15 }], ings: [{ nome: 'Morango', qtd: 15 }] },
    { nome: 'Torta de Limão', cat: 'Doces', rend: 800, rendUn: 1, preco: 55.00, ings: [{ nome: 'Farinha de Trigo', qtd: 150 }, { nome: 'Manteiga sem Sal', qtd: 60 }, { nome: 'Leite Condensado', qtd: 395 }, { nome: 'Limão', qtd: 200 }, { nome: 'Creme de Leite', qtd: 200 }], embs: [{ nome: 'Caixa Kraft M', qtd: 1 }] },
    { nome: 'Cheesecake de Frutas', cat: 'Doces', rend: 1000, rendUn: 1, preco: 90.00, ings: [{ nome: 'Cream Cheese', qtd: 300 }, { nome: 'Açúcar Refinado', qtd: 100 }, { nome: 'Ovos (dúzia)', qtd: 3 }, { nome: 'Manteiga sem Sal', qtd: 50 }], preps: [{ nome: 'Calda de Morango', qtd: 200 }], embs: [{ nome: 'Caixa Kraft G', qtd: 1 }] },
    // Mais salgados
    { nome: 'Esfiha de Carne (un)', cat: 'Salgados', rend: 70, rendUn: 1, preco: 5.50, ings: [{ nome: 'Farinha de Trigo', qtd: 30 }, { nome: 'Carne Moída', qtd: 25 }, { nome: 'Sal', qtd: 2 }] },
    { nome: 'Mini Pizza (un)', cat: 'Salgados', rend: 100, rendUn: 1, preco: 7.00, ings: [{ nome: 'Farinha de Trigo', qtd: 40 }, { nome: 'Queijo Mussarela', qtd: 30 }, { nome: 'Molho de Tomate', qtd: 20 }] },
    { nome: 'Cento de Salgados Misto', cat: 'Salgados', rend: 4000, rendUn: 1, preco: 180.00, ings: [{ nome: 'Farinha de Trigo', qtd: 1500 }, { nome: 'Peito de Frango', qtd: 500 }, { nome: 'Queijo Mussarela', qtd: 300 }, { nome: 'Carne Moída', qtd: 300 }, { nome: 'Ovos (dúzia)', qtd: 6 }, { nome: 'Sal', qtd: 20 }] },
    { nome: 'Marmita Grande Completa', cat: 'Marmitas', rend: 750, rendUn: 1, preco: 30.00, ings: [{ nome: 'Peito de Frango', qtd: 250 }, { nome: 'Sal', qtd: 3 }, { nome: 'Azeite Extra Virgem', qtd: 10 }], preps: [{ nome: 'Molho Bolonhesa', qtd: 100 }], embs: [{ nome: 'Marmitex Alumínio 750ml', qtd: 1 }] },
  ];

  const prodIds = {};
  for (const prod of produtos) {
    const r = await db.runAsync(
      'INSERT INTO produtos (nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades, preco_venda) VALUES (?,?,?,?,?,?)',
      [prod.nome, catProdIds[prod.cat], prod.rend, 'g', prod.rendUn, prod.preco]
    );
    const prodId = r.lastInsertRowId;
    prodIds[prod.nome] = prodId;

    // Add direct ingredients
    if (prod.ings) {
      for (const ing of prod.ings) {
        const mpId = insumoIds[ing.nome];
        if (mpId) {
          await db.runAsync('INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)', [prodId, mpId, ing.qtd]);
        }
      }
    }

    // Add preparos
    if (prod.preps) {
      for (const prep of prod.preps) {
        const prId = prepIds[prep.nome];
        if (prId) {
          await db.runAsync('INSERT INTO produto_preparos (produto_id, preparo_id, quantidade_utilizada) VALUES (?,?,?)', [prodId, prId, prep.qtd]);
        }
      }
    }

    // Add embalagens
    if (prod.embs) {
      for (const emb of prod.embs) {
        const eId = embIds[emb.nome];
        if (eId) {
          await db.runAsync('INSERT INTO produto_embalagens (produto_id, embalagem_id, quantidade_utilizada) VALUES (?,?,?)', [prodId, eId, emb.qtd]);
        }
      }
    }
  }

  // ========== DELIVERY ==========
  // Add some delivery products
  const deliveryProds = [
    { nome: 'Bolo Chocolate P - Delivery', preco: 52.00 },
    { nome: 'Bolo Morango - Delivery', preco: 90.00 },
    { nome: 'Marmita Frango - Delivery', preco: 26.00 },
    { nome: 'Marmita Carne - Delivery', preco: 29.00 },
    { nome: 'Kit 4 Brigadeiros', preco: 12.00 },
  ];
  const delProdIds = {};
  for (const dp of deliveryProds) {
    const r = await db.runAsync('INSERT INTO delivery_produtos (nome, preco_venda) VALUES (?,?)', [dp.nome, dp.preco]);
    delProdIds[dp.nome] = r.lastInsertRowId;
  }

  // Combos
  const combos = [
    { nome: 'Combo Festa P', preco: 120.00 },
    { nome: 'Combo Almoço Casal', preco: 45.00 },
    { nome: 'Combo Doces Sortidos', preco: 85.00 },
  ];
  for (const combo of combos) {
    await db.runAsync('INSERT INTO delivery_combos (nome, preco_venda) VALUES (?,?)', [combo.nome, combo.preco]);
  }

  // Plataformas
  const plataformas = [
    { nome: 'iFood', taxa: 0.12, comissao: 0.27, ativo: 1 },
    { nome: 'Rappi', taxa: 0.10, comissao: 0.25, ativo: 1 },
    { nome: 'Venda Direta', taxa: 0, comissao: 0, ativo: 1 },
  ];
  for (const p of plataformas) {
    await db.runAsync(
      'INSERT INTO delivery_config (plataforma, taxa_plataforma, comissao_app, ativo) VALUES (?,?,?,?)',
      [p.nome, p.taxa, p.comissao, p.ativo]
    );
  }

  // ========== DELIVERY ADICIONAIS ==========
  const adicionais = [
    { nome: 'Sachê Ketchup', custo: 0.15, preco: 0.00 },
    { nome: 'Sachê Mostarda', custo: 0.15, preco: 0.00 },
    { nome: 'Sachê Maionese', custo: 0.20, preco: 0.00 },
    { nome: 'Molho Extra (pote 50ml)', custo: 0.80, preco: 2.00 },
    { nome: 'Talheres Descartáveis', custo: 0.30, preco: 0.00 },
    { nome: 'Guardanapo Extra', custo: 0.10, preco: 0.00 },
    { nome: 'Cobertura Extra Chocolate', custo: 1.50, preco: 3.00 },
    { nome: 'Porção Extra Morango', custo: 2.00, preco: 4.00 },
  ];
  for (const ad of adicionais) {
    await db.runAsync(
      'INSERT INTO delivery_adicionais (nome, custo, preco_cobrado) VALUES (?,?,?)',
      [ad.nome, ad.custo, ad.preco]
    );
  }

  // ========== DELIVERY COMBO ITENS ==========
  // Link combo items to delivery products
  const comboRows = await db.getAllAsync('SELECT id, nome FROM delivery_combos');
  const delProdRows = await db.getAllAsync('SELECT id, nome FROM delivery_produtos');

  // Combo Festa P → Bolo Chocolate P Delivery + Kit 4 Brigadeiros
  const comboFesta = comboRows.find(c => c.nome === 'Combo Festa P');
  const delBoloChoc = delProdRows.find(d => d.nome === 'Bolo Chocolate P - Delivery');
  const delKit = delProdRows.find(d => d.nome === 'Kit 4 Brigadeiros');
  if (comboFesta && delBoloChoc) {
    await db.runAsync('INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?,?,?,?)', [comboFesta.id, 'delivery_produto', delBoloChoc.id, 1]);
  }
  if (comboFesta && delKit) {
    await db.runAsync('INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?,?,?,?)', [comboFesta.id, 'delivery_produto', delKit.id, 2]);
  }

  // Combo Almoço Casal → Marmita Frango + Marmita Carne
  const comboAlmoco = comboRows.find(c => c.nome === 'Combo Almoço Casal');
  const delMarmFrango = delProdRows.find(d => d.nome === 'Marmita Frango - Delivery');
  const delMarmCarne = delProdRows.find(d => d.nome === 'Marmita Carne - Delivery');
  if (comboAlmoco && delMarmFrango) {
    await db.runAsync('INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?,?,?,?)', [comboAlmoco.id, 'delivery_produto', delMarmFrango.id, 1]);
  }
  if (comboAlmoco && delMarmCarne) {
    await db.runAsync('INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?,?,?,?)', [comboAlmoco.id, 'delivery_produto', delMarmCarne.id, 1]);
  }

  // Combo Doces Sortidos → Bolo Morango + Kit 4 Brigadeiros
  const comboDoces = comboRows.find(c => c.nome === 'Combo Doces Sortidos');
  const delBoloMorango = delProdRows.find(d => d.nome === 'Bolo Morango - Delivery');
  if (comboDoces && delBoloMorango) {
    await db.runAsync('INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?,?,?,?)', [comboDoces.id, 'delivery_produto', delBoloMorango.id, 1]);
  }
  if (comboDoces && delKit) {
    await db.runAsync('INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?,?,?,?)', [comboDoces.id, 'delivery_produto', delKit.id, 3]);
  }

  // ========== CONFIGURAÇÃO FINANCEIRA ==========
  await db.runAsync(
    'INSERT OR REPLACE INTO configuracao (id, lucro_desejado, faturamento_mensal, margem_seguranca) VALUES (1, ?, ?, ?)',
    [0.25, 18000, 0.05]
  );

  // ========== FATURAMENTO MENSAL ==========
  const faturamentos = [
    { mes: 'Jan', valor: 14500 },
    { mes: 'Fev', valor: 13200 },
    { mes: 'Mar', valor: 16800 },
    { mes: 'Abr', valor: 15900 },
    { mes: 'Mai', valor: 17300 },
    { mes: 'Jun', valor: 19500 },
    { mes: 'Jul', valor: 18200 },
    { mes: 'Ago', valor: 20100 },
    { mes: 'Set', valor: 17800 },
    { mes: 'Out', valor: 21500 },
    { mes: 'Nov', valor: 23000 },
    { mes: 'Dez', valor: 28500 },
  ];
  for (const fat of faturamentos) {
    await db.runAsync('INSERT INTO faturamento_mensal (mes, valor) VALUES (?,?)', [fat.mes, fat.valor]);
  }

  // ========== DESPESAS FIXAS ==========
  const despFixas = [
    { desc: 'Aluguel', valor: 2800 },
    { desc: 'Energia Elétrica', valor: 650 },
    { desc: 'Água', valor: 180 },
    { desc: 'Gás', valor: 320 },
    { desc: 'Internet', valor: 130 },
    { desc: 'Telefone', valor: 80 },
    { desc: 'Contador', valor: 450 },
    { desc: 'Seguro do Ponto', valor: 190 },
    { desc: 'Sistema de Gestão', valor: 120 },
    { desc: 'Material de Limpeza', valor: 250 },
    { desc: 'Manutenção Equipamentos', valor: 200 },
    { desc: 'Salário Auxiliar', valor: 1800 },
  ];
  for (const df of despFixas) {
    await db.runAsync('INSERT INTO despesas_fixas (descricao, valor) VALUES (?,?)', [df.desc, df.valor]);
  }

  // ========== DESPESAS VARIÁVEIS ==========
  // Valores em decimal (0.06 = 6%)
  const despVar = [
    { desc: 'Impostos (Simples Nacional)', pct: 0.06 },
    { desc: 'Taxa Cartão de Crédito', pct: 0.035 },
    { desc: 'Taxa Cartão de Débito', pct: 0.018 },
    { desc: 'Comissão de Vendas', pct: 0.05 },
    { desc: 'Embalagem Delivery', pct: 0.02 },
    { desc: 'Perdas e Desperdício', pct: 0.03 },
  ];
  for (const dv of despVar) {
    await db.runAsync('INSERT INTO despesas_variaveis (descricao, percentual) VALUES (?,?)', [dv.desc, dv.pct]);
  }

  // ========== PERFIL DO NEGÓCIO ==========
  await db.runAsync(
    'INSERT OR REPLACE INTO perfil (id, nome_negocio, segmento, telefone) VALUES (1, ?, ?, ?)',
    ['Doce Sabor Confeitaria', 'Confeitaria e Alimentação', '(11) 98765-4321']
  );

  // Mark as seeded
  await db.runAsync('INSERT OR IGNORE INTO _seed_flag (id) VALUES (1)');
  console.log('Seed data inserted successfully!');
}
