import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { getDatabase } from '../database/database';
import usePushPermissions from '../hooks/usePushPermissions';
import InputField from '../components/InputField';
import Card from '../components/Card';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';
import { formatCurrency, converterParaBase, calcDespesasFixasPercentual, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';

function getUltimos6Meses() {
  const meses = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    meses.push({ key: `${yyyy}-${mm}`, label: `${nomesMeses[d.getMonth()]}/${String(yyyy).slice(2)}` });
  }
  return meses;
}

function formatDateBR(dateStr) {
  if (!dateStr || dateStr.length < 10) return dateStr || '';
  const [yyyy, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

export default function VendaDetalheScreen({ route }) {
  const produtoId = route.params.id;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [produto, setProduto] = useState(null);
  const [custoUnitario, setCustoUnitario] = useState(0);
  const [dataVenda, setDataVenda] = useState(todayStr);
  const [quantidade, setQuantidade] = useState('');
  const [mesAtual, setMesAtual] = useState(getUltimos6Meses()[0].key);
  const [vendasDoMes, setVendasDoMes] = useState([]);
  const [config, setConfig] = useState({ despFixasPerc: 0, despVarPerc: 0 });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const savingRef = useRef(false);
  const { askIfNotAsked } = usePushPermissions();

  const meses = getUltimos6Meses();

  useEffect(() => {
    loadData();
  }, [mesAtual]);

  async function loadData() {
    try {
      const db = await getDatabase();

      // Load product
      const prods = await db.getAllAsync('SELECT * FROM produtos WHERE id = ?', [produtoId]);
      if (prods.length === 0) return;
      const prod = prods[0];
      setProduto(prod);

      // Load despesas config
      const fixas = await db.getAllAsync('SELECT * FROM despesas_fixas');
      const variaveis = await db.getAllAsync('SELECT * FROM despesas_variaveis');
      const fat = await db.getAllAsync('SELECT * FROM faturamento_mensal');
      const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
      const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0);
      const mesesComFat = fat.filter(f => f.valor > 0);
      const fatMedio = mesesComFat.length > 0 ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length : 0;
      const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
      setConfig({ despFixasPerc: dfPerc, despVarPerc: totalVar });

      // Calculate unit cost
      const ings = await db.getAllAsync(
        `SELECT pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi
         JOIN materias_primas mp ON mp.id = pi.materia_prima_id WHERE pi.produto_id = ?`, [produtoId]);
      const custoIng = ings.reduce((a, i) => {
        return a + calcCustoIngrediente(i.preco_por_kg, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida);
      }, 0);

      const preps = await db.getAllAsync(
        `SELECT pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp
         JOIN preparos pr ON pr.id = pp.preparo_id WHERE pp.produto_id = ?`, [produtoId]);
      const custoPr = preps.reduce((a, pp) => {
        return a + calcCustoPreparo(pp.custo_por_kg, pp.quantidade_utilizada, pp.unidade_medida || 'g');
      }, 0);

      const embs = await db.getAllAsync(
        `SELECT pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe
         JOIN embalagens em ON em.id = pe.embalagem_id WHERE pe.produto_id = ?`, [produtoId]);
      const custoEmb = embs.reduce((a, e) => a + e.preco_unitario * e.quantidade_utilizada, 0);

      const divisor = getDivisorRendimento(prod) || 1;
      const custoUn = (custoIng + custoPr + custoEmb) / divisor;
      setCustoUnitario(Number.isFinite(custoUn) && custoUn >= 0 ? custoUn : 0);

      // Load sales for selected month (filter in JS for web DB compatibility)
      const todasVendas = await db.getAllAsync('SELECT * FROM vendas');
      const vendasDoProduto = todasVendas.filter(v => v.produto_id == produtoId);
      const vendasFiltradas = vendasDoProduto.filter(v => v.data && v.data.startsWith(mesAtual));
      vendasFiltradas.sort((a, b) => b.data.localeCompare(a.data));
      setVendasDoMes(vendasFiltradas);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[VendaDetalheScreen.loadData]', e);
    }
  }

  async function registrarVenda() {
    // Guard contra double-tap (useRef sincroniza imediato; setState é async).
    if (savingRef.current) return;
    const qtdNum = parseFloat(String(quantidade).replace(',', '.'));
    if (!quantidade || !Number.isFinite(qtdNum) || qtdNum <= 0) {
      return Alert.alert('Atenção', 'Informe uma quantidade válida (maior que zero)');
    }
    if (!dataVenda || !/^\d{4}-\d{2}-\d{2}$/.test(dataVenda)) {
      return Alert.alert('Atenção', 'Informe uma data válida (AAAA-MM-DD)');
    }
    savingRef.current = true;
    setSalvando(true);
    let vendaInseridaId = null;
    try {
      const db = await getDatabase();
      const qtd = qtdNum;
      const result = await db.runAsync(
        'INSERT INTO vendas (produto_id, data, quantidade) VALUES (?, ?, ?)',
        [produtoId, dataVenda, qtd]
      );
      vendaInseridaId = result?.lastInsertRowId || null;

      // Baixa de estoque (M1-10). Se falhar, faz rollback da venda e avisa.
      try {
        const { baixarEstoquePorVenda } = await import('../services/estoque');
        const res = await baixarEstoquePorVenda(db, produtoId, qtd, vendaInseridaId);
        // res.semBOM === true → produto sem BOM cadastrado, OK não bloqueia
        if (res?.semBOM) {
          // venda fica registrada, mas sem baixa de insumos
        }
      } catch (estoqueErr) {
        // Reverte a venda recém-inserida.
        if (vendaInseridaId) {
          try {
            await db.runAsync('DELETE FROM vendas WHERE id = ?', [vendaInseridaId]);
          } catch (_) { /* swallow rollback error */ }
        }
        Alert.alert(
          'Venda não registrada',
          estoqueErr?.message || 'Falha ao baixar estoque. A venda foi cancelada.'
        );
        return;
      }

      setQuantidade('');
      loadData();

      // Earned moment: pede permissão de push apenas após a PRIMEIRA venda real do
      // histórico do usuário (não a primeira da sessão). A venda recém-inserida já
      // está no DB, então totalVendas === 1 ⇒ é a primeira de fato.
      // Idempotente — askIfNotAsked também guarda flag (chave 'first_sale').
      try {
        const countRow = await db.getFirstAsync('SELECT COUNT(*) as count FROM vendas');
        const totalVendas = countRow?.count || 0;
        if (totalVendas === 1) {
          await askIfNotAsked('first_sale');
        }
      } catch (pushErr) {
        // Não bloqueia a venda — apenas registra para diagnóstico.
        if (typeof console !== 'undefined' && console.error) {
          console.error('[VendaDetalheScreen.registrarVenda.earnedMoment]', pushErr);
        }
      }
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Não foi possível registrar a venda.');
    } finally {
      savingRef.current = false;
      setSalvando(false);
    }
  }

  function removerVenda(id, data, qtd) {
    setConfirmDelete({
      titulo: 'Remover Venda',
      nome: `${formatDateBR(data)} - ${qtd} un`,
      onConfirm: async () => {
        const db = await getDatabase();
        try {
          // Primeiro estorna o estoque (devolve insumos ao saldo).
          // Idempotente — se a venda nunca baixou estoque, retorna 0.
          const { estornarEstoquePorVenda } = await import('../services/estoque');
          try {
            await estornarEstoquePorVenda(id);
          } catch (_) { /* não bloqueia delete da venda */ }
          await db.runAsync('DELETE FROM vendas WHERE id = ?', [id]);
        } finally {
          setConfirmDelete(null);
          loadData();
        }
      },
    });
  }

  if (!produto) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Carregando...</Text>
      </View>
    );
  }

  const precoVenda = produto.preco_venda || 0;
  const margemPerc = precoVenda > 0 ? ((precoVenda - custoUnitario) / precoVenda) * 100 : 0;
  const cmvPerc = precoVenda > 0 ? (custoUnitario / precoVenda) * 100 : 0;

  // Month summary
  const qtdMes = vendasDoMes.reduce((a, v) => a + (v.quantidade || 0), 0);
  const faturamentoMes = qtdMes * precoVenda;
  const custoTotalMes = qtdMes * custoUnitario;
  const lucroBrutoMes = faturamentoMes - custoTotalMes;
  const despFixasMes = faturamentoMes * config.despFixasPerc;
  const despVarMes = faturamentoMes * config.despVarPerc;
  const lucroLiquidoMes = faturamentoMes - custoTotalMes - despFixasMes - despVarMes;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 1. Product Info Card */}
      <Card title={produto.nome}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Preço de venda</Text>
          <Text style={[styles.infoValue, { color: colors.info }]}>{formatCurrency(precoVenda)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Custo unitario</Text>
          <Text style={styles.infoValue}>{formatCurrency(custoUnitario)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Margem</Text>
          <Text style={[styles.infoValue, { color: margemPerc >= 0 ? colors.success : colors.error }]}>
            {margemPerc.toFixed(1)}%
          </Text>
        </View>
        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.infoLabel}>CMV</Text>
          <Text style={[styles.infoValue, { color: cmvPerc <= 35 ? colors.success : colors.warning }]}>
            {cmvPerc.toFixed(1)}%
          </Text>
        </View>
      </Card>

      {/* 2. Register Sale Form */}
      <Card title="Registrar Venda">
        <InputField
          label="Data"
          value={dataVenda}
          onChangeText={setDataVenda}
          placeholder="AAAA-MM-DD"
        />
        <InputField
          label="Quantidade"
          value={quantidade}
          onChangeText={setQuantidade}
          placeholder="Ex: 10"
          keyboardType="numeric"
        />
        <TouchableOpacity
          style={[styles.btnRegistrar, salvando && { opacity: 0.6 }]}
          onPress={registrarVenda}
          disabled={salvando}
          activeOpacity={0.7}
        >
          <Text style={styles.btnRegistrarText}>
            {salvando ? 'Registrando…' : 'Registrar Venda'}
          </Text>
        </TouchableOpacity>
      </Card>

      {/* 3. Month Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mesesScroll} contentContainerStyle={styles.mesesList}>
        {meses.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[styles.mesChip, mesAtual === m.key && styles.mesChipAtivo]}
            onPress={() => setMesAtual(m.key)}
          >
            <Text style={[styles.mesTexto, mesAtual === m.key && styles.mesTextoAtivo]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 4. Month Summary Card */}
      <Card title="Resumo do Mes">
        <View style={styles.resumoGrid}>
          <View style={styles.resumoItem}>
            <Text style={styles.resumoLabel}>Qtd vendida</Text>
            <Text style={styles.resumoValor}>
              {qtdMes % 1 === 0 ? qtdMes : qtdMes.toFixed(1)}
            </Text>
          </View>
          <View style={styles.resumoItem}>
            <Text style={styles.resumoLabel}>Faturamento</Text>
            <Text style={[styles.resumoValor, { color: colors.info }]}>{formatCurrency(faturamentoMes)}</Text>
          </View>
          <View style={styles.resumoItem}>
            <Text style={styles.resumoLabel}>Custo total</Text>
            <Text style={[styles.resumoValor, { color: colors.error }]}>{formatCurrency(custoTotalMes)}</Text>
          </View>
          <View style={styles.resumoItem}>
            <Text style={styles.resumoLabel}>Lucro bruto</Text>
            <Text style={[styles.resumoValor, { color: lucroBrutoMes >= 0 ? colors.success : colors.error }]}>
              {formatCurrency(lucroBrutoMes)}
            </Text>
          </View>
          <View style={[styles.resumoItem, { width: '100%' }]}>
            <Text style={styles.resumoLabel}>Lucro liquido</Text>
            <Text style={[styles.resumoValor, { color: lucroLiquidoMes >= 0 ? colors.success : colors.error, fontSize: fonts.large }]}>
              {formatCurrency(lucroLiquidoMes)}
            </Text>
          </View>
        </View>
      </Card>

      {/* 5. Sales History Table */}
      <Card title="Histórico de Vendas">
        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Data</Text>
          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Qtd</Text>
          <Text style={[styles.tableHeaderText, { flex: 2, textAlign: 'right' }]}>Valor</Text>
          <Text style={[styles.tableHeaderText, { width: 40, textAlign: 'center' }]}>Acao</Text>
        </View>

        {vendasDoMes.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma venda registrada neste mês</Text>
        ) : (
          vendasDoMes.map((v, index) => (
            <View key={String(v.id)} style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}>
              <Text style={[styles.tableCell, { flex: 2 }]}>{formatDateBR(v.data)}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                {v.quantidade % 1 === 0 ? v.quantidade : v.quantidade.toFixed(1)}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, textAlign: 'right', color: colors.info }]}>
                {formatCurrency(v.quantidade * precoVenda)}
              </Text>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => removerVenda(v.id, v.data, v.quantidade)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </Card>
    </ScrollView>

      <ConfirmDeleteModal
        visible={!!confirmDelete}
        titulo={confirmDelete?.titulo}
        nome={confirmDelete?.nome}
        onConfirm={confirmDelete?.onConfirm}
        onCancel={() => setConfirmDelete(null)}
        confirmLabel="Remover"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Product info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: fonts.regular,
    fontWeight: '700',
    color: colors.text,
  },

  // Register button
  btnRegistrar: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  btnRegistrarText: {
    color: colors.textLight,
    fontSize: fonts.regular,
    fontWeight: '700',
  },

  // Month selector
  mesesScroll: {
    marginBottom: spacing.md,
  },
  mesesList: {
    gap: spacing.xs,
  },
  mesChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  mesChipAtivo: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mesTexto: {
    fontSize: fonts.tiny,
    fontWeight: '600',
    color: colors.text,
  },
  mesTextoAtivo: {
    color: colors.textLight,
  },

  // Summary grid
  resumoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  resumoItem: {
    width: '50%',
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
  },
  resumoLabel: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  resumoValor: {
    fontSize: fonts.regular,
    fontWeight: '700',
    color: colors.primary,
  },

  // Table
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: 1,
  },
  tableHeaderText: {
    color: colors.textLight,
    fontSize: fonts.tiny,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
  },
  tableRowAlt: {
    backgroundColor: colors.inputBg,
  },
  tableCell: {
    fontSize: fonts.tiny,
    color: colors.text,
    fontWeight: '500',
  },
  deleteBtn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '700',
  },

  // Empty
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: fonts.small,
    paddingVertical: spacing.lg,
  },
});
