import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { supabase } from '../config/supabase';
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
    try {
      if (isSetup) {
        navigation.replace('Onboarding');
      } else {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.replace('MainTabs');
        }
      }
    } catch (e) {
      console.warn('navegarAposKit fallback:', e);
      navigation.replace('MainTabs');
    }
  }

  async function aplicarKit() {
    if (!selected) return;

    if (selected === 'outro') {
      navegarAposKit();
      return;
    }

    // Fluxo com confirmação dupla (reset) quando vem das Configurações
    if (!isSetup) {
      if (Platform.OS === 'web') {
        const confirm1 = window.confirm('Atenção: Aplicar este kit vai substituir todos os dados atuais do app (insumos, categorias, etc). Deseja continuar?');
        if (!confirm1) return;
        const confirm2 = window.confirm('Confirmação Final: Tem certeza? Esta ação não pode ser desfeita.');
        if (!confirm2) return;
        console.log('[Kit] Confirmações OK, chamando executarKit(true)...');
        await executarKit(true);
        return;
      } else {
        Alert.alert(
          'Atenção',
          'Aplicar este kit vai substituir todos os dados atuais do app (insumos, categorias, etc). Deseja continuar?',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Sim, continuar',
              style: 'destructive',
              onPress: () => {
                Alert.alert(
                  'Confirmação Final',
                  'Tem certeza? Esta ação não pode ser desfeita.',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Sim, tenho certeza', style: 'destructive', onPress: () => executarKit(true) },
                  ]
                );
              },
            },
          ]
        );
        return;
      }
    }

    // Fluxo setup (primeiro uso) — sem confirmação
    console.log('[Kit] Setup mode, chamando executarKit(false)...');
    await executarKit(false);
  }

  async function executarKit(resetar) {
    setLoading(true);
    try {
      console.log('[Kit] Step 0: Getting user...');
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error('Erro de autenticação: ' + authErr.message);
      const userId = authData?.user?.id;
      if (!userId) throw new Error('Usuário não autenticado');
      console.log('[Kit] User OK:', userId.substring(0, 8));

      const insumosTemplate = INSUMOS_POR_SEGMENTO[selected] || [];
      const categoriasTemplate = CATEGORIAS_POR_SEGMENTO[selected] || [];

      // Step 1: Clean existing data — sequential in FK-safe order
      if (resetar || isSetup) {
        console.log('[Kit] Step 1: Cleaning data...');
        // Phase 1: Junction tables (no dependencies)
        const phase1 = ['produto_ingredientes', 'produto_preparos', 'produto_embalagens',
          'preparo_ingredientes', 'delivery_combo_itens', 'delivery_produto_itens'];
        await Promise.all(phase1.map(t =>
          supabase.from(t).delete().eq('user_id', userId).then(r => {
            if (r.error) console.warn('[Kit] delete', t, r.error.message);
          }).catch(() => {})
        ));
        console.log('[Kit] Phase 1 done (junction tables)');

        // Phase 2: Main entity tables
        const phase2 = ['delivery_combos', 'delivery_produtos', 'delivery_adicionais',
          'delivery_config', 'produtos', 'preparos', 'embalagens'];
        await Promise.all(phase2.map(t =>
          supabase.from(t).delete().eq('user_id', userId).then(r => {
            if (r.error) console.warn('[Kit] delete', t, r.error.message);
          }).catch(() => {})
        ));
        console.log('[Kit] Phase 2 done (entity tables)');

        // Phase 3: materias_primas (depends on preparo_ingredientes, produto_ingredientes)
        const { error: mpErr } = await supabase.from('materias_primas').delete().eq('user_id', userId);
        if (mpErr) console.warn('[Kit] delete materias_primas:', mpErr.message);
        console.log('[Kit] Phase 3 done (materias_primas)');

        // Phase 4: Category tables (materias_primas FK gone now)
        const phase4 = ['categorias_produtos', 'categorias_preparos', 'categorias_embalagens', 'categorias_insumos'];
        await Promise.all(phase4.map(t =>
          supabase.from(t).delete().eq('user_id', userId).then(r => {
            if (r.error) console.warn('[Kit] delete', t, r.error.message);
          }).catch(() => {})
        ));
        console.log('[Kit] Phase 4 done (categories)');
      }

      // Step 2: Insert categories
      let firstCatId = null;
      if (categoriasTemplate.length > 0) {
        console.log('[Kit] Step 2: Inserting', categoriasTemplate.length, 'categories...');
        const catRows = categoriasTemplate.map(nome => ({
          user_id: userId,
          nome,
          icone: '📦',
        }));
        const { data: catData, error: catErr } = await supabase
          .from('categorias_insumos')
          .insert(catRows)
          .select('id');
        if (catErr) {
          console.error('[Kit] categorias error:', catErr.message);
          throw new Error('Erro ao cadastrar categorias: ' + catErr.message);
        }
        firstCatId = catData?.[0]?.id || null;
        console.log('[Kit] Categories OK, firstCatId:', firstCatId);
      }

      // Step 3: Insert insumos
      let criados = 0;
      if (insumosTemplate.length > 0) {
        console.log('[Kit] Step 3: Inserting', insumosTemplate.length, 'insumos...');
        const insumoRows = insumosTemplate.map(insumo => {
          const fc = calcFatorCorrecao(insumo.quantidade_bruta, insumo.quantidade_liquida);
          const pb = calcPrecoBase(insumo.valor_pago, insumo.quantidade_liquida, insumo.unidade_medida);
          return {
            user_id: userId,
            nome: insumo.nome,
            marca: '',
            categoria_id: firstCatId,
            quantidade_bruta: insumo.quantidade_bruta,
            quantidade_liquida: insumo.quantidade_liquida,
            fator_correcao: fc,
            unidade_medida: insumo.unidade_medida,
            valor_pago: insumo.valor_pago,
            preco_por_kg: pb,
          };
        });
        const { data: insData, error: insErr } = await supabase
          .from('materias_primas')
          .insert(insumoRows)
          .select('id');
        if (insErr) {
          console.error('[Kit] insumos error:', insErr.message);
          throw new Error('Erro ao cadastrar insumos: ' + insErr.message);
        }
        criados = insData?.length || 0;
        console.log('[Kit] Insumos OK, criados:', criados);
      }

      console.log('[Kit] SUCCESS — navigating...');
      setDone(true);
      setLoading(false);
      setTimeout(() => navegarAposKit(), 300);
    } catch (e) {
      console.error('[Kit] CATCH error:', e?.message || e);
      setLoading(false);
      const errMsg = `Não foi possível aplicar o kit.\n\nDetalhes: ${e?.message || String(e)}`;
      if (Platform.OS === 'web') {
        window.alert(errMsg);
      } else {
        Alert.alert('Erro', errMsg);
      }
    }
  }

  const segmentoInfo = selected ? SEGMENTOS.find(s => s.key === selected) : null;
  const insumosCount = selected ? (INSUMOS_POR_SEGMENTO[selected]?.length || 0) : 0;
  const categoriasCount = selected ? (CATEGORIAS_POR_SEGMENTO[selected]?.length || 0) : 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Botão Voltar */}
        {isSetup && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('ProfileSetup')}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={18} color={colors.primary} />
            <Text style={styles.backBtnText}>Voltar</Text>
          </TouchableOpacity>
        )}

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
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: spacing.sm, paddingHorizontal: 2,
    marginBottom: spacing.xs, alignSelf: 'flex-start',
  },
  backBtnText: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.primary },

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
