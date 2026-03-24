import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import Card from '../components/Card';
import InputField from '../components/InputField';
import InfoTooltip from '../components/InfoTooltip';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

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

const DEFAULT_PLATFORMS = [
  { plataforma: 'iFood', taxa_plataforma: 27, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Rappi', taxa_plataforma: 25, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
  { plataforma: '99Food', taxa_plataforma: 20, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Uber Eats', taxa_plataforma: 30, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Venda Direta', taxa_plataforma: 0, taxa_entrega: 5, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
];

export default function DeliveryPlataformasScreen() {
  const isFocused = useIsFocused();
  const [plataformas, setPlataformas] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [novaPlataforma, setNovaPlataforma] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => setConfirmRemove(null);
    }, [])
  );

  async function loadData() {
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
  }

  async function updatePlatform(id, field, value) {
    const db = await getDatabase();
    await db.runAsync(`UPDATE delivery_config SET ${field} = ? WHERE id = ?`, [value, id]);
    setPlataformas(prev => prev.map(p => (p.id === id ? { ...p, [field]: value } : p)));
  }

  async function togglePlatform(id, currentValue) {
    await updatePlatform(id, 'ativo', currentValue ? 0 : 1);
  }

  async function adicionarPlataforma() {
    if (!novaPlataforma.trim()) return;
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO delivery_config (plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
      [novaPlataforma.trim(), 0, 0, 0, 0, 1]
    );
    setNovaPlataforma('');
    loadData();
  }

  function removerPlataforma(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_config WHERE id = ?', [id]);
        if (expandedId === id) setExpandedId(null);
        setConfirmRemove(null);
        loadData();
      },
    });
  }

  function parseInputValue(text) {
    return parseFloat(text.replace(',', '.')) || 0;
  }

  const ativas = plataformas.filter(p => p.ativo === 1).length;
  const inativas = plataformas.length - ativas;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
                        {plat.taxa_plataforma > 0 && (
                          <View style={[styles.taxaBadge, !isActive && { backgroundColor: colors.disabled }]}>
                            <Text style={styles.taxaBadgeText}>{plat.taxa_plataforma}%</Text>
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
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.platformFields}>
                    <InputField
                      label="Taxa da Plataforma (%)"
                      value={plat.taxa_plataforma > 0 ? String(plat.taxa_plataforma) : ''}
                      onChangeText={(val) => updatePlatform(plat.id, 'taxa_plataforma', parseInputValue(val))}
                      keyboardType="numeric"
                      placeholder="0"
                    />
                    <InputField
                      label="Taxa de Entrega (R$ por pedido)"
                      value={plat.taxa_entrega > 0 ? String(plat.taxa_entrega) : ''}
                      onChangeText={(val) => updatePlatform(plat.id, 'taxa_entrega', parseInputValue(val))}
                      keyboardType="numeric"
                      placeholder="0,00"
                    />
                    <InputField
                      label="Comissão do App (R$ por pedido)"
                      value={plat.comissao_app > 0 ? String(plat.comissao_app) : ''}
                      onChangeText={(val) => updatePlatform(plat.id, 'comissao_app', parseInputValue(val))}
                      keyboardType="numeric"
                      placeholder="0,00"
                    />
                    <InputField
                      label="Descontos e Promoções (%)"
                      value={plat.desconto_promocao > 0 ? String(plat.desconto_promocao) : ''}
                      onChangeText={(val) => updatePlatform(plat.id, 'desconto_promocao', parseInputValue(val))}
                      keyboardType="numeric"
                      placeholder="0"
                      style={{ marginBottom: spacing.xs }}
                    />
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removerPlataforma(plat.id, plat.plataforma)}
                      activeOpacity={0.6}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
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
          <View style={styles.addRow}>
            <InputField
              style={{ flex: 1, marginRight: spacing.sm, marginBottom: 0 }}
              value={novaPlataforma}
              onChangeText={setNovaPlataforma}
              placeholder="Nome da plataforma"
            />
            <TouchableOpacity style={styles.addBtn} onPress={adicionarPlataforma}>
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
  content: { padding: spacing.md, paddingBottom: 40 },

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
