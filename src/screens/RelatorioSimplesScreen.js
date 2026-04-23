import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Platform, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase, calcDespesasFixasPercentual, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';
import EmptyState from '../components/EmptyState';
import Loader from '../components/Loader';

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

  useFocusEffect(useCallback(() => {
    loadData();
  }, []));

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

      const [fixas, variaveis, fat, configRows, prods, allIngs, allEmbs, allPreps] = await Promise.all([
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT * FROM faturamento_mensal'),
        db.getAllAsync('SELECT * FROM configuracao'),
        db.getAllAsync('SELECT * FROM produtos'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      ]);
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

      const produtos = prods.map(p => {
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
        const despFixasVal = safeNum(precoVenda * dfPerc);
        const despVarVal = safeNum(precoVenda * totalVar);
        const lucro = precoVenda - custoUn - despFixasVal - despVarVal;
        const margem = precoVenda > 0 ? safeNum(lucro / precoVenda) : 0;

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

      setData({
        resumo,
        melhores,
        atencao,
        pontoEquilibrio,
        deliveryInsight,
        tendencia,
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

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório Precificaí</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
      .header { background: #004d47; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
      .header h1 { margin: 0 0 8px 0; font-size: 24px; }
      .header p { margin: 4px 0; opacity: 0.9; }
      .card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
      .card h3 { margin: 0 0 8px 0; color: #004d47; font-size: 16px; }
      .card p { margin: 0; line-height: 1.6; }
      .highlight { font-size: 18px; font-weight: 700; color: #004d47; }
      .footer { text-align: center; color: #888; margin-top: 30px; padding-top: 16px; border-top: 1px solid #e0e0e0; }
      @media print { body { margin: 0; } .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <div class="header"><h1>Precificaí</h1><p>${escapeHtml(perfilNome)} - Relatório Simplificado</p><p>${new Date().toLocaleDateString('pt-BR')}</p></div>
    ${sections.map(s => `<div class="card"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.text)}</p></div>`).join('')}
    <p class="footer">Gerado por Precificaí - www.precificaiapp.com</p>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  }

  if (!data || data.totalProdutos === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <EmptyState
          icon="file-text"
          title="Nenhum produto cadastrado"
          description="Cadastre seus produtos para ver o relatório simplificado."
        />
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
        <Text style={styles.headerTitle}>Explicaí</Text>
        <Text style={styles.headerSub}>Seus números traduzidos em linguagem simples</Text>
      </View>

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
    padding: spacing.lg,
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
});
