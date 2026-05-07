import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Platform, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase, calcDespesasFixasPercentual, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo, calcLucroLiquido, calcMargemLiquida } from '../utils/calculations';
import EmptyState from '../components/EmptyState';
import Loader from '../components/Loader';
import usePersistedState from '../hooks/usePersistedState';

// Paleta de cores para chips de categoria — espelha o padrão de ProdutosListScreen
// para manter coerência visual entre telas que filtram por categoria.
const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

// Helper: extrai número finito ou 0
const safeNum = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function RelatorioSimplesScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [perfilNome, setPerfilNome] = useState('');
  const [loadError, setLoadError] = useState(null);
  // Lista bruta de categorias do BD (para renderizar chips)
  const [categorias, setCategorias] = useState([]);
  // Filtro persistido entre sessões. 'todas' = sem filtro (default).
  // Quando filtrado por categoria, guarda o id da categoria como número.
  const [filtroCategoria, setFiltroCategoria] = usePersistedState('relatorioSimples.filtroCategoria', 'todas');

  useFocusEffect(useCallback(() => {
    loadData();
  }, [filtroCategoria]));

  async function loadData() {
    setLoadError(null);
    try {
      setLoading(true);
      const db = await getDatabase();

      // Load ALL data in a single parallel batch
      // Load profile name
      try {
        const perfil = await db.getAllAsync('SELECT * FROM configuracao');
        if (perfil && perfil[0] && perfil[0].nome_negocio) setPerfilNome(perfil[0].nome_negocio);
        else setPerfilNome('Meu Negócio');
      } catch (e) {
        console.warn('[RelatorioSimples.perfilNome]', e);
        setPerfilNome('Meu Negócio');
      }

      const [fixas, variaveis, fat, configRows, prods, allIngs, allEmbs, allPreps, cats] = await Promise.all([
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT * FROM faturamento_mensal'),
        db.getAllAsync('SELECT * FROM configuracao'),
        db.getAllAsync('SELECT * FROM produtos'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT * FROM categorias_produtos ORDER BY nome'),
      ]);
      setCategorias(cats || []);
      const lucroDesejado = configRows?.[0]?.lucro_desejado || 0;

      const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
      const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0);
      const mesesComFat = fat.filter(f => f.valor > 0);
      const fatMedio = mesesComFat.length > 0
        ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length
        : 0;
      const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);

      // Build lookup maps
      const ingsByProd = {};
      allIngs.forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const embsByProd = {};
      allEmbs.forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });
      const prepsByProd = {};
      allPreps.forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });

      // Aplica filtro de categoria persistido. 'todas' mantém o conjunto completo;
      // qualquer outro valor restringe o agregado (insights, ponto de equilíbrio, etc.)
      // aos produtos da categoria escolhida — produtos sem categoria são excluídos
      // quando há filtro ativo, evitando ruído nos números traduzidos.
      const prodsFiltrados = filtroCategoria === 'todas'
        ? prods
        : prods.filter(p => p.categoria_id === filtroCategoria);

      const produtos = prodsFiltrados.map(p => {
        const custoIng = (ingsByProd[p.id] || []).reduce((a, i) => {
          return a + calcCustoIngrediente(i.preco_por_kg || 0, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida);
        }, 0);
        const custoPr = (prepsByProd[p.id] || []).reduce((a, pp) => {
          return a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g');
        }, 0);
        const custoEmb = (embsByProd[p.id] || []).reduce((a, e) => a + (e.preco_unitario || 0) * e.quantidade_utilizada, 0);

        const custoTotal = safeNum(custoIng) + safeNum(custoPr) + safeNum(custoEmb);
        const divisor = getDivisorRendimento(p);
        const custoUn = divisor > 0 ? safeNum(custoTotal / divisor) : 0;
        const precoVenda = safeNum(p.preco_venda);
        // Sessão 28.9 — Auditoria P0-02: usar funções centrais
        const despFixasVal = safeNum(precoVenda * dfPerc);
        const despVarVal = safeNum(precoVenda * totalVar);
        const lucro = calcLucroLiquido(precoVenda, custoUn, despFixasVal, despVarVal);
        const margem = calcMargemLiquida(precoVenda, custoUn, despFixasVal, despVarVal);

        return { ...p, custoUn, precoVenda, lucro, margem, margemReais: lucro, despFixasVal, despVarVal };
      });

      // Load delivery data
      let deliveryProdutos = [];
      try {
        deliveryProdutos = await db.getAllAsync('SELECT * FROM delivery_produtos');
      } catch (e) { /* no delivery table */ }

      // Build insights
      const produtosComPreco = produtos.filter(p => p.precoVenda > 0);

      // --- Resumo Geral (para cada R$10) ---
      // CMV: média ponderada pelo preço de venda de cada produto
      // Fixas e Variáveis: dados financeiros reais configurados pelo usuário
      let resumo = null;
      if (fatMedio > 0 && produtosComPreco.length > 0) {
        const totalReceita = produtosComPreco.reduce((a, p) => a + p.precoVenda, 0);
        const totalCustoIng = produtosComPreco.reduce((a, p) => a + p.custoUn, 0);
        const percIng = totalReceita > 0 ? totalCustoIng / totalReceita : 0;
        const percFixas = dfPerc;
        const percVar = totalVar;
        const percLucro = 1 - percIng - percFixas - percVar;

        resumo = {
          ingredientes: (percIng * 10).toFixed(2).replace('.', ','),
          fixas: (percFixas * 10).toFixed(2).replace('.', ','),
          variaveis: (percVar * 10).toFixed(2).replace('.', ','),
          lucro: (Math.abs(percLucro) * 10).toFixed(2).replace('.', ','),
          lucroPositivo: percLucro > 0,
          percIng, percFixas, percVar, percLucro,
          fatMedio,
        };
      }

      // --- Melhores produtos (top 3 por margem em R$) ---
      const melhores = [...produtosComPreco]
        .filter(p => p.margemReais > 0)
        .sort((a, b) => b.margemReais - a.margemReais)
        .slice(0, 3);

      // --- Atenção: margem < 10% ---
      const atencao = produtosComPreco.filter(p => p.margem < 0.10 && p.margem >= 0);

      // --- Ponto de equilíbrio ---
      let pontoEquilibrio = null;
      if (totalFixas > 0 && produtosComPreco.length > 0) {
        const margemMediaDecimal = produtosComPreco.reduce((a, p) => a + p.margem, 0) / produtosComPreco.length;
        if (margemMediaDecimal > 0) {
          const peDiario = (totalFixas / margemMediaDecimal) / 30;
          // Produto mais vendido = o de menor preço (mais acessível, proxy)
          const produtoRef = [...produtosComPreco].sort((a, b) => a.precoVenda - b.precoVenda)[0];
          const qtdEquiv = produtoRef && produtoRef.precoVenda > 0
            ? Math.ceil(peDiario / produtoRef.precoVenda)
            : 0;
          pontoEquilibrio = {
            valorDiario: peDiario,
            produtoNome: produtoRef?.nome || '',
            qtdProduto: qtdEquiv,
          };
        }
      }

      // --- Delivery vs Balcão ---
      let deliveryInsight = null;
      if (deliveryProdutos.length > 0) {
        const deliveryMap = {};
        deliveryProdutos.forEach(dp => { deliveryMap[dp.produto_id] = dp; });

        const comparacoes = [];
        for (const p of produtosComPreco) {
          const dp = deliveryMap[p.id];
          if (dp && dp.preco_delivery > 0) {
            const taxas = (dp.comissao_percent || 0) * dp.preco_delivery;
            const lucroDelivery = dp.preco_delivery - p.custoUn - p.despFixasVal - p.despVarVal - taxas;
            const diffPercent = p.lucro > 0 ? ((p.lucro - lucroDelivery) / p.lucro) * 100 : 0;
            if (diffPercent > 0) {
              comparacoes.push({ nome: p.nome, diffPercent });
            }
          }
        }
        if (comparacoes.length > 0) {
          const pior = comparacoes.sort((a, b) => b.diffPercent - a.diffPercent)[0];
          deliveryInsight = {
            produto: pior.nome,
            percentMenos: pior.diffPercent.toFixed(0),
          };
        }
      }

      // --- Tendência (simulada com base nos dados disponíveis) ---
      let tendencia = null;
      if (fat.length >= 2) {
        const sorted = [...fat].filter(f => f.valor > 0).sort((a, b) => {
          const da = `${a.ano}-${String(a.mes).padStart(2, '0')}`;
          const db2 = `${b.ano}-${String(b.mes).padStart(2, '0')}`;
          return da.localeCompare(db2);
        });
        if (sorted.length >= 2) {
          const ultimo = sorted[sorted.length - 1].valor;
          const penultimo = sorted[sorted.length - 2].valor;
          if (penultimo > 0) {
            const variacaoFat = ((ultimo - penultimo) / penultimo) * 100;
            // If costs stayed the same but revenue changed, margin changes
            const margemAtual = produtosComPreco.length > 0
              ? produtosComPreco.reduce((a, p) => a + p.margem, 0) / produtosComPreco.length
              : 0;
            const margemProjetada = margemAtual + (variacaoFat / 100 * 0.3); // simplified projection
            tendencia = {
              variacao: Math.abs(variacaoFat).toFixed(1).replace('.', ','),
              subiu: variacaoFat > 0,
              desceu: variacaoFat < 0,
              margemProjetada: (margemProjetada * 100).toFixed(1).replace('.', ','),
            };
          }
        }
      }

      // --- Histórico de faturamento (até 12 meses, ordem cronológica) ---
      const historicoFaturamento = [...fat]
        .sort((a, b) => {
          const da = `${a.ano}-${String(a.mes).padStart(2, '0')}`;
          const db2 = `${b.ano}-${String(b.mes).padStart(2, '0')}`;
          return da.localeCompare(db2);
        })
        .slice(-12)
        .map(f => ({
          label: `${String(f.mes).padStart(2, '0')}/${String(f.ano).slice(-2)}`,
          valor: safeNum(f.valor),
        }));

      // --- Top 5 produtos por lucro absoluto (margemReais) ---
      const topProdutos = [...produtosComPreco]
        .filter(p => p.margemReais > 0)
        .sort((a, b) => b.margemReais - a.margemReais)
        .slice(0, 5)
        .map(p => ({
          nome: p.nome,
          lucro: p.margemReais,
          margem: p.margem,
        }));

      // --- Sessão 28.8 — Precificação detalhada por produto ---
      // Para cada produto: nome, CMV (custo unitário), preço venda, lucro,
      // margem %, markup. Ordenado por nome para fácil consulta.
      const precificacao = [...produtosComPreco]
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
        .map(p => ({
          id: p.id,
          nome: p.nome,
          categoria_id: p.categoria_id,
          cmv: p.custoUn,                       // custo dos ingredientes/preparos/embalagens
          custoTotal: p.custoUn + p.despFixasVal + p.despVarVal, // custo + rateio
          precoVenda: p.precoVenda,
          lucro: p.margemReais,
          margem: p.margem,
          markup: p.custoUn > 0 ? p.precoVenda / p.custoUn : 0,
        }));

      // --- Margem média por categoria (top 5) ---
      const catsMap = {};
      (cats || []).forEach(c => { catsMap[c.id] = c.nome; });
      const margemPorCat = {};
      produtosComPreco.forEach(p => {
        if (!p.categoria_id) return;
        const key = p.categoria_id;
        if (!margemPorCat[key]) margemPorCat[key] = { nome: catsMap[key] || 'Sem nome', soma: 0, count: 0 };
        margemPorCat[key].soma += p.margem;
        margemPorCat[key].count += 1;
      });
      const margemPorCategoria = Object.values(margemPorCat)
        .map(c => ({ nome: c.nome, margem: c.count > 0 ? c.soma / c.count : 0 }))
        .sort((a, b) => b.margem - a.margem)
        .slice(0, 5);

      setData({
        resumo,
        precificacao,
        melhores,
        atencao,
        pontoEquilibrio,
        deliveryInsight,
        tendencia,
        // Sessão 28.8 — historicoFaturamento removido do JSX (já está no Painel/Financeiro)
        // mantido no objeto para retrocompatibilidade se alguém quiser readicionar
        historicoFaturamento,
        topProdutos,
        margemPorCategoria,
        totalProdutos: produtos.length,
        produtosComPreco: produtosComPreco.length,
      });
    } catch (e) {
      console.error('[RelatorioSimples.loadData]', e);
      setLoadError(e?.message || 'Não foi possível gerar o relatório.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader message="Traduzindo seus números em palavras..." />
      </View>
    );
  }

  // Monta um texto resumido (período, faturamento, top 3, alertas) para o Share nativo.
  function construirTextoResumido() {
    if (!data) return '';
    const linhas = [];
    linhas.push(`Relatório Precificaí — ${perfilNome || 'Meu Negócio'}`);
    linhas.push(new Date().toLocaleDateString('pt-BR'));
    linhas.push('');

    if (data.resumo) {
      linhas.push('Resumo (a cada R$ 10,00 que entra):');
      linhas.push(`• R$ ${data.resumo.ingredientes} ingredientes`);
      linhas.push(`• R$ ${data.resumo.fixas} custos do mês`);
      linhas.push(`• R$ ${data.resumo.variaveis} custos por venda`);
      linhas.push(`• R$ ${data.resumo.lucro} ${data.resumo.lucroPositivo ? 'de lucro' : '(prejuízo)'}`);
      if (data.resumo.fatMedio > 0) {
        linhas.push(`Faturamento médio: ${formatCurrency(data.resumo.fatMedio)}/mês`);
      }
      linhas.push('');
    }

    if (data.melhores && data.melhores.length > 0) {
      linhas.push('Top 3 produtos (lucro por unidade):');
      data.melhores.slice(0, 3).forEach((p, i) => {
        linhas.push(`${i + 1}. ${p.nome} — ${formatCurrency(p.margemReais)}`);
      });
      linhas.push('');
    }

    if (data.atencao && data.atencao.length > 0) {
      linhas.push(`Alertas: ${data.atencao.length} produto(s) com margem abaixo de 10%.`);
      data.atencao.slice(0, 3).forEach(p => {
        linhas.push(`• ${p.nome} (${formatCurrency(p.precoVenda)})`);
      });
      linhas.push('');
    }

    linhas.push('Gerado por Precificaí — www.precificaiapp.com');
    return linhas.join('\n');
  }

  async function handleShare() {
    try {
      const message = construirTextoResumido();
      await Share.share({ message, title: 'Relatório Precificaí' });
    } catch (e) {
      console.error('[RelatorioSimples.share]', e);
    }
  }

  function baixarRelatorio() {
    if (!data || Platform.OS !== 'web') return;

    const sections = [];

    if (data.resumo) {
      sections.push({
        title: 'Resumo Geral',
        text: `De cada R$ 10,00 que entra no caixa: R$ ${data.resumo.ingredientes} vai pra ingredientes, R$ ${data.resumo.fixas} vai pra custos do mês, R$ ${data.resumo.variaveis} vai pra custos por venda, e ${data.resumo.lucroPositivo ? 'sobram' : 'faltam'} R$ ${data.resumo.lucro} ${data.resumo.lucroPositivo ? 'de lucro' : '(prejuízo)'}.`,
      });
    }

    if (data.melhores && data.melhores.length > 0) {
      sections.push({
        title: 'Seus Melhores Produtos',
        text: data.melhores.map((p, i) =>
          i === 0
            ? `${p.nome} é seu campeão: você ganha ${formatCurrency(p.margemReais)} a cada unidade vendida.`
            : `${p.nome}: lucro de ${formatCurrency(p.margemReais)} por unidade.`
        ).join(' '),
      });
    }

    if (data.atencao && data.atencao.length > 0) {
      sections.push({
        title: 'Atenção',
        text: data.atencao.slice(0, 5).map(p => {
          const precoSugerido = p.custoUn > 0 ? p.custoUn / 0.30 : p.precoVenda * 1.15;
          return `${p.nome} está te custando quase o que você cobra. Considere aumentar de ${formatCurrency(p.precoVenda)} para ${formatCurrency(precoSugerido)}.`;
        }).join(' '),
      });
    }

    if (data.pontoEquilibrio) {
      let peText = `Você precisa vender pelo menos ${formatCurrency(data.pontoEquilibrio.valorDiario)} por dia para não ter prejuízo.`;
      if (data.pontoEquilibrio.produtoNome) {
        peText += ` Isso equivale a ${data.pontoEquilibrio.qtdProduto} unidades de ${data.pontoEquilibrio.produtoNome} por dia.`;
      }
      sections.push({ title: 'Ponto de Equilíbrio Traduzido', text: peText });
    }

    if (data.deliveryInsight) {
      sections.push({
        title: 'Delivery vs Balcão',
        text: `No iFood, seu ${data.deliveryInsight.produto} rende ${data.deliveryInsight.percentMenos}% menos que no balcão por causa das taxas.`,
      });
    }

    if (data.tendencia) {
      sections.push({
        title: 'Tendência',
        text: `Nos últimos meses, seu faturamento ${data.tendencia.subiu ? 'subiu' : 'desceu'} ${data.tendencia.variacao}%. Se continuar assim, em 3 meses sua margem será de ${data.tendencia.margemProjetada}%.`,
      });
    }

    // Sessão 28.17: HTML enriquecido pra ficar mais próximo visualmente do que aparece na tela
    // (KPIs em destaque, cards coloridos, melhores/atenção em listas, etc).
    const formatBR = (v) => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v;
    const melhoresHtml = (data.melhores || []).slice(0, 5).map((p, i) => `
      <li style="margin: 6px 0; padding: 8px 12px; background: #ecfdf5; border-left: 3px solid #16a34a; border-radius: 4px;">
        <strong>${i+1}. ${escapeHtml(p.nome || '')}</strong>
        <span style="color: #16a34a; float: right;">+${formatCurrency(p.margemReais || 0)}/un</span>
      </li>
    `).join('');
    const atencaoHtml = (data.atencao || []).slice(0, 5).map(p => `
      <li style="margin: 6px 0; padding: 8px 12px; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 4px;">
        <strong>⚠️ ${escapeHtml(p.nome || '')}</strong>
        <span style="color: #6b7280; float: right;">${formatCurrency(p.precoVenda || 0)} (CMV ${formatCurrency(p.custoUn || 0)})</span>
      </li>
    `).join('');

    // Sessão 28.39: GRÁFICO DE BARRAS CSS — top 8 produtos por margem.
    // Sem libs externas (CSS puro funciona em window.print). Cada barra é um
    // div com width proporcional ao maior valor.
    const todosProdutosOrdenados = [...(data.produtosTodos || data.melhores || [])]
      .filter(p => Number(p.margemReais) > 0)
      .sort((a, b) => Number(b.margemReais) - Number(a.margemReais))
      .slice(0, 10);
    const maxMargem = todosProdutosOrdenados.length > 0
      ? Math.max(...todosProdutosOrdenados.map(p => Number(p.margemReais) || 0))
      : 1;
    const graficoMargemHtml = todosProdutosOrdenados.length > 0 ? `
      <div class="card">
        <h3>📊 Margem por produto (top 10)</h3>
        <p style="color: #6b7280; margin: 0 0 12px 0; font-size: 13px;">
          Visualização do lucro líquido por unidade vendida.
        </p>
        ${todosProdutosOrdenados.map(p => {
          const valor = Number(p.margemReais) || 0;
          const percent = maxMargem > 0 ? (valor / maxMargem) * 100 : 0;
          return `
            <div style="margin: 8px 0;">
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                <span style="color: #1f2937; font-weight: 500;">${escapeHtml(p.nome || '')}</span>
                <span style="color: #16a34a; font-weight: 700;">${formatCurrency(valor)}</span>
              </div>
              <div style="background: #f3f4f6; border-radius: 4px; height: 14px; overflow: hidden;">
                <div style="width: ${percent.toFixed(1)}%; height: 100%; background: linear-gradient(90deg, #004d47, #00897b); -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    // Filtro de categoria — destaque visual no topo do PDF se aplicável.
    const _categoriaAtivaNomeNoPdf = filtroCategoria === 'todas'
      ? null
      : (categorias.find(c => c.id === filtroCategoria)?.nome || null);
    const filtroCatHtml = _categoriaAtivaNomeNoPdf
      ? `<div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 10px 14px; border-radius: 4px; margin-bottom: 14px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
          <strong style="color: #92400e;">📌 Filtrado por categoria:</strong>
          <span style="color: #78350f;"> ${escapeHtml(_categoriaAtivaNomeNoPdf)}</span>
        </div>`
      : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório Precificaí — ${escapeHtml(perfilNome)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; max-width: 820px; margin: 0 auto; padding: 24px; color: #1f2937; background: #f9fafb; }
      .header { background: linear-gradient(135deg, #004d47 0%, #00695c 100%); color: white; padding: 28px 32px; border-radius: 12px; margin-bottom: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .header h1 { margin: 0 0 6px 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px; }
      .header .sub { margin: 0; opacity: 0.92; font-size: 15px; }
      .header .date { margin: 8px 0 0 0; opacity: 0.78; font-size: 13px; }
      .kpi-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
      .kpi { flex: 1 1 160px; background: white; padding: 16px; border-radius: 10px; border: 1px solid #e5e7eb; }
      .kpi-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
      .kpi-value { font-size: 22px; font-weight: 800; color: #004d47; }
      .card { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 14px; page-break-inside: avoid; }
      .card h3 { margin: 0 0 10px 0; color: #004d47; font-size: 17px; font-weight: 700; }
      .card p { margin: 0; line-height: 1.65; color: #374151; font-size: 14px; }
      ul.list { list-style: none; padding: 0; margin: 8px 0 0 0; }
      .footer { text-align: center; color: #9ca3af; margin-top: 30px; padding-top: 18px; border-top: 1px solid #e5e7eb; font-size: 12px; }
      @media print {
        body { background: white; padding: 0; }
        .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .kpi, .card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style></head><body>
    <div class="header">
      <h1>Precificaí</h1>
      <p class="sub">${escapeHtml(perfilNome)} — Relatório de gestão</p>
      <p class="date">Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
    </div>
    ${filtroCatHtml}
    ${data.resumo ? `<div class="kpi-row">
      <div class="kpi"><div class="kpi-label">Faturamento</div><div class="kpi-value">${formatCurrency(data.resumo.faturamento || 0)}</div></div>
      <div class="kpi"><div class="kpi-label">Lucro</div><div class="kpi-value" style="color: ${data.resumo.lucroPositivo ? '#16a34a' : '#dc2626'};">R$ ${formatBR(data.resumo.lucro)}</div></div>
      <div class="kpi"><div class="kpi-label">Custos do mês</div><div class="kpi-value">R$ ${formatBR(data.resumo.fixas)}</div></div>
    </div>` : ''}
    ${sections.map(s => `<div class="card"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.text)}</p></div>`).join('')}
    ${melhoresHtml ? `<div class="card"><h3>🏆 Top 5 — seus campeões</h3><ul class="list">${melhoresHtml}</ul></div>` : ''}
    ${atencaoHtml ? `<div class="card"><h3>⚠️ Atenção — produtos com margem apertada</h3><ul class="list">${atencaoHtml}</ul></div>` : ''}
    ${graficoMargemHtml}
    <p class="footer">Gerado por Precificaí · www.precificaiapp.com</p>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  }

  // Nome da categoria atualmente filtrada — usado no badge "Filtrando: X".
  const categoriaAtivaNome = filtroCategoria === 'todas'
    ? null
    : (categorias.find(c => c.id === filtroCategoria)?.nome || null);

  if (!data || data.totalProdutos === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <EmptyState
          icon="file-text"
          title={categoriaAtivaNome
            ? `Nenhum produto na categoria "${categoriaAtivaNome}"`
            : 'Nenhum produto cadastrado'}
          description={categoriaAtivaNome
            ? 'Limpe o filtro para ver o relatório completo, ou cadastre produtos nessa categoria.'
            : 'Cadastre seus produtos para ver o relatório simplificado.'}
        />
        {categoriaAtivaNome && (
          <TouchableOpacity
            style={styles.clearFilterBtnStandalone}
            activeOpacity={0.7}
            onPress={() => setFiltroCategoria('todas')}
            accessibilityRole="button"
            accessibilityLabel="Limpar filtro de categoria"
          >
            <Feather name="x" size={14} color={colors.primary} />
            <Text style={styles.clearFilterBtnText}>Limpar filtro</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loadError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={16} color={colors.error} style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>{loadError}</Text>
          <TouchableOpacity onPress={loadData} style={styles.errorBannerBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Tentar carregar relatório novamente">
            <Text style={styles.errorBannerBtnText}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Header */}
      <View style={styles.header}>
        <Feather name="book-open" size={24} color={colors.primary} />
        <Text style={styles.headerTitle}>Relatório</Text>
        <Text style={styles.headerSub}>Seus números traduzidos em linguagem simples</Text>
      </View>

      {/* Filtro por categoria — chips horizontais. 'Todas' é o estado neutro
          (sem filtro). Selecionar a categoria já ativa volta para 'Todas'. */}
      {categorias.length > 0 && (
        <View
          accessibilityRole="toolbar"
          accessibilityLabel="Filtrar relatório por categoria"
          style={styles.filtroBlock}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtrosList}
            nestedScrollEnabled
          >
            {[{ id: 'todas', nome: 'Todas' }, ...categorias].map((item, index) => {
              const isActive = filtroCategoria === item.id;
              const chipColor = item.id === 'todas' ? colors.primary : getCategoryColor(index - 1);
              return (
                <TouchableOpacity
                  key={String(item.id)}
                  style={[styles.filtroChip, isActive && { backgroundColor: chipColor, borderColor: chipColor }]}
                  onPress={() => setFiltroCategoria(item.id === filtroCategoria ? 'todas' : item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={item.id === 'todas'
                    ? 'Mostrar todas as categorias'
                    : `Filtrar por categoria ${item.nome}`}
                >
                  {item.id === 'todas' ? (
                    <Feather name="list" size={11} color={isActive ? '#fff' : colors.textSecondary} style={{ marginRight: 3 }} />
                  ) : (
                    <View style={[styles.chipDot, { backgroundColor: isActive ? '#fff' : chipColor }]} />
                  )}
                  <Text style={[styles.filtroTexto, isActive && styles.filtroTextoAtivo]} numberOfLines={1}>
                    {item.nome}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Indicador de filtro ativo + botão limpar */}
      {categoriaAtivaNome && (
        <View style={styles.filtroAtivoBadge} accessibilityRole="status">
          <Feather name="filter" size={13} color={colors.primary} />
          <Text style={styles.filtroAtivoText} numberOfLines={1}>
            Filtrando: <Text style={styles.filtroAtivoNome}>{categoriaAtivaNome}</Text>
          </Text>
          <TouchableOpacity
            onPress={() => setFiltroCategoria('todas')}
            style={styles.filtroLimparBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Limpar filtro de categoria"
          >
            <Feather name="x" size={12} color={colors.primary} />
            <Text style={styles.filtroLimparText}>Limpar filtro</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Download button */}
      {Platform.OS === 'web' && (
        <TouchableOpacity
          style={styles.downloadBtn}
          activeOpacity={0.7}
          onPress={baixarRelatorio}
          accessibilityRole="button"
          accessibilityLabel="Baixar relatório completo em PDF"
        >
          <Feather name="download" size={16} color="#fff" />
          <Text style={styles.downloadBtnText}>Baixar Relatório Completo</Text>
        </TouchableOpacity>
      )}

      {/* Share button (mobile-only) */}
      {Platform.OS !== 'web' && (
        <TouchableOpacity
          style={styles.downloadBtn}
          activeOpacity={0.7}
          onPress={handleShare}
          accessibilityRole="button"
          accessibilityLabel="Compartilhar resumo do relatório"
        >
          <Feather name="share-2" size={16} color="#fff" />
          <Text style={styles.downloadBtnText}>Compartilhar</Text>
        </TouchableOpacity>
      )}

      {/* Resumo Geral */}
      {data.resumo && (
        <View style={[styles.card, styles.cardResumo]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
              <Feather name="pie-chart" size={18} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Resumo Geral</Text>
          </View>
          <Text style={styles.cardText}>
            De cada{' '}
            <Text style={styles.highlight}>R$ 10,00</Text>
            {' '}que entra no seu caixa:
          </Text>
          <View style={styles.breakdownList}>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.coral }]} />
              <Text style={styles.breakdownText}>
                <Text style={styles.breakdownValue}>R$ {data.resumo.ingredientes}</Text> vai pra ingredientes
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.accent }]} />
              <Text style={styles.breakdownText}>
                <Text style={styles.breakdownValue}>R$ {data.resumo.fixas}</Text> vai pra custos do mês
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.purple }]} />
              <Text style={styles.breakdownText}>
                <Text style={styles.breakdownValue}>R$ {data.resumo.variaveis}</Text> vai pra custos por venda
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: data.resumo.lucroPositivo ? colors.success : colors.error }]} />
              <Text style={styles.breakdownText}>
                {data.resumo.lucroPositivo ? 'e sobram ' : 'e faltam '}
                <Text style={[styles.breakdownValue, { color: data.resumo.lucroPositivo ? colors.success : colors.error }]}>
                  R$ {data.resumo.lucro}
                </Text>
                {data.resumo.lucroPositivo ? ' de lucro' : ' (prejuízo)'}
              </Text>
            </View>
          </View>

          {/* Pie Chart */}
          {Platform.OS === 'web' && (() => {
            const slices = [
              { label: 'CMV', color: colors.coral, pct: data.resumo.percIng },
              { label: 'Fixas', color: colors.accent, pct: data.resumo.percFixas },
              { label: 'Variáveis', color: colors.purple, pct: data.resumo.percVar },
              { label: data.resumo.lucroPositivo ? 'Lucro' : 'Prejuízo', color: data.resumo.lucroPositivo ? colors.success : colors.error, pct: Math.abs(data.resumo.percLucro) },
            ];
            // Calculate label positions (angle midpoint of each slice)
            let cumAngle = 0;
            const labelPositions = slices.map(s => {
              const midAngle = cumAngle + (s.pct * 360) / 2;
              cumAngle += s.pct * 360;
              const rad = (midAngle - 90) * Math.PI / 180;
              const r = 55; // radius for label placement
              return { x: 90 + r * Math.cos(rad), y: 90 + r * Math.sin(rad), pctStr: (s.pct * 100).toFixed(1) };
            });
            return (
              <View style={styles.chartContainer}>
                <View style={{ position: 'relative', width: 180, height: 180 }}>
                  <View
                    style={[styles.pieChart, {
                      width: 180, height: 180, borderRadius: 90,
                      backgroundImage: `conic-gradient(${colors.coral} 0deg ${data.resumo.percIng * 360}deg, ${colors.accent} ${data.resumo.percIng * 360}deg ${(data.resumo.percIng + data.resumo.percFixas) * 360}deg, ${colors.purple} ${(data.resumo.percIng + data.resumo.percFixas) * 360}deg ${(data.resumo.percIng + data.resumo.percFixas + data.resumo.percVar) * 360}deg, ${data.resumo.lucroPositivo ? colors.success : colors.error} ${(data.resumo.percIng + data.resumo.percFixas + data.resumo.percVar) * 360}deg 360deg)`,
                    }]}
                  />
                  {slices.map((s, i) => s.pct >= 0.04 && (
                    <View key={i} style={{ position: 'absolute', left: labelPositions[i].x - 18, top: labelPositions[i].y - 8, width: 36, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontFamily: fontFamily.bold, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
                        {labelPositions[i].pctStr}%
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.chartLegend}>
                  {[
                    { label: 'CMV (Ingredientes)', color: colors.coral, pct: (data.resumo.percIng * 100).toFixed(1) },
                    { label: 'Custos do mês', color: colors.accent, pct: (data.resumo.percFixas * 100).toFixed(1) },
                    { label: 'Custos por venda', color: colors.purple, pct: (data.resumo.percVar * 100).toFixed(1) },
                    { label: data.resumo.lucroPositivo ? 'Lucro' : 'Prejuízo', color: data.resumo.lucroPositivo ? colors.success : colors.error, pct: (Math.abs(data.resumo.percLucro) * 100).toFixed(1) },
                  ].map(item => (
                    <View key={item.label} style={styles.chartLegendItem}>
                      <View style={[styles.chartLegendDot, { backgroundColor: item.color }]} />
                      <Text style={styles.chartLegendText}>{item.label}: {item.pct}%</Text>
                    </View>
                  ))}
                </View>
                {data.resumo.fatMedio > 0 && (
                  <Text style={styles.chartCaption}>
                    Base: faturamento médio de {formatCurrency(data.resumo.fatMedio)}/mês
                  </Text>
                )}
              </View>
            );
          })()}
        </View>
      )}

      {/* Sessão 28.8 — Precificação detalhada por produto */}
      {data.precificacao && data.precificacao.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
              <Feather name="dollar-sign" size={18} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Precificação por Produto</Text>
          </View>
          <Text style={styles.cardText}>
            {data.precificacao.length} produto{data.precificacao.length === 1 ? '' : 's'} com preço de venda. Toque em cada linha para editar.
          </Text>

          {/* Cabeçalho da tabela (só desktop) */}
          {Platform.OS === 'web' && (
            <View style={styles.precHeader}>
              <Text style={[styles.precHeaderText, { flex: 2 }]}>Produto</Text>
              <Text style={[styles.precHeaderText, { flex: 1, textAlign: 'right' }]}>CMV</Text>
              <Text style={[styles.precHeaderText, { flex: 1, textAlign: 'right' }]}>Preço</Text>
              <Text style={[styles.precHeaderText, { flex: 1, textAlign: 'right' }]}>Lucro</Text>
              <Text style={[styles.precHeaderText, { flex: 0.8, textAlign: 'right' }]}>Margem</Text>
            </View>
          )}

          {data.precificacao.map((p, idx) => {
            const margemPos = p.margem >= 0.10;
            const margemAlerta = p.margem < 0.10 && p.margem >= 0;
            const margemNeg = p.margem < 0;
            const corMargem = margemPos ? colors.success : margemAlerta ? colors.warning : colors.error;

            // Layout desktop: linha de tabela
            if (Platform.OS === 'web') {
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.precRow, idx % 2 === 0 && styles.precRowEven]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Produtos', { screen: 'ProdutosList', params: { openProductEdit: p.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${p.nome}`}
                >
                  <Text style={[styles.precCell, { flex: 2 }]} numberOfLines={1}>{p.nome}</Text>
                  <Text style={[styles.precCell, { flex: 1, textAlign: 'right' }]}>{formatCurrency(p.cmv)}</Text>
                  <Text style={[styles.precCell, { flex: 1, textAlign: 'right', fontWeight: '600' }]}>{formatCurrency(p.precoVenda)}</Text>
                  <Text style={[styles.precCell, { flex: 1, textAlign: 'right', color: p.lucro >= 0 ? colors.success : colors.error }]}>{formatCurrency(p.lucro)}</Text>
                  <Text style={[styles.precCell, { flex: 0.8, textAlign: 'right', color: corMargem, fontWeight: '600' }]}>{formatPercent(p.margem)}</Text>
                </TouchableOpacity>
              );
            }
            // Layout mobile: card empilhado
            return (
              <TouchableOpacity
                key={p.id}
                style={styles.precCardMobile}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Produtos', { screen: 'ProdutosList', params: { openProductEdit: p.id } })}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${p.nome}`}
              >
                <View style={styles.precCardHeader}>
                  <Text style={styles.precCardTitle} numberOfLines={1}>{p.nome}</Text>
                  <View style={[styles.precMargemBadge, { backgroundColor: corMargem + '15' }]}>
                    <Text style={[styles.precMargemBadgeText, { color: corMargem }]}>{formatPercent(p.margem)}</Text>
                  </View>
                </View>
                <View style={styles.precCardGrid}>
                  <View style={styles.precCardItem}>
                    <Text style={styles.precCardItemLabel}>CMV</Text>
                    <Text style={styles.precCardItemValue}>{formatCurrency(p.cmv)}</Text>
                  </View>
                  <View style={styles.precCardItem}>
                    <Text style={styles.precCardItemLabel}>Preço Venda</Text>
                    <Text style={[styles.precCardItemValue, { fontWeight: '700' }]}>{formatCurrency(p.precoVenda)}</Text>
                  </View>
                  <View style={styles.precCardItem}>
                    <Text style={styles.precCardItemLabel}>Lucro/un</Text>
                    <Text style={[styles.precCardItemValue, { color: p.lucro >= 0 ? colors.success : colors.error }]}>{formatCurrency(p.lucro)}</Text>
                  </View>
                  <View style={styles.precCardItem}>
                    <Text style={styles.precCardItemLabel}>Markup</Text>
                    <Text style={styles.precCardItemValue}>{p.markup ? p.markup.toFixed(2) + '×' : '—'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Melhores Produtos */}
      {data.melhores.length > 0 && (
        <View style={[styles.card, styles.cardSuccess]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.success + '15' }]}>
              <Feather name="award" size={18} color={colors.success} />
            </View>
            <Text style={styles.cardTitle}>Seus Melhores Produtos</Text>
          </View>
          {data.melhores.map((p, i) => (
            <View key={p.id} style={styles.insightRow}>
              <Feather
                name="check-circle"
                size={16}
                color={colors.success}
                style={{ marginRight: 8, marginTop: 2 }}
              />
              <Text style={styles.cardText}>
                {i === 0 ? (
                  <>
                    O <Text style={styles.highlightSuccess}>{p.nome}</Text> é seu campeão: você ganha{' '}
                    <Text style={styles.highlightSuccess}>{formatCurrency(p.margemReais)}</Text> a cada unidade vendida
                  </>
                ) : (
                  <>
                    <Text style={styles.highlightSuccess}>{p.nome}</Text>: lucro de{' '}
                    <Text style={styles.highlightSuccess}>{formatCurrency(p.margemReais)}</Text> por unidade
                  </>
                )}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Atenção */}
      {data.atencao.length > 0 && (
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.warning + '15' }]}>
              <Feather name="alert-triangle" size={18} color={colors.warning} />
            </View>
            <Text style={styles.cardTitle}>Atenção!</Text>
          </View>
          {data.atencao.slice(0, 5).map(p => {
            const precoSugerido = p.custoUn > 0 ? p.custoUn / 0.30 : p.precoVenda * 1.15;
            return (
              <View key={p.id} style={styles.insightRow}>
                <Feather
                  name="alert-circle"
                  size={16}
                  color={colors.warning}
                  style={{ marginRight: 8, marginTop: 2 }}
                />
                <Text style={styles.cardText}>
                  <Text style={styles.highlightWarning}>{p.nome}</Text> está te custando quase o que você cobra.
                  Considere aumentar de{' '}
                  <Text style={styles.highlightWarning}>{formatCurrency(p.precoVenda)}</Text> para{' '}
                  <Text style={styles.highlightWarning}>{formatCurrency(precoSugerido)}</Text>
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Ponto de Equilíbrio */}
      {data.pontoEquilibrio && (
        <View style={[styles.card]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.accent + '15' }]}>
              <Feather name="target" size={18} color={colors.accent} />
            </View>
            <Text style={[styles.cardTitle, { letterSpacing: 0.5 }]}>Ponto de Equilíbrio Traduzido</Text>
          </View>
          <View style={styles.insightRow}>
            <Feather name="info" size={16} color={colors.accent} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.cardText}>
              Você precisa vender pelo menos{' '}
              <Text style={styles.highlightAccent}>{formatCurrency(data.pontoEquilibrio.valorDiario)}</Text>
              {' '}por dia para não ter prejuízo.
              {data.pontoEquilibrio.produtoNome ? (
                <>
                  {' '}Isso equivale a{' '}
                  <Text style={styles.highlightAccent}>{data.pontoEquilibrio.qtdProduto}</Text>
                  {' '}unidades de {data.pontoEquilibrio.produtoNome} por dia.
                </>
              ) : null}
            </Text>
          </View>
        </View>
      )}

      {/* Delivery vs Balcão */}
      {data.deliveryInsight && (
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.warning + '15' }]}>
              <Feather name="truck" size={18} color={colors.warning} />
            </View>
            <Text style={styles.cardTitle}>Delivery vs Balcão</Text>
          </View>
          <View style={styles.insightRow}>
            <Feather name="alert-circle" size={16} color={colors.warning} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.cardText}>
              No iFood, seu <Text style={styles.highlightWarning}>{data.deliveryInsight.produto}</Text> rende{' '}
              <Text style={styles.highlightWarning}>{data.deliveryInsight.percentMenos}%</Text> menos que no balcão por causa das taxas
            </Text>
          </View>
        </View>
      )}

      {/* Tendência */}
      {data.tendencia && (
        <View style={[styles.card, data.tendencia.subiu ? styles.cardSuccess : styles.cardError]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: (data.tendencia.subiu ? colors.success : colors.error) + '15' }]}>
              <Feather
                name={data.tendencia.subiu ? 'trending-up' : 'trending-down'}
                size={18}
                color={data.tendencia.subiu ? colors.success : colors.error}
              />
            </View>
            <Text style={styles.cardTitle}>Tendência</Text>
          </View>
          <View style={styles.insightRow}>
            <Feather
              name="activity"
              size={16}
              color={data.tendencia.subiu ? colors.success : colors.error}
              style={{ marginRight: 8, marginTop: 2 }}
            />
            <Text style={styles.cardText}>
              Nos últimos meses, seu faturamento{' '}
              {data.tendencia.subiu ? 'subiu' : 'desceu'}{' '}
              <Text style={data.tendencia.subiu ? styles.highlightSuccess : styles.highlightError}>
                {data.tendencia.variacao}%
              </Text>.
              {' '}Se continuar assim, em 3 meses sua margem será de{' '}
              <Text style={data.tendencia.subiu ? styles.highlightSuccess : styles.highlightError}>
                {data.tendencia.margemProjetada}%
              </Text>
            </Text>
          </View>
        </View>
      )}

      {/* Sessão 28.8 — Histórico de Faturamento removido daqui.
          Visualização disponível em Painel/Financeiro (evita duplicação
          de informação financeira no relatório de precificação). */}

      {/* Top 5 Produtos por Lucro */}
      {data.topProdutos && data.topProdutos.length > 0 && (() => {
        const maxL = Math.max(...data.topProdutos.map(p => p.lucro)) || 1;
        return (
          <View style={[styles.card]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconCircle, { backgroundColor: colors.success + '15' }]}>
                <Feather name="trending-up" size={18} color={colors.success} />
              </View>
              <Text style={styles.cardTitle}>Top {data.topProdutos.length} por Lucro</Text>
            </View>
            <View style={{ marginTop: spacing.sm }}>
              {data.topProdutos.map((p, i) => {
                const pct = (p.lucro / maxL) * 100;
                return (
                  <View key={i} style={styles.hbarRow}>
                    <Text style={styles.hbarName} numberOfLines={1}>{p.nome}</Text>
                    <View style={styles.hbarTrack}>
                      <View style={[styles.hbarFill, { width: `${pct}%`, backgroundColor: colors.success }]} />
                    </View>
                    <Text style={styles.hbarValue}>{formatCurrency(p.lucro)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })()}

      {/* Margem média por categoria */}
      {data.margemPorCategoria && data.margemPorCategoria.length > 0 && (() => {
        const maxM = Math.max(...data.margemPorCategoria.map(c => Math.abs(c.margem))) || 1;
        return (
          <View style={[styles.card]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconCircle, { backgroundColor: colors.accent + '15' }]}>
                <Feather name="layers" size={18} color={colors.accent} />
              </View>
              <Text style={styles.cardTitle}>Margem Média por Categoria</Text>
            </View>
            <View style={{ marginTop: spacing.sm }}>
              {data.margemPorCategoria.map((c, i) => {
                const pct = (Math.abs(c.margem) / maxM) * 100;
                const positiva = c.margem >= 0;
                return (
                  <View key={i} style={styles.hbarRow}>
                    <Text style={styles.hbarName} numberOfLines={1}>{c.nome}</Text>
                    <View style={styles.hbarTrack}>
                      <View style={[styles.hbarFill, { width: `${pct}%`, backgroundColor: positiva ? colors.accent : colors.error }]} />
                    </View>
                    <Text style={styles.hbarValue}>{formatPercent(c.margem)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })()}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
    padding: spacing.md,
  },

  // Bar chart vertical (histórico)
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: 4,
    height: 160,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  barTrack: {
    width: '100%',
    height: 130,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: '70%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    marginTop: 4,
  },

  // Bar chart horizontal (top produtos / categorias)
  // Sessão 28.8 — Tabela/cards de Precificação por Produto
  precHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: spacing.sm,
  },
  precHeaderText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  precRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  precRowEven: {
    backgroundColor: colors.background,
  },
  precCell: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.text,
  },
  precCardMobile: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: 12,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  precCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  precCardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  precMargemBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  precMargemBadgeText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  precCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  precCardItem: {
    flex: 1,
    minWidth: '47%',
    paddingVertical: 4,
  },
  precCardItemLabel: {
    fontSize: 10,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  precCardItemValue: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    color: colors.text,
  },
  hbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    gap: 6,
  },
  hbarName: {
    width: 90,
    fontSize: fonts.tiny,
    color: colors.text,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  hbarTrack: {
    flex: 1,
    height: 12,
    backgroundColor: colors.inputBg,
    borderRadius: 6,
    overflow: 'hidden',
  },
  hbarFill: {
    height: '100%',
    borderRadius: 6,
  },
  hbarValue: {
    width: 70,
    textAlign: 'right',
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },

  // Download button
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: spacing.md,
    alignSelf: 'center',
  },
  downloadBtnText: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: '#fff',
  },

  // Loading / Empty
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fonts.regular,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  emptyTitle: {
    marginTop: spacing.md,
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  emptyDesc: {
    marginTop: spacing.xs,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: fonts.title,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  headerSub: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  cardResumo: {
    borderLeftColor: colors.primary,
  },
  cardSuccess: {
    borderLeftColor: colors.success,
  },
  cardWarning: {
    borderLeftColor: colors.warning,
  },
  cardError: {
    borderLeftColor: colors.error,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm + 4,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  cardTitle: {
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },

  cardText: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 24,
  },

  // Breakdown list (resumo geral)
  breakdownList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
    marginTop: 7,
  },
  breakdownText: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 24,
    flex: 1,
  },
  breakdownValue: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },

  // Insight row
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },

  // Highlights
  highlight: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    fontSize: fonts.large,
  },
  highlightSuccess: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.success,
  },
  highlightWarning: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.warning,
  },
  highlightAccent: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.accent,
  },
  highlightError: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.error,
  },

  // Pie chart
  chartContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  pieChart: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  chartLegend: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  chartLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  chartLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  chartLegendText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    color: colors.text,
  },
  chartCaption: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderLeftWidth: 3, borderLeftColor: colors.error,
    padding: spacing.sm, borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    flex: 1, fontSize: fonts.small, color: colors.error,
    fontFamily: fontFamily.regular,
  },
  errorBannerBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.error, borderRadius: borderRadius.sm,
    marginLeft: 8,
  },
  errorBannerBtnText: {
    fontSize: fonts.tiny, color: '#fff',
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },

  // Filtro por categoria — chips reutilizam o visual de ProdutosListScreen
  filtroBlock: {
    marginBottom: spacing.sm,
  },
  filtrosList: {
    paddingHorizontal: 0,
    gap: 2,
  },
  filtroChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginRight: 2,
  },
  chipDot: {
    width: 6, height: 6, borderRadius: 3, marginRight: 4,
  },
  filtroTexto: {
    fontSize: 11, fontWeight: '600', color: colors.text, maxWidth: 90,
    fontFamily: fontFamily.semiBold,
  },
  filtroTextoAtivo: { color: '#fff' },

  // Badge "Filtrando: X" + botão limpar
  filtroAtivoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '12',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: spacing.md,
    gap: 6,
  },
  filtroAtivoText: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
  },
  filtroAtivoNome: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
  },
  filtroLimparBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  filtroLimparText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.primary,
  },

  // Botão limpar filtro standalone (estado vazio)
  clearFilterBtnStandalone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  clearFilterBtnText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.primary,
  },
});
