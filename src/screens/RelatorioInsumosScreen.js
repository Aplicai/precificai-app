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
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';
import { isMarcaEstimada, formatInsumoNome } from '../utils/insumoDisplay';

const safe = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Sessão 28.41: SectionBlock — wrapper visual pra cada seção do relatório.
// Cada bloco vira um card distinto (fundo branco, bordas arredondadas, padding
// generoso) com header colorido. Resolve o problema de "tudo grudado" — agora
// há separação visual clara entre Precisa atenção / Tendências / Oportunidades /
// Análise / Histórico.
function SectionBlock({ icon, color, title, subtitle, children }) {
  return (
    <View style={sectionBlockStyles.card}>
      <View style={sectionBlockStyles.headerRow}>
        <View style={[sectionBlockStyles.iconCircle, { backgroundColor: color + '18' }]}>
          <Feather name={icon} size={16} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sectionBlockStyles.title}>{title}</Text>
          {subtitle ? <Text style={sectionBlockStyles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={sectionBlockStyles.divider} />
      <View style={sectionBlockStyles.body}>
        {children}
      </View>
    </View>
  );
}

// Sessão 28.40: prop `embedded` indica que estamos sendo renderizados dentro
// do RelatoriosHubScreen. Quando true: esconde header próprio (o hub já tem
// header global "Relatórios") e ajusta paddings.
export default function RelatorioInsumosScreen({ embedded = false } = {}) {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [insumos, setInsumos] = useState([]);
  const [categoriaStats, setCategoriaStats] = useState([]);
  const [historico, setHistorico] = useState([]);

  // Sessão 28.42: dedup — guarda timestamp do último carregar() pra evitar
  // re-fetch redundante. Antes useFocusEffect + addListener('focus') +
  // visibilitychange disparavam carregar() 2-3x consecutivos no mesmo evento.
  const lastLoadRef = useRef(0);
  const loadingRef = useRef(false);
  const MIN_RELOAD_MS = 3000;

  const carregarSafe = useCallback(() => {
    const now = Date.now();
    if (loadingRef.current) return; // já tem um em andamento
    if (now - lastLoadRef.current < MIN_RELOAD_MS) return; // muito recente
    lastLoadRef.current = now;
    carregar();
  }, []);

  useFocusEffect(useCallback(() => { carregarSafe(); }, [carregarSafe]));

  // Sessão 28.27: SEGURANÇA EXTRA — useFocusEffect às vezes não dispara em tab
  // navigators no web. Adiciona listener explícito + recarrega quando aba
  // do navegador volta a ficar visível. Sessão 28.42: usa carregarSafe pra
  // dedup de chamadas concorrentes.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { carregarSafe(); });
    let onVis;
    if (typeof document !== 'undefined' && document.addEventListener) {
      onVis = () => { if (!document.hidden) carregarSafe(); };
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      unsub();
      if (onVis && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [navigation, carregarSafe]);

  async function carregar() {
    loadingRef.current = true;
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

      // Stats por categoria — Sessão 28.47 (bug #9): exclui itens kit-only.
      // Antes: kit-only entrava no cálculo da categoria mais cara, distorcendo
      // o resultado quando o user ainda não tinha revisado os preços do kit.
      const byCat = {};
      (mps || []).forEach(m => {
        if (isMarcaEstimada(m.marca)) return; // pula kit-only
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
      loadingRef.current = false;
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
    const ehKitOnly = (i) => isMarcaEstimada(i?.marca);

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
        {/* Sessão 28.39/28.40: header polido — quando embedded no RelatoriosHub,
            mostra apenas subtitle + refresh (header principal está no hub). */}
        {!embedded && (
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
        )}
        {embedded && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Text style={styles.subtitle}>
              Saúde do cadastro: pendências, variações e oportunidades.
            </Text>
            <TouchableOpacity
              onPress={carregar}
              style={styles.refreshBtn}
              accessibilityLabel="Atualizar relatório"
            >
              <Feather name="refresh-cw" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

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
            {/* ─────────── PANORAMA (KPIs em grid 3x2) ─────────── */}
            <SectionBlock
              icon="grid"
              color={colors.primary}
              title="Panorama"
              subtitle="Números-chave do seu cadastro de insumos"
            >
              <View style={styles.kpiGrid}>
                <View style={styles.kpiTile}>
                  <Text style={styles.kpiTileLabel}>Cadastrados</Text>
                  <Text style={styles.kpiTileValue}>{insights.totalCadastrados}</Text>
                  <Text style={styles.kpiTileSub}>{insights.comPrecoCount} com preço</Text>
                </View>
                <View style={[styles.kpiTile, insights.semPrecoCount > 0 && styles.kpiTileError]}>
                  <Text style={styles.kpiTileLabel}>Sem preço</Text>
                  <Text style={[styles.kpiTileValue, insights.semPrecoCount > 0 && { color: colors.error }]}>{insights.semPrecoCount}</Text>
                  <Text style={styles.kpiTileSub}>bloqueiam cálculo</Text>
                </View>
                <View style={[styles.kpiTile, insights.desatualizadosCount > 0 && styles.kpiTileWarn]}>
                  <Text style={styles.kpiTileLabel}>Desatualizados</Text>
                  <Text style={[styles.kpiTileValue, insights.desatualizadosCount > 0 && { color: colors.warning }]}>{insights.desatualizadosCount}</Text>
                  <Text style={styles.kpiTileSub}>>60 dias</Text>
                </View>
                <View style={styles.kpiTile}>
                  <Text style={styles.kpiTileLabel}>Custo médio</Text>
                  <Text style={styles.kpiTileValue}>{formatCurrency(insights.custoMedio)}</Text>
                  <Text style={styles.kpiTileSub}>por kg/un</Text>
                </View>
                <View style={styles.kpiTile}>
                  <Text style={styles.kpiTileLabel}>Categoria mais cara</Text>
                  <Text style={[styles.kpiTileValue, { fontSize: 14 }]} numberOfLines={1}>
                    {insights.catMaisCara?.nome || '—'}
                  </Text>
                  <Text style={styles.kpiTileSub}>
                    {insights.catMaisCara ? formatCurrency(insights.catMaisCara.media) : '—'}
                  </Text>
                </View>
                <View style={[styles.kpiTile, insights.variacoesCount > 0 && styles.kpiTileInfo]}>
                  <Text style={styles.kpiTileLabel}>Variações ≥5%</Text>
                  <Text style={[styles.kpiTileValue, insights.variacoesCount > 0 && { color: colors.info }]}>{insights.variacoesCount}</Text>
                  <Text style={styles.kpiTileSub}>preço alterado</Text>
                </View>
              </View>
            </SectionBlock>

            {/* ─────────── PRECISA ATENÇÃO ─────────── */}
            {(insights.semPrecoCount > 0 || insights.desatualizadosCount > 0 || insights.kitOnlyCount > 0) && (
              <SectionBlock
                icon="zap"
                color={colors.error}
                title="Precisa atenção"
                subtitle="Pendências que afetam o cálculo dos seus produtos"
              >
                {insights.kitOnlyCount > 0 && (
                  <View style={[styles.alertPanel, { borderLeftColor: colors.warning, backgroundColor: colors.warning + '0a' }]}>
                    <View style={styles.alertPanelHead}>
                      <Feather name="info" size={16} color={colors.warning} />
                      <Text style={[styles.alertPanelTitle, { color: colors.warning }]}>
                        Preços ainda do Kit de Início ({insights.kitOnlyCount})
                      </Text>
                    </View>
                    <Text style={styles.alertPanelDesc}>
                      Valores foram pré-preenchidos pelo Kit. Atualize com o preço real que você paga pra o relatório ficar fiel.
                    </Text>
                    {insights.kitOnly.map((i, idx) => (
                      <TouchableOpacity
                        key={i.id || idx}
                        style={styles.listRow}
                        onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: i.id, returnTo: 'Relatorios', returnToParams: { aba: 'insumos' } } })}
                      >
                        <Text style={styles.listRowNome} numberOfLines={1}>{i.nome}</Text>
                        <Text style={styles.listRowValor}>R$ {Number(i.preco_por_kg).toFixed(2)}/kg</Text>
                        <Feather name="chevron-right" size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ))}
                    {insights.kitOnlyCount > insights.kitOnly.length && (
                      <Text style={styles.listMore}>+ {insights.kitOnlyCount - insights.kitOnly.length} outros</Text>
                    )}
                  </View>
                )}

                {insights.semPrecoCount > 0 && (
                  <View style={[styles.alertPanel, { borderLeftColor: colors.error, backgroundColor: colors.error + '0a' }]}>
                    <View style={styles.alertPanelHead}>
                      <Feather name="alert-triangle" size={16} color={colors.error} />
                      <Text style={[styles.alertPanelTitle, { color: colors.error }]}>
                        Pendentes — sem preço cadastrado
                      </Text>
                    </View>
                    <Text style={styles.alertPanelDesc}>
                      Esses insumos NÃO entram no cálculo dos seus produtos. Atualize agora.
                    </Text>
                    {insights.semPreco.map((i, idx) => (
                      <TouchableOpacity
                        key={i.id || idx}
                        style={styles.listRow}
                        onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: i.id, returnTo: 'Relatorios', returnToParams: { aba: 'insumos' } } })}
                      >
                        <Text style={styles.listRowNome} numberOfLines={1}>{i.nome}</Text>
                        <Feather name="chevron-right" size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ))}
                    {insights.semPrecoCount > insights.semPreco.length && (
                      <Text style={styles.listMore}>+ {insights.semPrecoCount - insights.semPreco.length} outros</Text>
                    )}
                  </View>
                )}

                {insights.desatualizadosCount > 0 && (
                  <View style={[styles.alertPanel, { borderLeftColor: colors.warning, backgroundColor: colors.warning + '0a' }]}>
                    <View style={styles.alertPanelHead}>
                      <Feather name="clock" size={16} color={colors.warning} />
                      <Text style={[styles.alertPanelTitle, { color: colors.warning }]}>
                        Preços desatualizados (&gt;60 dias)
                      </Text>
                    </View>
                    <Text style={styles.alertPanelDesc}>
                      Preço pode ter mudado no mercado. Confirme com seu fornecedor.
                    </Text>
                    {insights.desatualizados.map((i, idx) => (
                      <TouchableOpacity
                        key={i.id || idx}
                        style={styles.listRow}
                        onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: i.id, returnTo: 'Relatorios', returnToParams: { aba: 'insumos' } } })}
                      >
                        <Text style={styles.listRowNome} numberOfLines={1}>{i.nome}</Text>
                        <Text style={styles.listRowValor}>
                          {i.idadeDias == null ? 'sem histórico' : `há ${Math.round(i.idadeDias)}d`}
                        </Text>
                        <Feather name="chevron-right" size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ))}
                    {insights.desatualizadosCount > insights.desatualizados.length && (
                      <Text style={styles.listMore}>+ {insights.desatualizadosCount - insights.desatualizados.length} outros</Text>
                    )}
                  </View>
                )}
              </SectionBlock>
            )}

            {/* ─────────── ÚLTIMAS MUDANÇAS DE PREÇO ─────────── */}
            {insights.variacoesCount > 0 && (
              <SectionBlock
                icon="trending-up"
                color={colors.info}
                title="Últimas mudanças de preço"
                subtitle="Variações ≥5% na última atualização — reveja preços de venda afetados"
              >
                {insights.variacoes.slice(0, 8).map((v, i) => {
                  const subiu = v.delta > 0;
                  const tintColor = subiu ? colors.error : colors.success;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.listRow}
                      onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: v.materia_prima_id, returnTo: 'Relatorios', returnToParams: { aba: 'insumos' } } })}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listRowNome} numberOfLines={1}>{v.nome}</Text>
                        <Text style={styles.listRowSub}>
                          {formatCurrency(v.anterior)} → {formatCurrency(v.atual)}
                        </Text>
                      </View>
                      <View style={[styles.deltaBadge, { backgroundColor: tintColor + '15' }]}>
                        <Feather name={subiu ? 'trending-up' : 'trending-down'} size={12} color={tintColor} />
                        <Text style={[styles.deltaBadgeText, { color: tintColor }]}>
                          {subiu ? '+' : ''}{(v.delta * 100).toFixed(1)}%
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </SectionBlock>
            )}

            {/* ─────────── OPORTUNIDADES DE CUSTO ─────────── */}
            {insights.top5Caros.length > 0 && (
              <SectionBlock
                icon="dollar-sign"
                color={colors.success}
                title="Oportunidades de custo"
                subtitle="Top 5 insumos mais caros — vale renegociar ou buscar alternativa"
              >
                {insights.top5Caros.map((i, idx) => (
                  <TouchableOpacity
                    key={i.id || idx}
                    style={styles.listRow}
                    onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: i.id, returnTo: 'Relatorios', returnToParams: { aba: 'insumos' } } })}
                  >
                    <View style={[styles.rankBadge, { backgroundColor: colors.error + '18' }]}>
                      <Text style={[styles.rankBadgeText, { color: colors.error }]}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.listRowNome, { flex: 1 }]} numberOfLines={1}>{i.nome}</Text>
                    <Text style={[styles.listRowValor, { color: colors.error, fontFamily: fontFamily.bold }]}>
                      {formatCurrency(safe(i.preco_por_kg))}/kg
                    </Text>
                  </TouchableOpacity>
                ))}
              </SectionBlock>
            )}

            {/* ─────────── ANÁLISE POR CATEGORIA ─────────── */}
            {categoriaStats.length > 0 && (
              <SectionBlock
                icon="pie-chart"
                color={colors.primary}
                title="Análise por categoria"
                subtitle="Faixa de preços por grupo — dispersão alta sugere padronização"
              >
                {categoriaStats.map((cat, i) => (
                  <View key={i} style={styles.catRow}>
                    <View style={styles.catRowHead}>
                      <Text style={styles.catRowNome}>{cat.nome}</Text>
                      <Text style={styles.catRowCount}>{cat.count} insumo{cat.count !== 1 ? 's' : ''}</Text>
                    </View>
                    <View style={styles.catRowStats}>
                      <View style={styles.catRowStat}>
                        <Text style={styles.catRowStatLabel}>Média</Text>
                        <Text style={styles.catRowStatValue}>{formatCurrency(cat.media)}</Text>
                      </View>
                      <View style={styles.catRowStat}>
                        <Text style={styles.catRowStatLabel}>Mínimo</Text>
                        <Text style={[styles.catRowStatValue, { color: colors.success }]}>{formatCurrency(cat.min)}</Text>
                      </View>
                      <View style={styles.catRowStat}>
                        <Text style={styles.catRowStatLabel}>Máximo</Text>
                        <Text style={[styles.catRowStatValue, { color: colors.error }]}>{formatCurrency(cat.max)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </SectionBlock>
            )}

            {/* Sessão 28.47 — bloco "Histórico (Últimas mudanças de preço)"
                removido. A informação agora vive no bloco "Últimas mudanças
                de preço" (antes "Tendências de preço") logo acima. */}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// Sessão 28.41: SectionBlock styles — cada bloco vira um card com header,
// divider sutil e corpo com padding generoso. Resolve o "tudo grudado".
const sectionBlockStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: spacing.lg + 4,
    padding: spacing.md + 2,
    // Sombra discreta — separa visualmente do background sem competir
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: colors.border + '80',
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: fonts.regular + 1, fontFamily: fontFamily.bold, color: colors.text,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 2,
    lineHeight: 16,
  },
  divider: {
    height: 1, backgroundColor: colors.border,
    marginTop: spacing.md, marginBottom: spacing.md,
    opacity: 0.6,
  },
  body: {},
});

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

  // Sessão 28.39: hero + refresh
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

  // Sessão 28.41: KPI grid 3x2 dentro do SectionBlock "Panorama"
  kpiGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  kpiTile: {
    // 3 colunas em linhas: width = (100% - 2*gap) / 3 ≈ 32%; flexBasis garante quebra
    flexGrow: 1, flexShrink: 1, flexBasis: '30%', minWidth: 100,
    backgroundColor: colors.background,
    padding: spacing.md - 2,
    borderRadius: 10,
    borderWidth: 1, borderColor: colors.border + '80',
    alignItems: 'flex-start',
  },
  kpiTileError: { borderColor: colors.error + '40', backgroundColor: colors.error + '06' },
  kpiTileWarn:  { borderColor: colors.warning + '40', backgroundColor: colors.warning + '06' },
  kpiTileInfo:  { borderColor: colors.info + '40', backgroundColor: colors.info + '06' },
  kpiTileLabel: { fontSize: fonts.tiny, color: colors.textSecondary, marginBottom: 6, fontFamily: fontFamily.medium },
  kpiTileValue: { fontSize: 24, fontFamily: fontFamily.bold, color: colors.text, fontWeight: '700', lineHeight: 28 },
  kpiTileSub:   { fontSize: 10, color: colors.textSecondary, marginTop: 4 },

  // Sessão 28.41: alertPanel — sub-bloco dentro de "Precisa atenção"
  alertPanel: {
    borderRadius: 10,
    padding: spacing.md - 2,
    marginBottom: spacing.sm + 2,
    borderLeftWidth: 3,
  },
  alertPanelHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  alertPanelTitle: {
    fontSize: fonts.small + 1, fontFamily: fontFamily.bold,
  },
  alertPanelDesc: {
    fontSize: fonts.tiny + 1, color: colors.textSecondary,
    marginBottom: spacing.sm, lineHeight: 17,
  },

  // Sessão 28.41: listRow — usado em variações, top, kit-only, sem-preço, desatualizados.
  // borderBottom ao invés de borderTop: o divider do SectionBlock já separa do header,
  // então o primeiro item flui limpo. Cada linha vira uma "row" tipo tabela.
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 2,
    borderBottomWidth: 1, borderBottomColor: colors.border + '80',
  },
  listRowNome: { flex: 1, fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },
  listRowSub:  { fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 2 },
  listRowValor: { fontSize: fonts.tiny, color: colors.textSecondary, fontFamily: fontFamily.medium },
  listMore: {
    fontSize: fonts.tiny, color: colors.textSecondary, fontStyle: 'italic',
    marginTop: 8, textAlign: 'center',
  },
  deltaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  deltaBadgeText: { fontSize: fonts.tiny, fontFamily: fontFamily.bold, fontWeight: '700' },
  rankBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  rankBadgeText: { fontSize: fonts.tiny, fontFamily: fontFamily.bold, fontWeight: '700' },

  // Sessão 28.41: catRow — cards mais slim dentro do SectionBlock
  catRow: {
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1, borderBottomColor: colors.border + '80',
  },
  catRowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  catRowNome: { fontSize: fonts.small + 1, fontFamily: fontFamily.semiBold, color: colors.text },
  catRowCount: { fontSize: fonts.tiny, color: colors.textSecondary },
  catRowStats: { flexDirection: 'row', gap: spacing.sm },
  catRowStat: { flex: 1 },
  catRowStatLabel: { fontSize: 10, color: colors.textSecondary, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  catRowStatValue: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text },

  // Histórico
  histRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + '80',
  },
  histNome: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },
  histData: { fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 2 },
  histPreco: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.primary },
  histEmpty: {
    alignItems: 'center', padding: spacing.md,
    backgroundColor: colors.background, borderRadius: 8,
  },
  histEmptyText: {
    fontSize: fonts.small, color: colors.textSecondary,
    textAlign: 'center', marginTop: 6, lineHeight: 18,
  },
});
