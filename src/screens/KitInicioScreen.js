import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { SEGMENTOS, INSUMOS_POR_SEGMENTO, CATEGORIAS_POR_SEGMENTO } from '../data/templates';
import { calcPrecoBase, calcFatorCorrecao } from '../utils/calculations';

const SEGMENT_ICONS = {
  confeitaria: { set: 'material', name: 'cake-variant' },
  hamburgueria: { set: 'material', name: 'hamburger' },
  pizzaria: { set: 'material', name: 'pizza' },
  restaurante: { set: 'material', name: 'silverware-fork-knife' },
  padaria: { set: 'material', name: 'bread-slice' },
  marmitaria: { set: 'feather', name: 'package' },
  acai: { set: 'material', name: 'cup' },
  cafeteria: { set: 'material', name: 'coffee' },
  sorveteria: { set: 'material', name: 'ice-cream' },
  salgaderia: { set: 'material', name: 'food-drumstick' },
  japonesa: { set: 'material', name: 'fish' },
  outro: { set: 'feather', name: 'grid' },
};

export default function KitInicioScreen({ navigation, route }) {
  const isSetup = route?.params?.setup === true;
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function navegarAposKit() {
    if (isSetup) {
      navigation.replace('Onboarding');
    } else {
      navigation.goBack();
    }
  }

  async function aplicarKit() {
    if (!selected || selected === 'outro') {
      navegarAposKit();
      return;
    }

    // Se não é setup (está nas configurações), avisar que vai resetar
    if (!isSetup) {
      Alert.alert(
        '⚠️ Atenção',
        'Ao trocar o kit de início, todos os insumos, categorias, preparos, produtos e embalagens atuais serão excluídos e o app será reiniciado com os dados do novo segmento.\n\nDeseja continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sim, resetar', style: 'destructive', onPress: () => executarKit(true) },
        ]
      );
      return;
    }

    executarKit(false);
  }

  async function executarKit(resetar) {

    setLoading(true);
    try {
      const db = await getDatabase();

      // Se resetar, limpar todos os dados do usuário
      if (resetar) {
        const tablesOrdered = [
          'produto_ingredientes', 'produto_preparos', 'produto_embalagens',
          'preparo_ingredientes', 'delivery_combo_itens', 'delivery_produto_itens',
          'delivery_combos', 'delivery_produtos', 'delivery_adicionais', 'delivery_config',
          'produtos', 'preparos', 'embalagens', 'materias_primas',
          'categorias_produtos', 'categorias_preparos', 'categorias_embalagens', 'categorias_insumos',
        ];
        for (const table of tablesOrdered) {
          try {
            await db.runAsync(`DELETE FROM ${table} WHERE 1=1`);
          } catch (e) { /* ignora se tabela não existe */ }
        }
      }

      const insumosTemplate = INSUMOS_POR_SEGMENTO[selected] || [];
      const categoriasTemplate = CATEGORIAS_POR_SEGMENTO[selected] || [];

      // Criar categorias
      const catIds = {};
      for (const catNome of categoriasTemplate) {
        const existing = await db.getAllAsync('SELECT id FROM categorias_insumos WHERE nome = ?', [catNome]);
        if (existing.length > 0) {
          catIds[catNome] = existing[0].id;
        } else {
          const result = await db.runAsync(
            'INSERT INTO categorias_insumos (nome, icone) VALUES (?, ?)',
            [catNome, '📦']
          );
          catIds[catNome] = result?.lastInsertRowId;
        }
      }

      // Criar insumos
      let criados = 0;
      for (const insumo of insumosTemplate) {
        // Verificar se já existe
        const existing = await db.getAllAsync('SELECT id FROM materias_primas WHERE nome = ?', [insumo.nome]);
        if (existing.length > 0) continue;

        const fc = calcFatorCorrecao(insumo.quantidade_bruta, insumo.quantidade_liquida);
        const pb = calcPrecoBase(insumo.valor_pago, insumo.quantidade_liquida, insumo.unidade_medida);

        // Encontrar categoria
        let catId = null;
        for (const [catNome, id] of Object.entries(catIds)) {
          catId = id; // default to first
          break;
        }

        await db.runAsync(
          'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
          [insumo.nome, '', catId, insumo.quantidade_bruta, insumo.quantidade_liquida, fc, insumo.unidade_medida, insumo.valor_pago, pb]
        );
        criados++;
      }

      setDone(true);
      setTimeout(() => {
        Alert.alert(
          '✅ Kit aplicado!',
          `${criados} insumos e ${categoriasTemplate.length} categorias foram cadastrados. Agora ajuste os preços conforme seus fornecedores.`,
          [{ text: 'Começar', onPress: navegarAposKit }]
        );
      }, 500);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível aplicar o kit. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const segmentoInfo = selected ? SEGMENTOS.find(s => s.key === selected) : null;
  const insumosCount = selected ? (INSUMOS_POR_SEGMENTO[selected]?.length || 0) : 0;
  const categoriasCount = selected ? (CATEGORIAS_POR_SEGMENTO[selected]?.length || 0) : 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerCard}>
          <Feather name="zap" size={24} color={colors.primary} />
          <Text style={styles.headerTitle}>Kit de Início Rápido</Text>
          <Text style={styles.headerDesc}>
            Selecione seu tipo de negócio e receba insumos e categorias pré-cadastrados. Depois é só ajustar os preços!
          </Text>
        </View>

        {/* Aviso de reset quando acessado pelas Configurações */}
        {!isSetup && (
          <View style={styles.warningCard}>
            <Feather name="alert-triangle" size={18} color={colors.warning} />
            <Text style={styles.warningText}>
              Ao trocar o segmento, todos os dados cadastrados (insumos, preparos, embalagens e produtos) serão excluídos e substituídos pelo novo kit.
            </Text>
          </View>
        )}

        {/* Segmentos Grid */}
        <View style={styles.grid}>
          {SEGMENTOS.map(seg => {
            const iconDef = SEGMENT_ICONS[seg.key];
            const isSelected = selected === seg.key;
            const IconComp = iconDef.set === 'material' ? MaterialCommunityIcons : Feather;

            return (
              <TouchableOpacity
                key={seg.key}
                style={[styles.segCard, isSelected && styles.segCardSelected]}
                onPress={() => setSelected(seg.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.segIconCircle, isSelected && styles.segIconCircleSelected]}>
                  <IconComp name={iconDef.name} size={24} color={isSelected ? '#fff' : colors.primary} />
                </View>
                <Text style={[styles.segLabel, isSelected && styles.segLabelSelected]}>{seg.label}</Text>
                <Text style={styles.segDesc}>{seg.desc}</Text>
                {isSelected && <Feather name="check-circle" size={18} color={colors.primary} style={styles.segCheck} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Preview do que será cadastrado */}
        {selected && selected !== 'outro' && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>O que será cadastrado:</Text>
            <View style={styles.previewRow}>
              <View style={styles.previewItem}>
                <Text style={styles.previewNumber}>{insumosCount}</Text>
                <Text style={styles.previewLabel}>Insumos</Text>
              </View>
              <View style={styles.previewItem}>
                <Text style={styles.previewNumber}>{categoriasCount}</Text>
                <Text style={styles.previewLabel}>Categorias</Text>
              </View>
            </View>
            <Text style={styles.previewHint}>
              Os preços são estimativas médias. Ajuste conforme seus fornecedores após o cadastro.
            </Text>

            {/* Lista de insumos que serão cadastrados */}
            <View style={styles.previewList}>
              {(INSUMOS_POR_SEGMENTO[selected] || []).map((ins, i) => (
                <View key={i} style={styles.previewListItem}>
                  <Text style={styles.previewListName} numberOfLines={1}>{ins.nome}</Text>
                  <Text style={styles.previewListPrice}>R$ {ins.valor_pago.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Botão aplicar */}
        {selected && (
          <TouchableOpacity
            style={[styles.aplicarBtn, loading && { opacity: 0.6 }]}
            onPress={aplicarKit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name={selected === 'outro' ? 'arrow-right' : 'download'} size={18} color="#fff" />
                <Text style={styles.aplicarBtnText}>
                  {selected === 'outro' ? 'Começar do zero' : `Aplicar Kit ${segmentoInfo?.label}`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 960, alignSelf: 'center', width: '100%', paddingBottom: 40 },

  headerCard: {
    alignItems: 'center', padding: spacing.lg,
    backgroundColor: colors.primary + '08', borderRadius: borderRadius.lg,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.primary + '20',
  },
  headerTitle: { fontSize: fonts.title, fontFamily: fontFamily.bold, color: colors.primary, marginTop: spacing.sm },
  headerDesc: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 },

  warningCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: colors.warning + '10', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.warning + '30',
  },
  warningText: { flex: 1, fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.warning, lineHeight: 20 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: spacing.lg },
  segCard: {
    width: '48%', minWidth: 150, backgroundColor: colors.surface,
    borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 2, borderColor: colors.border, position: 'relative',
  },
  segCardSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '05' },
  segIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary + '10', alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  segIconCircleSelected: { backgroundColor: colors.primary },
  segLabel: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 2 },
  segLabelSelected: { color: colors.primary },
  segDesc: { fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary },
  segCheck: { position: 'absolute', top: 12, right: 12 },

  previewCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
  },
  previewTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.sm },
  previewRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  previewItem: { flex: 1, alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.sm, padding: spacing.sm },
  previewNumber: { fontSize: fonts.title, fontFamily: fontFamily.bold, color: colors.primary },
  previewLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.medium },
  previewHint: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginBottom: spacing.sm },

  previewList: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  previewListItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border + '40',
  },
  previewListName: { fontSize: fonts.small, color: colors.text, flex: 1 },
  previewListPrice: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.primary },

  aplicarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 14, marginTop: spacing.sm,
  },
  aplicarBtnText: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: '#fff' },
});
