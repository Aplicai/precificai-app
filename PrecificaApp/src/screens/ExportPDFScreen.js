import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { getDatabase } from '../database/database';
import { converterParaBase, formatCurrency, formatPercent } from '../utils/calculations';

export default function ExportPDFScreen({ navigation }) {
  const [produtos, setProdutos] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [busca, setBusca] = useState('');
  const [incluirAdicionais, setIncluirAdicionais] = useState(true);

  useEffect(() => {
    loadProdutos();
  }, []);

  const loadProdutos = async () => {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync('SELECT * FROM produtos ORDER BY nome');
      setProdutos(rows || []);
    } catch (e) {
      console.warn('Erro ao carregar produtos:', e);
    } finally {
      setLoading(false);
    }
  };

  const allSelected = produtos.length > 0 && produtos.every(p => selected[p.id]);

  const toggleAll = () => {
    if (allSelected) {
      setSelected({});
    } else {
      const all = {};
      produtos.forEach(p => { all[p.id] = true; });
      setSelected(all);
    }
  };

  const toggleOne = (id) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const handleExport = async () => {
    if (selectedCount === 0) return;
    setExporting(true);
    try {
      const db = await getDatabase();
      // Load all data with simple queries (no JOINs - Supabase wrapper handles better)
      const [perfilRows, configRows, rawProdIngs, rawProdPreps, rawProdEmbs, allMPs, allPreparos, allEmbItems, fixas, variaveis, fat] = await Promise.all([
        db.getAllAsync('SELECT * FROM perfil'),
        db.getAllAsync('SELECT * FROM configuracao'),
        db.getAllAsync('SELECT * FROM produto_ingredientes'),
        db.getAllAsync('SELECT * FROM produto_preparos'),
        db.getAllAsync('SELECT * FROM produto_embalagens'),
        db.getAllAsync('SELECT * FROM materias_primas'),
        db.getAllAsync('SELECT * FROM preparos'),
        db.getAllAsync('SELECT * FROM embalagens'),
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT * FROM faturamento_mensal'),
      ]);
      const perfil = perfilRows?.[0] || {};
      const config = configRows?.[0] || {};

      // Build lookup maps
      const mpMap = {};
      allMPs.forEach(mp => { mpMap[mp.id] = mp; });
      const prepMap = {};
      allPreparos.forEach(pr => { prepMap[pr.id] = pr; });
      const embMap = {};
      allEmbItems.forEach(e => { embMap[e.id] = e; });

      // Merge names into ingredient/preparo/embalagem records
      const allIngs = rawProdIngs.map(pi => ({
        ...pi,
        mp_nome: mpMap[pi.materia_prima_id]?.nome || '',
        preco_por_kg: mpMap[pi.materia_prima_id]?.preco_por_kg || 0,
        unidade_medida: mpMap[pi.materia_prima_id]?.unidade_medida || 'Grama(s)',
      }));
      const allPreps = rawProdPreps.map(pp => ({
        ...pp,
        pr_nome: prepMap[pp.preparo_id]?.nome || '',
        custo_por_kg: prepMap[pp.preparo_id]?.custo_por_kg || 0,
        unidade_medida: prepMap[pp.preparo_id]?.unidade_medida || 'Grama(s)',
      }));
      const allEmbs = rawProdEmbs.map(pe => ({
        ...pe,
        emb_nome: embMap[pe.embalagem_id]?.nome || '',
        preco_unitario: embMap[pe.embalagem_id]?.preco_unitario || 0,
      }));

      const ingsByProd = {};
      allIngs.forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const prepsByProd = {};
      allPreps.forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
      const embsByProd = {};
      allEmbs.forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

      // Financial data for composition
      const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
      const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0);
      const mesesComFat = fat.filter(f => f.valor > 0);
      const fatMedio = mesesComFat.length > 0 ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length : 0;

      const selectedIds = Object.entries(selected)
        .filter(([, v]) => v)
        .map(([k]) => Number(k));

      const fichas = [];

      for (const id of selectedIds) {
        const produto = produtos.find(p => p.id === id);
        if (!produto) continue;

        const ings = ingsByProd[id] || [];
        const preps = prepsByProd[id] || [];
        const embs = embsByProd[id] || [];

        // Cost calculations
        const custoIng = (ings || []).reduce((a, ing) => {
          const qtBase = converterParaBase(ing.quantidade_utilizada, ing.unidade_medida || 'g');
          return a + (qtBase / 1000) * (ing.preco_por_kg || 0);
        }, 0);

        const custoPrep = (preps || []).reduce((a, prep) => {
          const qtBase = converterParaBase(prep.quantidade_utilizada, prep.unidade_medida || 'g');
          return a + (qtBase / 1000) * (prep.custo_por_kg || 0);
        }, 0);

        const custoEmb = (embs || []).reduce((a, emb) => {
          return a + (emb.preco_unitario || 0) * (emb.quantidade_utilizada || emb.quantidade || 1);
        }, 0);

        const cmvTotal = custoIng + custoPrep + custoEmb;
        const rendUnidades = produto.rendimento_unidades || 1;
        const cmv = cmvTotal / rendUnidades; // CMV por unidade
        const precoVenda = produto.preco_venda || 0;

        // Calculate despesas percentuais from actual data
        const despFixasPerc = fatMedio > 0 ? totalFixas / fatMedio : 0;
        const despVarPerc = totalVar / 100; // totalVar is sum of percentuais
        const lucroDesejado = config.lucro_desejado || 0.15;

        const despFixasVal = precoVenda * despFixasPerc;
        const despVarVal = precoVenda * despVarPerc;
        const lucroVal = precoVenda - cmv - despFixasVal - despVarVal;
        const margemVal = precoVenda > 0 ? lucroVal / precoVenda : 0;

        const totalPercDespesas = despFixasPerc + despVarPerc + lucroDesejado;
        const markup = totalPercDespesas < 1 ? 1 / (1 - totalPercDespesas) : 0;
        const precoSugerido = cmv * markup;

        const cmvPerc = precoVenda > 0 ? cmv / precoVenda : 0;

        fichas.push({
          produto,
          ings: ings || [],
          preps: preps || [],
          embs: embs || [],
          custoIng, custoPrep, custoEmb, cmv,
          precoSugerido, lucroVal, margemVal,
          cmvPerc, despFixasPerc, despVarPerc,
        });
      }

      const html = buildHTML(fichas, perfil, config, incluirAdicionais);
      exportarPDF(html);
    } catch (e) {
      console.warn('Erro ao exportar:', e);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header info */}
      <View style={styles.infoCard}>
        <Feather name="printer" size={22} color={colors.primary} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.infoTitle}>Exportar Fichas Técnicas</Text>
          <Text style={styles.infoDesc}>
            Selecione os produtos para gerar um PDF com as fichas técnicas completas.
          </Text>
        </View>
      </View>

      {/* Select all */}
      <TouchableOpacity style={styles.selectAllRow} onPress={toggleAll} activeOpacity={0.6}>
        <View style={[styles.checkbox, allSelected && styles.checkboxActive]}>
          {allSelected && <Feather name="check" size={14} color="#fff" />}
        </View>
        <Text style={styles.selectAllLabel}>Selecionar Todos</Text>
        <Text style={styles.countLabel}>{selectedCount} de {produtos.length}</Text>
      </TouchableOpacity>

      {/* Search */}
      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar produto..."
          placeholderTextColor={colors.disabled}
          value={busca}
          onChangeText={setBusca}
        />
        {busca.length > 0 && (
          <TouchableOpacity onPress={() => setBusca('')}>
            <Feather name="x" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Product list */}
      {produtos.length === 0 ? (
        <View style={styles.emptyCard}>
          <Feather name="inbox" size={36} color={colors.disabled} />
          <Text style={styles.emptyText}>Nenhum produto cadastrado</Text>
        </View>
      ) : (
        produtos.filter(p => !busca.trim() || p.nome.toLowerCase().includes(busca.toLowerCase())).map(p => {
          const isSelected = !!selected[p.id];
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.productRow, isSelected && styles.productRowActive]}
              onPress={() => toggleOne(p.id)}
              activeOpacity={0.6}
            >
              <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                {isSelected && <Feather name="check" size={14} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{p.nome}</Text>
                {p.categoria ? (
                  <Text style={styles.productCategory}>{p.categoria}</Text>
                ) : null}
              </View>
              {p.preco_venda ? (
                <Text style={styles.productPrice}>{formatCurrency(p.preco_venda)}</Text>
              ) : null}
            </TouchableOpacity>
          );
        })
      )}

      {/* Options */}
      {selectedCount > 0 && (
        <TouchableOpacity
          style={styles.optionRow}
          onPress={() => setIncluirAdicionais(!incluirAdicionais)}
          activeOpacity={0.6}
        >
          <View style={[styles.checkbox, incluirAdicionais && styles.checkboxActive]}>
            {incluirAdicionais && <Feather name="check" size={14} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>Incluir informações adicionais</Text>
            <Text style={styles.optionDesc}>Modo de preparo, conservação, validade e observações</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Export button */}
      <TouchableOpacity
        style={[styles.exportBtn, selectedCount === 0 && styles.exportBtnDisabled]}
        onPress={handleExport}
        activeOpacity={0.7}
        disabled={selectedCount === 0 || exporting}
      >
        {exporting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Feather name="printer" size={18} color="#fff" />
            <Text style={styles.exportBtnText}>
              Exportar PDF ({selectedCount} {selectedCount === 1 ? 'produto' : 'produtos'})
            </Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ============================================================
// HTML generation
// ============================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtCur(v) {
  if (v === null || v === undefined || isNaN(v)) return 'R$ 0,00';
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '0,00%';
  return (Number(v) * 100).toFixed(2).replace('.', ',') + '%';
}

function buildHTML(fichas, perfil, config, incluirAdicionais = true) {
  const dataStr = new Date().toLocaleDateString('pt-BR');
  const nomeNegocio = perfil.nome_negocio || '';

  const fichaCards = fichas.map((f, idx) => {
    const { produto, ings, preps, embs, custoIng, custoPrep, custoEmb, cmv, precoSugerido, lucroVal, margemVal, cmvPerc, despFixasPerc, despVarPerc } = f;

    const ingRows = ings.map(i => `
      <tr>
        <td>${escapeHtml(i.mp_nome || '')}</td>
        <td style="text-align:center">${i.quantidade_utilizada || 0}</td>
        <td style="text-align:center">${escapeHtml(i.unidade_medida || 'g')}</td>
        <td style="text-align:right">${fmtCur((converterParaBase(i.quantidade_utilizada, i.unidade_medida || 'g') / 1000) * (i.preco_por_kg || 0))}</td>
      </tr>
    `).join('');

    const prepRows = preps.map(p => `
      <tr>
        <td>${escapeHtml(p.pr_nome || '')}</td>
        <td style="text-align:center">${p.quantidade_utilizada || 0}</td>
        <td style="text-align:center">${escapeHtml(p.unidade_medida || 'g')}</td>
        <td style="text-align:right">${fmtCur((converterParaBase(p.quantidade_utilizada, p.unidade_medida || 'g') / 1000) * (p.custo_por_kg || 0))}</td>
      </tr>
    `).join('');

    const embRows = embs.map(e => `
      <tr>
        <td>${escapeHtml(e.emb_nome || '')}</td>
        <td style="text-align:center">${e.quantidade || 1}</td>
        <td style="text-align:right">${fmtCur((e.preco_unitario || 0) * (e.quantidade || 1))}</td>
      </tr>
    `).join('');

    const precoVenda = produto.preco_venda || 0;
    const lucroDesejadoPerc = config.lucro_desejado || 0;

    return `
      <div class="ficha" ${idx > 0 ? 'style="page-break-before:always;"' : ''}>
        <div class="ficha-header">
          <h2>${escapeHtml(produto.nome || 'Sem nome')}</h2>
          <div class="ficha-meta">
            ${produto.categoria ? `<span class="badge">${escapeHtml(produto.categoria)}</span>` : ''}
            <span class="preco">${fmtCur(precoVenda)}</span>
          </div>
        </div>

        <!-- Resumo de Custos -->
        <div class="section-title">Resumo de Custos</div>
        <div class="resumo-grid">
          <div class="resumo-item">
            <span class="resumo-label">CMV</span>
            <span class="resumo-value">${fmtCur(cmv)}</span>
          </div>
          <div class="resumo-item">
            <span class="resumo-label">Preço Sugerido</span>
            <span class="resumo-value">${fmtCur(precoSugerido)}</span>
          </div>
          <div class="resumo-item">
            <span class="resumo-label">Lucro</span>
            <span class="resumo-value" style="color:${lucroVal >= 0 ? '#2E7D32' : '#c74040'}">${fmtCur(lucroVal)}</span>
          </div>
          <div class="resumo-item">
            <span class="resumo-label">Margem</span>
            <span class="resumo-value" style="color:${margemVal >= 0 ? '#2E7D32' : '#c74040'}">${fmtPct(margemVal)}</span>
          </div>
        </div>

        ${ings.length > 0 ? `
        <!-- Ingredientes -->
        <div class="section-title">Ingredientes</div>
        <table>
          <thead>
            <tr><th>Nome</th><th style="text-align:center">Qtd</th><th style="text-align:center">Unidade</th><th style="text-align:right">Custo</th></tr>
          </thead>
          <tbody>
            ${ingRows}
            <tr class="total-row"><td colspan="3"><strong>Total Ingredientes</strong></td><td style="text-align:right"><strong>${fmtCur(custoIng)}</strong></td></tr>
          </tbody>
        </table>
        ` : ''}

        ${preps.length > 0 ? `
        <!-- Preparos -->
        <div class="section-title">Preparos</div>
        <table>
          <thead>
            <tr><th>Nome</th><th style="text-align:center">Qtd</th><th style="text-align:center">Unidade</th><th style="text-align:right">Custo</th></tr>
          </thead>
          <tbody>
            ${prepRows}
            <tr class="total-row"><td colspan="3"><strong>Total Preparos</strong></td><td style="text-align:right"><strong>${fmtCur(custoPrep)}</strong></td></tr>
          </tbody>
        </table>
        ` : ''}

        ${embs.length > 0 ? `
        <!-- Embalagens -->
        <div class="section-title">Embalagens</div>
        <table>
          <thead>
            <tr><th>Nome</th><th style="text-align:center">Qtd</th><th style="text-align:right">Custo</th></tr>
          </thead>
          <tbody>
            ${embRows}
            <tr class="total-row"><td colspan="2"><strong>Total Embalagens</strong></td><td style="text-align:right"><strong>${fmtCur(custoEmb)}</strong></td></tr>
          </tbody>
        </table>
        ` : ''}

        <!-- Composição do Preço -->
        <div class="section-title">Composição do Preço</div>
        <div class="composicao-grid">
          <div class="comp-item">
            <div class="comp-bar" style="width:${Math.min(cmvPerc * 100, 100)}%; background-color:#e3704d;"></div>
            <span class="comp-label">CMV</span>
            <span class="comp-value">${fmtPct(cmvPerc)}</span>
          </div>
          <div class="comp-item">
            <div class="comp-bar" style="width:${Math.min(despFixasPerc * 100, 100)}%; background-color:#265bb0;"></div>
            <span class="comp-label">Custos Fixos</span>
            <span class="comp-value">${fmtPct(despFixasPerc)}</span>
          </div>
          <div class="comp-item">
            <div class="comp-bar" style="width:${Math.min(despVarPerc * 100, 100)}%; background-color:#e3b842;"></div>
            <span class="comp-label">Custos Variáveis</span>
            <span class="comp-value">${fmtPct(despVarPerc)}</span>
          </div>
          <div class="comp-item">
            <div class="comp-bar" style="width:${Math.min(Math.max(margemVal, 0) * 100, 100)}%; background-color:#2E7D32;"></div>
            <span class="comp-label">Margem</span>
            <span class="comp-value">${fmtPct(margemVal)}</span>
          </div>
        </div>

        ${incluirAdicionais && (produto.modo_preparo || produto.observacoes || produto.validade_dias || produto.temp_congelado || produto.temp_refrigerado || produto.temp_ambiente) ? `
        <!-- Informações Adicionais -->
        <div style="page-break-before: auto; margin-top: 16px;">
          <div class="section-title">Informações Adicionais</div>
          <table class="data-table" style="width: 100%;">
            <tbody>
              ${produto.modo_preparo ? `<tr><td style="font-weight:600; width:150px; vertical-align:top; padding:8px;">Modo de Preparo</td><td style="padding:8px; white-space:pre-wrap;">${escapeHtml(produto.modo_preparo)}</td></tr>` : ''}
              ${produto.validade_dias ? `<tr><td style="font-weight:600; width:150px; padding:8px;">Validade</td><td style="padding:8px;">${escapeHtml(String(produto.validade_dias))} dias</td></tr>` : ''}
              ${produto.temp_congelado && produto.tempo_congelado ? `<tr><td style="font-weight:600; width:150px; padding:8px;">Congelado</td><td style="padding:8px;">${escapeHtml(String(produto.temp_congelado))}°C por ${escapeHtml(String(produto.tempo_congelado))}</td></tr>` : ''}
              ${produto.temp_refrigerado && produto.tempo_refrigerado ? `<tr><td style="font-weight:600; width:150px; padding:8px;">Refrigerado</td><td style="padding:8px;">${escapeHtml(String(produto.temp_refrigerado))}°C por ${escapeHtml(String(produto.tempo_refrigerado))}</td></tr>` : ''}
              ${produto.temp_ambiente && produto.tempo_ambiente ? `<tr><td style="font-weight:600; width:150px; padding:8px;">Ambiente</td><td style="padding:8px;">${escapeHtml(String(produto.temp_ambiente))}°C por ${escapeHtml(String(produto.tempo_ambiente))}</td></tr>` : ''}
              ${produto.observacoes ? `<tr><td style="font-weight:600; width:150px; vertical-align:top; padding:8px;">Observações</td><td style="padding:8px; white-space:pre-wrap;">${escapeHtml(produto.observacoes)}</td></tr>` : ''}
            </tbody>
          </table>
        </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fichas Técnicas - Precificaí</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'DM Sans', sans-serif;
    color: #1A2B2A;
    background: #F4F6F5;
    padding: 0;
  }
  .page-header {
    background: #004d47;
    color: #fff;
    padding: 24px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .page-header h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .page-header .meta {
    text-align: right;
    font-size: 13px;
    opacity: 0.85;
  }
  .page-content {
    max-width: 900px;
    margin: 0 auto;
    padding: 24px 16px;
  }
  .ficha {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    border: 1px solid #D8E0DE;
    box-shadow: 0 2px 8px rgba(0,77,71,0.06);
  }
  .ficha-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid #004d47;
  }
  .ficha-header h2 {
    font-size: 20px;
    font-weight: 700;
    color: #004d47;
  }
  .ficha-meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .badge {
    background: #004d4712;
    color: #004d47;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
  }
  .preco {
    font-size: 18px;
    font-weight: 700;
    color: #004d47;
  }
  .section-title {
    font-size: 14px;
    font-weight: 700;
    color: #004d47;
    margin: 16px 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .resumo-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 8px;
  }
  .resumo-item {
    background: #F4F6F5;
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }
  .resumo-label {
    display: block;
    font-size: 11px;
    color: #6B7D7B;
    font-weight: 600;
    margin-bottom: 4px;
    text-transform: uppercase;
  }
  .resumo-value {
    display: block;
    font-size: 16px;
    font-weight: 700;
    color: #1A2B2A;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    font-size: 13px;
  }
  thead th {
    background: #F4F6F5;
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
    color: #6B7D7B;
    font-size: 11px;
    text-transform: uppercase;
    border-bottom: 1px solid #D8E0DE;
  }
  tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid #F4F6F5;
  }
  .total-row td {
    border-top: 2px solid #D8E0DE;
    background: #F4F6F5;
  }
  .composicao-grid {
    margin-bottom: 8px;
  }
  .comp-item {
    display: flex;
    align-items: center;
    margin-bottom: 6px;
    position: relative;
    height: 28px;
    background: #F4F6F5;
    border-radius: 6px;
    overflow: hidden;
  }
  .comp-bar {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    border-radius: 6px;
    opacity: 0.2;
  }
  .comp-label {
    position: relative;
    z-index: 1;
    margin-left: 10px;
    font-size: 12px;
    font-weight: 600;
    color: #1A2B2A;
    flex: 1;
  }
  .comp-value {
    position: relative;
    z-index: 1;
    margin-right: 10px;
    font-size: 12px;
    font-weight: 700;
    color: #1A2B2A;
  }
  .page-footer {
    text-align: center;
    padding: 16px;
    font-size: 12px;
    color: #6B7D7B;
    border-top: 1px solid #D8E0DE;
    margin-top: 24px;
  }
  @page {
    margin: 10mm 10mm 12mm 10mm;
    size: A4;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .page-header { margin: 0; }
    .page-content { padding: 0 16px; }
    .ficha { box-shadow: none; break-inside: avoid; }
    .page-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9px; color: #999; padding: 4px; }
  }
</style>
</head>
<body>
  <div class="page-header">
    <div>
      <h1>Precificaí</h1>
      ${nomeNegocio ? `<div style="font-size:14px;margin-top:4px;opacity:0.9">${escapeHtml(nomeNegocio)}</div>` : ''}
    </div>
    <div class="meta">
      <div>Fichas Técnicas</div>
      <div>${dataStr}</div>
    </div>
  </div>
  <div class="page-content">
    ${fichaCards}
  </div>
  <div class="page-footer">
    Gerado por Precificaí - precificaipp.com
  </div>
</body>
</html>`;
}

function exportarPDF(htmlContent) {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(htmlContent);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  }
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 40,
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,77,71,0.06)' },
      default: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
    }),
  },
  infoTitle: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  infoDesc: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.text,
    padding: 0,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,77,71,0.06)' },
      default: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
    }),
  },
  selectAllLabel: {
    flex: 1,
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginLeft: spacing.md,
  },
  countLabel: {
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productRowActive: {
    borderColor: colors.primary + '60',
    backgroundColor: colors.primary + '06',
  },
  productName: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginLeft: spacing.md,
  },
  productCategory: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginLeft: spacing.md,
    marginTop: 2,
  },
  productPrice: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: 8,
  },
  exportBtnDisabled: {
    backgroundColor: colors.disabled,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  optionLabel: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text },
  optionDesc: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  exportBtnText: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: '#fff',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
