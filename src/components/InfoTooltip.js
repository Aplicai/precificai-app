import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';

export default function InfoTooltip({ title, text, examples }) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity onPress={() => setVisible(true)} style={styles.iconBtn}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>?</Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable style={styles.balloon} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.text}>{text}</Text>

            {examples && examples.length > 0 && (
              <View style={styles.examplesBox}>
                <Text style={styles.examplesTitle}>Exemplos:</Text>
                {examples.map((ex, i) => (
                  <View key={i} style={styles.exampleRow}>
                    <Text style={styles.exampleIcon}>•</Text>
                    <Text style={styles.exampleText}>{ex}</Text>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    marginLeft: 6,
    justifyContent: 'center',
  },
  iconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  balloon: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    maxWidth: 420,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fonts.medium,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  text: {
    fontSize: fonts.regular,
    color: colors.text,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  examplesBox: {
    backgroundColor: '#F0F7F0',
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  examplesTitle: {
    fontSize: fonts.regular,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  exampleRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  exampleIcon: {
    color: colors.primary,
    marginRight: 6,
    fontWeight: '700',
  },
  exampleText: {
    fontSize: fonts.small,
    color: colors.text,
    flex: 1,
    lineHeight: 20,
  },
});
