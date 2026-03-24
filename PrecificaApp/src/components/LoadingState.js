import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { colors, spacing, fonts, fontFamily } from '../utils/theme';

export default function LoadingState({ message }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message && <Text style={styles.text}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  text: {
    marginTop: spacing.md,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
});
