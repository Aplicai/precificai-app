/**
 * RelatorioInsumosScreen — Sessão 28.17
 *
 * Substitui a aba "Comparar Fornecedores" (que ficou complicada de manter,
 * exigindo cadastrar marcas e variações). Aqui o foco é VISÃO GERAL DE PREÇOS:
 *
 *   - Preço médio por categoria de insumo
 *   - Top 5 mais caros / mais baratos
 *   - Histórico de mudanças de preço (a partir de `historico_precos` quando existir)
 *
 * Pra quê: empreendedora quer ver "como meus custos estão evoluindo" sem
 * precisar pensar em marcas/fornecedores específicos.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';

const safe = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function RelatorioInsumosScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [insumos, setInsumos] = useState([]);
  const [categoriaStats, setCategoriaStats] = useState([]);
  const [historico, setHistorico] = useState([]);

  useFocusEffect(useCallback(() => { carregar(); }, []));

  // Sessão 28.27: SEGURANÇA EXTRA — useFocusEffect às vezes não dispara em tab
  // navigators no web (depende da versão do React Navigation). Adiciona listener
  // explícito + recarrega quando aba do navegador volta a ficar visível.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { carregar(); });
    let onVis;
    if (typeof document !== 'undefined' && document.addEventListener) {
      onVis = () => { if (!document.hidden) carregar(); };
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      unsub();
      if (onVis && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [navigation]);

  async function carregar() {
    setLoading(true);
    try {
      // Sessão 28.25 BUG FIX: Relatório de Insumos não refletia edição de preço.
      // O wrapper supabaseDb tem cache de 2s com invalidação por tabela, mas em
      // SQLite local + alguns paths o cache pode ainda devolver dados velhos.
      // Limpa explicitamente antes de carregar pra garantir leitura fresca.
      try {
        const { clearQueryCache } = await import('../database/supabaseDb');
        clearQueryCache?.();
      } catch {}
      const db = await getDatabase();
      const [mps, cats] = await Promise.all([
        db.getAllAsync('SELECT mp.*, c.nome as categoria_nome FROM materias_primas mp LEFT JOIN categorias_insumos c ON c.id = mp.categoria_id ORDER BY mp.nome'),
        db.getAllAsync('SELECT * FROM categorias_insumos ORDER BY nome'),
      ]);
      setInsumos(mps || []);

      // Stats por categoria
      const byCat = {};
      (mps || []).forEach(m => {
        const cat = m.categoria_nome || 'Sem categoria';
        if (!byCat[cat]) byCat[cat] = { nome: cat, items: [], total: 0, count: 0 };
        const preco = safe(m.preco_por_kg);
        if (preco > 0) {
          byCat[cat].items.push({ nome: m.nome, marca: m.marca, preco, unidade: m.unidade_medida });
          byCat[cat].total += preco;
          byCat[cat].count += 1;
        }
      });
      const statsArr = Object.values(byCat).map(c => ({
        ...c,
        media: c.count > 0 ? c.total / c.count : 0,
        max: c.items.length > 0 ? Math.max(...c.items.map(i => i.preco)) : 0,
        min: c.items.length > 0 ? Math.min(...c.items.map(i => i.preco)) : 0,
      })).sort((a, b) => b.count - a.count);
      setCategoriaStats(statsArr);

      // Histórico (defensivo — tabela pode não existir)
      try {
        const hist = await db.getAllAsync(`
          SELECT h.materia_prima_id, h.preco_por_kg, h.criado_em, h.data, mp.nome, mp.marca, mp.unidade_medida
          FROM historico_precos h
          LEFT JOIN materias_primas mp ON mp.id = h.materia_prima_id
          ORDER BY COALESCE(h.criado_em, h.data) DESC
          LIMIT 100
        `);
        setHistorico(hist || []);
      } catch (e) {
        // Tabela ausente ou esquema diferente — silencioso.
        setHistorico([]);
      }
    } catch (e) {
      console.error('[RelatorioInsumos.carregar]', e);
    } finally {
      setLoading(false);
    }
  }

  // Sessão 28.37: insights baseados em melhores práticas de relatórios de
  // gestão de insumos (CMV, variação de preços, alertas de cadastro
  // incompleto, idade do dado, concentração de custo). Inspirado em:
  // food cost management dashboards, Cayena, SEBRAE, Crunchtime AvT reports.
  const insights = useMemo(() => {
    const safe = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
    const now = Date.now();
    const dia = 24 * 60 * 60 * 1000;

    // Sessão 28.39: insumos com preço SÓ do kit (marca = __VALOR_ESTIMADO_KIT__)
    // são EXCLUÍDOS dos alertas de variação/desatualizado/top — não foi user
    // que cadastrou esse preço, então tratar como dado autêntico polui o relatório.
    const ehKitOnly = (i) => i?.marca === '__VALOR_ESTIMADO_KIT__';

    const semPreco = insumos.filter(i => safe(i.preco_por_kg) <= 0);
    // "ComPreco" = só items com preço REAL inserido pelo user
    const comPreco = insumos.filter(i => safe(i.preco_por_kg) > 0 && !ehKitOnly(i));
    // "ComPrecoTotal" inclui kit-only — usado só pra estatística de quantos têm valor
    const comPrecoTotal = insumos.filter(i => safe(i.preco_por_kg) > 0);
    const aindaEstimadoKit = insumos.filter(ehKitOnly);

    // Idade do preço (dias desde última atualização registrada em historico_precos)
    const ultimaAtualizacaoPorInsumo = {};
    for (const h of historico) {
      const ts = h.criado_em || h.data;
      if (!ts) continue;
      const t = new Date(ts).getTime();
      if (!Number.isFinite(t)) continue;
      const cur = ultimaAtualizacaoPorInsumo[h.materia_prima_id];
      if (!cur || t > cur) ultimaAtualizacaoPorInsumo[h.materia_prima_id] = t;
    }
    const desatualizados = comPreco
      .map(i => {
        const t = ultimaAtualizacaoPorInsumo[i.id];
        const idadeDias = t ? (now - t) / dia : null;
        return { ...i, idadeDias };
      })
      .filter(i => i.idadeDias == null || i.idadeDias > 60)
      .sort((a, b) => (b.idadeDias || 999) - (a.idadeDias || 999));

    // Variação de preço — compara último vs penúltimo histórico por insumo
    const variacoes = [];
    const histPorInsumo = {};
    for (const h of historico) {
      if (!h.materia_prima_id) continue;
      (histPorInsumo[h.materia_prima_id] = histPorInsumo[h.materia_prima_id] || []).push(h);
    }
    Object.keys(histPorInsumo).forEach(id => {
      const arr = histPorInsumo[id].sort((a, b) => {
        const ta = new Date(a.criado_em || a.data || 0).getTime();
        const tb = new Date(b.criado_em || b.data || 0).getTime();
        return tb - ta; // mais recente primeiro
      });
      if (arr.length < 2) return;
      const atual = safe(arr[0].preco_por_kg);
      const anterior = safe(arr[1].preco_por_kg);
      if (atual <= 0 || anterior <= 0) return;
      const delta = (atual - anterior) / anterior;
      if (Math.abs(delta) >= 0.05) { // só lista variações ≥ 5%
        variacoes.push({
          materia_prima_id: arr[0].materia_prima_id,
          nome: arr[0].nome,
          atual, anterior, delta,
          quando: arr[0].criado_em || arr[0].data,
        });
      }
    });
    variacoes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // Top 5 mais caros (por preço/kg pra comparação justa) e mais baratos
    const top5Caros = [...comPreco]
      .sort((a, b) => safe(b.preco_por_kg) - safe(a.preco_por_kg))
      .slice(0, 5);
    const top5Baratos = [...comPreco]
      .sort((a, b) => safe(a.preco_por_kg) - safe(b.preco_por_kg))
      .slice(0, 5);

    // Concentração de custo: categoria que tem MAIOR preço médio
    const catMaisCara = [...categoriaStats].sort((a, b) => b.media - a.media)[0] || null;

    // Custo médio geral por kg
    const custoMedio = comPreco.length > 0
      ? comPreco.reduce((a, i) => a + safe(i.preco_por_kg), 0) / comPreco.length
      : 0;

    return {
      semPrecoCount: semPreco.length,
      semPreco: semPreco.slice(0, 10),
      desatualizadosCount: desatualizados.length,
      desatualizados: desatualizados.slice(0, 10),
      variacoes,
      variacoesCount: variacoes.length,
      top5Caros,
      top5Baratos,
      custoMedio,
      catMaisCara,
      totalCadastrados: insumos.length,
      comPrecoCount: comPrecoTotal.length,
      // 28.39: itens ainda com preço-do-kit (não foram revisados pelo user)
      kitOnlyCount: aindaEstimadoKit.length,
      kitOnly: aindaEstimadoKit.slice(0, 10),
    };
  }, [insumos, historico, categoriaStats]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Sessão 28.39: header polido no estilo Precificaí — ícone em círculo
            colorido + título + subtitle estruturados, ação de refresh com ícone redondo. */}
        <View style={styles.heroHeader}>
          <View style={styles.heroIcon}>
            <Feather name="bar-chart-2" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Relatório de Insumos</Text>
            <Text style={styles.subtitle}>
              Saúde do seu cadastro: pendências, variações e oportunidades de redução de custo.
            </Text>
          </View>
          <TouchableOpacity
            onPress={carregar}
            style={styles.refreshBtn}
            accessibilityLabel="Atualizar relatório"
          >
            <Feather name="refresh-cw" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {insumos.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={32} color={colors.disabled} />
            <Text style={styles.emptyTitle}>Sem insumos cadastrados</Text>
            <Text style={styles.emptyDesc}>
              Vai em Insumos pra cadastrar os primeiros e ver o relatório.
            </Text>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => navigation.navigate('Insumos', { screen: 'MateriasPrimas' })}
              activeOpacity={0.8}
            >
              <Text style={styles.btnPrimaryText}>Cadastrar insumos</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* KPIs principais — Sessão 28.37 */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Insumos cadastrados</Text>
                <Text style={styles.kpiValue}>{insights.totalCadastrados}</Text>
                <Text style={styles.kpiSub}>{insights.comPrecoCount} com preço</Text>
              </View>
              <View style={[styles.kpiCard, insights.semPrecoCount > 0 && { borderLeftWidth: 3, borderLeftColor: colors.error }]}>
                <Text style={styles.kpiLabel}>Sem preço</Text>
                <Text style={[styles.kpiValue, insights.semPrecoCount > 0 && { color: colors.error }]}>{insights.semPrecoCount}</Text>
                <Text style={styles.kpiSub}>bloqueiam precificação</Text>
              </View>
              <View style={[styles.kpiCard, insights.desatualizadosCount > 0 && { borderLeftWidth: 3, borderLeftColor: colors.warning }]}>
                <Text style={styles.kpiLabel}>Desatualizados</Text>
                <Text style={[styles.kpiValue, insights.desatualizadosCount > 0 && { color: colors.warning }]}>{insights.desatualizadosCount}</Text>
                <Text style={styles.kpiSub}>>60 dias sem update</Text>
              </View>
            </View>

            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Custo médio/kg</Text>
                <Text style={styles.kpiValue}>{formatCurrency(insights.custoMedio)}</Text>
                <Text style={styles.kpiSub}>entre insumos cadastrados</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Categoria mais cara</Text>
                <Text style={[styles.kpiValue, { fontSize: 14 }]} numberOfLines={1}>
                  {insights.catMaisCara?.nome || '—'}
                </Text>
                <Text style={styles.kpiSub}>
                  {insights.catMaisCara ? formatCurrency(insights.catMaisCara.media) + ' média' : ''}
                </Text>
              </View>
              <View style={[styles.kpiCard, insights.variacoesCount > 0 && { borderLeftWidth: 3, borderLeftColor: colors.info }]}>
                <Text style={styles.kpiLabel}>Variações ≥ 5%</Text>
                <Text style={[styles.kpiValue, insights.variacoesCount > 0 && { color: colors.info }]}>{insights.variacoesCount}</Text>
                <Text style={styles.kpiSub}>preço subiu ou caiu</Text>
              </View>
            </View>

            {/* SEÇÃO 1 — AÇÕES URGENTES (icon header) */}
            {(insights.semPrecoCount > 0 || insights.desatualizadosCount > 0 || insights.kitOnlyCount > 0) && (
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.error + '15' }]}>
                  <Feather name="zap" size={14} color={colors.error} />
                </View>
                <Text style={styles.sectionHeaderText}>Precisa atenção</Text>
              </View>
            )}

            {/* Insumos com preço só do kit */}
            {insights.kitOnlyCount > 0 && (
              <View style={[styles.alertCard, { borderLeftColor: colors.warning }]}>
                <View style={styles.alertHeader}>
                  <Feather name="info" size={18} color={colors.warning} />
                  <Text style={[styles.alertTitle, { color: colors.warning }]}>
                    Preços ainda do Kit de Início ({insights.kitOnlyCount})
                  </Text>
                </View>
                <Text style={styles.alertDesc}>
                  Esses insumos têm o valor de mercado pré-preenchido pelo Kit. Não foram revisados por você ainda — atualize com o preço REAL que você paga pra ter o relatório fiel.
                </Text>
                {insights.kitOnly.map((i, idx) => (
                  <TouchableOpacity
                    key={i.id || idx}
                    style={styles.alertItem}
                    onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: i.id, returnTo: 'RelatorioInsumos' } })}
                  >
                    <Text style={styles.alertItemNome} numberOfLines={1}>{i.nome}</Text>
                    <Text style={styles.alertItemValor}>R$ {Number(i.preco_por_kg).toFixed(2)}/kg</Text>
                    <Feather name="chevron-right" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
                {insights.kitOnlyCount > insights.kitOnly.length && (
                  <Text style={styles.alertMore}>+ {insights.kitOnlyCount - insights.kitOnly.length} outros</Text>
                )}
              </View>
            )}

            {/* AÇÕES URGENTES: insumos sem preço */}
            {insights.semPrecoCount > 0 && (
              <View style={[styles.alertCard, { borderLeftColor: colors.error }]}>
                <View style={styles.alertHeader}>
                  <Feather name="alert-triangle" size={18} color={colors.error} />
                  <Text style={[styles.alertTitle, { color: colors.error }]}>
                    Pendentes — sem preço cadastrado
                  </Text>
                </View>
                <Text style={styles.alertDesc}>
                  Esses insumos NÃO entram no cálculo dos seus produtos. Atualize agora.
                </Text>
                {insights.semPreco.map((i, idx) => (
                  <TouchableOpacity
                    key={i.id || idx}
                    style={styles.alertItem}
                    onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: i.id, returnTo: 'RelatorioInsumos' } })}
                  >
                    <Text style={styles.alertItemNome} numberOfLines={1}>{i.nome}</Text>
                    <Feather name="chevron-right" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
                {insights.semPrecoCount > insights.semPreco.length && (
                  <Text style={styles.alertMore}>+ {insights.semPrecoCount - insights.semPreco.length} outros</Text>
                )}
              </View>
            )}

            {/* AÇÕES URGENTES: desatualizados */}
            {insights.desatualizadosCount > 0 && (
              <View style={[styles.alertCard, { borderLeftColor: colors.warning }]}>
                <View style={styles.alertHeader}>
                  <Feather name="clock" size={18} color={colors.warning} />
                  <Text style={[styles.alertTitle, { color: colors.warning }]}>
                    Preços desatualizados (>60 dias)
                  </Text>
                </View>
                <Text style={styles.alertDesc}>
                  Preço pode ter mudado no mercado. Confirme com seu fornecedor.
                </Text>
                {insights.desatualizados.map((i, idx) => (
                  <TouchableOpacity
                    key={i.id || idx}
                    style={styles.alertItem}
                    onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: i.id, returnTo: 'RelatorioInsumos' } })}
                  >
                    <Text style={styles.alertItemNome} numberOfLines={1}>{i.nome}</Text>
                    <Text style={styles.alertItemValor}>
                      {i.idadeDias == null ? 'sem histórico' : `há ${Math.round(i.idadeDias)}d`}
                    </Text>
                    <Feather name="chevron-right" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
                {insights.desatualizadosCount > insights.desatualizados.length && (
                  <Text style={styles.alertMore}>+ {insights.desatualizadosCount - insights.desatualizados.length} outros</Text>
                )}
              </View>
            )}

            {/* SEÇÃO 2 — TENDÊNCIAS */}
            {insights.variacoesCount > 0 && (
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.info + '15' }]}>
                  <Feather name="trending-up" size={14} color={colors.info} />
                </View>
                <Text style={styles.sectionHeaderText}>Tendências de preço</Text>
              </View>
            )}

            {/* VARIAÇÕES RECENTES */}
            {insights.variacoesCount > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 0 }]}>
                  Variações ≥ 5%
                </Text>
                <Text style={styles.sectionDesc}>
                  Insumos com mudança significativa de custo na última atualização. Reveja os preços de venda dos produtos que usam esses insumos.
                </Text>
                {insights.variacoes.slice(0, 8).map((v, i) => {
                  const subiu = v.delta > 0;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.variacaoRow}
                      onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: v.materia_prima_id, returnTo: 'RelatorioInsumos' } })}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.variacaoNome} numberOfLines={1}>{v.nome}</Text>
                        <Text style={styles.variacaoSub}>
                          {formatCurrency(v.anterior)} → {formatCurrency(v.atual)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name={subiu ? 'trending-up' : 'trending-down'} size={14} color={subiu ? colors.error : colors.success} />
                        <Text style={{ fontSize: fonts.regular, fontFamily: fontFamily.bold, color: subiu ? colors.error : colors.success }}>
                          {subiu ? '+' : ''}{(v.delta * 100).toFixed(1)}%
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* SEÇÃO 3 — OPORTUNIDADES DE CUSTO */}
            {insights.top5Caros.length > 0 && (
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.success + '15' }]}>
                  <Feather name="dollar-sign" size={14} color={colors.success} />
                </View>
                <Text style={styles.sectionHeaderText}>Oportunidades de custo</Text>
              </View>
            )}

            {/* TOP 5 MAIS CAROS — pra ataque de custos */}
            {insights.top5Caros.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 0 }]}>
                  Top 5 mais caros (por kg)
                </Text>
                <Text style={styles.sectionDesc}>
                  Esses são os insumos que mais pesam por unidade. Vale renegociar com fornecedor ou buscar alternativa.
                </Text>
                {insights.top5Caros.map((i, idx) => (
                  <TouchableOpacity
                    key={i.id || idx}
                    style={styles.topRow}
                    onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: i.id, returnTo: 'RelatorioInsumos' } })}
                  >
                    <View style={[styles.topRank, { backgroundColor: colors.error + '20' }]}>
                      <Text style={[styles.topRankText, { color: colors.error }]}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.topNome} numberOfLines={1}>{i.nome}</Text>
                    <Text style={[styles.topPreco, { color: colors.error }]}>
                      {formatCurrency(safe(i.preco_por_kg))}/kg
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* SEÇÃO 4 — VISÃO ANALÍTICA */}
            {categoriaStats.length > 0 && (
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.primary + '15' }]}>
                  <Feather name="pie-chart" size={14} color={colors.primary} />
                </View>
                <Text style={styles.sectionHeaderText}>Análise por categoria</Text>
              </View>
            )}

            {/* PREÇO MÉDIO POR CATEGORIA — visão analítica */}
            {categoriaStats.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 0 }]}>
                  Preço médio por categoria
                </Text>
                <Text style={styles.sectionDesc}>
                  Use pra comparar a faixa de preços. Categorias com grande dispersão (mín vs máx) podem indicar oportunidade de padronização.
                </Text>
                {categoriaStats.map((cat, i) => (
                  <View key={i} style={styles.catCard}>
                    <View style={styles.catHeader}>
                      <Text style={styles.catNome}>{cat.nome}</Text>
                      <Text style={styles.catCount}>{cat.count} insumo{cat.count !== 1 ? 's' : ''}</Text>
                    </View>
                    <View style={styles.catStatsRow}>
                      <View style={styles.catStat}>
                        <Text style={styles.catStatLabel}>Média</Text>
                        <Text style={styles.catStatValue}>{formatCurrency(cat.media)}</Text>
                      </View>
                      <View style={styles.catStat}>
                        <Text style={styles.catStatLabel}>Mínimo</Text>
                        <Text style={[styles.catStatValue, { color: colors.success }]}>{formatCurrency(cat.min)}</Text>
                      </View>
                      <View style={styles.catStat}>
                        <Text style={styles.catStatLabel}>Máximo</Text>
                        <Text style={[styles.catStatValue, { color: colors.error }]}>{formatCurrency(cat.max)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Histórico (mantido — útil pra ver evolução) */}
            {historico.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
                  Últimas mudanças de preço
                </Text>
                {historico.slice(0, 15).map((h, i) => (
                  <View key={i} style={styles.histRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histNome}>
                        {h.nome}{h.marca ? ` (${h.marca})` : ''}
                      </Text>
                      <Text style={styles.histData}>
                        {h.criado_em ? new Date(h.criado_em).toLocaleDateString('pt-BR') : '—'}
                      </Text>
                    </View>
                    <Text style={styles.histPreco}>{formatCurrency(safe(h.preco_por_kg))}/{h.unidade_medida || 'kg'}</Text>
                  </View>
                ))}
              </>
            )}
            {historico.length === 0 && (
              <View style={[styles.empty, { marginTop: spacing.md, padding: spacing.md }]}>
                <Feather name="clock" size={20} color={colors.disabled} />
                <Text style={[styles.emptyDesc, { marginTop: 4 }]}>
                  Sem histórico de mudanças ainda. Edite o preço de algum insumo pra começar a registrar a evolução.
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 960, alignSelf: 'center', width: '100%' },
  header: { marginBottom: spacing.md },
  title: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, lineHeight: 18 },
  empty: { alignItems: 'center', padding: spacing.lg, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  emptyTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
  btnPrimary: {
    backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md, marginTop: spacing.md,
  },
  btnPrimaryText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: fonts.regular },
  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  kpiCard: {
    flex: 1, backgroundColor: colors.surface, padding: spacing.md,
    borderRadius: borderRadius.md, alignItems: 'center',
  },
  kpiLabel: { fontSize: fonts.tiny, color: colors.textSecondary, marginBottom: 4 },
  kpiValue: { fontSize: fonts.xlarge || 22, fontFamily: fontFamily.bold, color: colors.primary },
  sectionTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.sm },
  catCard: {
    backgroundColor: colors.surface, padding: spacing.md,
    borderRadius: borderRadius.md, marginBottom: spacing.sm,
  },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  catNome: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text },
  catCount: { fontSize: fonts.small, color: colors.textSecondary },
  catStatsRow: { flexDirection: 'row', gap: spacing.sm },
  catStat: { flex: 1 },
  catStatLabel: { fontSize: fonts.tiny, color: colors.textSecondary, marginBottom: 2 },
  catStatValue: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text },
  histRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  histNome: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },
  histData: { fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 2 },
  histPreco: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.primary },

  // Sessão 28.39: header polido + section dividers visuais
  heroHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface,
    padding: spacing.md, borderRadius: borderRadius.md,
    marginBottom: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.primary,
  },
  heroIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: spacing.lg, marginBottom: spacing.sm,
    paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sectionIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionHeaderText: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold,
    color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  // Sessão 28.37: novas styles pra reformulação do relatório
  kpiSub: { fontSize: 10, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  sectionDesc: { fontSize: fonts.small, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: -spacing.xs, lineHeight: 18 },
  alertCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
  },
  alertHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  alertTitle: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold,
  },
  alertDesc: {
    fontSize: fonts.small, color: colors.textSecondary,
    marginBottom: spacing.sm, lineHeight: 18,
  },
  alertItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border,
  },
  alertItemNome: {
    flex: 1, fontSize: fonts.small, fontFamily: fontFamily.medium,
    color: colors.text,
  },
  alertItemValor: {
    fontSize: fonts.tiny, color: colors.textSecondary, fontFamily: fontFamily.medium,
  },
  alertMore: {
    fontSize: fonts.tiny, color: colors.textSecondary, fontStyle: 'italic',
    marginTop: 6, textAlign: 'center',
  },
  variacaoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, padding: spacing.sm + 2,
    borderRadius: borderRadius.sm, marginBottom: 4,
  },
  variacaoNome: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },
  variacaoSub: { fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 2 },
  topRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, padding: spacing.sm + 2,
    borderRadius: borderRadius.sm, marginBottom: 4,
  },
  topRank: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  topRankText: { fontSize: fonts.tiny, fontFamily: fontFamily.bold, fontWeight: '700' },
  topNome: { flex: 1, fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },
  topPreco: { fontSize: fonts.regular, fontFamily: fontFamily.bold },
});
