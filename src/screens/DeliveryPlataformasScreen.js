import React, { useState, useCallback, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import Card from '../components/Card';
import InputField from '../components/InputField';
import InfoTooltip from '../components/InfoTooltip';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { safeNum } from '../utils/calculations';

// ─── Numeric helpers (audit P0) ─────────────
function parseInputNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim().replace(',', '.');
  if (str === '') return null;
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

// Audit P0: SQL injection defense — whitelist permitted UPDATE fields
const PLAT_NUMERIC_FIELDS = Object.freeze([
  'taxa_plataforma', 'taxa_entrega', 'comissao_app', 'desconto_promocao', 'outros_perc', 'ativo',
]);

// Field-specific validation: percent fields capped at [0, 100]
// APP-29: comissao_app agora é %; desconto_promocao agora é R$ (cupom recorrente)
// Sessão 28.27: outros_perc adicionado como % pra taxas embutidas
const PLAT_PERCENT_FIELDS = new Set(['taxa_plataforma', 'comissao_app', 'outros_perc']);

// Color cycling for platform avatars (same pattern as MateriasPrimasScreen)
const PLATFORM_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

function getPlatformColor(index) {
  return PLATFORM_COLORS[index % PLATFORM_COLORS.length];
}

// Known platform styles with distinctive icons and brand colors
const KNOWN_PLATFORMS = [
  { match: 'ifood',        icon: 'food',          iconSet: 'material', color: '#EA1D2C' },
  { match: 'rappi',        icon: 'zap',           iconSet: 'feather',  color: '#FF6B00' },
  { match: '99food',       icon: 'numeric-99',    iconSet: 'material', color: '#FFCC00' },
  { match: 'uber eats',    icon: 'car',           iconSet: 'material', color: '#06C167' },
  { match: 'ubereats',     icon: 'car',           iconSet: 'material', color: '#06C167' },
  { match: 'venda direta', icon: 'shopping-bag',  iconSet: 'feather',  color: colors.primary },
];

function getPlatformStyle(name) {
  const normalized = (name || '').toLowerCase().trim();
  for (const p of KNOWN_PLATFORMS) {
    if (normalized.includes(p.match)) {
      return { icon: p.icon, iconSet: p.iconSet, color: p.color };
    }
  }
  return null;
}

// APP-29/29b: mapping semântico dos campos existentes (sem migration de schema)
//   taxa_plataforma  (%)  = Comissão da plataforma
//   comissao_app     (%)  = Taxa de pagamento online (REPURPOSED — antes era R$)
//   desconto_promocao(R$) = Cupom de desconto recorrente (REPURPOSED — antes era %)
//   taxa_entrega     (R$) = Frete subsidiado recorrente
// Defaults pré-cadastrados: comissão + taxa pgto online padrão de mercado 2025-2026.
const DEFAULT_PLATFORMS = [
  { plataforma: 'iFood', taxa_plataforma: 27, taxa_entrega: 0, comissao_app: 3.2, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Rappi', taxa_plataforma: 25, taxa_entrega: 0, comissao_app: 3, desconto_promocao: 0, ativo: 1 },
  { plataforma: '99Food', taxa_plataforma: 22, taxa_entrega: 0, comissao_app: 3, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Uber Eats', taxa_plataforma: 30, taxa_entrega: 0, comissao_app: 3, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Site Próprio / WhatsApp', taxa_plataforma: 0, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
];

export default function DeliveryPlataformasScreen() {
  const isFocused = useIsFocused();
  const [plataformas, setPlataformas] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [novaPlataforma, setNovaPlataforma] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Audit P0: error states + race-guard
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const isLoadingRef = useRef(false);
  const saveErrorTimerRef = useRef(null);

  function showSaveError(msg) {
    setSaveError(msg);
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
    saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 4000);
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => setConfirmRemove(null);
    }, [])
  );

  async function loadData() {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoadError(null);
    try {
      const db = await getDatabase();
      let plats = await db.getAllAsync('SELECT * FROM delivery_config ORDER BY id');
      if (plats.length === 0) {
        for (const p of DEFAULT_PLATFORMS) {
          await db.runAsync(
            'INSERT INTO delivery_config (plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
            [p.plataforma, p.taxa_plataforma, p.taxa_entrega, p.comissao_app, p.desconto_promocao, p.ativo]
          );
        }
        plats = await db.getAllAsync('SELECT * FROM delivery_config ORDER BY id');
      }
      setPlataformas(plats);
    } catch (e) {
      console.error('[DeliveryPlataformasScreen.loadData]', e);
      setLoadError('Não foi possível carregar as plataformas. Tente novamente.');
    } finally {
      isLoadingRef.current = false;
    }
  }

  async function updatePlatform(id, field, value) {
    // Audit P0: SQL injection defense — only allow whitelisted fields
    if (!PLAT_NUMERIC_FIELDS.includes(field)) {
      console.error('[DeliveryPlataformasScreen.updatePlatform] campo não permitido:', field);
      return;
    }
    const numValue = safeNum(value);
    if (numValue < 0) {
      showSaveError('Valor não pode ser negativo.');
      return;
    }
    if (PLAT_PERCENT_FIELDS.has(field) && numValue > 100) {
      showSaveError('Percentual não pode ultrapassar 100%.');
      return;
    }
    try {
      const db = await getDatabase();
      await db.runAsync(`UPDATE delivery_config SET ${field} = ? WHERE id = ?`, [numValue, id]);
      setPlataformas(prev => prev.map(p => (p.id === id ? { ...p, [field]: numValue } : p)));
    } catch (e) {
      console.error('[DeliveryPlataformasScreen.updatePlatform]', e);
      showSaveError('Falha ao salvar alteração. Tente novamente.');
    }
  }

  async function togglePlatform(id, currentValue) {
    await updatePlatform(id, 'ativo', currentValue ? 0 : 1);
  }

  async function adicionarPlataforma() {
    const nome = novaPlataforma.trim();
    if (!nome) return;
    const exists = plataformas.some(p => (p.plataforma || '').trim().toLowerCase() === nome.toLowerCase());
    if (exists) {
      showSaveError('Já existe uma plataforma com esse nome.');
      return;
    }
    // D-08: se o nome bate com uma plataforma conhecida, traz os defaults (comissão + taxa pgto online)
    const knownDefault = DEFAULT_PLATFORMS.find(d =>
      (d.plataforma || '').toLowerCase() === nome.toLowerCase() ||
      nome.toLowerCase().includes((d.plataforma || '').toLowerCase().split(' ')[0])
    );
    const defaults = knownDefault || { taxa_plataforma: 0, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0 };
    try {
      const db = await getDatabase();
      await db.runAsync(
        'INSERT INTO delivery_config (plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
        [nome, defaults.taxa_plataforma, defaults.taxa_entrega, defaults.comissao_app, defaults.desconto_promocao, 1]
      );
      setNovaPlataforma('');
      loadData();
      if (knownDefault && typeof console !== 'undefined' && console.log) {
        console.log(`[DeliveryPlataformas] Defaults aplicados: ${defaults.taxa_plataforma}% comissão + ${defaults.comissao_app}% taxa pgto online`);
      }
    } catch (e) {
      console.error('[DeliveryPlataformasScreen.adicionarPlataforma]', e);
      showSaveError('Falha ao adicionar plataforma. Tente novamente.');
    }
  }

  function removerPlataforma(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        try {
          const db = await getDatabase();
          await db.runAsync('DELETE FROM delivery_config WHERE id = ?', [id]);
          if (expandedId === id) setExpandedId(null);
          setConfirmRemove(null);
          loadData();
        } catch (e) {
          console.error('[DeliveryPlataformasScreen.removerPlataforma]', e);
          setConfirmRemove(null);
          showSaveError('Falha ao remover plataforma. Tente novamente.');
        }
      },
    });
  }

  function parseInputValue(text, { percent = false } = {}) {
    const n = parseInputNumber(text);
    if (n === null || n < 0) return 0;
    if (percent && n > 100) return 100;
    return n;
  }

  const ativas = plataformas.filter(p => p.ativo === 1).length;
  const inativas = plataformas.length - ativas;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Audit P0: error banners */}
        {loadError && (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.errorBannerText}>{loadError}</Text>
            <TouchableOpacity
              onPress={loadData}
              style={styles.errorRetryBtn}
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar plataformas novamente"
            >
              <Text style={styles.errorRetryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        )}
        {saveError && (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.errorBannerText}>{saveError}</Text>
          </View>
        )}

        {/* Status bar */}
        <View style={styles.statusRow}>
          <View style={[styles.statusChip, { backgroundColor: colors.success + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.statusText, { color: colors.success }]}>{ativas} ativa{ativas !== 1 ? 's' : ''}</Text>
          </View>
          {inativas > 0 && (
            <View style={[styles.statusChip, { backgroundColor: colors.disabled + '30' }]}>
              <View style={[styles.statusDot, { backgroundColor: colors.disabled }]} />
              <Text style={[styles.statusText, { color: colors.textSecondary }]}>{inativas} inativa{inativas !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>

        <Card
          title="Plataformas"
          headerRight={
            <InfoTooltip
              title="Plataformas de Delivery"
              text="Configure as taxas de cada plataforma. Plataformas ativas serão usadas no cálculo de preços."
              examples={[
                'Taxa da plataforma: comissão cobrada sobre o pedido',
                'Taxa de entrega: custo fixo por pedido',
                'Desative plataformas que não usa',
              ]}
            />
          }
        >
          {plataformas.map((plat, index) => {
            const isExpanded = expandedId === plat.id;
            const isActive = plat.ativo === 1;
            const platformStyle = getPlatformStyle(plat.plataforma);
            const avatarColor = platformStyle ? platformStyle.color : getPlatformColor(index);
            const inicial = (plat.plataforma || '?').charAt(0).toUpperCase();

            return (
              <View key={plat.id} style={[styles.platformItem, !isActive && styles.platformInactive]}>
                <TouchableOpacity
                  style={styles.platformHeader}
                  onPress={() => setExpandedId(isExpanded ? null : plat.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.platformHeaderLeft}>
                    {/* Platform icon or colored initial avatar */}
                    <View style={[styles.avatar, { backgroundColor: avatarColor + '18' }]}>
                      {platformStyle ? (
                        platformStyle.iconSet === 'material' ? (
                          <MaterialCommunityIcons name={platformStyle.icon} size={20} color={avatarColor} />
                        ) : (
                          <Feather name={platformStyle.icon} size={18} color={avatarColor} />
                        )
                      ) : (
                        <Text style={[styles.avatarText, { color: avatarColor }]}>{inicial}</Text>
                      )}
                    </View>

                    <View style={styles.platformInfo}>
                      <View style={styles.platformNameRow}>
                        <Text style={[styles.platformName, !isActive && { color: colors.disabled }]} numberOfLines={1}>
                          {plat.plataforma}
                        </Text>
                        {safeNum(plat.taxa_plataforma) > 0 && (
                          <View style={[styles.taxaBadge, !isActive && { backgroundColor: colors.disabled }]}>
                            <Text style={styles.taxaBadgeText}>{safeNum(plat.taxa_plataforma)}%</Text>
                          </View>
                        )}
                      </View>
                      {/* Active/inactive status indicator */}
                      <View style={styles.statusIndicatorRow}>
                        <View style={[styles.statusIndicatorDot, { backgroundColor: isActive ? colors.success : colors.disabled }]} />
                        <Text style={[styles.statusIndicatorText, { color: isActive ? colors.success : colors.disabled }]}>
                          {isActive ? 'Ativa' : 'Inativa'}
                        </Text>
                      </View>
                    </View>

                    {/* Chevron icon */}
                    <Feather
                      name={isExpanded ? 'chevron-down' : 'chevron-right'}
                      size={14}
                      color={colors.disabled}
                      style={{ marginRight: spacing.sm }}
                    />
                  </View>
                  <Switch
                    value={isActive}
                    onValueChange={() => togglePlatform(plat.id, plat.ativo)}
                    trackColor={{ false: colors.disabled, true: colors.primaryLight }}
                    thumbColor={isActive ? colors.primary : '#f4f3f4'}
                    accessibilityRole="switch"
                    accessibilityLabel={`Ativar plataforma ${plat.plataforma}`}
                    accessibilityState={{ checked: isActive }}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.platformFields}>
                    {/* APP-25/29: campos remapeados pro modelo correto de delivery.
                        Comissão e Taxa pgto online são SEMPRE aplicadas; cupom e frete são promoções recorrentes opcionais. */}
                    <View style={styles.subSectionHeader}>
                      <Text style={styles.subSectionTitle}>Custos sempre aplicados</Text>
                      <InfoTooltip
                        title="Custos fixos da plataforma"
                        text="A comissão é o que a plataforma fica com cada venda. A taxa de pagamento online é cobrada à parte (substitui a maquininha do balcão)."
                      />
                    </View>

                    <InputField
                      label="Comissão da plataforma (%)"
                      value={safeNum(plat.taxa_plataforma) > 0 ? String(plat.taxa_plataforma) : ''}
                      onChangeText={(val) => updatePlatform(plat.id, 'taxa_plataforma', parseInputValue(val, { percent: true }))}
                      keyboardType="decimal-pad"
                      placeholder="Ex: 27"
                      accessibilityLabel={`Comissão da plataforma ${plat.plataforma} em porcentagem`}
                    />
                    <InputField
                      label="Taxa de pagamento online (%)"
                      value={safeNum(plat.comissao_app) > 0 ? String(plat.comissao_app) : ''}
                      onChangeText={(val) => updatePlatform(plat.id, 'comissao_app', parseInputValue(val, { percent: true }))}
                      keyboardType="decimal-pad"
                      placeholder="Ex: 3,2"
                      accessibilityLabel={`Taxa de pagamento online da plataforma ${plat.plataforma}`}
                    />
                    {/* Sessão 28.27: novo campo "Outros %" pra taxas embutidas que não se encaixam acima */}
                    <InputField
                      label="Outras taxas embutidas (%)"
                      value={safeNum(plat.outros_perc) > 0 ? String(plat.outros_perc) : ''}
                      onChangeText={(val) => updatePlatform(plat.id, 'outros_perc', parseInputValue(val, { percent: true }))}
                      keyboardType="decimal-pad"
                      placeholder="Ex: 2 (fundo de propaganda, marketing, etc)"
                      accessibilityLabel={`Outras taxas embutidas da plataforma ${plat.plataforma}`}
                    />

                    <View style={[styles.subSectionHeader, { marginTop: spacing.md }]}>
                      <Text style={styles.subSectionTitle}>Promoções recorrentes (opcional)</Text>
                      <InfoTooltip
                        title="Quando preencher"
                        text="Use só se você dá cupom fixo todo dia ou subsidia frete grátis sempre. Para promoções pontuais, deixe em branco e simule manualmente."
                      />
                    </View>

                    <InputField
                      label="Cupom de desconto recorrente (R$)"
                      value={safeNum(plat.desconto_promocao) > 0 ? String(plat.desconto_promocao) : ''}
                      onChangeText={(val) => updatePlatform(plat.id, 'desconto_promocao', parseInputValue(val))}
                      keyboardType="decimal-pad"
                      placeholder="Ex: 5,00"
                      accessibilityLabel={`Cupom recorrente da plataforma ${plat.plataforma} em reais`}
                    />
                    <InputField
                      label="Frete subsidiado recorrente (R$)"
                      value={safeNum(plat.taxa_entrega) > 0 ? String(plat.taxa_entrega) : ''}
                      onChangeText={(val) => updatePlatform(plat.id, 'taxa_entrega', parseInputValue(val))}
                      keyboardType="decimal-pad"
                      placeholder="Ex: 8,00"
                      style={{ marginBottom: spacing.xs }}
                      accessibilityLabel={`Frete subsidiado da plataforma ${plat.plataforma} em reais`}
                    />
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removerPlataforma(plat.id, plat.plataforma)}
                      activeOpacity={0.6}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover plataforma ${plat.plataforma}`}
                    >
                      <Feather name="trash-2" size={13} color={colors.disabled} />
                      <Text style={styles.removeBtnText}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </Card>

        <Card title="Adicionar Plataforma">
          {/* D-08: chips com plataformas conhecidas (defaults pré-preenchidos ao tap) */}
          {(() => {
            const existentes = plataformas.map(p => (p.plataforma || '').toLowerCase());
            const disponiveis = DEFAULT_PLATFORMS.filter(d => !existentes.includes((d.plataforma || '').toLowerCase()));
            if (disponiveis.length === 0) return null;
            return (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm }}>
                {disponiveis.map(p => (
                  <TouchableOpacity
                    key={p.plataforma}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.primary + '40', backgroundColor: colors.primary + '0F' }}
                    onPress={() => { setNovaPlataforma(p.plataforma); setTimeout(() => adicionarPlataforma(), 50); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Adicionar ${p.plataforma} com taxas pré-preenchidas`}
                  >
                    <Feather name="plus" size={11} color={colors.primary} />
                    <Text style={{ fontSize: fonts.tiny, color: colors.primary, fontFamily: fontFamily.semiBold }}>
                      {p.plataforma}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                      {p.taxa_plataforma > 0 ? `${p.taxa_plataforma}%` : 'sem comissão'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })()}
          <View style={styles.addRow}>
            <InputField
              style={{ flex: 1, marginRight: spacing.sm, marginBottom: 0 }}
              value={novaPlataforma}
              onChangeText={setNovaPlataforma}
              placeholder="Ou digite outra plataforma"
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={adicionarPlataforma}
              accessibilityRole="button"
              accessibilityLabel="Adicionar plataforma"
            >
              <Feather name="plus" size={20} color={colors.textLight} />
            </TouchableOpacity>
          </View>
        </Card>
      </ScrollView>

      <ConfirmDeleteModal
        visible={!!confirmRemove}
        isFocused={isFocused}
        titulo="Remover Plataforma"
        nome={confirmRemove?.nome}
        onConfirm={confirmRemove?.onConfirm}
        onCancel={() => setConfirmRemove(null)}
        confirmLabel="Remover"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },

  // Audit P0: error banners
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: 4,
  },
  errorBannerText: {
    flex: 1,
    color: '#991b1b',
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
  },
  errorRetryBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: '#dc2626', borderRadius: 4, marginLeft: spacing.xs,
  },
  errorRetryText: {
    color: '#fff', fontSize: fonts.tiny, fontWeight: '700',
    fontFamily: fontFamily.bold,
  },

  // APP-25/29: sub-section headers for "Custos sempre aplicados" vs "Promoções recorrentes"
  subSectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: spacing.sm,
    gap: 6,
  },
  subSectionTitle: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Status bar
  statusRow: { flexDirection: 'row', marginBottom: spacing.md },
  statusChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    marginRight: spacing.sm,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: {
    fontSize: fonts.tiny, fontWeight: '600',
    fontFamily: fontFamily.semiBold,
  },

  // Platform items
  platformItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  platformInactive: {
    opacity: 0.6,
  },
  platformHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.sm,
    backgroundColor: colors.inputBg,
  },
  platformHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', flex: 1,
  },

  // Avatar (matching MateriasPrimasScreen)
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: 15, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Platform info column
  platformInfo: {
    flex: 1, marginRight: spacing.xs,
  },
  platformNameRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  platformName: {
    fontSize: fonts.regular, fontWeight: '600', color: colors.text,
    fontFamily: fontFamily.semiBold,
  },

  // Status indicator (below name)
  statusIndicatorRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 2,
  },
  statusIndicatorDot: {
    width: 6, height: 6, borderRadius: 3, marginRight: 4,
  },
  statusIndicatorText: {
    fontSize: 10, fontFamily: fontFamily.medium, fontWeight: '500',
  },

  // Taxa badge
  taxaBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
    marginLeft: spacing.xs,
    overflow: 'hidden',
  },
  taxaBadgeText: {
    fontSize: 10, color: colors.textLight, fontWeight: '700',
    fontFamily: fontFamily.bold,
  },

  // Expanded fields
  platformFields: {
    padding: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF',
  },

  // Remove button (trash icon + text, matching other screens)
  removeBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: 5,
  },
  removeBtnText: {
    color: colors.disabled, fontSize: fonts.small, fontWeight: '600',
    fontFamily: fontFamily.semiBold,
  },

  // Add platform
  addRow: { flexDirection: 'row', alignItems: 'flex-end' },
  addBtn: {
    backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
});
