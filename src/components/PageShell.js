/**
 * Sprint 3 S2 — `<PageShell>` único para container de conteúdo com maxWidth.
 *
 * MOTIVAÇÃO (audit L2):
 * 15 telas duplicam esse mesmo bloco:
 *   content: { maxWidth: X, alignSelf: 'center', width: '100%' }
 * com X variando entre 600, 720, 800, 960, 1024, 1200 — sem critério claro.
 * Resultado: "pulo horizontal" entre telas (o conteúdo recentra em larguras
 * diferentes a cada navegação).
 *
 * API:
 *   <PageShell preset="narrow|default|wide">  // 600 / 960 / 1200
 *     {children}
 *   </PageShell>
 *
 * Também aceita `maxWidth` numérico direto para casos fora do preset.
 *
 * USO:
 *   // Antes (repetido em 15 telas):
 *   <ScrollView>
 *     <View style={styles.content}>{...}</View>
 *   </ScrollView>
 *
 *   // Depois:
 *   <PageShell preset="default">
 *     <ScrollView>{...}</ScrollView>
 *   </PageShell>
 *
 * Migração é incremental — telas que não adotaram ainda continuam funcionando.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { spacing } from '../utils/theme';

const PRESET_MAP = Object.freeze({
  narrow: 600,   // formulários, leitura focada
  default: 960, // padrão — listas, dashboards
  wide: 1200,   // tabelas largas, comparativos
});

export default function PageShell({
  preset = 'default',
  maxWidth,
  padding = true,
  style,
  contentStyle,
  children,
  testID,
}) {
  const resolvedMaxWidth = typeof maxWidth === 'number' ? maxWidth : (PRESET_MAP[preset] || PRESET_MAP.default);

  return (
    <View style={[styles.outer, style]} testID={testID}>
      <View
        style={[
          styles.inner,
          { maxWidth: resolvedMaxWidth },
          padding && styles.innerPadding,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

PageShell.PRESETS = PRESET_MAP;

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  innerPadding: {
    paddingHorizontal: spacing.lg,
  },
});
