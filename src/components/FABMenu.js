/**
 * Sprint 4 F1 — FABMenu: FAB que abre menu de ações relacionadas.
 *
 * MOTIVAÇÃO (audit ES3, MP6):
 * Quando `modo_avancado_estoque` está on, o usuário precisa de 2 ações
 * adicionais perto do FAB principal: "Lançar compra" e "Ajustar saldo".
 * Antes: ações enterradas dentro do card de cada insumo (ícones 15px,
 * abaixo de touch target 44pt) — discoverability zero.
 *
 * USO:
 *   <FABMenu
 *     primary={{ label: 'Novo Insumo', icon: 'plus', onPress: () => ... }}
 *     actions={[
 *       { label: 'Lançar compra', icon: 'shopping-bag', onPress: () => ... },
 *       { label: 'Ajustar saldo', icon: 'sliders', onPress: () => ... },
 *     ]}
 *   />
 *
 * Se `actions` for vazio/undefined → renderiza FAB simples (mesma assinatura).
 *
 * COMPORTAMENTO:
 *   - Tap no FAB principal abre/fecha o menu (rotaciona ícone para X).
 *   - Backdrop semi-transparente fecha sem disparar ação.
 *   - Cada ação aparece como pílula com label + ícone (mais descobríveis que
 *     mini-FABs sem texto).
 */

import React, { useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, borderRadius, fonts, fontFamily, spacing } from '../utils/theme';

export default function FABMenu({ primary, actions = [], expanded: controlledExpanded, onExpandedChange }) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded != null ? controlledExpanded : internalExpanded;
  const setExpanded = (v) => {
    if (controlledExpanded == null) setInternalExpanded(v);
    if (typeof onExpandedChange === 'function') onExpandedChange(v);
  };

  const hasActions = Array.isArray(actions) && actions.length > 0;

  // Se não há actions, comporta como FAB simples — sem menu, sem backdrop.
  if (!hasActions) {
    return (
      <TouchableOpacity
        style={styles.fab}
        onPress={primary?.onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={primary?.label || 'Adicionar'}
      >
        <Feather name={primary?.icon || 'plus'} size={24} color={colors.textLight} />
      </TouchableOpacity>
    );
  }

  function handleAction(fn) {
    setExpanded(false);
    if (typeof fn === 'function') {
      // pequeno delay para fechar antes de navegar (UX mais suave)
      setTimeout(fn, 50);
    }
  }

  return (
    <>
      {expanded && (
        <Pressable
          style={styles.backdrop}
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          accessibilityLabel="Fechar menu de ações"
        />
      )}

      <View style={styles.menuContainer} pointerEvents="box-none">
        {expanded && (
          <View style={styles.actionsStack} pointerEvents="box-none">
            {actions.map((a, i) => (
              <TouchableOpacity
                key={a.key || a.label || i}
                style={styles.actionPill}
                onPress={() => handleAction(a.onPress)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={a.label}
              >
                <Feather name={a.icon || 'circle'} size={18} color={colors.primary} />
                <Text style={styles.actionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            {/* Pílula do FAB primário replicada no menu para clareza */}
            {primary && (
              <TouchableOpacity
                style={[styles.actionPill, styles.actionPillPrimary]}
                onPress={() => handleAction(primary.onPress)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={primary.label}
              >
                <Feather name={primary.icon || 'plus'} size={18} color={colors.textLight} />
                <Text style={[styles.actionLabel, { color: colors.textLight }]}>{primary.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TouchableOpacity
          style={styles.fab}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Fechar menu' : 'Abrir menu de ações'}
          accessibilityState={{ expanded }}
        >
          <Feather name={expanded ? 'x' : (primary?.icon || 'plus')} size={24} color={colors.textLight} />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 9,
  },
  menuContainer: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  actionsStack: {
    marginBottom: spacing.sm,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 4,
    ...Platform.select({ web: { boxShadow: '0 3px 8px rgba(0,77,71,0.3)' }, default: {} }),
  },
  actionPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    gap: 8,
    elevation: 4,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 6,
    minWidth: 160,
  },
  actionPillPrimary: {
    backgroundColor: colors.primary,
  },
  actionLabel: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
});
